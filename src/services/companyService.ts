import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  runTransaction 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, isConfigPlaceholder } from './firebase';
import { CompanyProfile, NumberSequenceType, SequenceCounters } from '../types/company';
import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';
import { TENANT } from '../config';

const SETTINGS_COLLECTION = 'settings';
const COMPANY_DOC = 'company';
const COUNTERS_DOC = 'counters';

const LOCAL_STORAGE_COMPANY_KEY = 'safardesk_company_profile';
const LOCAL_STORAGE_COUNTERS_KEY = 'safardesk_sequence_counters';

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: TENANT.companyName,
  legalName: 'SafarDesk Tourism & Travel Management Pvt. Ltd.',
  logoUrl: '',
  address: 'Suite 402, Al-Mansoor Executive Towers, Ibrahim Al-Khalil Road',
  city: 'Makkah Mukarramah',
  country: 'Kingdom of Saudi Arabia',
  phone: TENANT.contact.phone,
  mobile: '+966 50 123 4567',
  email: TENANT.contact.email,
  website: 'https://safardesk.com',
  taxRegNo: 'VAT-300189201940003',
  voucherPrefix: 'UV-',
  invoicePrefix: 'INV-',
  paymentPrefix: 'PAY-',
  jvPrefix: 'JV-',
  baseCurrency: 'PKR', // Fixed "PKR"
  defaultForeignCurrency: 'SAR', // "SAR"
  agentBackdateHours: 12, // Default 12, editable
  statementFooterNote: 'Official computer generated statement from SafarDesk. All transactions are subject to final airline and hotel audit verification. For discrepancies, please notify accounts@safardesk.com within 48 hours.',
  updatedAt: '2026-10-01T00:00:00Z',
  updatedBy: 'system_default',
};

const DEFAULT_COUNTERS: SequenceCounters = {
  voucher: 122,
  invoice: 1045,
  payment: 489,
  jv: 82,
};

/**
 * Fetch company profile document from Firestore settings/company
 */
export async function fetchCompanyProfile(): Promise<CompanyProfile> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDoc(doc(db, SETTINGS_COLLECTION, COMPANY_DOC));
      if (snap.exists()) {
        const data = snap.data() as CompanyProfile;
        localStorage.setItem(LOCAL_STORAGE_COMPANY_KEY, JSON.stringify(data));
        return data;
      } else {
        // Bootstrap document on first load
        await setDoc(doc(db, SETTINGS_COLLECTION, COMPANY_DOC), DEFAULT_COMPANY_PROFILE);
        localStorage.setItem(LOCAL_STORAGE_COMPANY_KEY, JSON.stringify(DEFAULT_COMPANY_PROFILE));
        return DEFAULT_COMPANY_PROFILE;
      }
    }
  } catch (err) {
    console.warn('Could not read settings/company from Firestore:', err);
  }

  // Fallback to local storage or defaults
  const stored = localStorage.getItem(LOCAL_STORAGE_COMPANY_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // use default
    }
  }

  localStorage.setItem(LOCAL_STORAGE_COMPANY_KEY, JSON.stringify(DEFAULT_COMPANY_PROFILE));
  return DEFAULT_COMPANY_PROFILE;
}

/**
 * Save company profile document (Owner only) and record in auditLog
 */
export async function saveCompanyProfile(
  actor: UserProfile,
  profile: CompanyProfile
): Promise<CompanyProfile> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the agency Owner can modify company settings.');
  }

  const previous = await fetchCompanyProfile();

  const updatedProfile: CompanyProfile = {
    ...profile,
    baseCurrency: 'PKR', // Strictly fixed to "PKR" as per requirement
    defaultForeignCurrency: profile.defaultForeignCurrency || 'SAR',
    agentBackdateHours: Number(profile.agentBackdateHours) || 12,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.uid,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, SETTINGS_COLLECTION, COMPANY_DOC), updatedProfile);
    }
  } catch (err) {
    console.warn('Could not write settings/company to Firestore:', err);
  }

  localStorage.setItem(LOCAL_STORAGE_COMPANY_KEY, JSON.stringify(updatedProfile));

  // Write audit log
  await logAuditEvent({
    action: 'COMPANY_SETTINGS_UPDATE',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    details: {
      before: previous,
      after: updatedProfile,
    },
  });

  return updatedProfile;
}

