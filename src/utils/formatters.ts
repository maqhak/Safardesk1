import { TENANT } from '../config';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/**
 * Format date to standard DD-MMM-YYYY (e.g. 02-Oct-2026)
 */
export function formatDate(
  dateInput: string | number | Date | null | undefined,
  includeTime: boolean = false
): string {
  if (!dateInput) return '—';

  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number'
      ? new Date(dateInput)
      : dateInput;

    if (isNaN(d.getTime())) return '—';

    const day = String(d.getDate()).padStart(2, '0');
    const month = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();

    if (includeTime) {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}-${month}-${year} ${hours}:${minutes}`;
    }

    return `${day}-${month}-${year}`;
  } catch {
    return '—';
  }
}

/**
 * Global money formatter for currency values with 2 decimals and thousand separators.
 * Defaults to primary currency (SAR).
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string = TENANT.currency.primary,
  locale: string = 'en-US'
): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return `0.00 ${currency}`;
  }

  const formattedNumber = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `${formattedNumber} ${currency}`;
}

/**
 * Dual Currency Converter & Formatter for SAR & PKR pairs
 */
export function formatDualCurrency(
  amountSar: number | null | undefined,
  exchangeRate: number = TENANT.currency.defaultExchangeRate
): { sar: string; pkr: string; rawSar: number; rawPkr: number } {
  const sar = Number(amountSar) || 0;
  const pkr = sar * exchangeRate;

  return {
    sar: formatMoney(sar, 'SAR'),
    pkr: formatMoney(pkr, 'PKR'),
    rawSar: sar,
    rawPkr: pkr,
  };
}

/**
 * Utility for combining Tailwind class names conditionally
 */
export function cn(...classes: any[]): string {
  return classes.filter(Boolean).join(' ');
}
