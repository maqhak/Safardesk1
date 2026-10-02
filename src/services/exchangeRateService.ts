import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';

const LOCAL_STORAGE_RATES_KEY = 'safardesk_exchange_rates_master_v2';

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

export function fetchExchangeRates(): Record<string, number> {
  const stored = localStorage.getItem(LOCAL_STORAGE_RATES_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(DEFAULT_RATES));
  return DEFAULT_RATES;
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
  localStorage.setItem(LOCAL_STORAGE_RATES_KEY, JSON.stringify(rates));

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
    setRate(getCurrentRate(pair));
    const handleStorage = () => {
      setRate(getCurrentRate(pair));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [pair]);

  return rate;
}

/**
 * Shared display helper rendering converted figures as "SAR 1,000 @ 74.50 = PKR 74,500"
 */
export function formatConvertedMoney(amountSAR: number, rate?: number): string {
  const currentRate = rate || getCurrentRate('SAR-PKR');
  const amountPKR = amountSAR * currentRate;
  
  const formattedSAR = amountSAR.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const formattedPKR = amountPKR.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const formattedRate = currentRate.toFixed(2);

  return `SAR ${formattedSAR} @ ${formattedRate} = PKR ${formattedPKR}`;
}
