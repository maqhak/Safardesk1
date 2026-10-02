export type PaymentEntryType = 
  | 'cash-received'
  | 'cash-sent'
  | 'bank-received'
  | 'bank-sent';

export interface BankDoc {
  id: string;
  bankName: string;
  accountTitle: string;
  accountNumber: string;
  iban: string;
  branch: string;
  currency: 'SAR' | 'PKR';
  linkedLedgerAccountId: string;
  isActive: boolean;
}

export type DriveSyncStatus = 'synced' | 'pending' | 'failed';
export type AiVerificationStatus = 'Verified' | 'Needs Review';

export interface PaymentDoc {
  id: string;
  paymentNo: string; // The Manual No. (e.g. "PMT-00101")
  date: string; // YYYY-MM-DD
  entryType: PaymentEntryType;
  fromAccountId: string; // Payer or Source ledger account
  toAccountId: string; // Payee or Destination ledger account
  bankAccountId?: string | null; // Required for bank transfers
  amountSAR: number;
  exchangeRate: number; // manual, prefilled per agent where relevant
  amountPKR: number; // computed amountSAR * exchangeRate
  againstInvoiceNo?: string | null; // optional link
  particulars: string; // Details Box — free text shown in the ledger statement's Particulars column
  receiptFile: string; // Mandatory receipt photo or PDF (data URL / storage URL)
  receiptFileName?: string;
  receiptFileType?: 'image' | 'pdf';
  createdBy: string;
  createdAt: string;
  isVoid: boolean;
  voidReason?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  debitEntryId?: string;
  creditEntryId?: string;

  // Google Drive Integration fields
  driveSyncStatus: DriveSyncStatus;
  driveFileId?: string | null;
  webViewLink?: string | null;
  driveError?: string | null;

  // Gemini AI Verification fields
  aiStatus: AiVerificationStatus;
  aiExtractedDate?: string | null;
  aiNotes?: string | null;
  needsOwnerReview: boolean;
  ownerApproved?: boolean;
  ownerApprovedAt?: string | null;
  ownerApprovedBy?: string | null;
}

export interface InvoiceRecord {
  invoiceNo: string;
  accountId: string;
  accountCode: string;
  accountTitle: string;
  date: string;
  module: 'Visa' | 'Voucher' | 'Ticket';
  description: string;
  totalSAR: number;
  paidSAR: number;
  balanceSAR: number;
  status: 'Unpaid' | 'Partially Paid' | 'Paid';
}

export interface DriveIntegrationDoc {
  id: string;
  connected: boolean;
  connectedEmail: string | null;
  connectedAt: string | null;
  connectedBy: string | null;
  rootFolderId: string | null;       // "Receipt" folder
  receivedFolderId: string | null;   // "Receipt/Received" folder
  sentFolderId: string | null;       // "Receipt/Sent" folder
  refreshToken?: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface AiVerificationResult {
  aiStatus: AiVerificationStatus;
  aiExtractedDate: string | null;
  aiNotes: string;
  isReadable: boolean;
  isAuthenticReceipt: boolean;
  dateMatches: boolean;
}
