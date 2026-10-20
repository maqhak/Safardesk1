/**
 * Transport Invoice service — create/fetch/void/delete with ledger posting.
 * Ledger (sale): Dr Customer / Cr Transport Income.
 * Ledger (purchase, when a vendor is set): Dr Transport Cost / Cr Vendor.
 * Particulars carry vehicle, sector, vendor, and description verbatim.
 */
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import {
  postBalancedTransaction,
  voidLedgerEntry,
  fetchLedgerEntries,
  fetchLedgerAccounts,
  saveLedgerAccount,
} from './accountingService';
import {
  TransportInvoiceDoc,
  TRANSPORT_INVOICE_PREFIX,
  TRANSPORT_INVOICE_COLLECTION,
  TRANSPORT_INVOICE_LOCAL_KEY,
} from '../types/transportInvoice';
import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';

const TRANSPORT_INCOME_CODE = 'SYS-TRN';
const TRANSPORT_COST_CODE = 'SYS-TRC';

async function ensureTransportAccounts(createdBy: string) {
  const accounts = await fetchLedgerAccounts();
  const now = new Date().toISOString();
  let income = accounts.find((a) => a.accountCode === TRANSPORT_INCOME_CODE);
  if (!income) {
    income = {
      id: 'acc-sys-trn', accountCode: TRANSPORT_INCOME_CODE, accountType: 'income',
      title: 'Transport Income', isSystem: true, isActive: true,
      openingBalanceSAR: 0, openingBalancePKR: 0, createdAt: now, createdBy,
    } as any;
    try { await saveLedgerAccount(income as any); } catch { /* entries still carry correct accountId */ }
  }
  let cost = accounts.find((a) => a.accountCode === TRANSPORT_COST_CODE);
  if (!cost) {
    cost = {
      id: 'acc-sys-trc', accountCode: TRANSPORT_COST_CODE, accountType: 'expense',
      title: 'Transport Cost', isSystem: true, isActive: true,
      openingBalanceSAR: 0, openingBalancePKR: 0, createdAt: now, createdBy,
    } as any;
    try { await saveLedgerAccount(cost as any); } catch { /* entries still carry correct accountId */ }
  }
  return { incomeId: income!.id, costId: cost!.id };
}

export async function fetchTransportInvoices(): Promise<TransportInvoiceDoc[]> {
  if (!isConfigPlaceholder) {
    try {
      const snap = await getDocs(collection(db, TRANSPORT_INVOICE_COLLECTION));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransportInvoiceDoc));
      try { localStorage.setItem(TRANSPORT_INVOICE_LOCAL_KEY, JSON.stringify(docs)); } catch { /* ignore */ }
      return docs.sort((a, b) => (b.invoiceNo || '').localeCompare(a.invoiceNo || ''));
    } catch { /* fall through to local */ }
  }
  try {
    const raw = localStorage.getItem(TRANSPORT_INVOICE_LOCAL_KEY);
    const docs = raw ? (JSON.parse(raw) as TransportInvoiceDoc[]) : [];
    return docs.sort((a, b) => (b.invoiceNo || '').localeCompare(a.invoiceNo || ''));
  } catch { return []; }
}

