import { 
  BankDoc, 
  PaymentDoc, 
  PaymentEntryType, 
  InvoiceRecord,
  AiVerificationResult
} from '../types/payment';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import { db, isConfigPlaceholder } from './firebase';
import { postBalancedTransaction, voidLedgerEntry, deleteLedgerEntry, fetchLedgerEntries, fetchLedgerAccounts } from './accountingService';
import { TENANT } from '../config';
import { uploadReceipt, verifyReceiptWithAI } from './driveService';
import { getCurrentRate } from './exchangeRateService';
import { cached, bust } from './queryCache';

const PAYMENTS_COLLECTION = 'payments';
const BANKS_COLLECTION = 'banks';
const INVOICES_COLLECTION = 'accounts_invoices';

const LOCAL_STORAGE_PAYMENTS_KEY = 'safardesk_payments_v3';
const LOCAL_STORAGE_BANKS_KEY = 'safardesk_banks_v3';
const LOCAL_STORAGE_INVOICES_KEY = 'safardesk_invoices_v3';

/**
 * Receipt photos as base64 data URLs are huge (MBs) — they must NEVER be
 * persisted to localStorage (5MB quota) or Firestore (1MB doc limit).
 * The data URL lives only in memory for the current session; the background
 * upload replaces it with a Drive link. This strips it before any write.
 */
function stripReceiptDataForStorage<T>(item: T): T {
  const p = item as any;
  if (p && typeof p.receiptFile === 'string' && p.receiptFile.startsWith('data:')) {
    return { ...p, receiptFile: null };
  }
  return item;
}

function savePaymentsToStorage(payments: PaymentDoc[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(payments.map(stripReceiptDataForStorage)));
  } catch {
    /* storage full/blocked — Firestore is source of truth */
  }
}

const SAMPLE_RECEIPT_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500" style="background-color:#ffffff;font-family:sans-serif">
  <rect x="10" y="10" width="380" height="480" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <rect x="25" y="25" width="350" height="50" rx="6" fill="#0e2c4c"/>
  <text x="200" y="55" fill="#ffffff" font-size="16" font-weight="bold" text-anchor="middle">OFFICIAL TRANSACTION RECEIPT</text>
  <text x="35" y="110" fill="#64748b" font-size="11">DATE / TIME:</text>
  <text x="140" y="110" fill="#0f172a" font-size="12" font-weight="bold">2026-10-01 14:30:22 GMT</text>
  <line x1="30" y1="125" x2="370" y2="125" stroke="#e2e8f0" stroke-width="1.5"/>
  <text x="35" y="155" fill="#64748b" font-size="11">TRANSACTION REF:</text>
  <text x="170" y="155" fill="#0e2c4c" font-size="13" font-weight="bold" font-family="monospace">TX-SA-8891024</text>
  <text x="35" y="185" fill="#64748b" font-size="11">PAYMENT CHANNEL:</text>
  <text x="170" y="185" fill="#0f172a" font-size="12" font-weight="bold">Al-Rajhi Bank Wire Transfer</text>
  <text x="35" y="215" fill="#64748b" font-size="11">SOURCE ACCOUNT:</text>
  <text x="170" y="215" fill="#0f172a" font-size="12">SA4480000482001928374</text>
  <line x1="30" y1="240" x2="370" y2="240" stroke="#e2e8f0" stroke-width="1.5"/>
  <rect x="30" y="260" width="340" height="80" rx="8" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="50" y="295" fill="#64748b" font-size="12">SETTLED AMOUNT (SAR):</text>
  <text x="50" y="325" fill="#0e2c4c" font-size="24" font-weight="black" font-family="monospace">SAR 8,000.00</text>
  <text x="230" y="325" fill="#10b981" font-size="13" font-weight="bold">CONFIRMED</text>
  <text x="35" y="375" fill="#64748b" font-size="10">REMITTER REMARKS:</text>
  <text x="35" y="395" fill="#334155" font-size="11">MoFA Electronic Visa batch settlement for October groups.</text>
  <rect x="35" y="425" width="100" height="40" rx="4" fill="#e2e8f0"/>
  <text x="85" y="448" fill="#475569" font-size="9" text-anchor="middle" font-weight="bold">BANK STAMP</text>
  <text x="365" y="465" fill="#94a3b8" font-size="9" text-anchor="end">SafarDesk Verified Audit Copy</text>
