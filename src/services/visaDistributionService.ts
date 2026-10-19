import { 
  VisaDistributionDoc, 
  VisaInvoiceDoc, 
  InvoicePaxLine,
  DistributionGroupLine,
  CommissionDetails
} from '../types/visaDistribution';
import { VisaDoc, fetchVisas } from './visaService';
import { fetchLedgerAccounts, fetchLedgerEntries, postBalancedTransaction, saveLedgerAccount, voidLedgerEntry } from './accountingService';
import { bust, bustPrefix } from './queryCache';
import { LedgerEntryDoc, LedgerAccountDoc } from '../types/accounting';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { logAuditEvent } from './userService';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import { getCurrentRate, getBuyRate, getSellRate } from './exchangeRateService';
import { UserProfile } from '../types/auth';

const DISTRIB_COLLECTION = 'visa_distributions';
const INVOICES_COLLECTION = 'visa_invoices';
const VISAS_COLLECTION = 'visas';
const ENTRIES_COLLECTION = 'ledger_entries';

const LOCAL_STORAGE_DISTRIB_KEY = 'safardesk_visa_distributions_v1';
const LOCAL_STORAGE_INVOICES_KEY = 'safardesk_visa_invoices_v1';
const LOCAL_STORAGE_VISAS_KEY = 'safardesk_visas_directory';
const LOCAL_STORAGE_ENTRIES_KEY = 'safardesk_ledger_entries_v5';

