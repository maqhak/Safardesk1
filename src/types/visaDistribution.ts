/** Standard Umrah package varieties — price varies by duration. */
export const PACKAGE_TYPES = ['10 Days', '15 Days', '21 Days', '28 Days', 'Long Stay'] as const;
export type PackageType = typeof PACKAGE_TYPES[number];

export interface DistributionGroupLine {
  groupCode: string;
  groupName: string;
  agentId: string;
  sellingPricePerVisa: number;
  buyingPricePerVisa: number;
  visaIds: string[];
  visaCount: number;
  packageType?: string;
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

/** Per-PAX invoice line — one row per pilgrim on the single invoice. */
export interface InvoicePaxLine {
  pilgrimName: string;
  passportNumber: string;
  groupCode: string;
  groupName: string;
  sellingPricePerVisa: number;
  lineTotalSAR: number;
  packageType?: string;
}

/** Details for the optional commission box on a distribution batch. */
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
  shirkaId?: string; // Sub-Shirka of the vendor (empty = vendor itself)
  date: string;
  lines: InvoicePaxLine[];
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