</svg>
`);

export const INITIAL_BANKS: BankDoc[] = [
  {
    id: 'bnk-001',
    bankName: 'Al-Rajhi Bank (Saudi Arabia)',
    accountTitle: `${TENANT.companyName} Corporate Treasury`,
    accountNumber: '',
    iban: '',
    branch: '',
    currency: 'SAR',
    linkedLedgerAccountId: 'acc-bnk-001',
    isActive: true,
  },
  {
    id: 'bnk-002',
    bankName: 'Meezan Bank (Pakistan)',
    accountTitle: `${TENANT.companyName} Pakistan Operations`,
    accountNumber: '',
    iban: '',
    branch: '',
    currency: 'PKR',
    linkedLedgerAccountId: 'acc-bnk-002',
    isActive: true,
  },
  {
    id: 'bnk-003',
    bankName: 'Saudi National Bank (SNB / AlAhli)',
    accountTitle: `${TENANT.companyName} Ground Transport Ops`,
    accountNumber: '',
    iban: '',
    branch: '',
    currency: 'SAR',
    linkedLedgerAccountId: 'acc-bnk-001',
    isActive: true,
  },
];

export const INITIAL_INVOICES: InvoiceRecord[] = [
  {
    invoiceNo: 'INV-2026-081',
    accountId: 'acc-agt-001',
    accountCode: 'AGT-001',
    accountTitle: 'Al-Barakah Travel & Tours Karachi',
    date: '2026-09-15',
    module: 'Visa',
    description: 'MoFA Electronic Visas Issued (Batch 12 Pax)',
    totalSAR: 5400,
    paidSAR: 5400,
    balanceSAR: 0,
    status: 'Paid',
  },
  {
    invoiceNo: 'INV-TKT-5510',
    accountId: 'acc-agt-002',
    accountCode: 'AGT-002',
    accountTitle: 'Falcon International Travels Lahore',
    date: '2026-09-22',
    module: 'Ticket',
    description: 'Saudia Airline 20x Group Seats (ISB - JED - ISB)',
    totalSAR: 42000,
    paidSAR: 10000,
    balanceSAR: 32000,
    status: 'Partially Paid',
  },
  {
    invoiceNo: 'UV-000101',
    accountId: 'acc-agt-001',
    accountCode: 'AGT-001',
    accountTitle: 'Al-Barakah Travel & Tours Karachi',
    date: '2026-09-20',
    module: 'Voucher',
    description: 'Fairmont Makkah Clock Tower & Staria VIP transfers',
    totalSAR: 6600,
    paidSAR: 2600,
    balanceSAR: 4000,
    status: 'Partially Paid',
  },
  {
    invoiceNo: 'INV-VSA-9902',
    accountId: 'acc-agt-003',
    accountCode: 'AGT-003',
    accountTitle: 'Makkah Direct Rawalpindi',
    date: '2026-09-28',
    module: 'Visa',
    description: 'Umrah Electronic Visas (Batch 8 Pax)',
    totalSAR: 3600,
    paidSAR: 0,
    balanceSAR: 3600,
    status: 'Unpaid',
  },
];

export const INITIAL_PAYMENTS: PaymentDoc[] = [
  {
    id: 'pmt-00101',
    paymentNo: 'PMT-00101',
    date: '2026-09-25',
    entryType: 'bank-received',
    fromAccountId: 'acc-agt-001', // Al-Barakah
    toAccountId: 'acc-bnk-001',   // Al-Rajhi Bank
    bankAccountId: 'bnk-001',
    amountSAR: 8000,
    exchangeRate: 74.50,
    amountPKR: 596000,
    againstInvoiceNo: 'INV-2026-081',
    particulars: 'Inward TT bank transfer from Al-Barakah Karachi against Visa Batch INV-2026-081',
    receiptFile: SAMPLE_RECEIPT_SVG,
    receiptFileName: 'PMT-00101.png',
    receiptFileType: 'image',
    createdBy: 'Agency Owner',
    createdAt: '2026-09-25T14:30:00Z',
    isVoid: false,
    debitEntryId: 'le-10005',
    creditEntryId: 'le-10006',
    driveSyncStatus: 'synced',
    driveFileId: 'drive-file-sample-01',
    webViewLink: 'https://drive.google.com/file/d/drive-file-sample-01/view',
    aiStatus: 'Verified',
    aiExtractedDate: '2026-09-25',
    aiNotes: 'Legitimate Al-Rajhi Bank transfer slip. Date and remitter verified.',
    needsOwnerReview: false,
    ownerApproved: true,
  },
  {
    id: 'pmt-00102',
    paymentNo: 'PMT-00102',
    date: '2026-09-26',
    entryType: 'cash-sent',
    fromAccountId: 'acc-csh-001', // Makkah Cash Till
    toAccountId: 'acc-htl-001',   // Fairmont Hotel
    amountSAR: 3000,
    exchangeRate: 74.50,
    amountPKR: 223500,
    againstInvoiceNo: 'UV-000101',
    particulars: 'Cash deposit paid directly to Fairmont front desk cashier for room reservation',
    receiptFile: SAMPLE_RECEIPT_SVG,
    receiptFileName: 'PMT-00102.png',
    receiptFileType: 'image',
    createdBy: 'Operations Staff',
    createdAt: '2026-09-26T16:00:00Z',
    isVoid: false,
    driveSyncStatus: 'synced',
    driveFileId: 'drive-file-sample-02',
    webViewLink: 'https://drive.google.com/file/d/drive-file-sample-02/view',
    aiStatus: 'Verified',
    aiExtractedDate: '2026-09-26',
    aiNotes: 'Cash voucher validated with official front desk stamp.',
    needsOwnerReview: false,
    ownerApproved: true,
  },
  {
    id: 'pmt-00103',
    paymentNo: 'PMT-00103',
    date: '2026-09-29',
    entryType: 'bank-sent',
    fromAccountId: 'acc-bnk-001', // Al-Rajhi
    toAccountId: 'acc-vnd-001',   // Al-Haramain Group
    bankAccountId: 'bnk-001',
    amountSAR: 4500,
    exchangeRate: 74.50,
    amountPKR: 335250,
    againstInvoiceNo: null,
    particulars: 'Advance wire transfer to Al-Haramain Group for October Umrah bus slots',
    receiptFile: SAMPLE_RECEIPT_SVG,
    receiptFileName: 'PMT-00103.png',
    receiptFileType: 'image',
    createdBy: 'Agency Owner',
    createdAt: '2026-09-29T11:20:00Z',
    isVoid: false,
    driveSyncStatus: 'pending',
    driveFileId: null,
    webViewLink: null,
    driveError: 'Google Drive was offline during submission. Retry available.',
    aiStatus: 'Verified',
    aiExtractedDate: '2026-09-29',
    aiNotes: 'Wire proof confirmed.',
    needsOwnerReview: false,
  },
  {
    id: 'pmt-00104',
    paymentNo: 'PMT-00104',
    date: '2026-10-01',
    entryType: 'cash-received',
    fromAccountId: 'acc-agt-002', // Falcon Travels
    toAccountId: 'acc-csh-002',   // Karachi Cash Drawer
    amountSAR: 10000,
    exchangeRate: 75.00,
    amountPKR: 750000,
    againstInvoiceNo: 'INV-TKT-5510',
    particulars: 'Cash collection at Karachi branch counter for group tickets INV-TKT-5510',
    receiptFile: SAMPLE_RECEIPT_SVG,
    receiptFileName: 'PMT-00104.png',
    receiptFileType: 'image',
    createdBy: 'Accounts Executive',
    createdAt: '2026-10-01T09:45:00Z',
    isVoid: false,
    driveSyncStatus: 'pending',
    driveFileId: null,
    webViewLink: null,
    aiStatus: 'Needs Review',
    aiExtractedDate: null,
    aiNotes: 'Uploaded document has faint date stamp. Date match could not be confirmed automatically. Flagged for Owner review.',
    needsOwnerReview: true,
    ownerApproved: false,
  },
];

export async function fetchBanks(): Promise<BankDoc[]> {
  let firestoreBanks: BankDoc[] = [];
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, BANKS_COLLECTION));
      firestoreBanks = snap.docs.map((d) => {
        const data = d.data() as BankDoc;
        return { ...data, id: (data as any).id || d.id };
      });
    }
  } catch (err) {
    console.warn('Could not read banks from Firestore:', err);
  }

  let localBanks: BankDoc[] = [];
  const stored = localStorage.getItem(LOCAL_STORAGE_BANKS_KEY);
  if (stored) {
    try {
      localBanks = JSON.parse(stored);
    } catch {
      localBanks = [];
    }
  }
  const byId = new Map<string, BankDoc>();
  for (const b of localBanks) if ((b as any)?.id) byId.set((b as any).id, b);
  for (const b of firestoreBanks) if ((b as any)?.id) byId.set((b as any).id, b);
  return Array.from(byId.values());
}

export async function saveBank(bank: BankDoc): Promise<BankDoc> {
  const banks = await fetchBanks();
  const idx = banks.findIndex((b) => b.id === bank.id);
  const next = idx >= 0 ? banks.map((b, i) => (i === idx ? bank : b)) : [bank, ...banks];
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, BANKS_COLLECTION, bank.id), stripUndefinedDeep(bank));
    }
  } catch (err) {
    console.warn('Could not save bank to Firestore:', err);
  }
  localStorage.setItem(LOCAL_STORAGE_BANKS_KEY, JSON.stringify(next));
  return bank;
}

export async function fetchInvoices(): Promise<InvoiceRecord[]> {
  let firestoreInvoices: InvoiceRecord[] = [];
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, INVOICES_COLLECTION));
      firestoreInvoices = snap.docs.map((d) => {
        const data = d.data() as InvoiceRecord;
        return { ...data, invoiceNo: data.invoiceNo || d.id };
      });
    }
  } catch (err) {
    console.warn('Could not read invoices from Firestore:', err);
  }

  let localInvoices: InvoiceRecord[] = [];
  const stored = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
  if (stored) {
    try {
      localInvoices = JSON.parse(stored);
    } catch {
      localInvoices = [];
    }
  }
  const byNo = new Map<string, InvoiceRecord>();
  for (const inv of localInvoices) if (inv?.invoiceNo) byNo.set(inv.invoiceNo, inv);
  for (const inv of firestoreInvoices) if (inv?.invoiceNo) byNo.set(inv.invoiceNo, inv);
  return Array.from(byNo.values());
}

async function fetchPaymentsRaw(): Promise<PaymentDoc[]> {
  let firestorePayments: PaymentDoc[] = [];
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, PAYMENTS_COLLECTION));
      firestorePayments = snap.docs.map((d) => ({ ...d.data(), id: (d.data() as any).id || d.id } as PaymentDoc));
    }
  } catch (err) {
    console.warn('Could not read payments from Firestore:', err);
  }

  let localPayments: PaymentDoc[] = [];
  const stored = localStorage.getItem(LOCAL_STORAGE_PAYMENTS_KEY);
  if (stored) {
    try {
      localPayments = JSON.parse(stored);
      // One-time cleanup: strip any base64 receipt data bloating localStorage.
      if (localPayments.some((p: any) => typeof p?.receiptFile === 'string' && p.receiptFile.startsWith('data:'))) {
        savePaymentsToStorage(localPayments);
        localPayments = localPayments.map((p: any) =>
          (typeof p?.receiptFile === 'string' && p.receiptFile.startsWith('data:')) ? { ...p, receiptFile: null } : p
        );
      }
    } catch {
      localPayments = [];
    }
  }
  const byId = new Map<string, PaymentDoc>();
  for (const pm of localPayments) if ((pm as any)?.id) byId.set((pm as any).id, pm);
  for (const pm of firestorePayments) if ((pm as any)?.id) byId.set((pm as any).id, pm);
  return Array.from(byId.values());
}

/** Cached: repeat visits within 90s don't re-download the whole collection. */
export function fetchPayments(): Promise<PaymentDoc[]> {
  return cached('payments:all', fetchPaymentsRaw);
}

export async function getNextPaymentNumber(): Promise<string> {
  const current = await fetchPayments();
  let maxSeq = 100;
  current.forEach((p) => {
    const match = p.paymentNo.match(/PMT-(\d+)/);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxSeq) maxSeq = val;
    }
  });
  return `PMT-${String(maxSeq + 1).padStart(5, '0')}`;
}

/**
 * Create a new Payment doc with Google Drive storage & AI verification
 */
export async function createPayment(params: {
  date: string;
  entryType: PaymentEntryType;
  fromAccountId: string;
  toAccountId: string;
  bankAccountId?: string | null;
  amountSAR: number;
  exchangeRate: number;
  enteredCurrency?: 'SAR' | 'PKR';
  enteredAmount?: number;
  againstInvoiceNo?: string | null;
  particulars: string;
  receiptFile: string; // MANDATORY
  receiptFileName?: string;
  receiptFileType?: 'image' | 'pdf';
  createdBy: string;
  paymentNo?: string; // optional — preserves the number when reposting an edited payment
}): Promise<PaymentDoc> {
  bust('payments:all'); // fresh read after write
  // HARD VALIDATION: RECEIPT RULE
  if (!params.receiptFile || !params.receiptFile.trim()) {
    throw new Error('RECEIPT RULE VIOLATION: A payment cannot be saved without an attached receipt file.');
  }

  const paymentNo = params.paymentNo || await getNextPaymentNumber();
  const exchangeRate = params.exchangeRate || getCurrentRate('SAR-PKR');
  const amountPKR = Math.round(params.amountSAR * exchangeRate * 100) / 100;
  const now = new Date().toISOString();

  const isReceived = params.entryType === 'cash-received' || params.entryType === 'bank-received';

  // Helper: hard timeout so a hanging call never blocks (used by background tasks).
  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
      ),
    ]);

  // Helper: patch a payment doc in localStorage + Firestore (used by background tasks).
  const patchPaymentDoc = async (paymentId: string, patch: Partial<PaymentDoc>) => {
    try {
      const list = await fetchPayments();
      const i = list.findIndex((x) => x.id === paymentId);
      if (i === -1) return;
      const updated = { ...list[i], ...patch };
      list[i] = updated;
      try { savePaymentsToStorage(list); } catch { /* ignore */ }
      if (!isConfigPlaceholder) {
        await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), stripUndefinedDeep(stripReceiptDataForStorage(updated)));
      }
    } catch (e) {
      console.warn('Background payment patch failed:', e);
    }
  };

  // Background tasks: AI verification + Drive upload run AFTER the payment is saved,
  // so the UI never waits for them. They patch the payment doc when done.
  const runBackgroundTasks = async (paymentId: string) => {
    // 1. AI verification
    try {
      const ai = await withTimeout(
        verifyReceiptWithAI({
          fileDataUrl: params.receiptFile,
          expectedDate: params.date,
          amountSAR: params.amountSAR,
        }),
        45000,
        'AI receipt verification'
      );
      const needsReview = ai.aiStatus === 'Needs Review';
      await patchPaymentDoc(paymentId, {
        aiStatus: ai.aiStatus,
        aiExtractedDate: ai.aiExtractedDate,
        aiNotes: ai.aiNotes,
        needsOwnerReview: needsReview,
        ownerApproved: !needsReview,
      });
    } catch (err) {
      console.warn('Background AI verification failed:', err);
      await patchPaymentDoc(paymentId, {
        aiNotes: 'AI verification pending — will retry on next load.',
      });
    }

    // 2. Drive/Storage upload
    try {
      const up = await withTimeout(
        uploadReceipt({
          paymentNo,
          fileDataUrl: params.receiptFile,
          fileType: params.receiptFileType || 'image',
          isReceived,
        }),
        60000,
        'Receipt upload'
      );
      if (up.success && up.webViewLink) {
        await patchPaymentDoc(paymentId, {
          driveSyncStatus: 'synced',
          driveFileId: up.driveFileId || null,
          webViewLink: up.webViewLink,
          driveError: up.provider === 'storage' ? 'Stored in Firebase Storage (Drive unavailable).' : null,
        });
      } else {
        await patchPaymentDoc(paymentId, {
          driveSyncStatus: 'pending',
          driveError: up.error || 'Receipt upload failed on Drive and Storage.',
        });
      }
    } catch (err: any) {
      await patchPaymentDoc(paymentId, {
        driveSyncStatus: 'pending',
        driveError: err.message || 'Receipt upload error',
      });
    }
  };

  // Initial state: AI + upload pending (background will fill these in).
  const needsOwnerReview = true;

  // Post balanced transaction directly to the general ledger (fast — UI waits only for this).
  // Receipt opens from the local data URL until the background upload provides a Drive link.
  let debitAccId = params.toAccountId;
  let creditAccId = params.fromAccountId;

  const { debitEntry, creditEntry } = await postBalancedTransaction({
    date: params.date,
    entryType: 'Payment',
    transNo: paymentNo,
    particulars: params.particulars,
    invoiceRef: params.againstInvoiceNo || undefined,
    voucherNo: params.againstInvoiceNo?.startsWith('UV-') ? params.againstInvoiceNo : undefined,
    rate: exchangeRate,
    debitAccountId: debitAccId,
    creditAccountId: creditAccId,
    amountSAR: params.amountSAR,
    driveFileUrl: params.receiptFile,
    proofType: 'receipt',
    createdBy: params.createdBy,
  });

  const ext = params.receiptFileType === 'pdf' ? '.pdf' : '.jpg';
  // Fix #30: stamp the linked agent id so Firestore rules can isolate agent reads
  let paymentAgentId: string | null = null;
  try {
    const accs = await fetchLedgerAccounts();
    const fromAcc = accs.find((a: any) => a.id === params.fromAccountId) as any;
    const toAcc = accs.find((a: any) => a.id === params.toAccountId) as any;
    paymentAgentId = fromAcc?.linkedId || fromAcc?.linkedAgentId || toAcc?.linkedId || toAcc?.linkedAgentId || null;
  } catch {
    // non-fatal: agent isolation stamp skipped
  }

  const newPayment: PaymentDoc = {
    id: `pmt-${Date.now()}`,
    paymentNo,
    date: params.date,
    entryType: params.entryType,
    fromAccountId: params.fromAccountId,
    toAccountId: params.toAccountId,
    bankAccountId: params.bankAccountId || null,
    amountSAR: params.amountSAR,
    exchangeRate,
    amountPKR,
    enteredCurrency: params.enteredCurrency,
    enteredAmount: params.enteredAmount,
    againstInvoiceNo: params.againstInvoiceNo || null,
    particulars: params.particulars,
    receiptFile: params.receiptFile,
    receiptFileName: `${paymentNo}${ext}`,
    receiptFileType: params.receiptFileType || 'image',
    createdBy: params.createdBy,
    createdAt: now,
    isVoid: false,
    debitEntryId: debitEntry.id,
    creditEntryId: creditEntry.id,
    agentId: paymentAgentId,

    driveSyncStatus: 'pending',
    driveFileId: null,
    webViewLink: null,
    driveError: null,

    aiStatus: 'Needs Review',
    aiExtractedDate: null,
    aiNotes: 'AI verification running in background…',
    needsOwnerReview,
    ownerApproved: !needsOwnerReview,
  };

  const currentPayments = await fetchPayments();
  const updatedPayments = [newPayment, ...currentPayments];
  savePaymentsToStorage(updatedPayments);

  // 5. Update invoice status if paying against invoice
  if (params.againstInvoiceNo) {
    try {
      const invoices = await fetchInvoices();
      const invIndex = invoices.findIndex((i) => i.invoiceNo === params.againstInvoiceNo);
      if (invIndex !== -1) {
        const inv = invoices[invIndex];
        const newPaid = inv.paidSAR + params.amountSAR;
        const newBal = Math.max(0, inv.totalSAR - newPaid);
        const newStatus = newBal <= 0 ? 'Paid' : newPaid > 0 ? 'Partially Paid' : 'Unpaid';
        invoices[invIndex] = {
          ...inv,
          paidSAR: newPaid,
          balanceSAR: newBal,
          status: newStatus,
        };
        localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(invoices));
        if (!isConfigPlaceholder) {
          await setDoc(doc(db, INVOICES_COLLECTION, inv.invoiceNo), stripUndefinedDeep(invoices[invIndex]));
        }
      }
    } catch (e) {
      console.warn('Could not update invoice status:', e);
    }
  }

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, newPayment.id), stripUndefinedDeep(stripReceiptDataForStorage(newPayment)));
    }
  } catch (err) {
    console.warn('Could not write payment to Firestore:', err);
  }

  // Fire-and-forget: AI verification + Drive upload run in the background so the
  // save button never waits for them. They patch the payment doc when done.
  runBackgroundTasks(newPayment.id).catch((e) =>
    console.warn('Background payment tasks failed:', e)
  );

  return newPayment;
}

/**
 * Retry Google Drive upload for a pending or failed payment receipt
 */
export async function retryDriveUploadForPayment(paymentId: string): Promise<PaymentDoc> {
  const currentPayments = await fetchPayments();
  const idx = currentPayments.findIndex((p) => p.id === paymentId);
  if (idx === -1) {
    throw new Error('Payment not found');
  }

  const pmt = currentPayments[idx];
  const isReceived = pmt.entryType === 'cash-received' || pmt.entryType === 'bank-received';

  const result = await uploadReceipt({
    paymentNo: pmt.paymentNo,
    fileDataUrl: pmt.receiptFile,
    fileType: pmt.receiptFileType || 'image',
    isReceived,
  });

  if (!result.success || !result.webViewLink) {
    const failedPmt: PaymentDoc = {
      ...pmt,
      driveSyncStatus: 'failed',
      driveError: result.error || 'Retry upload failed.',
    };
    currentPayments[idx] = failedPmt;
    savePaymentsToStorage(currentPayments);
    throw new Error(result.error || 'Drive sync retry failed.');
  }

  const updatedPmt: PaymentDoc = {
    ...pmt,
    driveSyncStatus: 'synced',
    driveFileId: result.driveFileId,
    webViewLink: result.webViewLink,
    driveError: null,
  };

  currentPayments[idx] = updatedPmt;
  savePaymentsToStorage(currentPayments);

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), stripUndefinedDeep(stripReceiptDataForStorage(updatedPmt)));
    }
  } catch (err) {
    console.warn('Could not update retried payment in Firestore:', err);
  }

  return updatedPmt;
}

/**
 * Owner Review Queue: Approve a receipt flagged as Needs Review
 */
export async function approvePaymentReceipt(paymentId: string, ownerName: string): Promise<PaymentDoc> {
  bust('payments:all'); // fresh read after write
  const currentPayments = await fetchPayments();
  const idx = currentPayments.findIndex((p) => p.id === paymentId);
  if (idx === -1) {
    throw new Error('Payment not found');
  }

  const now = new Date().toISOString();
  const updated: PaymentDoc = {
    ...currentPayments[idx],
    needsOwnerReview: false,
    ownerApproved: true,
    ownerApprovedAt: now,
    ownerApprovedBy: ownerName,
    aiNotes: `${currentPayments[idx].aiNotes || ''} (Manually approved by Owner: ${ownerName})`.trim(),
  };

  currentPayments[idx] = updated;
  savePaymentsToStorage(currentPayments);

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), stripUndefinedDeep(stripReceiptDataForStorage(updated)));
    }
  } catch (err) {
    console.warn('Could not update approved payment in Firestore:', err);
  }

  return updated;
}

/**
 * Replace the receipt attached to a payment (Owner/Staff).
 * The old receipt is discarded; AI verification + Drive sync restart for the new file.
 */
export async function updatePaymentReceipt(
  paymentId: string,
  receipt: { receiptFile: string; receiptFileName?: string; receiptFileType?: 'image' | 'pdf' },
  actorName: string
): Promise<PaymentDoc> {
  if (!receipt.receiptFile || !receipt.receiptFile.trim()) {
    throw new Error('A replacement receipt file is required.');
  }
  const currentPayments = await fetchPayments();
  const idx = currentPayments.findIndex((p) => p.id === paymentId);
  if (idx === -1) {
    throw new Error('Payment not found');
  }
  if (currentPayments[idx].isVoid) {
    throw new Error('Cannot replace the receipt of a voided payment.');
  }

  const now = new Date().toISOString();
  const updated: PaymentDoc = {
    ...currentPayments[idx],
    receiptFile: receipt.receiptFile,
    receiptFileName: receipt.receiptFileName || currentPayments[idx].receiptFileName,
    receiptFileType: receipt.receiptFileType || currentPayments[idx].receiptFileType,
    // Restart verification + Drive sync for the new file
    aiStatus: 'Needs Review',
    aiNotes: `Receipt replaced by ${actorName} on ${now.split('T')[0]} — re-verification pending.`,
    needsOwnerReview: true,
    ownerApproved: false,
    driveSyncStatus: 'pending',
    driveFileId: null,
    webViewLink: null,
    driveError: null,
  };

  currentPayments[idx] = updated;
  savePaymentsToStorage(currentPayments);

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), stripUndefinedDeep(stripReceiptDataForStorage(updated)));
    }
  } catch (err) {
    console.warn('Could not update payment receipt in Firestore:', err);
  }

  return updated;
}

/**
 * Void a payment (Owner only). Reverses/voids ledger entries and marks payment as voided.
 */
/**
 * Delete a payment (Owner only). HARD DELETE — the payment doc and its two ledger
 * entries are removed from the system completely (localStorage + Firestore).
 * No struck-through trace remains. Invoice balances are restored if linked.
 */
export async function voidPayment(
  paymentId: string,
  _voidReason: string,
  _voidedBy: string
): Promise<string> {
  bust('payments:all'); // fresh read after write
  const currentPayments = await fetchPayments();
  const index = currentPayments.findIndex((p) => p.id === paymentId);
  if (index === -1) {
    throw new Error('Payment not found');
  }

  const pmt = currentPayments[index];
  const paymentNo = pmt.paymentNo;

  // 1. Hard-delete both ledger legs (no trace left)
  if (pmt.debitEntryId) {
    try {
      await deleteLedgerEntry(pmt.debitEntryId);
    } catch (e) {
      console.warn('Could not delete debit entry:', e);
    }
  }
  if (pmt.creditEntryId) {
    try {
      await deleteLedgerEntry(pmt.creditEntryId);
    } catch (e) {
      console.warn('Could not delete credit entry:', e);
    }
  }

  // 2. Restore invoice balance if this payment was against an invoice
  if (pmt.againstInvoiceNo) {
    try {
      const invoices = await fetchInvoices();
      const invIndex = invoices.findIndex((i) => i.invoiceNo === pmt.againstInvoiceNo);
      if (invIndex !== -1) {
        const inv = invoices[invIndex];
        const newPaid = Math.max(0, inv.paidSAR - pmt.amountSAR);
        const newBal = inv.totalSAR - newPaid;
        const newStatus = newBal <= 0 ? 'Paid' : newPaid > 0 ? 'Partially Paid' : 'Unpaid';
        invoices[invIndex] = {
          ...inv,
          paidSAR: newPaid,
          balanceSAR: newBal,
          status: newStatus,
        };
        localStorage.setItem(LOCAL_STORAGE_INVOICES_KEY, JSON.stringify(invoices));
      }
    } catch (e) {
      console.warn('Could not restore invoice balance:', e);
    }
  }

  // 3. Hard-delete the payment doc itself
  const remaining = currentPayments.filter((x) => x.id !== paymentId);
  try { savePaymentsToStorage(remaining); } catch { /* ignore */ }
  try {
    if (!isConfigPlaceholder) {
      const { deleteDoc: fsDeleteDoc } = await import('firebase/firestore');
      await fsDeleteDoc(doc(db, PAYMENTS_COLLECTION, paymentId));
    }
  } catch (err) {
    console.warn('Could not delete payment from Firestore:', err);
  }

  bust('payments:all'); // drop stale cache — fixes deleted payments still showing in lists
  return paymentNo;
}

/**
 * Edit a payment (Owner/Staff): void-and-repost with the SAME paymentNo.
 * The old payment + its ledger legs are hard-deleted (invoice balance restored
 * inside voidPayment); a corrected payment is reposted with the same number,
 * keeping the original receipt and invoice link.
 * Editable: date, from/to accounts, amount, particulars, exchange rate.
 */
export async function editPayment(
  paymentId: string,
  updates: { date: string; fromAccountId: string; toAccountId: string; amountSAR: number; particulars: string; exchangeRate: number },
  editedBy: string
): Promise<PaymentDoc> {
  const current = await fetchPayments();
  const orig = current.find((p) => p.id === paymentId);
  if (!orig) {
    throw new Error('Payment not found');
  }
  if (!updates.date) {
    throw new Error('Date is required');
  }
  if (!(updates.amountSAR > 0)) {
    throw new Error('Amount must be greater than zero');
  }
  if (!updates.fromAccountId || !updates.toAccountId) {
    throw new Error('Both from and to accounts are required');
  }
  if (updates.fromAccountId === updates.toAccountId) {
    throw new Error('From and to accounts cannot be the same');
  }

  // 1) Remove the old payment + its ledger legs (invoice balance restored)
  await voidPayment(paymentId, 'Edited — corrected payment reposted', editedBy);

  // 2) Repost corrected payment with the SAME payment number
  return createPayment({
    date: updates.date,
    entryType: orig.entryType,
    fromAccountId: updates.fromAccountId,
    toAccountId: updates.toAccountId,
    bankAccountId: orig.bankAccountId,
    amountSAR: updates.amountSAR,
    exchangeRate: updates.exchangeRate,
    enteredCurrency: 'SAR',
    enteredAmount: updates.amountSAR,
    againstInvoiceNo: orig.againstInvoiceNo,
    particulars: updates.particulars,
    receiptFile: orig.receiptFile,
    receiptFileName: orig.receiptFileName,
    receiptFileType: orig.receiptFileType,
    createdBy: editedBy,
    paymentNo: orig.paymentNo,
  });
}

export async function processReceiptFile(file: File): Promise<{
  dataUrl: string;
  fileName: string;
  fileType: 'image' | 'pdf';
}> {
  const maxBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxBytes) {
    throw new Error('File exceeds the 10MB limit. Please upload a smaller receipt.');
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          dataUrl: reader.result as string,
          fileName: file.name,
          fileType: 'pdf',
        });
      };
      reader.onerror = () => reject(new Error('Failed to read PDF file'));
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1600;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: e.target?.result as string,
            fileName: file.name,
            fileType: 'image',
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve({
          dataUrl: compressedDataUrl,
          fileName: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
          fileType: 'image',
        });
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