/**
 * Upload company logo to Firebase Storage
 */
export async function uploadCompanyLogo(file: File): Promise<string> {
  if (!isConfigPlaceholder && storage) {
    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const storageRef = ref(storage, `company/logo_${Date.now()}.${fileExt}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (err) {
      console.warn('Firebase Storage upload failed, falling back to local data URL:', err);
    }
  }

  // Fallback / instant preview via FileReader data URL
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

/**
 * Atomically increment sequence counter in Firestore settings/counters and return formatted number
 * e.g. "UV-000123"
 */
export async function nextNumber(type: NumberSequenceType): Promise<string> {
  const profile = await fetchCompanyProfile();
  const prefixMap: Record<NumberSequenceType, string> = {
    voucher: profile.voucherPrefix || 'UV-',
    invoice: profile.invoicePrefix || 'INV-',
    payment: profile.paymentPrefix || 'PAY-',
    jv: profile.jvPrefix || 'JV-',
  };

  const prefix = prefixMap[type];

  // Try Firestore atomic transaction
  if (!isConfigPlaceholder) {
    try {
      const counterRef = doc(db, SETTINGS_COLLECTION, COUNTERS_DOC);

      const nextVal = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let currentCount = DEFAULT_COUNTERS[type];

        if (counterDoc.exists()) {
          const data = counterDoc.data() as SequenceCounters;
          currentCount = (data[type] || DEFAULT_COUNTERS[type]) + 1;
          transaction.update(counterRef, {
            [type]: currentCount,
            lastUpdated: new Date().toISOString(),
          });
        } else {
          currentCount = DEFAULT_COUNTERS[type] + 1;
          transaction.set(counterRef, {
            ...DEFAULT_COUNTERS,
            [type]: currentCount,
            lastUpdated: new Date().toISOString(),
          });
        }

        return currentCount;
      });

      return `${prefix}${String(nextVal).padStart(6, '0')}`;
    } catch (err) {
      console.warn('Firestore transaction on settings/counters failed:', err);
    }
  }

  // Fallback to local storage atomic counter
  const counters: SequenceCounters = JSON.parse(
    localStorage.getItem(LOCAL_STORAGE_COUNTERS_KEY) || JSON.stringify(DEFAULT_COUNTERS)
  );

  counters[type] = (counters[type] || DEFAULT_COUNTERS[type]) + 1;
  counters.lastUpdated = new Date().toISOString();
  localStorage.setItem(LOCAL_STORAGE_COUNTERS_KEY, JSON.stringify(counters));

  return `${prefix}${String(counters[type]).padStart(6, '0')}`;
}

/**
 * Peek at next sequence number without incrementing counter (for previews)
 */
export async function peekNextNumber(type: NumberSequenceType): Promise<string> {
  const profile = await fetchCompanyProfile();
  const prefixMap: Record<NumberSequenceType, string> = {
    voucher: profile.voucherPrefix || 'UV-',
    invoice: profile.invoicePrefix || 'INV-',
    payment: profile.paymentPrefix || 'PAY-',
    jv: profile.jvPrefix || 'JV-',
  };

  const prefix = prefixMap[type];
  const counters: SequenceCounters = JSON.parse(
    localStorage.getItem(LOCAL_STORAGE_COUNTERS_KEY) || JSON.stringify(DEFAULT_COUNTERS)
  );

  const nextVal = (counters[type] || DEFAULT_COUNTERS[type]) + 1;
  return `${prefix}${String(nextVal).padStart(6, '0')}`;
}
