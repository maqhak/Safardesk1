import { TENANT_KEY, LICENSE_FIREBASE_CONFIG } from '../config';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

export interface LicenseDoc {
  companyName: string;
  status: 'active' | 'trial' | 'expired' | 'blocked';
  validUntil: string; // YYYY-MM-DD
  plan: string;
  supportContact?: string;
}

const LICENSE_CACHE_KEY = 'safardesk_license_cache_v1';
const LICENSE_CACHE_TIME_KEY = 'safardesk_license_cache_time_v1';

export async function fetchTenantLicense(): Promise<LicenseDoc> {
  const defaultLicense: LicenseDoc = {
    companyName: 'SafarDesk Travel & Tours',
    status: 'active',
    validUntil: '2027-12-31',
    plan: 'Enterprise Unlimited',
    supportContact: '+966 12 558 7890 (support@safardesk.com)',
  };

  try {
    // Check local cache first (valid for 24 hours)
    const cachedTime = localStorage.getItem(LICENSE_CACHE_TIME_KEY);
    const cachedData = localStorage.getItem(LICENSE_CACHE_KEY);
    const now = Date.now();

    if (cachedTime && cachedData && now - parseInt(cachedTime, 10) < 24 * 60 * 60 * 1000) {
      return JSON.parse(cachedData);
    }

    // Initialize secondary app for license server if credentials provided
    let licenseApp;
    const existingApps = getApps();
    const licenseAppName = 'SafarDeskLicenseApp';
    const foundApp = existingApps.find(a => a.name === licenseAppName);

    if (foundApp) {
      licenseApp = foundApp;
    } else {
      licenseApp = initializeApp(LICENSE_FIREBASE_CONFIG, licenseAppName);
    }

    const licenseDb = getFirestore(licenseApp);
    const snap = await getDoc(doc(licenseDb, 'crm_licenses', TENANT_KEY));

    if (snap.exists()) {
      const data = snap.data() as LicenseDoc;
      localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(data));
      localStorage.setItem(LICENSE_CACHE_TIME_KEY, String(now));
      return data;
    } else {
      // If doc not found, fail-open to default active license or cached
      if (cachedData) return JSON.parse(cachedData);
      return defaultLicense;
    }
  } catch (err) {
    console.warn('License server unreachable. Failing-open using cached license:', err);
    const cachedData = localStorage.getItem(LICENSE_CACHE_KEY);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    return defaultLicense;
  }
}
