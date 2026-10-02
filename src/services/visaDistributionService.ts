import { getCurrentRate } from './exchangeRateService';
import { 
  VisaDistributionDoc, 
  VisaInvoiceDoc, 
  DistributionGroupLine 
} from '../types/visaDistribution';
import { VisaDoc, fetchVisas } from './visaService';
import { fetchLedgerAccounts, fetchLedgerEntries } from './accountingService';
import { LedgerEntryDoc, LedgerAccountDoc } from '../types/accounting';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { logAuditEvent } from './userService';

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
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as VisaDistributionDoc);
      }
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
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as VisaInvoiceDoc);
      }
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
  buyingPricePerVisa: number;
  agentGroupMap: Map<string, { agentId: string; sellingPricePerVisa: number; groupCode: string; groupName: string; visaIds: string[] }>;
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

  // Group distributions by agentId
  const agentBatches = new Map<string, {
    agentId: string;
    groups: Array<{ groupCode: string; groupName: string; visaIds: string[]; visaCount: number; sellingPricePerVisa: number }>;
    totalVisas: number;
    sellingTotalSAR: number;
    buyingTotalSAR: number;
  }>();

  params.agentGroupMap.forEach((data) => {
    const existing = agentBatches.get(data.agentId) || {
      agentId: data.agentId,
      groups: [],
      totalVisas: 0,
      sellingTotalSAR: 0,
      buyingTotalSAR: 0,
    };

    const visaCount = data.visaIds.length;
    const lineSelling = visaCount * data.sellingPricePerVisa;
    const lineBuying = visaCount * params.buyingPricePerVisa;

    existing.groups.push({
      groupCode: data.groupCode,
      groupName: data.groupName,
      visaIds: data.visaIds,
      visaCount,
      sellingPricePerVisa: data.sellingPricePerVisa,
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

  let totalVisasAll = 0;
  let totalBuyingAll = 0;
  let totalSellingAll = 0;

  for (const [agentId, batch] of agentBatches.entries()) {
    const exchangeRate = getCurrentRate('SAR-PKR'); // snapshotted active exchange rate

    batch.groups.forEach((g) => {
      createdGroups.push({
        groupCode: g.groupCode,
        groupName: g.groupName,
        agentId: batch.agentId,
        sellingPricePerVisa: g.sellingPricePerVisa,
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
          } as any;
        }
      });
    });

    const marginSAR = batch.sellingTotalSAR - batch.buyingTotalSAR;
    const invoiceNo = await getNextInvoiceNumber();
    const totalsPKR = Math.round(batch.sellingTotalSAR * exchangeRate * 100) / 100;

    const invoiceLines = batch.groups.map((g) => ({
      groupCode: g.groupCode,
      groupName: g.groupName,
      visaCount: g.visaCount,
      sellingPricePerVisa: g.sellingPricePerVisa,
      lineTotalSAR: g.visaCount * g.sellingPricePerVisa,
    }));

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
      createdBy: params.createdBy,
      createdAt: now,
    };

    createdInvoices.push(invoice);

    // Ledger postings for this invoice (double-entry into ledgerEntries)
    const baseSeq = currentEntries.length + newLedgerEntries.length + 20000;

    // (a) Debit Agent ledger receivable = sellingTotalSAR
    const debitAgentPKR = Math.round(batch.sellingTotalSAR * exchangeRate * 100) / 100;
    newLedgerEntries.push({
      id: `le-${baseSeq + 1}`,
      entryNo: `LE-${baseSeq + 1}`,
      date: params.date,
      accountId: agentId,
      entryType: 'Invoice',
      transNo: invoiceNo,
      particulars: `Visa Sales Invoice #${invoiceNo} (${batch.totalVisas} Visas distributed)`,
      invoiceRef: invoiceNo,
      rate: exchangeRate,
      debitSAR: batch.sellingTotalSAR,
      creditSAR: 0,
      debitPKR: debitAgentPKR,
      creditPKR: 0,
      createdBy: params.createdBy,
      createdAt: now,
      isVoid: false,
    });

    // (b) Credit Vendor (Shirka) ledger payable = buyingTotalSAR
    const creditVendorPKR = Math.round(batch.buyingTotalSAR * exchangeRate * 100) / 100;
    newLedgerEntries.push({
      id: `le-${baseSeq + 2}`,
      entryNo: `LE-${baseSeq + 2}`,
      date: params.date,
      accountId: params.vendorId,
      entryType: 'Invoice',
      transNo: invoiceNo,
      particulars: `Visa Purchase Cost for Invoice #${invoiceNo} (${batch.totalVisas} Visas)`,
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
      id: `le-${baseSeq + 3}`,
      entryNo: `LE-${baseSeq + 3}`,
      date: params.date,
      accountId: marginAccount!.id,
      entryType: 'Invoice',
      transNo: invoiceNo,
      particulars: `Visa Distribution Margin for Invoice #${invoiceNo}`,
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
    buyingPricePerVisa: params.buyingPricePerVisa,
    groups: createdGroups,
    totalVisas: totalVisasAll,
    totalBuyingSAR: totalBuyingAll,
    totalSellingSAR: totalSellingAll,
    marginSAR: totalSellingAll - totalBuyingAll,
    date: params.date,
    createdBy: params.createdBy,
    createdAt: now,
  };

  // Save to localStorage & Firestore
  const currentDistribs = await fetchVisaDistributions();
  const updatedDistribs = [distribution, ...currentDistribs];
  localStorage.setItem(LOCAL_STORAGE_DISTRIB_KEY, JSON.stringify(updatedDistribs));

  const currentInvoices = await fetchVisaInvoices();
  const updatedInvoices = [...createdInvoices, ...currentInvoices];
  localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(updatedInvoices));

  localStorage.setItem(LOCAL_STORAGE_VISAS_KEY, JSON.stringify(updatedVisas));

  const updatedAllEntries = [...newLedgerEntries, ...currentEntries];
  localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(updatedAllEntries));

  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, DISTRIB_COLLECTION, distribution.id), distribution);
      await Promise.all(createdInvoices.map((inv) => setDoc(doc(db, INVOICES_COLLECTION, inv.id), inv)));
      await Promise.all(updatedVisas.map((v) => setDoc(doc(db, VISAS_COLLECTION, v.id), v)));
      await Promise.all(newLedgerEntries.map((le) => setDoc(doc(db, ENTRIES_COLLECTION, le.id), le)));
    } catch (e) {
      console.warn('Could not sync distribution batch to Firestore:', e);
    }
  }

  // Audit log entry
  await logAuditEvent({
    action: 'CREATE_VISA_DISTRIBUTION',
    userId: 'system-operator',
    userName: params.createdBy,
    userEmail: 'operator@safardesk.com',
    userRole: 'owner',
    details: {
      message: `Distributed ${totalVisasAll} visas to ${agentBatches.size} agents from vendor ${params.vendorId}.`,
      totalVisas: totalVisasAll,
      totalBuyingSAR: totalBuyingAll,
      totalSellingSAR: totalSellingAll,
    },
  });

  return { distribution, invoices: createdInvoices };
}
