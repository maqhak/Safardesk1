import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Printer, ShieldAlert } from 'lucide-react';
import { VoucherDoc } from '../types/voucher';
import { fetchVoucherById } from '../services/voucherService';
import { fetchVisas } from '../services/visaService';
import { VoucherPrintDocument } from '../components/voucher/VoucherPrintDocument';
import { downloadVoucherPDF } from '../utils/voucherPrint';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

/**
 * Fix #18: shareable read-only voucher link (/vouchers/shared/:voucherId).
 * No edit actions — view, print, and go back only. Agents can only open
 * their own vouchers.
 */
export const VoucherSharedView: React.FC = () => {
  const { voucherId } = useParams<{ voucherId: string }>();
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const { profile: company } = useCompany();
  const [voucher, setVoucher] = useState<VoucherDoc | null>(null);
  const [groupCode, setGroupCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Public shared link: single-doc read (no login required). The
        // Firestore rules allow public `get` on vouchers/{id}.
        const found = await fetchVoucherById(voucherId || '');
        if (!found) {
          setVoucher(null);
        } else if (role === 'agent' && userProfile?.agentId && found.agentId !== userProfile.agentId) {
          // Logged-in agents can only open their own vouchers; anonymous
          // visitors (QR scan) see the voucher without login.
          setDenied(true);
        } else {
          setVoucher(found);
          try {
            const visas = await fetchVisas();
            const m = new Map<string, string>();
            visas.forEach((v: any) => m.set(v.id, v.groupCode || ''));
            for (const id of found.visaIds || []) {
              const g = m.get(id);
              if (g) { setGroupCode(g); break; }
            }
          } catch { /* group code is display-only */ }
        }
      } catch {
        setVoucher(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [voucherId, role, userProfile?.agentId]);

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">Loading shared voucher…</div>
    );
  }

  if (denied) {
    return (
      <div className="py-16">
        <Card className="max-w-md mx-auto text-center p-8 border-rose-200">
          <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-1">Not Authorized</h2>
          <p className="text-xs text-slate-500">This voucher belongs to another agent.</p>
        </Card>
      </div>
    );
  }

  if (!voucher) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500 mb-4">Voucher not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/vouchers')}>
          Back to Vouchers
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} rightIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Back
        </Button>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Official Voucher • Read-only shared link</span>
        </div>
        <Button variant="primary" size="sm" onClick={() => downloadVoucherPDF(voucher.voucherNo)} rightIcon={<Download className="w-3.5 h-3.5" />}>
          Download PDF
        </Button>
        <Button variant="primary" size="sm" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>
          Print Voucher
        </Button>
      </div>

      {/* OFFICIAL voucher document (same F&S A4 design as print).
          Owner order 2026-10-23: scan view shows ONLY the official voucher —
          no summary card below it at all. */}
      <VoucherPrintDocument voucher={voucher} company={company} groupCode={groupCode} theme="color" preview />
    </div>
  );
};

export default VoucherSharedView;
