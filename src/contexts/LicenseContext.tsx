import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchTenantLicense, LicenseDoc } from '../services/licenseService';

interface LicenseContextValue {
  license: LicenseDoc | null;
  loading: boolean;
  /** True when the license is expired/blocked AND the user entered read-only mode. */
  isReadOnly: boolean;
  enterReadOnly: () => void;
  isExpiredOrBlocked: boolean;
  daysRemaining: number | null;
}

const LicenseContext = createContext<LicenseContextValue>({
  license: null,
  loading: true,
  isReadOnly: false,
  enterReadOnly: () => {},
  isExpiredOrBlocked: false,
  daysRemaining: null,
});

const READONLY_SESSION_KEY = 'safardesk_license_readonly_v1';

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [license, setLicense] = useState<LicenseDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(READONLY_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    // Fail open fast: if the license server hangs, don't wait more than 5s.
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('license-timeout')), 5000)
    );
    Promise.race([fetchTenantLicense(), timeout])
      .then((lic) => setLicense(lic))
      .catch(() => setLicense(null))
      .finally(() => setLoading(false));
  }, []);

  const isExpiredOrBlocked = useMemo(() => {
    if (!license) return false;
    return (
      license.status === 'expired' ||
      license.status === 'blocked' ||
      (license.validUntil ? new Date(license.validUntil).getTime() < Date.now() : false)
    );
  }, [license]);

  const daysRemaining = useMemo(() => {
    if (!license?.validUntil) return null;
    const diff = new Date(license.validUntil).getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [license]);

  const enterReadOnly = () => {
    setIsReadOnly(true);
    try {
      sessionStorage.setItem(READONLY_SESSION_KEY, '1');
    } catch {
      // non-fatal
    }
  };

  return (
    <LicenseContext.Provider
      value={{ license, loading, isReadOnly, enterReadOnly, isExpiredOrBlocked, daysRemaining }}
    >
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicense = (): LicenseContextValue => useContext(LicenseContext);
