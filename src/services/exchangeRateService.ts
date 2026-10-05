import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';

const LOCAL_STORAGE_RATES_KEY = 'safardesk_exchange_rates_master_v2';
const SETTINGS_COLLECTION = 'settings';
const RATES_DOC = 'exchangeRates';

export interface ExchangeRateDoc {
  pair: string; // e.g. "SAR-PKR"
  rate: number; // e.g. 74.50
  updatedAt: string;
  updatedBy: string;
}

const DEFAULT_RATES: Record<string, number> = {
  'SAR-PKR': 74.50,
  'USD-SAR': 3.75,
  'USD-PKR': 278.50,
};

// In-memory cache (populated from Firestore at startup)
let cachedRates: Record<string, number> | null = null;

export function fetchExchangeRates(): Record<string, number> {
  if (cachedRates) return { ...cachedRates };
  const stored = localStorage.getItem(LOCAL_STORAGE_RATES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return { ...DEFAULT_RATES };
}

/**
 * Load rates from Firestore into memory + localStorage cache.
 * Call at app startup. Silently keeps defaults on failure.
 */
export async function loadExchangeRates(): Promise<void> {
  try {
    if (isConfigPlaceholder) return;
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, RATES_DOC));
    if (snap.exists()) {
      const data = snap.data() as { rates?: Record<string, number> };
      if (data.rates) {
        cachedRates = { ...DEFAULT_RATES, ...data.rates };
        localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(cachedRates));
        return;
      }
    }
  } catch {
    // keep defaults
  }
  // Fallback to localStorage
  const stored = localStorage.getItem(LOCAL_STORAGE_RATES_KEY);
  if (stored) {
    try {
      cachedRates = { ...DEFAULT_RATES, ...JSON.parse(stored) };
      return;
    } catch {
      // ignore
    }
  }
  cachedRates = { ...DEFAULT_RATES };
}

export function getCurrentRate(pair: string = 'SAR-PKR'): number {
  const rates = fetchExchangeRates();
  return rates[pair] || DEFAULT_RATES[pair] || 74.50;
}

export async function updateExchangeRate(
  actor: UserProfile,
  pair: string,
  newRate: number
): Promise<void> {
  const rates = fetchExchangeRates();
  rates[pair] = newRate;
  cachedRates = { ...rates };
  localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(rates));

  // Persist to Firestore so all devices/users share the same rate
  try {
    if (!isConfigPlaceholder) {
      await setDoc(
        doc(db, SETTINGS_COLLECTION, RATES_DOC),
        { rates, updatedAt: new Date().toISOString(), updatedBy: actor.uid },
        { merge: true }
      );
    }
  } catch (err) {
    console.error('Could not save exchange rate to Firestore:', err);
    throw new Error('Failed to save rate to Firestore. Check rules and Owner role.');
  }

  await logAuditEvent({
    action: 'UPDATE_EXCHANGE_RATE',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: pair,
    details: { pair, newRate },
  });
}

/**
 * Hook to get current rate and update function
 */
import { useState, useEffect } from 'react';

export function useCurrentRate(pair: string = 'SAR-PKR') {
  const [rate, setRate] = useState<number>(() => getCurrentRate(pair));

  useEffect(() => {
    loadExchangeRates().then(() => setRate(getCurrentRate(pair)));
  }, [pair]);

  return rate;
}

export function formatConvertedMoney(amountSAR: number, rate?: number): string {
  const r = rate || getCurrentRate('SAR-PKR');
  const pkr = amountSAR * r;
  return `SAR ${amountSAR.toLocaleString()} @ ${r.toFixed(2)} = PKR ${Math.round(pkr).toLocaleString()}`;
}
