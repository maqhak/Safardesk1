import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { CompanyProfile } from '../types/company';
import { fetchCompanyProfile, DEFAULT_COMPANY_PROFILE } from '../services/companyService';

interface CompanyContextType {
  profile: CompanyProfile;
  loading: boolean;
  reloadProfile: () => Promise<void>;
  updateCachedProfile: (newProfile: CompanyProfile) => void;
}

const CompanyContext = createContext<CompanyContextType>({
  profile: DEFAULT_COMPANY_PROFILE,
  loading: true,
  reloadProfile: async () => {},
  updateCachedProfile: () => {},
});

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState<boolean>(true);

  const reloadProfile = useCallback(async () => {
    try {
      const data = await fetchCompanyProfile();
      setProfile(data);
    } catch (err) {
      console.warn('Failed to load company profile:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadProfile();
  }, [reloadProfile]);

  const updateCachedProfile = (newProfile: CompanyProfile) => {
    setProfile(newProfile);
  };

  return (
    <CompanyContext.Provider
      value={{
        profile,
        loading,
        reloadProfile,
        updateCachedProfile,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompanyProfile = (): CompanyContextType => {
  return useContext(CompanyContext);
};

export const useCompany = useCompanyProfile;
