import React, { useState, useEffect } from 'react';
import { ShieldAlert, AlertTriangle, Calendar, Building2, Phone, Mail, CheckCircle2 } from 'lucide-react';
import { fetchTenantLicense, LicenseDoc } from '../../services/licenseService';
import { TENANT_KEY, TENANT } from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface LicenseGateProps {
  children: React.ReactNode;
}

export const LicenseGate: React.FC<LicenseGateProps> = ({ children }) => {
  const { userProfile, role } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [license, setLicense] = useState<LicenseDoc | null>(null);

  useEffect(() => {
    fetchTenantLicense()
      .then((lic) => {
        setLicense(lic);
      })
      .catch(() => {
        // Fallback active
        setLicense({
          companyName: TENANT.companyName,
          status: 'active',
          validUntil: '2027-12-31',
          plan: 'Enterprise',
          supportContact: TENANT.contact.phone,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[#c9a227] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-xs font-mono text-slate-400">Verifying secure tenant subscription...</div>
        </div>
      </div>
    );
  }

  if (!license) {
    return <>{children}</>;
  }

  // Check expiration or block
  const isExpiredOrBlocked = 
    license.status === 'expired' || 
    license.status === 'blocked' || 
    (license.validUntil && new Date(license.validUntil).getTime() < Date.now());

  if (isExpiredOrBlocked) {
    const isOwner = role === 'owner';

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Subscription Expired
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              The subscription for <strong>{license.companyName}</strong> has expired as of <strong>{license.validUntil}</strong>. Your agency data remains 100% intact, secure, and unmodified. Please contact your system provider to renew your enterprise plan.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Tenant Key:</span>
              <strong className="font-mono text-slate-900">{TENANT_KEY}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Status:</span>
              <span className="font-bold uppercase text-rose-600">{license.status}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Support Contact:</span>
              <strong className="text-slate-900">{license.supportContact || TENANT.contact.phone}</strong>
            </div>
          </div>

          {isOwner && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-1 text-xs text-amber-900">
              <strong>Owner License Control Panel:</strong>
              <p className="text-[11px] text-amber-800">
                You are logged in as Owner. You may contact billing support to refresh the secure Firestore license token.
              </p>
            </div>
          )}

          <div className="pt-2">
            <a
              href={`mailto:support@safardesk.com?subject=License Renewal for ${license.companyName} (${TENANT_KEY})`}
              className="inline-block w-full py-2.5 bg-[#0e2c4c] hover:bg-[#0e2c4c]/90 text-white font-bold rounded-xl text-xs shadow-md transition text-center"
            >
              Contact Renewal Support →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
