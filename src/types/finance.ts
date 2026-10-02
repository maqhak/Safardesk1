export interface ExchangeRateDoc {
  id: string;
  pair: 'SAR/PKR' | 'USD/PKR' | 'AED/PKR' | string;
  rate: number; // PKR per 1 unit of foreign currency
  effectiveDate: string; // YYYY-MM-DD
  method: 'manual' | 'bulk-upload';
  addedBy: string;
  createdAt: string;
  updatedAt?: string;
}