export async function fetchVisaDistributions(): Promise<VisaDistributionDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, DISTRIB_COLLECTION));
      return snap.docs.map((d) => ({ ...d.data(), id: (d.data() as any).id || d.id } as VisaDistributionDoc));
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
      return snap.docs.map((d) => ({ ...d.data(), id: (d.data() as any).id || d.id } as VisaInvoiceDoc));
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
    // New VV docs use VV-<n>; legacy docs keep their INV-<n> numbers.
    // Numbering continues from the max across both so VV numbers never collide.
    const match = inv.invoiceNo.match(/(?:VV|INV)-(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) maxNum = val;
    }
  });
  return `VV-${maxNum + 1}`;
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
    packageType?: string;
    exchangeRateSARPKR: number; // Fix #29: manually entered per-agent SAR->PKR rate
    buyROE?: number; // Dual ROE: cost side (defaults to Settings Buying ROE)
    sellROE?: number; // Dual ROE: revenue side (defaults to Settings Selling ROE)
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
    // BUG FIX: the margin account was previously built in-memory only and never
    // persisted, so its entries matched no account doc and "Income — Visa Margin"
    // never showed in Balances. Persist it, mirroring the vendor account block below.
    try {
      await saveLedgerAccount(marginAccount);
    } catch { /* entries below still carry the correct accountId */ }
  }

  const distribId = `distrib-${Date.now()}`;
  const distribNo = `DIST-${Math.floor(1000 + Math.random() * 9000)}`;

  // Resolve Shirka display name for stamping + vendor name/code for its ledger account
  let shirkaName = '';
  let vendorName = '';
  let vendorCode = '';
  try {
    const { fetchVendors } = await import('./masterService');
    const vnd = (await fetchVendors()).find((v: any) => v.id === params.vendorId);
    const shk = (vnd?.shirkas || []).find((s: any) => s.id === params.shirkaId);
    shirkaName = shk?.name || '';
    vendorName = vnd?.name || '';
    vendorCode = vnd?.vendorCode || '';
  } catch { /* best-effort */ }

  // Resolve the vendor's LEDGER account (id `ledger-vnd-<vendorId>`), mirroring how
  // agent entries use the agent's ledger account id (`ledger-agent-...`).
  // BUG FIX: the vendor buying-cost entry previously used the raw vendorId as
  // accountId, which matches NO ledger account doc, so vendor balances stayed 0
  // and the vendor ledger showed no transactions. Create the account if missing.
  let vendorLedgerAccount = ledgerAccounts.find((a) =>
    a.id === `ledger-vnd-${params.vendorId}` ||
    (((a as any).linkedAgentId === params.vendorId || (a as any).linkedId === params.vendorId) && a.accountType === 'vendor')
  );
  if (!vendorLedgerAccount) {
    const newVendorAccount: LedgerAccountDoc = {
      id: `ledger-vnd-${params.vendorId}`,
      accountCode: vendorCode,
      accountType: 'vendor',
      title: vendorName || 'Vendor',
      linkedId: params.vendorId,
      isSystem: false,
      isActive: true,
      openingBalanceSAR: 0,
      openingBalancePKR: 0,
      createdAt: now,
      createdBy: params.createdBy,
    };
    try {
      await saveLedgerAccount(newVendorAccount);
    } catch { /* entries below still carry the correct accountId */ }
    vendorLedgerAccount = newVendorAccount;
  }

  // Group distributions by agentId
  const agentBatches = new Map<string, {
    agentId: string;
    groups: Array<{ groupCode: string; groupName: string; visaIds: string[]; visaCount: number; sellingPricePerVisa: number; buyingPricePerVisa: number; packageType?: string }>;
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
      packageType: data.packageType || undefined,
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

  // Guard: skip visas that are already distributed (stale UI can resubmit them —
  // this is how the same visa ended up on two VVs). Fail loudly if ALL are dupes.
  const skippedDistributed: string[] = [];
  params.agentGroupMap.forEach((data, key) => {
    const freshIds = data.visaIds.filter((vId) => {
      const v = visaById.get(vId);
      if (v && v.status === 'Distributed') {
        skippedDistributed.push(`${v.pilgrimName || vId} (${v.passportNumber || 'no passport'})`);
        return false;
      }
      return true;
    });
    if (freshIds.length !== data.visaIds.length) {
      params.agentGroupMap.set(key, { ...data, visaIds: freshIds });
    }
  });
  // Drop groups left with zero visas
  for (const [key, data] of Array.from(params.agentGroupMap.entries())) {
    if (data.visaIds.length === 0) params.agentGroupMap.delete(key);
  }
  if (params.agentGroupMap.size === 0) {
    throw new Error(
      `All selected visas are already distributed — nothing to distribute.` +
      (skippedDistributed.length ? ` Skipped: ${skippedDistributed.slice(0, 5).join('; ')}${skippedDistributed.length > 5 ? ` (+${skippedDistributed.length - 5} more)` : ''}` : '')
    );
  }

  let totalVisasAll = 0;
  let totalBuyingAll = 0;
  let totalSellingAll = 0;

  // Dual-role routing: if an agent is linked to a vendor (one party, one account),
  // its Dr postings go to the shared vendor ledger account. Non-dual agents keep
  // the original accountId behavior untouched.
  const dualRoleVendorAccount = new Map<string, string>();
  try {
    const { fetchAgents } = await import('./agentService');
    const allAgents = await fetchAgents();
    for (const [agentId] of agentBatches.keys()) {
      const ag: any = allAgents.find((a: any) => a.id === agentId);
      if (ag?.linkedVendorId) {
        dualRoleVendorAccount.set(agentId, `ledger-vnd-${ag.linkedVendorId}`);
      }
    }
  } catch { /* non-dual fallback below */ }

  for (const [agentId, batch] of agentBatches.entries()) {
    // Dual ROE: revenue side uses sellROE, cost side uses buyROE.
    // Manual per-group entry wins; otherwise the agent's manual rate; otherwise Settings.
    const agentManual = Number(batch.exchangeRateSARPKR) > 0 ? Number(batch.exchangeRateSARPKR) : 0;
    const sellROE = Number((batch as any).sellROE) > 0 ? Number((batch as any).sellROE) : (agentManual || getSellRate());
    const buyROE = Number((batch as any).buyROE) > 0 ? Number((batch as any).buyROE) : (agentManual || getBuyRate());
    // Legacy single-rate field kept for backward compatibility (mirrors sellROE).
    const exchangeRate = sellROE;

    batch.groups.forEach((g) => {
      createdGroups.push({
        groupCode: g.groupCode,
        groupName: g.groupName,
        agentId: batch.agentId,
        sellingPricePerVisa: g.sellingPricePerVisa,
        buyingPricePerVisa: g.buyingPricePerVisa,
        visaIds: g.visaIds,
        visaCount: g.visaCount,
        packageType: (g as any).packageType || undefined,
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
    const sellingTotalPKR = Math.round(batch.sellingTotalSAR * sellROE * 100) / 100;
    const buyingTotalPKR = Math.round(batch.buyingTotalSAR * buyROE * 100) / 100;
    const totalsPKR = sellingTotalPKR;

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
          packageType: (g as any).packageType || undefined,
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
      shirkaId: params.shirkaId || undefined,
      date: params.date,
      lines: invoiceLines,
      sellingTotalSAR: batch.sellingTotalSAR,
      buyingTotalSAR: batch.buyingTotalSAR,
      marginSAR,
      exchangeRate,
      buyROE,
      sellROE,
      buyingTotalPKR,
      sellingTotalPKR,
      totalsPKR,
      // NOTE (VV rename): `status` is kept on the doc for backward compatibility
      // with legacy INV- docs, but the VV UI no longer displays or filters by
      // Paid/Unpaid — a VV is not paid per-invoice; payments arrive as
      // separate payment documents. Do not reintroduce status UI here.
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
        const pkr = Math.round(sar * sellROE * 100) / 100;
        paxCount += 1;
        const seq = baseSeq + paxCount;
        newLedgerEntries.push({
          id: `le-${seq}`,
          entryNo: `LE-${seq}`,
          date: params.date,
          accountId: dualRoleVendorAccount.get(agentId) || agentId,
          entryType: 'Invoice',
          transNo: invoiceNo,
          particulars: `Visa — ${v?.pilgrimName || 'Pilgrim'} | PP: ${v?.passportNumber || '—'} | ${g.groupCode}${g.groupName && g.groupName !== g.groupCode ? ` (${g.groupName})` : ''} — SAR ${sar.toLocaleString()}/visa @${sellROE}`,
          invoiceRef: invoiceNo,
          rate: sellROE,
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
    // accountId MUST be the vendor's ledger account id (`ledger-vnd-<vendorId>`),
    // NOT the raw vendorId — entries only attach to accounts by exact id match.
    const creditVendorPKR = Math.round(batch.buyingTotalSAR * buyROE * 100) / 100;
    newLedgerEntries.push({
      id: `le-${baseSeq + paxCount + 1}`,
      entryNo: `LE-${baseSeq + paxCount + 1}`,
      date: params.date,
      accountId: vendorLedgerAccount.id,
      entryType: 'Invoice',
      transNo: invoiceNo,
      particulars: `Visa Purchase Cost for VV #${invoiceNo} (${batch.totalVisas} Visas)${shirkaName ? ` — ${shirkaName}` : ''} @${buyROE}`,
      invoiceRef: invoiceNo,
      rate: buyROE,
      debitSAR: 0,
      creditSAR: batch.buyingTotalSAR,
      debitPKR: 0,
      creditPKR: creditVendorPKR,
      createdBy: params.createdBy,
      createdAt: now,
      isVoid: false,
    });

    // (c) Credit "Income — Visa Margin" system account = marginSAR
    const creditMarginPKR = Math.round((sellingTotalPKR - buyingTotalPKR) * 100) / 100;
    newLedgerEntries.push({
      id: `le-${baseSeq + paxCount + 2}`,
      entryNo: `LE-${baseSeq + paxCount + 2}`,
      date: params.date,
      accountId: marginAccount.id,
      entryType: 'Invoice',
      transNo: invoiceNo,
      particulars: `Gross Visa Margin for VV #${invoiceNo}`,
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
        setDoc(doc(db, DISTRIB_COLLECTION, distribution.id), stripUndefinedDeep(distribution)),
        ...createdInvoices.map((inv) => setDoc(doc(db, INVOICES_COLLECTION, inv.id), stripUndefinedDeep(inv))),
        ...updatedVisas.map((v) => setDoc(doc(db, VISAS_COLLECTION, v.id), stripUndefinedDeep(v))),
        ...newLedgerEntries.map((e) => setDoc(doc(db, ENTRIES_COLLECTION, e.id), stripUndefinedDeep(e))),
      ]);
    } catch (err) {
      console.warn('Could not sync visa distribution batch to Firestore:', err);
      throw err;
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

/** Per-group rate row for VV editing (prefill + save). */
export interface VVEditGroup {
  groupCode: string;
  groupName: string;
  visaCount: number;
  sellingPricePerVisa: number;
  buyingPricePerVisa: number;
  packageType?: string;
}

/**
 * Build VV edit prefill: per-group selling from VV lines, per-group buying
 * from the distribution doc (falls back to VV average when missing).
 */
export async function getVVEditData(invoiceId: string): Promise<{ invoice: VisaInvoiceDoc; groups: VVEditGroup[] }> {
  const [invoices, distributions] = await Promise.all([fetchVisaInvoices(), fetchVisaDistributions()]);
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('VV not found');
  const distrib = distributions.find((d) => d.id === invoice.distributionId);
  const buyByGroup = new Map<string, number>();
  distrib?.groups.forEach((g) => {
    if (g.agentId === invoice.agentId) buyByGroup.set(g.groupCode, g.buyingPricePerVisa);
  });
  const avgBuying = invoice.lines.length > 0 ? invoice.buyingTotalSAR / invoice.lines.length : 0;

  const gmap = new Map<string, VVEditGroup>();
  invoice.lines.forEach((l) => {
    let g = gmap.get(l.groupCode);
    if (!g) {
      g = {
        groupCode: l.groupCode,
        groupName: l.groupName || l.groupCode,
        visaCount: 0,
        sellingPricePerVisa: l.sellingPricePerVisa,
        buyingPricePerVisa: buyByGroup.get(l.groupCode) ?? Math.round(avgBuying * 100) / 100,
        packageType: l.packageType || '',
      };
      gmap.set(l.groupCode, g);
    }
    g.visaCount += 1;
  });
  return { invoice, groups: Array.from(gmap.values()) };
}

/**
 * Owner (or staff with Visas edit permission) updates a VV's rates.
 * Old 'Invoice' ledger legs are voided (audit trail kept) and fresh legs
 * are posted under the SAME VV number with the corrected amounts.
 */
export async function updateVisaInvoiceRates(
  invoiceId: string,
  params: {
    date: string;
    exchangeRate: number;
    agentId?: string; // optional agent change — reposts Dr legs to the new agent
    groups: VVEditGroup[];
    editedBy: string;
  }
): Promise<VisaInvoiceDoc> {
  const invoices = await fetchVisaInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('VV not found');
  if (!params.date) throw new Error('Date is required');
  if (!(params.exchangeRate > 0)) throw new Error('Exchange rate must be greater than zero');

  const groupMap = new Map(params.groups.map((g) => [g.groupCode, g]));
  const now = new Date().toISOString();

  // 1) Void old ledger legs for this VV (history preserved via reversals)
  const allEntries = await fetchLedgerEntries();
  const oldLegs = allEntries.filter(
    (e) => e.transNo === invoice.invoiceNo && e.entryType === 'Invoice' && !e.isVoid
  );
  for (const leg of oldLegs) {
    await voidLedgerEntry(leg.id, `VV ${invoice.invoiceNo} edited — rates updated`, params.editedBy);
  }

  // 2) Rebuild pax lines with new group rates
  const newLines: InvoicePaxLine[] = invoice.lines.map((l) => {
    const g = groupMap.get(l.groupCode);
    const selling = g ? Math.round(g.sellingPricePerVisa * 100) / 100 : l.sellingPricePerVisa;
    return {
      ...l,
      sellingPricePerVisa: selling,
      lineTotalSAR: selling,
      packageType: g?.packageType || l.packageType,
    };
  });
  let sellingTotalSAR = 0;
  let buyingTotalSAR = 0;
  const visasByGroup = new Map<string, number>();
  newLines.forEach((l) => {
    sellingTotalSAR += l.lineTotalSAR;
    visasByGroup.set(l.groupCode, (visasByGroup.get(l.groupCode) || 0) + 1);
  });
  visasByGroup.forEach((count, code) => {
    const g = groupMap.get(code);
    const buying = g ? Math.round(g.buyingPricePerVisa * 100) / 100 : 0;
    buyingTotalSAR += Math.round(buying * count * 100) / 100;
  });
  sellingTotalSAR = Math.round(sellingTotalSAR * 100) / 100;
  buyingTotalSAR = Math.round(buyingTotalSAR * 100) / 100;
  const marginSAR = Math.round((sellingTotalSAR - buyingTotalSAR) * 100) / 100;
  const totalsPKR = Math.round(sellingTotalSAR * params.exchangeRate * 100) / 100;

  // Effective agent: the newly selected one, or the invoice's existing agent.
  const effectiveAgentId = params.agentId && params.agentId !== invoice.agentId ? params.agentId : invoice.agentId;
  const agentChanged = effectiveAgentId !== invoice.agentId;

  const updated: VisaInvoiceDoc = {
    ...invoice,
    date: params.date,
    agentId: effectiveAgentId,
    lines: newLines,
    sellingTotalSAR,
    buyingTotalSAR,
    marginSAR,
    exchangeRate: params.exchangeRate,
    totalsPKR,
  };

  // 3) Resolve ledger accounts (mirror of create flow)
  const ledgerAccounts = await fetchLedgerAccounts();
  let marginAccount = ledgerAccounts.find(
    (a) => a.accountCode === 'SYS-MARGIN' || a.title.toLowerCase().includes('visa margin')
  );
  if (!marginAccount) {
    marginAccount = {
      id: 'acc-sys-margin', accountCode: 'SYS-MARGIN', accountType: 'income',
      title: 'Income — Visa Margin', isSystem: true, isActive: true,
      openingBalanceSAR: 0, openingBalancePKR: 0, createdAt: now, createdBy: params.editedBy,
    };
    try { await saveLedgerAccount(marginAccount); } catch { /* entries still carry correct accountId */ }
  }
  let vendorLedgerAccount = ledgerAccounts.find(
    (a) => a.id === `ledger-vnd-${invoice.vendorId}` ||
      (((a as any).linkedAgentId === invoice.vendorId || (a as any).linkedId === invoice.vendorId) && a.accountType === 'vendor')
  );
  if (!vendorLedgerAccount) {
    vendorLedgerAccount = {
      id: `ledger-vnd-${invoice.vendorId}`, accountCode: '', accountType: 'vendor',
      title: 'Vendor', linkedId: invoice.vendorId, isSystem: false, isActive: true,
      openingBalanceSAR: 0, openingBalancePKR: 0, createdAt: now, createdBy: params.editedBy,
    };
    try { await saveLedgerAccount(vendorLedgerAccount); } catch { /* best-effort */ }
  }
  // Dual-role: agent linked to a vendor posts Dr to the shared vendor account
  let agentAccountId = effectiveAgentId;
  try {
    const { fetchAgents } = await import('./agentService');
    const ag: any = (await fetchAgents()).find((a: any) => a.id === effectiveAgentId);
    if (ag?.linkedVendorId) agentAccountId = `ledger-vnd-${ag.linkedVendorId}`;
  } catch { /* keep agentId */ }

  // 4) Post fresh legs under the SAME VV number — mirror of the create flow:
  //     per-pax Dr agent legs + summary Cr vendor leg + summary Cr margin leg.
  const rate = params.exchangeRate;
  const currentEntries = await fetchLedgerEntries();
  const baseSeq = currentEntries.length + 30000;
  const newLegs: LedgerEntryDoc[] = [];
  let seq = baseSeq;
  const mkLeg = (
    accountId: string, particulars: string,
    debitSAR: number, creditSAR: number
  ): LedgerEntryDoc => {
    seq += 1;
    return {
      id: `le-${seq}`,
      entryNo: `LE-${seq}`,
      date: params.date,
      accountId,
      entryType: 'Invoice',
      transNo: invoice.invoiceNo,
      particulars,
      invoiceRef: invoice.invoiceNo,
      rate,
      debitSAR: Math.round(debitSAR * 100) / 100,
      creditSAR: Math.round(creditSAR * 100) / 100,
      debitPKR: Math.round(debitSAR * rate * 100) / 100,
      creditPKR: Math.round(creditSAR * rate * 100) / 100,
      createdBy: params.editedBy,
      createdAt: now,
      isVoid: false,
    };
  };

  // (a) Per-pax Dr agent legs
  for (const l of newLines) {
    newLegs.push(mkLeg(
      agentAccountId,
      `Visa — ${l.pilgrimName} | PP: ${l.passportNumber} | ${l.groupCode}${l.groupName && l.groupName !== l.groupCode ? ` (${l.groupName})` : ''} — SAR ${l.sellingPricePerVisa.toLocaleString()}/visa (edited)`,
      l.lineTotalSAR, 0
    ));
  }
  // (b) Vendor payable (buying total)
  newLegs.push(mkLeg(
    vendorLedgerAccount.id,
    `Visa Purchase Cost for VV #${invoice.invoiceNo} (${newLines.length} Visas) — edited`,
    0, buyingTotalSAR
  ));
  // (c) Margin (selling - buying)
  newLegs.push(mkLeg(
    marginAccount.id,
    `Gross Visa Margin for VV #${invoice.invoiceNo} — edited`,
    0, marginSAR
  ));

  // Persist invoice + legs
  const existingInvoices = await fetchVisaInvoices();
  const allInvoices = [updated, ...existingInvoices.filter((i) => i.id !== invoice.id)];
  try { localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(allInvoices)); } catch { /* ignore */ }

  // If the agent changed, move the linked visa docs to the new agent too.
  if (agentChanged) {
    try {
      const { fetchVisas } = await import('./visaService');
      const visas = await fetchVisas();
      const linkedIds = new Set((invoice as any).visaIds || []);
      // Fallback: match by distributionId + old agent
      const toMove = visas.filter((v: any) =>
        linkedIds.has(v.id) || (v.distributionId === invoice.distributionId && v.agentId === invoice.agentId)
      );
      for (const v of toMove) {
        const patch = { agentId: effectiveAgentId, updatedAt: now, updatedBy: params.editedBy };
        try {
          if (!isConfigPlaceholder) {
            const { doc: fsDoc, setDoc: fsSet } = await import('firebase/firestore');
            const { db: fsDb } = await import('./firebase');
            await fsSet(fsDoc(fsDb, 'visas', v.id), stripUndefinedDeep({ ...v, ...patch }), { merge: true });
          }
        } catch { /* local fallback below */ }
      }
      const nextVisas = visas.map((v: any) =>
        toMove.some((m: any) => m.id === v.id) ? { ...v, agentId: effectiveAgentId, updatedAt: now, updatedBy: params.editedBy } : v
      );
      try { localStorage.setItem('safardesk_visas_v1', JSON.stringify(nextVisas)); } catch { /* ignore */ }
    } catch (err) {
      console.warn('Could not move visa docs to new agent:', err);
    }
  }
  const existingEntries = await fetchLedgerEntries();
  const allEntriesNew = [...newLegs, ...existingEntries];
  try { localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(allEntriesNew)); } catch { /* ignore */ }
  bust('ledger:entries:all'); bustPrefix('ledger:entries:');
  bustPrefix('visa_invoices');

  if (!isConfigPlaceholder) {
    try {
      await Promise.all([
        setDoc(doc(db, INVOICES_COLLECTION, updated.id), stripUndefinedDeep(updated)),
        ...newLegs.map((e) => setDoc(doc(db, ENTRIES_COLLECTION, e.id), stripUndefinedDeep(e))),
      ]);
    } catch (err) {
      console.warn('Could not sync VV edit to Firestore:', err);
      throw err;
    }
  }

  await logAuditEvent({
    action: 'EDIT_VV_RATES',
    userId: params.editedBy,
    userName: params.editedBy,
    userEmail: '',
    userRole: 'owner',
    targetUserId: updated.id,
    targetUserName: updated.invoiceNo,
    details: { sellingTotalSAR, buyingTotalSAR, marginSAR, groups: params.groups.length },
  }).catch(() => {});

  return updated;
}

/**
 * Void a VV (owner or staff with Visas edit access).
 * Marks the VV doc void + voids all its 'Invoice' ledger legs (audit trail
 * kept via reversals). Visa docs are left untouched — they may be billed
 * on another VV (e.g. double-import cleanup).
 */
export async function voidVisaInvoice(
  invoiceId: string,
  reason: string,
  voidedBy: string
): Promise<VisaInvoiceDoc> {
  if (!reason.trim()) throw new Error('A void reason is required.');
  const invoices = await fetchVisaInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('VV not found');
  if ((invoice as any).isVoid) throw new Error('VV is already voided');

  // Void all live ledger legs for this VV
  const allEntries = await fetchLedgerEntries();
  const legs = allEntries.filter(
    (e) => e.transNo === invoice.invoiceNo && e.entryType === 'Invoice' && !e.isVoid
  );
  for (const leg of legs) {
    await voidLedgerEntry(leg.id, `VV ${invoice.invoiceNo} voided: ${reason.trim()}`, voidedBy);
  }

  const now = new Date().toISOString();
  const updated: VisaInvoiceDoc = {
    ...invoice,
    isVoid: true,
    voidReason: reason.trim(),
    voidedAt: now,
    voidedBy,
  } as VisaInvoiceDoc;

  const existingInvoices = await fetchVisaInvoices();
  const allInvoices = [updated, ...existingInvoices.filter((i) => i.id !== invoice.id)];
  try { localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(allInvoices)); } catch { /* ignore */ }
  bustPrefix('visa_invoices');
  bust('ledger:entries:all'); bustPrefix('ledger:entries:');

  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, INVOICES_COLLECTION, updated.id), stripUndefinedDeep(updated));
    } catch (err) {
      console.warn('Could not sync VV void to Firestore:', err);
      throw err;
    }
  }

  await logAuditEvent({
    action: 'VOID_VV',
    userId: voidedBy,
    userName: voidedBy,
    userEmail: '',
    userRole: 'owner',
    targetUserId: updated.id,
    targetUserName: updated.invoiceNo,
    details: { reason: reason.trim(), legsVoided: legs.length },
  }).catch(() => {});

  return updated;
}

/**
 * Hard-delete a VV (Owner only). Follows the voidVisaInvoice pattern:
 * live ledger legs are voided first so the books stay balanced, then the VV
 * document is permanently removed from Firestore and localStorage.
 */
export async function deleteVisaInvoice(invoiceId: string, actor: UserProfile): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only the Owner can delete a VV.');
  }
  const invoices = await fetchVisaInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('VV not found.');

  // Void all live ledger legs for this VV (same pattern as voidVisaInvoice)
  const allEntries = await fetchLedgerEntries();
  const legs = allEntries.filter(
    (e) => e.transNo === invoice.invoiceNo && e.entryType === 'Invoice' && !e.isVoid
  );
  for (const leg of legs) {
    await voidLedgerEntry(leg.id, `VV ${invoice.invoiceNo} deleted`, actor.name || actor.email);
  }

  if (!isConfigPlaceholder) {
    try {
      await deleteDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    } catch (err) {
      console.warn('Could not delete VV from Firestore:', err);
      throw err;
    }
  }

  const remaining = invoices.filter((i) => i.id !== invoiceId);
  try { localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(remaining)); } catch { /* ignore */ }
  bustPrefix('visa_invoices');
  bust('ledger:entries:all'); bustPrefix('ledger:entries:');

  await logAuditEvent({
    action: 'DELETE_VV',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: invoice.id,
    targetUserName: invoice.invoiceNo,
    details: { legsVoided: legs.length },
  }).catch(() => {});
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
    particulars: `Commission payment for VV #${inv.invoiceNo} to ${inv.commission.recipientName}`,
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
      await setDoc(doc(db, INVOICES_COLLECTION, inv.id), stripUndefinedDeep(inv));
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

