import { 
  VisaDistributionDoc, 
  VisaInvoiceDoc, 
  InvoicePaxLine,
  DistributionGroupLine,
  CommissionDetails
} from '../types/visaDistribution';
import { VisaDoc, fetchVisas } from './visaService';
import { fetchLedgerAccounts, fetchLedgerEntries, postBalancedTransaction } from './accountingService';
import { LedgerEntryDoc, LedgerAccountDoc } from '../types/accounting';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { logAuditEvent } from './userService';
import { getCurrentRate } from './exchangeRateService';
import { UserProfile } from '../types/auth';

const DISTRIB_COLLECTION = 'visa_distributions';
const INVOICES_COLLECTION = 'visa_invoices';
const VISAS_COLLECTION = 'visas';
const ENTRIES_COLLECTION = 'ledger_entries';

const LOCAL_STORAGE_DISTRIB_KEY = 'safardesk_visa_distributions_v1';
const LOCAL_STORAGE_INVOICES_KEY = 'safardesk_visa_invoices_v1';
const LOCAL_STORAGE_VISAS_KEY = 'safardesk_visas_directory';
const LOCAL_STORAGE_ENTRIES_KEY = 'safardesk_ledger_entries_v3';

export async function fetchVisaDistributions(): Promise<VisaDistributionDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, DISTRIB_COLLECTION));
      return snap.docs.map((d) => d.data() as VisaDistributionDoc);
    }
  } catch (err) {
    console.warn('Could not read distributions from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_DISTRIB_KEY);
  return stored ? JSON.parse(stored) : [];
}

export async function fetchVisaInvoices(): Promise<VisaInvoiceDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, INVOICES_COLLECTION));
      return snap.docs.map((d) => d.data() as VisaInvoiceDoc);
    }
  } catch (err) {
    console.warn('Could not read invoices from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
  return stored ? JSON.parse(stored) : [];
}

export async function getNextInvoiceNumber(): Promise<string> {
  const invoices = await fetchVisaInvoices();
  let maxNum = 1000;
  invoices.forEach((inv) => {
    const match = inv.invoiceNo.match(/INV-(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) maxNum = val;
    }
  });
  return `INV-${maxNum + 1}`;
}

export async function createVisaDistributionBatch(params: {
  vendorId: string;
  shirkaId?: string;
  agentGroupMap: Map<string, {
    agentId: string;
    sellingPricePerVisa: number;
    buyingPricePerVisa: number; // per-group buying rate (purchase rates differ per group)
    groupCode: string;
    groupName: string;
    visaIds: string[];
    exchangeRateSARPKR: number; // Fix #29: manually entered per-agent SAR->PKR rate
    commission?: {
      enabled: boolean;
      recipientName: string;
      contactNumber: string;
      amountSAR: number;
    };
  }>;
  date: string;
  createdBy: string;
}): Promise<{ distribution: VisaDistributionDoc; invoices: VisaInvoiceDoc[] }> {
  const allVisas = await fetchVisas();
  const ledgerAccounts = await fetchLedgerAccounts();
  const currentEntries = await fetchLedgerEntries();
  const now = new Date().toISOString();

  // Find or create "Income — Visa Margin" system account
  let marginAccount: LedgerAccountDoc | undefined = ledgerAccounts.find((a) => a.accountCode === 'SYS-MARGIN' || a.title.toLowerCase().includes('visa margin'));
  if (!marginAccount) {
    marginAccount = {
      id: 'acc-sys-margin',
      accountCode: 'SYS-MARGIN',
      accountType: 'income',
      title: 'Income — Visa Margin',
      isSystem: true,
      isActive: true,
      openingBalanceSAR: 0,
      openingBalancePKR: 0,
      createdAt: now,
      createdBy: params.createdBy,
    };
  }

  const distribId = `distrib-${Date.now()}`;
  const distribNo = `DIST-${Math.floor(1000 + Math.random() * 9000)}`;

  // Resolve Shirka display name for stamping
  let shirkaName = '';
  try {
    const { fetchVendors } = await import('./masterService');
    const vnd = (await fetchVendors()).find((v: any) => v.id === params.vendorId);
    const shk = (vnd?.shirkas || []).find((s: any) => s.id === params.shirkaId);
    shirkaName = shk?.name || '';
  } catch { /* best-effort */ }

  // Group distributions by agentId
  const agentBatches = new Map<string, {
    agentId: string;
    groups: Array<{ groupCode: string; groupName: string; visaIds: string[]; visaCount: number; sellingPricePerVisa: number; buyingPricePerVisa: number }>;
    totalVisas: number;
    sellingTotalSAR: number;
    buyingTotalSAR: number;
    exchangeRateSARPKR: number;
    commission?: { enabled: boolean; recipientName: string; contactNumber: string; amountSAR: number };
  }>();

  params.agentGroupMap.forEach((data) => {
    const existing = agentBatches.get(data.agentId) || {
      agentId: data.agentId,
      groups: [],
      totalVisas: 0,
      sellingTotalSAR: 0,
      buyingTotalSAR: 0,
      exchangeRateSARPKR: data.exchangeRateSARPKR,
      commission: data.commission?.enabled ? data.commission : undefined,
    };

    const visaCount = data.visaIds.length;
    const lineSelling = visaCount * data.sellingPricePerVisa;
    const lineBuying = visaCount * data.buyingPricePerVisa;

    existing.groups.push({
      groupCode: data.groupCode,
      groupName: data.groupName,
      visaIds: data.visaIds,
      visaCount,
      sellingPricePerVisa: data.sellingPricePerVisa,
      buyingPricePerVisa: data.buyingPricePerVisa,
    });
    existing.totalVisas += visaCount;
    existing.sellingTotalSAR += lineSelling;
    existing.buyingTotalSAR += lineBuying;

    agentBatches.set(data.agentId, existing);
  });

  const createdGroups: DistributionGroupLine[] = [];
  const createdInvoices: VisaInvoiceDoc[] = [];
  const newLedgerEntries: LedgerEntryDoc[] = [];
  const updatedVisas: VisaDoc[] = [...allVisas];
  const visaById = new Map<string, VisaDoc>(updatedVisas.map((v) => [v.id, v]));

  let totalVisasAll = 0;
  let totalBuyingAll = 0;
  let totalSellingAll = 0;

  for (const [agentId, batch] of agentBatches.entries()) {
    // Fix #29: each agent's invoice uses its own MANUALLY entered SAR->PKR rate.
    const exchangeRate = batch.exchangeRateSARPKR > 0 ? batch.exchangeRateSARPKR : getCurrentRate('SAR-PKR');

    batch.groups.forEach((g) => {
      createdGroups.push({
        groupCode: g.groupCode,
        groupName: g.groupName,
        agentId: batch.agentId,
        sellingPricePerVisa: g.sellingPricePerVisa,
        buyingPricePerVisa: g.buyingPricePerVisa,
        visaIds: g.visaIds,
        visaCount: g.visaCount,
      });

      // Update visa docs status to Distributed
      g.visaIds.forEach((vId) => {
        const vIndex = updatedVisas.findIndex((v) => v.id === vId);
        if (vIndex !== -1) {
          updatedVisas[vIndex] = {
            ...updatedVisas[vIndex],
            status: 'Distributed',
            agentId: batch.agentId,
            distributionId: distribId,
            vendorId: params.vendorId,
            shirkaId: params.shirkaId || undefined,
            shirkaName: shirkaName || undefined,
          } as any;
        }
      });
    });

    const marginSAR = batch.sellingTotalSAR - batch.buyingTotalSAR;
    const invoiceNo = await getNextInvoiceNumber();
    const totalsPKR = Math.round(batch.sellingTotalSAR * exchangeRate * 100) / 100;

    // One invoice, but lines split per PAX (one by one) — each pilgrim's
    // name + passport + individual rate on its own row, never lumped.
    const invoiceLines: InvoicePaxLine[] = [];
    batch.groups.forEach((g) => {
      g.visaIds.forEach((vId) => {
        const v = visaById.get(vId);
        invoiceLines.push({
          pilgrimName: v?.pilgrimName || 'Pilgrim',
          passportNumber: v?.passportNumber || '—',
          groupCode: g.groupCode,
          groupName: g.groupName,
          sellingPricePerVisa: g.sellingPricePerVisa,
          lineTotalSAR: g.sellingPricePerVisa,
        });
      });
    });

    const commissionDetails: CommissionDetails | null = batch.commission?.enabled ? {
      enabled: true,
      recipientName: batch.commission.recipientName,
      contactNumber: batch.commission.contactNumber,
      amountSAR: batch.commission.amountSAR,
      status: 'Unpaid',
      paidAt: null,
      paidEntryId: null,
    } : null;

    const invoice: VisaInvoiceDoc = {
      id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      invoiceNo,
      distributionId: distribId,
      agentId,
      vendorId: params.vendorId,
      date: params.date,
      lines: invoiceLines,
      sellingTotalSAR: batch.sellingTotalSAR,
      buyingTotalSAR: batch.buyingTotalSAR,
      marginSAR,
      exchangeRate,
      totalsPKR,
      status: 'Unpaid',
      commission: commissionDetails,
      createdBy: params.createdBy,
      createdAt: now,
    };

    createdInvoices.push(invoice);

    // Ledger postings for this invoice (double-entry into ledgerEntries)
    const baseSeq = currentEntries.length + newLedgerEntries.length + 20000;

    // (a) Debit Agent ledger — ONE line PER PAX with name + passport + group detail.
    // Sum of all pax lines still equals the invoice selling total.
    let paxCount = 0;
    batch.groups.forEach((g) => {
      g.visaIds.forEach((vId) => {
        const v = visaById.get(vId);
        const sar = g.sellingPricePerVisa;
        const pkr = Math.round(sar * exchangeRate * 100) / 100;
        paxCount += 1;
        const seq = baseSeq + paxCount;
        newLedgerEntries.push({
          id: `le-${seq}`,
          entryNo: `LE-${seq}`,
          date: params.date,
          accountId: agentId,
          entryType: 'Invoice',
          transNo: invoiceNo,
          particulars: `Visa — ${v?.pilgrimName || 'Pilgrim'} | PP: ${v?.passportNumber || '—'} | ${g.groupCode}${g.groupName && g.groupName !== g.groupCode ? ` (${g.groupName})` : ''} — SAR ${sar.toLocaleString()}/visa`,
          invoiceRef: invoiceNo,
          rate: exchangeRate,
          debitSAR: sar,
          creditSAR: 0,
          debitPKR: pkr,
          creditPKR: 0,
          createdBy: params.createdBy,
          createdAt: now,
          isVoid: false,
        });
      });
    });

    // (b) Credit Vendor (Shirka) ledger payable = buyingTotalSAR
    const creditVendorPKR = Math.round(batch.buyingTotalSAR * exchangeRate * 100) / 100;
    newLedgerEntries.push({
      id: `le-${baseSeq + paxCount + 1}`,
      entryNo: `LE-${baseSeq + paxCount + 1}`,
      date: params.date,
      accountId: params.vendorId,
      entryType: 'Invoice',
      transNo: invoiceNo,
      particulars: `Visa Purchase Cost for Invoice #${invoiceNo} (${batch.totalVisas} Visas)${shirkaName ? ` — ${shirkaName}` : ''}`,
      invoiceRef: invoiceNo,
      rate: exchangeRate,
      debitSAR: 0,
      creditSAR: batch.buyingTotalSAR,
      debitPKR: 0,
      creditPKR: creditVendorPKR,
      createdBy: params.createdBy,
      createdAt: now,
      isVoid: false,
    });

    // (c) Credit "Income — Visa Margin" system account = marginSAR
    const creditMarginPKR = Math.round(marginSAR * exchangeRate * 100) / 100;
    newLedgerEntries.push({
      id: `le-${baseSeq + paxCount + 2}`,
      entryNo: `LE-${baseSeq + paxCount + 2}`,
      date: params.date,
      accountId: marginAccount.id,
      entryType: 'Invoice',
      transNo: invoiceNo,
      particulars: `Gross Visa Margin for Invoice #${invoiceNo}`,
      invoiceRef: invoiceNo,
      rate: exchangeRate,
      debitSAR: 0,
      creditSAR: marginSAR,
      debitPKR: 0,
      creditPKR: creditMarginPKR,
      createdBy: params.createdBy,
      createdAt: now,
      isVoid: false,
    });

    totalVisasAll += batch.totalVisas;
    totalBuyingAll += batch.buyingTotalSAR;
    totalSellingAll += batch.sellingTotalSAR;
  }

  const distribution: VisaDistributionDoc = {
    id: distribId,
    distributionNo: distribNo,
    vendorId: params.vendorId,
    shirkaId: params.shirkaId || undefined,
    buyingPricePerVisa: totalVisasAll > 0 ? Math.round((totalBuyingAll / totalVisasAll) * 100) / 100 : 0,
    groups: createdGroups,
    totalVisas: totalVisasAll,
    totalBuyingSAR: totalBuyingAll,
    totalSellingSAR: totalSellingAll,
    marginSAR: totalSellingAll - totalBuyingAll,
    date: params.date,
    createdBy: params.createdBy,
    createdAt: now,
  };

  // Save distribution, invoices, ledger entries, and updated visas
  const existingDistribs = await fetchVisaDistributions();
  const existingInvoices = await fetchVisaInvoices();

  const allDistribs = [distribution, ...existingDistribs];
  const allInvoices = [...createdInvoices, ...existingInvoices];
  const allEntries = [...newLedgerEntries, ...currentEntries];

  localStorage.setItem(LOCAL_STORAGE_DISTRIB_KEY, JSON.stringify(allDistribs));
  localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(allInvoices));
  localStorage.setItem(LOCAL_STORAGE_VISAS_KEY, JSON.stringify(updatedVisas));
  localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(allEntries));

  if (!isConfigPlaceholder) {
    try {
      await Promise.all([
        setDoc(doc(db, DISTRIB_COLLECTION, distribution.id), distribution),
        ...createdInvoices.map((inv) => setDoc(doc(db, INVOICES_COLLECTION, inv.id), inv)),
        ...updatedVisas.map((v) => setDoc(doc(db, VISAS_COLLECTION, v.id), v)),
        ...newLedgerEntries.map((e) => setDoc(doc(db, ENTRIES_COLLECTION, e.id), e)),
      ]);
    } catch (err) {
      console.warn('Could not sync visa distribution batch to Firestore:', err);
    }
  }

  await logAuditEvent({
    action: 'CREATE_VISA_DISTRIBUTION',
    userId: params.createdBy,
    userName: params.createdBy,
    userEmail: '',
    userRole: 'owner',
    targetUserId: distribId,
    targetUserName: distribNo,
    details: { totalVisas: totalVisasAll, totalSellingSAR: totalSellingAll, invoicesCreated: createdInvoices.length },
  });

  return { distribution, invoices: createdInvoices };
}

