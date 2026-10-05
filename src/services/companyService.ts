import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  runTransaction 
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
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
  stampUrl: '',
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
  makkahStaffName: '',
  makkahStaffPhone: '',
  madinaStaffName: '',
  madinaStaffPhone: '',
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
    console.error('Could not write settings/company to Firestore:', err);
    // Don't silently succeed — let the UI show the real error
    throw new Error(
      'Failed to save to Firestore. Check: (1) Firestore rules deployed, (2) you are Owner, (3) user document exists.'
    );
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
 * Upload company logo to central SafarDesk Drive via Google Apps Script.
 * The script URL comes from VITE_LOGO_UPLOAD_URL env var (one-time setup by Moin).
 * Falls back to resized base64 data URL if the script is not configured.
 */
export async function uploadCompanyLogo(file: File): Promise<string> {
  const scriptUrl = import.meta.env.VITE_LOGO_UPLOAD_URL as string | undefined;

  // Resize image to max 400px before upload (keeps it fast)
  const dataUrl = await resizeImageToDataUrl(file, 400);

  if (scriptUrl) {
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          image: dataUrl,
          mimeType: file.type || 'image/png',
          filename: `logo_${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`,
        }),
      });
      const result = await response.json();
      if (result.success && result.url) {
        return result.url;
      }
      console.warn('Logo upload script returned error:', result.error);
    } catch (err) {
      console.warn('Logo upload via Apps Script failed, using local data URL:', err);
    }
  }

  // Fallback: resized base64 data URL (stored in Firestore settings/company)
  return dataUrl;
}

/**
 * Resize an image file to max dimension and return as data URL.
 */
function resizeImageToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      resolve(canvas.toDataURL(mimeType, 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
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
