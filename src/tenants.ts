/**
 * tenants.ts — Central tenant registry for one-build-many-tenants architecture.
 *
 * The app detects which domain it's running on and loads the matching
 * Firebase config at runtime from environment variables.
 * Build ONCE, deploy the same dist/ to all agency hosting sites.
 *
 * .env format (all agencies in ONE file):
 *   VITE_TENANT_<KEY>_API_KEY=...
 *   VITE_TENANT_<KEY>_AUTH_DOMAIN=...
 *   VITE_TENANT_<KEY>_PROJECT_ID=...
 *   VITE_TENANT_<KEY>_STORAGE_BUCKET=...
 *   VITE_TENANT_<KEY>_SENDER_ID=...
 *   VITE_TENANT_<KEY>_APP_ID=...
 *   VITE_TENANT_<KEY>_HOSTNAME=safardesk-xxx.web.app
 *   VITE_TENANT_<KEY>_COMPANY_NAME=...
 *
 * Where <KEY> is e.g. ABUSULTAN, ADAN, LEADING, BROTHERS6, FS
 */

export interface TenantFirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  tenantKey: string;
  companyName: string;
  hostname: string;
}

const TENANT_KEYS = ['ABUSULTAN', 'ADAN', 'LEADING', 'BROTHERS6', 'FS'] as const;

function loadTenantFromEnv(key: string): TenantFirebaseConfig | null {
  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env[`VITE_TENANT_${key}_API_KEY`];
  const projectId = env[`VITE_TENANT_${key}_PROJECT_ID`];
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain: env[`VITE_TENANT_${key}_AUTH_DOMAIN`] || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: env[`VITE_TENANT_${key}_STORAGE_BUCKET`] || `${projectId}.firebasestorage.app`,
    messagingSenderId: env[`VITE_TENANT_${key}_SENDER_ID`] || '',
    appId: env[`VITE_TENANT_${key}_APP_ID`] || '',
    tenantKey: env[`VITE_TENANT_${key}_KEY`] || projectId,
    companyName: env[`VITE_TENANT_${key}_COMPANY_NAME`] || projectId,
    hostname: env[`VITE_TENANT_${key}_HOSTNAME`] || `${projectId}.web.app`,
  };
}

function getAllTenantsFromEnv(): TenantFirebaseConfig[] {
  const tenants: TenantFirebaseConfig[] = [];
  for (const key of TENANT_KEYS) {
    const t = loadTenantFromEnv(key);
    if (t) tenants.push(t);
  }
  return tenants;
}

/**
 * Resolve the current tenant from the browser hostname.
 * Returns null on localhost (uses legacy single-tenant .env path).
 */
export function resolveTenant(): TenantFirebaseConfig | null {
  if (typeof window === 'undefined') return null;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return null;

  const tenants = getAllTenantsFromEnv();
  // Exact hostname match
  for (const t of tenants) {
    if (t.hostname === hostname) return t;
  }
  // Fallback: match by project ID in hostname
  for (const t of tenants) {
    if (hostname.includes(t.projectId)) return t;
  }
  return null;
}

export function getAllTenants(): TenantFirebaseConfig[] {
  return getAllTenantsFromEnv();
}
