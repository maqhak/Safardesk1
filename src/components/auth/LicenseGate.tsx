import React from 'react';
import { ShieldAlert, Calendar, Phone, Eye } from 'lucide-react';
import { LicenseProvider, useLicense } from '../../contexts/LicenseContext';
import { TENANT_KEY, TENANT } from '../../config';
import { useAuth } from '../../contexts/AuthContext';

interface LicenseGateProps {
  children: React.ReactNode;
}

/** Persistent banner shown while the app runs in read-only mode. */
const ReadOnlyBanner: React.FC = () => (
  <div className="bg-rose-600 text-white text-center text-[11px] font-bold py-1.5 px-4 flex items-center justify-center gap-2">
    <Eye className="w-3.5 h-3.5" />
    <span>
      Read-Only Mode — the SafarDesk license has expired. You can view records, but creating, editing, or deleting is disabled.
      Contact {TENANT.contact.phone} to renew.
    </span>
  </div>
);

const LicenseGateInner: React.FC<LicenseGateProps> = ({ children }) => {
  const { license, loading, isReadOnly, enterReadOnly, isExpiredOrBlocked, daysRemaining } = useLicense();
  const { role } = useAuth();

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

  // Fix #28: expired/blocked licenses switch the app to READ-ONLY mode instead of
  // a dead end — data stays visible and untouched, but nothing can be changed.
  if (isExpiredOrBlocked && !isReadOnly) {
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
              The subscription for <strong>{license.companyName}</strong> has expired{license.validUntil ? <> as of <strong>{license.validUntil}</strong></> : ''}. Your agency data remains 100% intact, secure, and unmodified. You may continue in read-only mode, or contact your system provider to renew.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-600">
              <span>Tenant Key:</span>
              <strong className="font-mono text-slate-900">{TENANT_KEY}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Valid Until:</span>
              <strong className="text-slate-900">{license.validUntil || '—'}{daysRemaining !== null && daysRemaining < 0 ? ` (${Math.abs(daysRemaining)} days ago)` : ''}</strong>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span>Status:</span>
              <span className="font-bold uppercase text-rose-600">{license.status}</span>
            </div>
            <div className="flex items-center justify-between text-slate-600">
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />Support:</span>
              <strong className="text-slate-900">{license.supportContact || TENANT.contact.phone}</strong>
            </div>
          </div>

          {isOwner && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-left space-y-1 text-xs text-amber-900">
              <strong>Owner License Control Panel:</strong>
              <p className="text-[11px] text-amber-800">
                You are logged in as Owner. Contact billing support to refresh the secure license token and restore full access.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <button
              type="button"
              onClick={enterReadOnly}
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 bg-[#0e2c4c] hover:bg-[#0e2c4c]/90 text-white font-bold rounded-xl text-xs shadow-md transition cursor-pointer"
            >
              <Eye className="w-4 h-4" />
              Continue in Read-Only Mode
            </button>
            <a
              href={`mailto:support@safardesk.com?subject=License Renewal for ${license.companyName} (${TENANT_KEY})`}
              className="inline-block w-full py-2.5 border border-slate-300 text-slate-700 font-bold rounded-xl text-xs transition text-center hover:bg-slate-50"
            >
              Contact Renewal Support →
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {isReadOnly && <ReadOnlyBanner />}
      {children}
    </>
  );
};

export const LicenseGate: React.FC<LicenseGateProps> = ({ children }) => (
  <LicenseProvider>
    <LicenseGateInner>{children}</LicenseGateInner>
  </LicenseProvider>
);
