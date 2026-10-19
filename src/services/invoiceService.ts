/**
 * Manual Invoice service (Accounts → Invoices).
 * Same robust pattern as vouchers: stripUndefinedDeep on every Firestore
 * write, localStorage mirror, Firestore-first fetch with local fallback.
 * Saving posts a balanced ledger transaction (Dr Party / Cr Income) so
 * the party's balance reflects the invoice immediately. Voiding posts a
 * mirror reversal for each ledger leg (via voidLedgerEntry).
 */
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import { fetchLedgerAccounts, postBalancedTransaction, voidLedgerEntry, fetchLedgerEntries } from './accountingService';
import { ManualInvoiceDoc, MANUAL_INVOICE_PREFIX } from '../types/invoice';
import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';

const INVOICES_COLLECTION = 'manualInvoices';
const LOCAL_STORAGE_KEY = 'safardesk_manual_invoices';

export function normalizeInvoice(raw: any): ManualInvoiceDoc {
  const lines = Array.isArray(raw?.lines) ? raw.lines.map((l: any, i: number) => ({
    id: l?.id || `line-${i}`,
    description: l?.description || '',
    qty: Number(l?.qty) || 0,
    rate: Number(l?.rate) || 0,
    amount: Number(l?.amount) || 0,
  })) : [];
  return {
    id: raw?.id || '',
    invoiceNo: raw?.invoiceNo || '',
    date: raw?.date || '',
    dueDate: raw?.dueDate || '',
    partyId: raw?.partyId || '',
    partyName: raw?.partyName || '',
    partyType: raw?.partyType || '',
    incomeAccountId: raw?.incomeAccountId || '',
    incomeAccountName: raw?.incomeAccountName || '',
    currency: raw?.currency === 'PKR' ? 'PKR' : 'SAR',
    rate: Number(raw?.rate) || 0,
    lines,
    subtotal: Number(raw?.subtotal) || 0,
    discount: Number(raw?.discount) || 0,
    total: Number(raw?.total) || 0,
    totalSAR: Number(raw?.totalSAR) || 0,
    totalPKR: Number(raw?.totalPKR) || 0,
    notes: raw?.notes || '',
    status: raw?.status || 'Unpaid',
    paidAmount: Number(raw?.paidAmount) || 0,
    createdBy: raw?.createdBy || '',
    createdByName: raw?.createdByName || '',
    createdAt: raw?.createdAt || '',
    isVoid: !!raw?.isVoid,
    voidReason: raw?.voidReason || null,
  };
}

export async function fetchManualInvoices(): Promise<ManualInvoiceDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, INVOICES_COLLECTION));
      return snap.docs.map((d) => normalizeInvoice({ ...d.data(), id: (d.data() as any).id || d.id }));
    }
  } catch (err) {
    console.warn('Could not read manual invoices from Firestore:', err);
  }
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return (Array.isArray(parsed) ? parsed : []).map(normalizeInvoice);
    }
  } catch { /* fallback */ }
  return [];
}