/**
 * One-time migration: backfill shirkaId on old invoices from their distributions.
 * Old invoices were created before shirkaId was stored on VisaInvoiceDoc.
 */
export async function backfillInvoiceShirkaIds(): Promise<number> {
  const [invoices, distributions] = await Promise.all([
    fetchVisaInvoices(),
    fetchVisaDistributions(),
  ]);
  const distMap = new Map(distributions.map(d => [d.id, d]));
  let updated = 0;
  
  for (const inv of invoices) {
    if (inv.shirkaId) continue; // Already has it
    const dist = distMap.get(inv.distributionId);
    if (dist?.shirkaId) {
      const updatedInv = { ...inv, shirkaId: dist.shirkaId };
      if (!isConfigPlaceholder) {
        await setDoc(doc(db, INVOICES_COLLECTION, inv.id), stripUndefinedDeep(updatedInv));
      }
      updated++;
    }
  }
  // Refresh localStorage cache
  if (updated > 0 && !isConfigPlaceholder) {
    const fresh = await fetchVisaInvoices();
    localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(fresh));
  }
  return updated;
}


// ---------------------------------------------------------------------------
// Repair: distributions that failed to sync to Firestore (the undefined-field
// bug). They show as Distributed locally but were never actually saved.
// This resets those visas back to undistributed and removes orphaned docs.
// ---------------------------------------------------------------------------

