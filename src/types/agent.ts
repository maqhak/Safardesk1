export interface AgentDoc {
  id: string; // Firestore document ID
  agentCode: string; // e.g. "AGT-001"
  companyName: string; // Agent / Company name
  contactPerson: string;
  mobile: string;
  city: string;
  email: string;
  dueLimitSAR: number;
  exchangeRatePKRRate: number; // Manual SAR -> PKR rate for this agent
  defaultSellingPricePerVisa?: number; // Default selling price per visa (SAR) — auto-fills in distribution
  notes: string;
  isActive: boolean;
  userId?: string; // Linked Firebase Auth / users doc UID
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface LedgerAccountDoc {
  id: string;
  accountType: 'agent' | 'vendor' | 'bank' | 'customer' | 'other';
  linkedAgentId: string;
  agentCode: string;
  accountName: string;
  openingBalance: number;
  currentBalanceSAR: number;
  currency: string; // "SAR"
  createdAt: string;
  createdBy: string;
  updatedAt?: string;
}

export interface LedgerEntryDoc {
  id: string;
  ledgerAccountId: string;
  voucherNo?: string;
  entryDate: string;
  description: string;
  debitSAR: number;
  creditSAR: number;
  balanceSAR: number;
  currency: string;
  createdAt: string;
  createdBy: string;
}

export interface AgentBalanceInfo {
  agentId: string;
  agentCode: string;
  companyName: string;
  balanceSAR: number;
  balancePKR: number;
  dueLimitSAR: number;
  exchangeRatePKRRate: number;
  isOverLimit: boolean;
  overLimitAmountSAR: number;
}