export async function markCommissionPaid(
  actor: UserProfile,
  invoiceId: string,
  paymentAccountId: string
): Promise<void> {
  const invoices = await fetchVisaInvoices();
  const invIndex = invoices.findIndex(i => i.id === invoiceId || i.invoiceNo === invoiceId);
  if (invIndex === -1) throw new Error('Invoice not found');
  const inv = invoices[invIndex];

  if (!inv.commission || !inv.commission.enabled) {
    throw new Error('This invoice has no active commission enabled.');
  }
  if (inv.commission.status === 'Paid') {
    throw new Error('Commission is already marked as Paid.');
  }

  const now = new Date().toISOString();
  const exchangeRate = inv.exchangeRate || getCurrentRate('SAR-PKR');
  const commSAR = inv.commission.amountSAR;

  // Post balanced transaction: Dr Commission Expense (acc-sys-003) / Cr Cash-or-Bank (paymentAccountId)
  await postBalancedTransaction({
    date: now.split('T')[0],
    entryType: 'Payment',
    transNo: `COMM-${inv.invoiceNo}`,
    particulars: `Commission payment for Invoice #${inv.invoiceNo} to ${inv.commission.recipientName}`,
    invoiceRef: inv.invoiceNo,
    rate: exchangeRate,
    debitAccountId: 'acc-sys-003', // Commission Expense system account
    creditAccountId: paymentAccountId, // Bank or Cash account selected by Owner
    amountSAR: commSAR,
    createdBy: actor.name || 'Owner',
  });

  inv.commission.status = 'Paid';
  inv.commission.paidAt = now;

  invoices[invIndex] = inv;
  localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(invoices));

  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, INVOICES_COLLECTION, inv.id), inv);
    } catch (err) {
      console.warn('Could not update invoice commission in Firestore:', err);
    }
  }

  await logAuditEvent({
    action: 'MARK_COMMISSION_PAID',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: inv.id,
    targetUserName: inv.invoiceNo,
    details: { recipientName: inv.commission.recipientName, amountSAR: commSAR },
  });
}
