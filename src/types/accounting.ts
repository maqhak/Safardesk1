export type LedgerAccountType = 
  | 'agent'
  | 'vendor'
  | 'hotel'
  | 'bank'
  | 'cash'
  | 'customer'
  | 'income'
  | 'expense';

export type LedgerEntryType = 
  | 'Invoice'
  | 'Payment'
  | 'Journal Voucher'
  | 'Voucher Charge'
  | 'Refund'
  | 'Adjustment'
  | 'Item/Service';

export interface LedgerAccountDoc {
  id: string;
  accountCode: string; // e.g. "AGT-001", "VND-002", "BNK-001", "CSH-001", "SYS-001"
  accountType: LedgerAccountType;
  title: string;
  linkedId?: string | null; // agentId, vendorId, hotelId, bankId, customerId
  isSystem: boolean; // true for seeded system accounts like Visa Margin Income, Ticket Income, Commission Expense, Transport Income
  isActive: boolean;
  openingBalanceSAR: number;
  openingBalancePKR: number;
  creditLimitSAR?: number; // Due / credit limit for agents
  currentBalanceSAR?: number;
  currentBalancePKR?: number;
  lastRecomputedAt?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

export interface LedgerEntryDoc {
  id: string;
  entryNo: string; // auto e.g. "LE-10001"
  date: string; // YYYY-MM-DD
  accountId: string; // ref to LedgerAccountDoc.id
  entryType: LedgerEntryType;
  transNo: string; // source document number (INV-1001, PAY-2001, JV-3001, UV-000101, etc.)
  particulars: string; // free text description
  invoiceRef?: string | null; // invoice reference
  voucherNo?: string | null; // nullable — clicking it anywhere opens the voucher
  rate: number; // SAR -> PKR exchange rate used (e.g. 74.50)
  debitSAR: number;
  creditSAR: number;
  debitPKR: number;
  creditPKR: number;
  driveFileUrl?: string | null; // proof link
  proofType?: 'receipt' | 'voice' | null;
  createdBy: string;
  createdAt: string;
  isVoid: boolean;
  voidReason?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  reversalOf?: string | null; // entryNo of the original entry this entry reverses
  paxCount?: number; // carried on voucher-charge entries
  paxType?: 'mofa' | 'hotel' | null;
  mofaPax?: number; // explicit count
  hotelPax?: number; // explicit count
}

export interface ComputedLedgerStatementRow {
  entry: LedgerEntryDoc;
  runningBalance: number;
  formattedRate: string;
}

export interface LedgerStatementSummary {
  account: LedgerAccountDoc;
  currency: 'SAR' | 'PKR' | 'USD';
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  previousBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  totalMofaPax: number;
  totalHotelPax: number;
  rows: ComputedLedgerStatementRow[];
}

export interface AccountBalanceRow {
  account: LedgerAccountDoc;
  balanceSAR: number;
  balancePKR: number;
  creditLimitSAR: number;
  isOverLimit: boolean;
  overDueAmountSAR: number;
  lastEntryDate: string | null;
  entriesCount: number;
}

export interface BalancesSummaryData {
  lastRecomputedAt: string;
  agents: AccountBalanceRow[];
  hotelsVendors: AccountBalanceRow[];
  banks: AccountBalanceRow[];
  cash: AccountBalanceRow[];
  customers: AccountBalanceRow[];

  // Section totals
  totalAgentsSAR: number;
  totalAgentsPKR: number;
  totalHotelsVendorsSAR: number;
  totalHotelsVendorsPKR: number;
  totalBanksSAR: number;
  totalBanksPKR: number;
  totalCashSAR: number;
  totalCashPKR: number;
  totalCustomersSAR: number;
  totalCustomersPKR: number;

  // Grand totals
  totalReceivableSAR: number;
  totalReceivablePKR: number;
  totalPayableSAR: number;
  totalPayablePKR: number;
  netPositionSAR: number;
  netPositionPKR: number;
}