export async function nextTransportInvoiceNo(): Promise<string> {
  const list = await fetchTransportInvoices();
  let max = 1000;
  for (const inv of list) {
    const m = /^TINV-(\d+)$/.exec(inv.invoiceNo || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${TRANSPORT_INVOICE_PREFIX}${max + 1}`;
}

export interface CreateTransportInvoiceInput {
  date: string;
  customerId: string;
  customerName: string;
  vendorId?: string;
  vendorName?: string;
  vehicleId?: string;
  vehicleType?: string;
  sector: string;
  referenceNo?: string;
  description: string;
  amountSAR: number;
  rate: number;
}

/**
 * Create a transport invoice + post to ledger.
 * Sale: Dr Customer / Cr Transport Income.
 * Purchase (when vendor set): Dr Transport Cost / Cr Vendor.
 */
export async function createTransportInvoice(
  input: CreateTransportInvoiceInput,
  createdBy: string,
  createdByName: string,
): Promise<TransportInvoiceDoc> {
  if (!input.customerId) throw new Error('Customer is required.');
  if (!input.sector) throw new Error('Sector is required.');
  if (!(input.amountSAR > 0)) throw new Error('Amount must be greater than zero.');
  if (!(input.rate > 0)) throw new Error('Exchange rate must be greater than zero.');

  const invoiceNo = await nextTransportInvoiceNo();
  const now = new Date().toISOString();
  const amountPKR = Math.round(input.amountSAR * input.rate * 100) / 100;

  const invoice: TransportInvoiceDoc = stripUndefinedDeep({
    id: `tinv-${Date.now()}`,
    invoiceNo,
    date: input.date,
    customerId: input.customerId,
    customerName: input.customerName,
    vendorId: input.vendorId || undefined,
    vendorName: input.vendorName || undefined,
    vehicleId: input.vehicleId || undefined,
    vehicleType: input.vehicleType || undefined,
    sector: input.sector,
    referenceNo: input.referenceNo?.trim() || undefined,
    description: input.description || '',
    amountSAR: Math.round(input.amountSAR * 100) / 100,
    amountPKR,
    rate: input.rate,
    status: 'Unpaid',
    paidAmount: 0,
    isVoid: false,
    createdBy,
    createdByName,
    createdAt: now,
  } as TransportInvoiceDoc) as TransportInvoiceDoc;

  const { incomeId, costId } = await ensureTransportAccounts(createdByName);

  // Particulars carry every detail verbatim: vehicle, sector, vendor, description.
  const detailBits = [
    invoice.referenceNo ? `Ref: ${invoice.referenceNo}` : null,
    invoice.vehicleType ? `Vehicle: ${invoice.vehicleType}` : null,
    `Sector: ${invoice.sector}`,
    invoice.vendorName ? `Vendor: ${invoice.vendorName}` : null,
    invoice.description ? `Description: ${invoice.description}` : null,
  ].filter(Boolean).join(' | ');
  const particulars = `Transport Invoice ${invoiceNo} — ${invoice.customerName} | ${detailBits}`;

  // 1) Sale: Dr Customer / Cr Transport Income
  await postBalancedTransaction({
    date: invoice.date,
    entryType: 'Invoice',
    transNo: invoiceNo,
    invoiceRef: invoiceNo,
    rate: invoice.rate,
    particulars,
    debitAccountId: input.customerId,
    creditAccountId: incomeId,
    amountSAR: invoice.amountSAR,
    createdBy: createdByName,
  });

  // 2) Purchase (vendor selected): Dr Transport Cost / Cr Vendor
  if (input.vendorId) {
    const accounts = await fetchLedgerAccounts();
    const vendorAccount = accounts.find(
      (a) => a.id === `ledger-vnd-${input.vendorId}` ||
        ((a as any).linkedAgentId === input.vendorId || (a as any).linkedId === input.vendorId)
    );
    const vendorAccountId = vendorAccount ? vendorAccount.id : `ledger-vnd-${input.vendorId}`;
    await postBalancedTransaction({
      date: invoice.date,
      entryType: 'Invoice',
      transNo: invoiceNo,
      invoiceRef: invoiceNo,
      rate: invoice.rate,
      particulars: `Transport Purchase for ${invoiceNo} — ${invoice.vendorName} | ${detailBits}`,
      debitAccountId: costId,
      creditAccountId: vendorAccountId,
      amountSAR: invoice.amountSAR,
      createdBy: createdByName,
    });
  }

  const existing = await fetchTransportInvoices();
  const next = [invoice, ...existing];
  try { localStorage.setItem(TRANSPORT_INVOICE_LOCAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, TRANSPORT_INVOICE_COLLECTION, invoice.id), stripUndefinedDeep(invoice));
    } catch (err: any) {
      throw new Error(`Saved locally, but Firestore sync failed: ${err?.message || err}.`);
    }
  }
  return invoice;
}

/**
 * Record a payment against a transport invoice.
 * Ledger: Dr Cash/Bank / Cr Customer. Updates paidAmount + status.
 */
export async function recordTransportInvoicePayment(
  invoiceId: string,
  payment: { date: string; amountSAR: number; rate: number; cashOrBankAccountId: string; notes?: string },
  recordedBy: string,
): Promise<TransportInvoiceDoc> {
  const invoices = await fetchTransportInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('Transport invoice not found.');
  if (invoice.isVoid) throw new Error('Cannot record payment on a void invoice.');
  if (!(payment.amountSAR > 0)) throw new Error('Amount must be greater than zero.');
  if (!(payment.rate > 0)) throw new Error('Exchange rate must be greater than zero.');

  const newPaid = Math.round(((invoice.paidAmount || 0) + payment.amountSAR) * 100) / 100;
  if (newPaid > invoice.amountSAR + 0.01) {
    throw new Error(`Payment exceeds the invoice balance. Balance: SAR ${(invoice.amountSAR - (invoice.paidAmount || 0)).toFixed(2)}.`);
  }

  await postBalancedTransaction({
    date: payment.date,
    entryType: 'Payment',
    transNo: `PMT-TINV-${Date.now().toString().slice(-6)}`,
    invoiceRef: invoice.invoiceNo,
    rate: payment.rate,
    particulars: `Payment received against Transport Invoice ${invoice.invoiceNo} — ${invoice.customerName}${payment.notes ? ` (${payment.notes})` : ''}`,
    debitAccountId: payment.cashOrBankAccountId,
    creditAccountId: invoice.customerId,
    amountSAR: payment.amountSAR,
    createdBy: recordedBy,
  });

  const status = newPaid >= invoice.amountSAR - 0.01 ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
  const updated: TransportInvoiceDoc = {
    ...invoice,
    paidAmount: newPaid,
    status: status as any,
    updatedAt: new Date().toISOString(),
    updatedBy: recordedBy,
  };
  const next = invoices.map((x) => (x.id === invoiceId ? updated : x));
  try { localStorage.setItem(TRANSPORT_INVOICE_LOCAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  if (!isConfigPlaceholder) {
    await setDoc(doc(db, TRANSPORT_INVOICE_COLLECTION, invoiceId), stripUndefinedDeep(updated));
  }
  return updated;
}

export async function voidTransportInvoice(
  invoice: TransportInvoiceDoc,
  voidReason: string,
  voidedBy: string,
): Promise<TransportInvoiceDoc> {
  const entries = await fetchLedgerEntries();
  const mine = entries.filter((e) => e.transNo === invoice.invoiceNo && !e.isVoid);
  for (const e of mine) {
    await voidLedgerEntry(e.id, voidReason, voidedBy);
  }
  const updated: TransportInvoiceDoc = { ...invoice, isVoid: true, status: 'Void', voidReason };
  const existing = await fetchTransportInvoices();
  const next = existing.map((x) => (x.id === invoice.id ? updated : x));
  try { localStorage.setItem(TRANSPORT_INVOICE_LOCAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  if (!isConfigPlaceholder) {
    await setDoc(doc(db, TRANSPORT_INVOICE_COLLECTION, invoice.id), stripUndefinedDeep(updated));
  }
  return updated;
}

export async function deleteTransportInvoice(
  actor: UserProfile,
  invoiceId: string,
): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only the Owner can delete a transport invoice.');
  }
  const invoices = await fetchTransportInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('Transport invoice not found.');

  const entries = await fetchLedgerEntries();
  const legs = entries.filter((e) => e.transNo === invoice.invoiceNo && !e.isVoid);
  for (const leg of legs) {
    await voidLedgerEntry(leg.id, `Transport Invoice ${invoice.invoiceNo} deleted`, actor.name || actor.email || 'system');
  }

  if (!isConfigPlaceholder) {
    const { deleteDoc: fsDelete } = await import('firebase/firestore');
    await fsDelete(doc(db, TRANSPORT_INVOICE_COLLECTION, invoiceId));
  }
  const remaining = invoices.filter((i) => i.id !== invoiceId);
  try { localStorage.setItem(TRANSPORT_INVOICE_LOCAL_KEY, JSON.stringify(remaining)); } catch { /* ignore */ }

  await logAuditEvent({
    action: 'DELETE_TRANSPORT_INVOICE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: invoice.id,
    targetUserName: invoice.invoiceNo,
    details: { legsVoided: legs.length },
  }).catch(() => {});
}
