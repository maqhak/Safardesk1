export type JournalVoucherTag = 'Adjustment' | 'Direct Settlement' | 'Netting';

export interface JournalVoucherLine {
  id: string;
  accountId: string;
  accountTitle: string;
  accountCode: string;
  accountType?: string;
  debitSAR: number;
  creditSAR: number;
}

export interface JournalVoucherAttachment {
  fileUrl: string;
  fileName: string;
  fileType: 'image' | 'pdf' | 'audio';
  mimeType?: string;
  driveFileId?: string | null;
  webViewLink?: string | null;
}

export interface AiVoiceCheckResult {
  transcription: string;
  extractedAmount?: number | null;
  extractedDate?: string | null;
  extractedPayer?: string | null;
  amountMatches: boolean;
  dateMatches: boolean;
  status: 'Verified' | 'Needs Review';
  notes: string;
}

export interface JournalVoucherDoc {
  id: string;
  jvNo: string; // auto, JV prefix e.g. "JV-00101"
  date: string; // YYYY-MM-DD
  tag: JournalVoucherTag;
  lines: JournalVoucherLine[];
  exchangeRate: number; // manual SAR→PKR rate on EVERY JV
  detailsBox: string; // free text — shown VERBATIM in ledger statement Particulars column
  totalDebitSAR: number;
  totalCreditSAR: number;
  attachment?: JournalVoucherAttachment | null;
  aiVoiceCheck?: AiVoiceCheckResult | null;
  status: 'Active' | 'Voided';
  createdBy: string;
  createdAt: string;
  isVoid?: boolean;
  voidReason?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  needsOwnerReview?: boolean;
  ownerApproved?: boolean;
  createdEntryIds?: string[];
  auditTrail: Array<{
    action: 'create' | 'edit' | 'void' | 'approve';
    by: string;
    at: string;
    notes?: string;
    snapshot?: any;
  }>;
}
