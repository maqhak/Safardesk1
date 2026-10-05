import { 
  BankDoc, 
  PaymentDoc, 
  PaymentEntryType, 
  InvoiceRecord,
  AiVerificationResult
} from '../types/payment';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { postBalancedTransaction, voidLedgerEntry, fetchLedgerEntries, fetchLedgerAccounts } from './accountingService';
import { uploadReceipt, verifyReceiptWithAI } from './driveService';
import { getCurrentRate } from './exchangeRateService';

const PAYMENTS_COLLECTION = 'payments';
const BANKS_COLLECTION = 'banks';
const INVOICES_COLLECTION = 'accounts_invoices';

const LOCAL_STORAGE_PAYMENTS_KEY = 'safardesk_payments_v2';
const LOCAL_STORAGE_BANKS_KEY = 'safardesk_banks_v2';
const LOCAL_STORAGE_INVOICES_KEY = 'safardesk_invoices_v2';

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
    accountTitle: 'SafarDesk Corporate Treasury',
    accountNumber: '482001928374',
    iban: 'SA4480000482001928374',
    branch: 'Al-Mansoor District, Makkah Mukarramah',
    currency: 'SAR',
    linkedLedgerAccountId: 'acc-bnk-001',
    isActive: true,
  },
  {
    id: 'bnk-002',
    bankName: 'Meezan Bank (Pakistan)',
    accountTitle: 'SafarDesk Pakistan Operations',
    accountNumber: '01020109928381',
    iban: 'PK64MEZN0001020109928381',
    branch: 'Main Branch, I.I. Chundrigar Road, Karachi',
    currency: 'PKR',
    linkedLedgerAccountId: 'acc-bnk-002',
    isActive: true,
  },
  {
    id: 'bnk-003',
    bankName: 'Saudi National Bank (SNB / AlAhli)',
    accountTitle: 'SafarDesk Ground Transport Ops',
    accountNumber: '201994820194',
    iban: 'SA12100000201994820194',
    branch: 'King Abdulaziz Road, Jeddah',
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
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, BANKS_COLLECTION));
      return snap.docs.map((d) => d.data() as BankDoc);
    }
  } catch (err) {
    console.warn('Could not read banks from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_BANKS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

export async function saveBank(bank: BankDoc): Promise<BankDoc> {
  const banks = await fetchBanks();
  const idx = banks.findIndex((b) => b.id === bank.id);
  const next = idx >= 0 ? banks.map((b, i) => (i === idx ? bank : b)) : [bank, ...banks];
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, BANKS_COLLECTION, bank.id), bank);
    }
  } catch (err) {
    console.warn('Could not save bank to Firestore:', err);
  }
  localStorage.setItem(LOCAL_STORAGE_BANKS_KEY, JSON.stringify(next));
  return bank;
}

