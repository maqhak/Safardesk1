export interface CompanyProfile {
  companyName: string;
  legalName: string;
  logoUrl: string;
  stampUrl: string; // company rubber stamp/seal image for vouchers
  address: string;
  city: string;
  country: string;
  phone: string;
  mobile: string;
  email: string;
  website: string;
  taxRegNo: string;
  voucherPrefix: string; // e.g. "UV-"
  invoicePrefix: string; // e.g. "INV-"
  paymentPrefix: string; // e.g. "PAY-"
  jvPrefix: string; // e.g. "JV-"
  baseCurrency: string; // Fixed "PKR"
  defaultForeignCurrency: string; // e.g. "SAR"
  agentBackdateHours: number; // default 12, editable
  makkahStaffName: string; // default KSA staff contacts (editable per voucher)
  makkahStaffPhone: string;
  madinaStaffName: string;
  madinaStaffPhone: string;
  statementFooterNote: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type NumberSequenceType = 'voucher' | 'invoice' | 'payment' | 'jv';

export interface SequenceCounters {
  voucher: number;
  invoice: number;
  payment: number;
  jv: number;
  lastUpdated?: string;
}
