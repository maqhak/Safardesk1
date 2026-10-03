export interface DistributionGroupLine {
  groupCode: string;
  groupName: string;
  agentId: string;
  sellingPricePerVisa: number;
  buyingPricePerVisa: number;
  visaIds: string[];
  visaCount: number;
}

export interface VisaDistributionDoc {
  id: string;
  distributionNo: string;
  vendorId: string;
  shirkaId?: string; // Sub-Shirka of the vendor (empty = vendor itself)
  buyingPricePerVisa: number;
  groups: DistributionGroupLine[];
  totalVisas: number;
  totalBuyingSAR: number;
  totalSellingSAR: number;
  marginSAR: number;
  date: string;
  createdBy: string;
  createdAt: string;
}

export interface InvoiceGroupLine {
  groupCode: string;
  groupName: string;
  visaCount: number;
  sellingPricePerVisa: number;
  buyingPricePerVisa: number;
  lineTotalSAR: number;
}

export interface CommissionDetails {
  enabled: boolean;
  recipientName: string;
  contactNumber: string;
  amountSAR: number;
  status: 'Unpaid' | 'Paid';
  paidAt?: string | null;
  paidEntryId?: string | null;
}

export interface VisaInvoiceDoc {
  id: string;
  invoiceNo: string;
  distributionId: string;
  agentId: string;
  vendorId: string;
  date: string;
  lines: InvoiceGroupLine[];
  sellingTotalSAR: number;
  buyingTotalSAR: number;
  marginSAR: number;
  exchangeRate: number;
  totalsPKR: number;
  status: 'Unpaid' | 'Partially Paid' | 'Paid';
  paidAmountSAR?: number;
  commission?: CommissionDetails | null;
  createdBy: string;
  createdAt: string;
  isVoid?: boolean;
}