export interface FailedDistributionInfo {
  id: string;
  distributionNo: string;
  date: string;
  totalVisas: number;
}

function readLocal<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

/** Distributions that exist locally but never reached Firestore. */
export async function detectFailedDistributions(): Promise<FailedDistributionInfo[]> {
  const localDistribs = readLocal<any>(LOCAL_STORAGE_DISTRIB_KEY);
  if (localDistribs.length === 0) return [];

  let firestoreIds = new Set<string>();
  if (!isConfigPlaceholder) {
    try {
      const snap = await getDocs(collection(db, DISTRIB_COLLECTION));
      firestoreIds = new Set(snap.docs.map((d) => d.id));
    } catch {
      return []; // can't verify — don't touch anything
    }
  }

  return localDistribs
    .filter((d: any) => d && d.id && !firestoreIds.has(d.id))
    .map((d: any) => ({
      id: d.id,
      distributionNo: d.distributionNo || d.id,
      date: d.date || '',
      totalVisas: d.totalVisas || 0,
    }));
}

/**
 * Repair failed distributions: reset their visas to undistributed,
 * delete orphaned Firestore ledger entries, and clean localStorage.
 * Only touches distributions that never reached Firestore — real ones are safe.
 */
export async function repairFailedDistributions(ids: string[]): Promise<{
  distributions: number;
  visas: number;
  ledgerEntries: number;
}> {
  const idSet = new Set(ids);
  let visaCount = 0;
  let entryCount = 0;

  const localDistribs = readLocal<any>(LOCAL_STORAGE_DISTRIB_KEY);
  const localInvoices = readLocal<any>(LOCAL_STORAGE_INVOICES_KEY);
  const localEntries = readLocal<LedgerEntryDoc>(LOCAL_STORAGE_ENTRIES_KEY);
  const localVisas = readLocal<VisaDoc>(LOCAL_STORAGE_VISAS_KEY);

  // Invoice numbers belonging to failed distributions (to find orphaned ledger entries)
  const failedInvoiceNos = new Set<string>();
  const failedVisaIds = new Set<string>();
  localDistribs.forEach((d: any) => {
    if (!d || !idSet.has(d.id)) return;
    (d.groups || []).forEach((g: any) => {
      (g.visaIds || []).forEach((vId: string) => failedVisaIds.add(vId));
    });
  });
  localInvoices.forEach((inv: any) => {
    if (inv && idSet.has(inv.distributionId) && inv.invoiceNo) {
      failedInvoiceNos.add(inv.invoiceNo);
    }
  });

  // 1. Delete orphaned Firestore ledger entries (they synced; invoices didn't)
  if (!isConfigPlaceholder && failedInvoiceNos.size > 0) {
    try {
      const nos = [...failedInvoiceNos];
      // Firestore 'in' supports max 10 per query — chunk it
      for (let i = 0; i < nos.length; i += 10) {
        const chunk = nos.slice(i, i + 10);
        const q = query(collection(db, ENTRIES_COLLECTION), where('invoiceRef', 'in', chunk));
        const snap = await getDocs(q);
        for (const d of snap.docs) {
          await deleteDoc(d.ref);
          entryCount += 1;
        }
      }
    } catch (err) {
      console.warn('Could not delete orphaned ledger entries:', err);
    }
  }

  // 2. Reset visas (Firestore + localStorage): only those tied to failed distributions
  const resetVisa = (v: any) => {
    if (!v || !failedVisaIds.has(v.id)) return v;
    if (v.status === 'Distributed' || v.distributionId) {
      visaCount += 1;
      const { agentId: _a, distributionId: _d, vendorId: _v, shirkaId: _s, shirkaName: _sn, ...rest } = v;
      return { ...rest, status: 'Pending' };
    }
    return v;
  };

  const updatedLocalVisas = localVisas.map(resetVisa);
  localStorage.setItem(LOCAL_STORAGE_VISAS_KEY, JSON.stringify(updatedLocalVisas));

  if (!isConfigPlaceholder) {
    try {
      const snap = await getDocs(collection(db, VISAS_COLLECTION));
      const batch: Promise<void>[] = [];
      snap.docs.forEach((d) => {
        const v = d.data() as any;
        if (v && failedVisaIds.has(v.id) && (v.status === 'Distributed' || v.distributionId)) {
          const { agentId: _a, distributionId: _dd, vendorId: _v, shirkaId: _s, shirkaName: _sn, ...rest } = v;
          batch.push(setDoc(d.ref, stripUndefinedDeep({ ...rest, status: 'Pending' })));
        }
      });
      await Promise.all(batch);
    } catch (err) {
      console.warn('Could not reset visas in Firestore:', err);
    }
  }

  // 3. Clean localStorage: remove failed distributions, their invoices, their entries
  const remainingDistribs = localDistribs.filter((d: any) => !idSet.has(d?.id));
  const remainingInvoices = localInvoices.filter((inv: any) => !idSet.has(inv?.distributionId));
  const remainingEntries = localEntries.filter((e: any) => !(e?.invoiceRef && failedInvoiceNos.has(e.invoiceRef)));
  localStorage.setItem(LOCAL_STORAGE_DISTRIB_KEY, JSON.stringify(remainingDistribs));
  localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(remainingInvoices));
  localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(remainingEntries));

  await logAuditEvent({
    action: 'REPAIR_FAILED_DISTRIBUTIONS',
    userId: 'system',
    userName: 'system',
    userEmail: '',
    userRole: 'owner',
    targetUserId: ids.join(','),
    targetUserName: 'failed-distribution-repair',
    details: { distributions: ids.length, visas: visaCount, ledgerEntries: entryCount },
  });

  return { distributions: ids.length, visas: visaCount, ledgerEntries: entryCount };
}