export async function fetchInvoices(): Promise<InvoiceRecord[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, INVOICES_COLLECTION));
      return snap.docs.map((d) => d.data() as InvoiceRecord);
    }
  } catch (err) {
    console.warn('Could not read invoices from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_INVOICES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

export async function fetchPayments(): Promise<PaymentDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, PAYMENTS_COLLECTION));
      return snap.docs.map((d) => d.data() as PaymentDoc);
    }
  } catch (err) {
    console.warn('Could not read payments from Firestore:', err);
  }

  // localStorage fallback only when Firestore is unconfigured or unreachable
  let list: PaymentDoc[] = [];

  const stored = localStorage.getItem(LOCAL_STORAGE_PAYMENTS_KEY);
  if (stored) {
    try {
      list = JSON.parse(stored);
    } catch {
      list = [];
    }
  }

  return list;
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
}): Promise<PaymentDoc> {
  // HARD VALIDATION: RECEIPT RULE
  if (!params.receiptFile || !params.receiptFile.trim()) {
    throw new Error('RECEIPT RULE VIOLATION: A payment cannot be saved without an attached receipt file.');
  }

  const paymentNo = await getNextPaymentNumber();
  const exchangeRate = params.exchangeRate || getCurrentRate('SAR-PKR');
  const amountPKR = Math.round(params.amountSAR * exchangeRate * 100) / 100;
  const now = new Date().toISOString();

  const isReceived = params.entryType === 'cash-received' || params.entryType === 'bank-received';

  // 1. Run AI Verification on the receipt file (via server-side Gemini)
  let aiResult: AiVerificationResult = {
    aiStatus: 'Needs Review',
    aiExtractedDate: null,
    aiNotes: 'AI verification pending.',
    isReadable: true,
    isAuthenticReceipt: false,
    dateMatches: false,
  };

  try {
    aiResult = await verifyReceiptWithAI({
      fileDataUrl: params.receiptFile,
      expectedDate: params.date,
      amountSAR: params.amountSAR,
    });
  } catch (err) {
    console.warn('AI receipt verification call failed:', err);
  }

  const needsOwnerReview = aiResult.aiStatus === 'Needs Review';

  // 2. Upload flow to Google Drive:
  // "Cash/Bank 'Received' payments go to Receipt/Received, 'Sent' payments go to Receipt/Sent"
  // "RENAME the file to the payment's Manual No. (e.g. 'PAY-000123.pdf')"
  let driveSyncStatus: PaymentDoc['driveSyncStatus'] = 'pending';
  let driveFileId: string | null = null;
  let webViewLink: string | null = null;
  let driveError: string | null = null;

  try {
    // Fix #22: Drive first, Firebase Storage fallback — receipt is never lost
    const receiptUpload = await uploadReceipt({
      paymentNo,
      fileDataUrl: params.receiptFile,
      fileType: params.receiptFileType || 'image',
      isReceived,
    });

    if (receiptUpload.success && receiptUpload.webViewLink) {
      driveSyncStatus = 'synced';
      driveFileId = receiptUpload.driveFileId || null;
      webViewLink = receiptUpload.webViewLink || null;
      driveError = receiptUpload.provider === 'storage' ? 'Stored in Firebase Storage (Drive unavailable).' : null;
    } else {
      driveSyncStatus = 'pending';
      driveError = receiptUpload.error || 'Receipt upload failed on Drive and Storage.';
    }
  } catch (err: any) {
    driveSyncStatus = 'pending';
    driveError = err.message || 'Receipt upload error';
  }

  // 3. The app must always open receipts through the stored link, with local fallback
  const storedReceiptLink = webViewLink || params.receiptFile;

  // 4. Post balanced transaction directly to the general ledger
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
    driveFileUrl: storedReceiptLink,
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

    driveSyncStatus,
    driveFileId,
    webViewLink,
    driveError,

    aiStatus: aiResult.aiStatus,
    aiExtractedDate: aiResult.aiExtractedDate,
    aiNotes: aiResult.aiNotes,
    needsOwnerReview,
    ownerApproved: !needsOwnerReview,
  };

  const currentPayments = await fetchPayments();
  const updatedPayments = [newPayment, ...currentPayments];
  localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(updatedPayments));

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
          await setDoc(doc(db, INVOICES_COLLECTION, inv.invoiceNo), invoices[invIndex]);
        }
      }
    } catch (e) {
      console.warn('Could not update invoice status:', e);
    }
  }

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, newPayment.id), newPayment);
    }
  } catch (err) {
    console.warn('Could not write payment to Firestore:', err);
  }

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
    localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(currentPayments));
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
  localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(currentPayments));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), updatedPmt);
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
  localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(currentPayments));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), updated);
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
  localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(currentPayments));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), updated);
    }
  } catch (err) {
    console.warn('Could not update payment receipt in Firestore:', err);
  }

  return updated;
}

/**
 * Void a payment (Owner only). Reverses/voids ledger entries and marks payment as voided.
 */
export async function voidPayment(
  paymentId: string,
  voidReason: string,
  voidedBy: string
): Promise<PaymentDoc> {
  const currentPayments = await fetchPayments();
  const index = currentPayments.findIndex((p) => p.id === paymentId);
  if (index === -1) {
    throw new Error('Payment not found');
  }

  const pmt = currentPayments[index];
  const now = new Date().toISOString();

  if (pmt.debitEntryId) {
    try {
      await voidLedgerEntry(pmt.debitEntryId, `Payment ${pmt.paymentNo} voided: ${voidReason}`, voidedBy);
    } catch (e) {
      console.warn('Could not void debit entry:', e);
    }
  }
  if (pmt.creditEntryId) {
    try {
      await voidLedgerEntry(pmt.creditEntryId, `Payment ${pmt.paymentNo} voided: ${voidReason}`, voidedBy);
    } catch (e) {
      console.warn('Could not void credit entry:', e);
    }
  }

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

  const updated: PaymentDoc = {
    ...pmt,
    isVoid: true,
    voidReason,
    voidedAt: now,
    voidedBy,
    needsOwnerReview: false,
  };

  currentPayments[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(currentPayments));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, PAYMENTS_COLLECTION, paymentId), updated);
    }
  } catch (err) {
    console.warn('Could not update voided payment in Firestore:', err);
  }

  return updated;
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
