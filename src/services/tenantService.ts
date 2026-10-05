/**
 * tenantService.ts — Runtime tenant branding (stored in Firestore settings/tenant)
 *
 * This allows agency branding (company name, app title, contact info) to be
 * changed from the UI without rebuilding/redeploying. Values stored here
 * override the build-time .env defaults in src/config.ts.
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';

const SETTINGS_COLLECTION = 'settings';
const TENANT_DOC = 'tenant';

export interface TenantBranding {
  companyName?: string;
  appTitle?: string;
  email?: string;
  phone?: string;
  address?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const LOCAL_STORAGE_TENANT_KEY = 'safardesk_tenant_branding';

/**
 * Fetch tenant branding from Firestore. Returns null if not set
 * (caller falls back to build-time .env defaults).
 */
export async function fetchTenantBranding(): Promise<TenantBranding | null> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDoc(doc(db, SETTINGS_COLLECTION, TENANT_DOC));
      if (snap.exists()) {
        const data = snap.data() as TenantBranding;
        localStorage.setItem(LOCAL_STORAGE_TENANT_KEY, JSON.stringify(data));
        return data;
      }
      return null;
    }
  } catch (err) {
    console.warn('Could not read settings/tenant from Firestore:', err);
  }

  // Fallback to local cache
  const stored = localStorage.getItem(LOCAL_STORAGE_TENANT_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Save tenant branding to Firestore (Owner only).
 * Applies immediately to the running app via applyTenantBranding().
 */
export async function saveTenantBranding(
  actorUid: string,
  branding: TenantBranding
): Promise<TenantBranding> {
  const payload: TenantBranding = {
    ...branding,
    updatedAt: new Date().toISOString(),
    updatedBy: actorUid,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, SETTINGS_COLLECTION, TENANT_DOC), payload, { merge: true });
    }
  } catch (err) {
    console.error('Could not write settings/tenant to Firestore:', err);
    throw new Error(
      'Failed to save branding. Check: (1) Firestore rules deployed, (2) you are Owner.'
    );
  }

  localStorage.setItem(LOCAL_STORAGE_TENANT_KEY, JSON.stringify(payload));

  // Apply to running app immediately
  const { applyTenantBranding } = await import('../config');
  applyTenantBranding(payload);

  return payload;
}