/** Next invoice number: MINV-1001, MINV-1002… (own series, never collides with visa INV-1001). */
export async function nextManualInvoiceNo(): Promise<string> {
  const list = await fetchManualInvoices();
  let max = 1000;
  for (const inv of list) {
    const m = /^MINV-(\d+)$/.exec(inv.invoiceNo || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${MANUAL_INVOICE_PREFIX}${max + 1}`;
}

/**
 * Create a manual invoice + post to ledger (Dr Party / Cr Income).
 * Throws on sync failure so the UI never shows a false success.
 */
export async function createManualInvoice(
  input: Omit<ManualInvoiceDoc, 'id' | 'invoiceNo' | 'createdAt' | 'status' | 'paidAmount' | 'isVoid'>,
  createdBy: string,
  createdByName: string,
): Promise<ManualInvoiceDoc> {
  const invoiceNo = await nextManualInvoiceNo();
  const now = new Date().toISOString();
  const invoice: ManualInvoiceDoc = normalizeInvoice({
    ...input,
    id: `minv-${Date.now()}`,
    invoiceNo,
    status: 'Unpaid',
    paidAmount: 0,
    isVoid: false,
    createdBy,
    createdByName,
    createdAt: now,
  });

  // Ledger: Dr Party (receivable) / Cr Income — transNo + invoiceRef = invoiceNo
  // so the entry links back to this invoice in Ledgers / Balances.
  await postBalancedTransaction({
    date: invoice.date,
    entryType: 'Invoice',
    transNo: invoice.invoiceNo,
    particulars: `Manual Invoice ${invoice.invoiceNo} — ${invoice.partyName}${invoice.notes ? ` (${invoice.notes})` : ''}`,
    invoiceRef: invoice.invoiceNo,
    rate: invoice.rate,
    debitAccountId: invoice.partyId,
    creditAccountId: invoice.incomeAccountId,
    amountSAR: invoice.totalSAR,
    createdBy,
  });

  // Persist invoice (local first so a sync failure still leaves a trace,
  // then Firestore — a failure here throws so the UI shows the error).
  const existing = await fetchManualInvoices();
  const updated = [invoice, ...existing];
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  if (!isConfigPlaceholder) {
    await setDoc(doc(db, INVOICES_COLLECTION, invoice.id), stripUndefinedDeep(invoice));
  }
  return invoice;
}

/** Void an invoice + reverse its ledger legs. */
export async function voidManualInvoice(
  invoice: ManualInvoiceDoc,
  voidReason: string,
  voidedBy: string,
): Promise<ManualInvoiceDoc> {
  // Reverse every ledger entry tied to this invoice number.
  const entries = await fetchLedgerEntries();
  const mine = entries.filter((e) => e.transNo === invoice.invoiceNo && !e.isVoid);
  for (const e of mine) {
    await voidLedgerEntry(e.id, voidReason, voidedBy);
  }

  const updated: ManualInvoiceDoc = { ...invoice, isVoid: true, status: 'Void', voidReason };
  const existing = await fetchManualInvoices();
  const next = existing.map((x) => (x.id === invoice.id ? updated : x));
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(next));
  if (!isConfigPlaceholder) {
    await setDoc(doc(db, INVOICES_COLLECTION, invoice.id), stripUndefinedDeep(updated));
  }
  return updated;
}

/**
 * Hard-delete a manual invoice (Owner only): void its ledger legs first,
 * then permanently remove the invoice doc from Firestore + localStorage.
 */
export async function deleteManualInvoice(
  actor: UserProfile,
  invoiceId: string,
): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only the Owner can delete an invoice.');
  }
  const invoices = await fetchManualInvoices();
  const invoice = invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new Error('Invoice not found.');

  // Void all live ledger legs first (books stay balanced)
  const entries = await fetchLedgerEntries();
  const legs = entries.filter((e) => e.transNo === invoice.invoiceNo && !e.isVoid);
  for (const leg of legs) {
    await voidLedgerEntry(leg.id, `Invoice ${invoice.invoiceNo} deleted`, actor.name || actor.email || 'system');
  }

  if (!isConfigPlaceholder) {
    const { deleteDoc: fsDelete } = await import('firebase/firestore');
    await fsDelete(doc(db, INVOICES_COLLECTION, invoiceId));
  }
  const remaining = invoices.filter((i) => i.id !== invoiceId);
  try { localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(remaining)); } catch { /* ignore */ }

  await logAuditEvent({
    action: 'DELETE_INVOICE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: invoice.id,
    targetUserName: invoice.invoiceNo,
    details: { legsVoided: legs.length },
  }).catch(() => {});
}

/** Income-type ledger accounts for the credit-side dropdown. Creates a
 *  default "Income — Services" account when the tenant has no income account. */
export async function fetchInvoiceIncomeAccounts() {
  const accounts = await fetchLedgerAccounts();
  const income = accounts.filter((a) => a.accountType === 'income' && a.isActive !== false);
  if (income.length > 0) return income;
  // No income account yet — create the default one.
  const { saveLedgerAccount } = await import('./accountingService');
  const created = await saveLedgerAccount({
    id: 'acc-sys-services',
    accountCode: 'SYS-007',
    accountType: 'income',
    title: 'Income — Services',
    isSystem: true,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
  } as any);
  return [created];
}
