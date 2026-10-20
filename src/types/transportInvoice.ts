/**
 * Transport Invoice — charge a customer for transport service.
 * Captures: vendor (which company the transport was taken from),
 * customer (whom it was given to), vehicle, sector, description.
 * Ledger: Dr Customer / Cr Transport Income (+ optional Dr Transport Cost / Cr Vendor).
 */

export const TRANSPORT_INVOICE_PREFIX = 'TINV-';
export const TRANSPORT_INVOICE_COLLECTION = 'transportInvoices';
export const TRANSPORT_INVOICE_LOCAL_KEY = 'safardesk_transport_invoices_v1';

export type TransportInvoiceStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Void';

export interface TransportInvoiceDoc {
  id: string;
  invoiceNo: string; // TINV-1001…
  date: string; // YYYY-MM-DD
  customerId: string;
  customerName: string;
  vendorId?: string;
  vendorName?: string;
  vehicleId?: string;
  vehicleType?: string; // Car | Staria | Hiace | Coaster | Bus | GMC
  sector: string; // Arrival | Departure | Makkah to Madina | …
  description: string;
  amountSAR: number;
  amountPKR: number;
  rate: number; // SAR → PKR used
  status: TransportInvoiceStatus;
  paidAmount: number;
  isVoid: boolean;
  voidReason?: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const TRANSPORT_SECTORS = [
  'Arrival',
  'Departure',
  'Makkah to Madina',
  'Madina to Makkah',
  'Roundtrip',
  'Makkah Ziyarat',
  'Madina Ziyarat',
  'Badr Ziyarat',
  'Taif Ziyarat',
  'Ziyarat',
  'Other',
];
