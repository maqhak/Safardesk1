import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, Clock, X, Building2, CalendarDays, KeyRound, Phone } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { useLicense } from '../../contexts/LicenseContext';
import { TENANT_KEY } from '../../config';

/**
 * Fix #28 — License pill for the top navbar.
 * Shows live license status; click opens the license details panel.
 */
export const LicensePill: React.FC = () => {
  const { license, loading, daysRemaining, isReadOnly } = useLicense();
  const [detailsOpen, setDetailsOpen] = useState<boolean>(false);

  if (loading || !license) return null;

  const expired = license.status === 'expired' || license.status === 'blocked' || (daysRemaining !== null && daysRemaining < 0);
  const trial = license.status === 'trial';
  const expiringSoon = !expired && daysRemaining !== null && daysRemaining <= 15;

  const pillStyle = expired || isReadOnly
    ? 'bg-rose-500/15 border-rose-400/30 text-rose-200'
    : trial || expiringSoon
      ? 'bg-amber-500/15 border-amber-400/30 text-amber-200'
      : 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200';

  const label = isReadOnly
    ? 'Read-Only'
    : expired
      ? 'Expired'
      : trial
        ? `Trial • ${daysRemaining ?? '—'}d left`
        : expiringSoon
          ? `${daysRemaining}d left`
          : 'Licensed';

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold transition cursor-pointer ${pillStyle}`}
        title="View license details"
      >
        {expired || isReadOnly ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
        <span>{label}</span>
      </button>

      <Modal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        title="SafarDesk License Details"
        subtitle="Tenant subscription & support information"
        footer={
          <div className="flex justify-end w-full">
            <button
              type="button"
              onClick={() => setDetailsOpen(false)}
              className="px-4 py-2 bg-[#0e2c4c] text-white text-xs font-bold rounded-lg cursor-pointer"
            >
              Close
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2 text-xs">
          <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${expired ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                {expired ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
              </div>
              <div>
                <div className="font-bold text-slate-900 text-sm">{license.plan || 'Enterprise'}</div>
                <div className="text-slate-500">Subscription plan</div>
              </div>
            </div>
            <Badge variant={expired ? 'danger' : trial ? 'gold' : 'success'}>
              {isReadOnly ? 'Read-Only' : license.status.toUpperCase()}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1"><Building2 className="w-3.5 h-3.5" /><span>Licensed To</span></div>
              <div className="font-bold text-slate-900">{license.companyName}</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1"><KeyRound className="w-3.5 h-3.5" /><span>Tenant Key</span></div>
              <div className="font-mono font-bold text-slate-900">{TENANT_KEY}</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1"><CalendarDays className="w-3.5 h-3.5" /><span>Valid Until</span></div>
              <div className="font-bold text-slate-900">{license.validUntil || '—'}</div>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center gap-1.5 text-slate-500 mb-1"><Clock className="w-3.5 h-3.5" /><span>Days Remaining</span></div>
              <div className={`font-bold ${daysRemaining !== null && daysRemaining <= 15 ? 'text-amber-700' : 'text-slate-900'}`}>
                {daysRemaining === null ? '—' : daysRemaining < 0 ? 'Expired' : `${daysRemaining} days`}
              </div>
            </div>
          </div>

          <div className="p-3 bg-navy-50 border border-navy-100 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-700">
              <Phone className="w-4 h-4 text-[var(--theme-primary)]" />
              <span>Renewal & billing support: <strong>{license.supportContact || 'support@safardesk.com'}</strong></span>
            </div>
          </div>

          {isReadOnly && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
              Read-only mode is active: you can view all records, but creating, editing, or deleting anything is disabled until the license is renewed. Your data is untouched.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
