/**
 * SafarDesk — Global Tenant & Firebase Configuration
 * 
 * NOTE FOR REDEPLOYMENT:
 * This is the SINGLE SOURCE OF TRUTH for tenant branding and Firebase backend configuration.
 * To rebrand or redeploy this application for a different travel agency client,
 * simply modify the TENANT and firebaseConfig objects in this file (or supply them via environment variables).
 */

export interface TenantConfig {
  companyName: string;
  appTitle: string;
  shortName: string;
  tagline: string;
  currency: {
    primary: string; // e.g. 'SAR'
    secondary: string; // e.g. 'PKR'
    defaultExchangeRate: number; // e.g. 1 SAR = 74.50 PKR
  };
  contact: {
    email: string;
    phone: string;
    address: string;
  };
  brandColors?: {
    navy: string;
    gold: string;
  };
  dateFormat: string; // 'DD-MMM-YYYY'
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
}

/**
 * Active Tenant Branding & Settings
 */
export const TENANT: TenantConfig = {
  companyName: import.meta.env.VITE_TENANT_COMPANY_NAME || 'SafarDesk Travel & Tours',
  appTitle: import.meta.env.VITE_TENANT_APP_TITLE || 'SafarDesk — Travel Business Management System',
  shortName: 'SafarDesk',
  tagline: 'Enterprise Travel, Visa & Voucher Management CRM',
  currency: {
    primary: 'SAR',
    secondary: 'PKR',
    defaultExchangeRate: 74.50, // 1 SAR = 74.50 PKR
  },
  contact: {
    email: 'operations@safardesk.com',
    phone: '+966 12 558 7890',
    address: 'Al Mansoor District, Makkah Mukarramah, KSA',
  },
  brandColors: {
    navy: '#0e2c4c',
    gold: '#c9a227',
  },
  dateFormat: 'DD-MMM-YYYY',
};

/**
 * Firebase Client Configuration
 * Reads from environment variables if provided, or default placeholder credentials.
 * The application automatically validates if live credentials are provided;
 * otherwise it activates a graceful demo/preview authentication mode so reviewers
 * can test every feature and role seamlessly.
 */
const envFirebaseConfig: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyDemo-SafarDesk-TravelCRM-PlaceholderKey',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'safardesk-travel-crm.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'safardesk-travel-crm',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'safardesk-travel-crm.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '109233182682',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:109233182682:web:7f6d2b89c301ae420',
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)',
};


/**
 * Easy Firebase Connect: an owner can paste the project's web config JSON once
 * in Settings > Firebase Backend — it is saved in this browser (localStorage)
 * and used instead of the build-time .env values. No rebuild needed.
 */
const CUSTOM_FIREBASE_CONFIG_KEY = 'safardesk_firebase_config';

function loadCustomFirebaseConfig(): FirebaseConfig | null {
  try {
    const raw = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.apiKey === 'string' && typeof parsed.authDomain === 'string' && typeof parsed.projectId === 'string') {
      return {
        apiKey: parsed.apiKey,
        authDomain: parsed.authDomain,
        projectId: parsed.projectId,
        storageBucket: typeof parsed.storageBucket === 'string' ? parsed.storageBucket : '',
        messagingSenderId: typeof parsed.messagingSenderId === 'string' ? parsed.messagingSenderId : '',
        appId: typeof parsed.appId === 'string' ? parsed.appId : '',
        firestoreDatabaseId: typeof parsed.databaseId === 'string' ? parsed.databaseId : '(default)',
      };
    }
  } catch { /* ignore malformed saved config */ }
  return null;
}

export function getFirebaseConfigSource(): 'custom' | 'env' {
  return loadCustomFirebaseConfig() ? 'custom' : 'env';
}

export function saveCustomFirebaseConfig(jsonText: string): FirebaseConfig {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('This is not valid JSON. Copy the web config from Firebase Console > Project Settings > "Your apps" and paste it here.');
  }
  const cfg = parsed?.firebaseConfig || parsed;
  if (!cfg?.apiKey || !cfg?.authDomain || !cfg?.projectId) {
    throw new Error('The config must include apiKey, authDomain and projectId.');
  }
  localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(cfg));
  return cfg;
}

export function clearCustomFirebaseConfig(): void {
  localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
}

export const firebaseConfig: FirebaseConfig = loadCustomFirebaseConfig() || envFirebaseConfig;

export const TENANT_KEY = import.meta.env.VITE_TENANT_KEY || 'safardesk-default-tenant';
// Fix #31: demo backdoor is gated behind VITE_DEMO_MODE (default off).
// Set VITE_DEMO_MODE=true in .env only for local UI demos — never in production.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export const LICENSE_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: import.meta.env.VITE_LICENSE_API_KEY || firebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_LICENSE_AUTH_DOMAIN || 'safardesk-license-server.firebaseapp.com',
  projectId: import.meta.env.VITE_LICENSE_PROJECT_ID || 'safardesk-license-server',
  appId: import.meta.env.VITE_LICENSE_APP_ID || '1:license:web:app',
};

export default {
  TENANT,
  firebaseConfig,
  TENANT_KEY,
  LICENSE_FIREBASE_CONFIG,
};
