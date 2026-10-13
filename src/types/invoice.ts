/**
 * Manual Invoice (Accounts → Invoices).
 * A free-form invoice the owner/staff enters by hand: pick who owes us
 * (any ledger account), add line items, and the invoice posts to the
 * ledger (Dr Party / Cr Income) so balances stay correct.
 */
export interface ManualInvoiceLine {
  id: string;
  description: string;
  qty: number;
  rate: number;
  amount: number; // qty * rate (in invoice currency)
}

export type ManualInvoiceStatus = 'Unpaid' | 'Partially Paid' | 'Paid' | 'Void';

export interface ManualInvoiceDoc {
  id: string;
  invoiceNo: string; // MINV-1001…
  date: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  partyId: string; // ledger account id (who owes us)
  partyName: string;
  partyType: string; // ledger accountType: agent / customer / vendor / hotel / bank / cash / income / expense
  incomeAccountId: string; // ledger account id (credit side)
  incomeAccountName: string;
  currency: 'SAR' | 'PKR';
  rate: number; // SAR -> PKR rate used
  lines: ManualInvoiceLine[];
  subtotal: number; // in invoice currency
  discount: number; // in invoice currency
  total: number; // subtotal - discount (in invoice currency)
  totalSAR: number;
  totalPKR: number;
  notes: string;
  status: ManualInvoiceStatus;
  paidAmount: number; // in invoice currency (tracked manually for now)
  createdBy: string;
  createdByName: string;
  createdAt: string;
  isVoid: boolean;
  voidReason?: string | null;
}

export const MANUAL_INVOICE_PREFIX = 'MINV-';
