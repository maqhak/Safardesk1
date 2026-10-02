import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc 
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { ExchangeRateDoc } from '../types/finance';
import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';

const EXCHANGE_RATES_COLLECTION = 'exchangeRates';
const LOCAL_STORAGE_RATES_KEY = 'safardesk_exchange_rates';

const INITIAL_RATES: ExchangeRateDoc[] = [
  {
    id: 'rate-sar-1',
    pair: 'SAR/PKR',
    rate: 74.50,
    effectiveDate: '2026-10-01',
    method: 'manual',
    addedBy: 'system',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'rate-usd-1',
    pair: 'USD/PKR',
    rate: 278.50,
    effectiveDate: '2026-10-01',
    method: 'manual',
    addedBy: 'system',
    createdAt: '2026-10-01T00:00:00Z',
  },
  {
    id: 'rate-aed-1',
    pair: 'AED/PKR',
    rate: 75.80,
    effectiveDate: '2026-10-01',
    method: 'manual',
    addedBy: 'system',
    createdAt: '2026-10-01T00:00:00Z',
  },
];

export async function fetchExchangeRates(): Promise<ExchangeRateDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, EXCHANGE_RATES_COLLECTION));
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as ExchangeRateDoc);
      }
    }
  } catch (err) {
    console.warn('Could not read exchange rates from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_RATES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(INITIAL_RATES));
  return INITIAL_RATES;
}

export async function createExchangeRate(
  actor: UserProfile,
  data: { pair: string; rate: number; effectiveDate: string; method: 'manual' | 'bulk-upload' }
): Promise<ExchangeRateDoc> {
  if (data.rate <= 0) {
    throw new Error('Exchange rate must be greater than 0.');
  }

  const existing = await fetchExchangeRates();
  const duplicate = existing.find(
    (r) => r.pair.toUpperCase() === data.pair.toUpperCase() && r.effectiveDate === data.effectiveDate
  );
  if (duplicate) {
    throw new Error(`An exchange rate for ${data.pair} on effective date ${data.effectiveDate} already exists.`);
  }

  const rateId = `rate-${data.pair.replace('/', '-').toLowerCase()}-${Date.now()}`;
  const newRate: ExchangeRateDoc = {
    id: rateId,
    pair: data.pair.toUpperCase(),
    rate: data.rate,
    effectiveDate: data.effectiveDate,
    method: data.method,
    addedBy: actor.name || actor.email,
    createdAt: new Date().toISOString(),
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, EXCHANGE_RATES_COLLECTION, rateId), newRate);
    }
  } catch (err) {
    console.warn('Firestore write failed for exchange rate:', err);
  }

  const updatedList = [newRate, ...existing];
  localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(updatedList));

  await logAuditEvent({
    action: 'CREATE_EXCHANGE_RATE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: rateId,
    details: { pair: data.pair, rate: data.rate, effectiveDate: data.effectiveDate, method: data.method },
  });

  return newRate;
}

/**
 * Global helper: convert foreign currency amount to PKR
 */
export function convert(amountForeign: number, rate: number): number {
  return Math.round(amountForeign * rate * 100) / 100;
}
