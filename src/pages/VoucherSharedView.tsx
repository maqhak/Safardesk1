import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, ShieldAlert } from 'lucide-react';
import { VoucherDoc } from '../types/voucher';
import { fetchVouchers } from '../services/voucherService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

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
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchVouchers();
        const found = list.find((v) => v.id === voucherId) || null;
        if (!found) {
          setVoucher(null);
        } else if (role === 'agent' && found.agentId !== userProfile?.agentId) {
          setDenied(true);
        } else {
          setVoucher(found);
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
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <Button variant="outline" size="sm" onClick={() => navigate(-1)} rightIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
          Back
        </Button>
        <Button variant="primary" size="sm" onClick={() => window.print()} rightIcon={<Printer className="w-3.5 h-3.5" />}>
          Print Voucher
        </Button>
      </div>

      <Card className="p-6 sm:p-8">
        {/* Letterhead */}
        <div className="border-b-2 border-slate-900 pb-4 mb-5">
          <h1 className="text-2xl font-black text-[#0e2c4c] tracking-tight">{company.companyName}</h1>
          <p className="text-xs text-slate-600 mt-1">
            {[company.address, company.city, company.phone, company.email].filter(Boolean).join(' • ')}
          </p>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-2">Umrah Trip Voucher (Read-Only)</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-5 text-xs">
          <span className="font-mono font-black text-xl text-[#c9a227]">{voucher.voucherNo}</span>
          <Badge variant={voucher.status === 'Confirmed' ? 'success' : voucher.status === 'Cancelled' ? 'danger' : 'warning'}>
            {voucher.status}
          </Badge>
          <span className="text-slate-500 uppercase font-semibold">Link: {voucher.linkType}</span>
        </div>

        {/* Passengers */}
        <h3 className="font-bold text-slate-900 text-sm mb-2">Passengers ({voucher.passengers.length})</h3>
        <div className="grid sm:grid-cols-2 gap-2 mb-5 text-xs">
          {voucher.passengers.map((p, i) => (
            <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="font-bold text-slate-800">{p.name}</div>
              <div className="text-slate-500 font-mono">{p.passportNumber} • {p.ageType}</div>
            </div>
          ))}
        </div>

        {/* Sectors */}
        {voucher.sectors.length > 0 && (
          <>
            <h3 className="font-bold text-slate-900 text-sm mb-2">Transport Sectors</h3>
            <div className="space-y-2 mb-5 text-xs">
              {voucher.sectors.map((s, i) => (
                <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex justify-between">
                  <span className="font-bold text-[#0e2c4c]">{s.type} • {s.date}</span>
                  <span className="text-slate-600">{s.isSelfGari ? 'Self Gari' : s.vehicleType || '—'}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Hotel stays */}
        {voucher.hotelStays.length > 0 && (
          <>
            <h3 className="font-bold text-slate-900 text-sm mb-2">Hotel Stays</h3>
            <div className="space-y-2 mb-5 text-xs">
              {voucher.hotelStays.map((h, i) => (
                <div key={i} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex justify-between">
                  <span className="font-bold text-slate-800">
                    {h.hotelName} {h.isSelfHotel && <span className="text-slate-500 font-medium">(Self Hotel)</span>}
                  </span>
                  <span className="text-slate-600">{h.city} • {h.nights}n • {h.bedType} bed</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Charges */}
        <h3 className="font-bold text-slate-900 text-sm mb-2">Charges</h3>
        <div className="space-y-1.5 mb-4 text-xs">
          {voucher.charges.map((c, i) => (
            <div key={i} className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-700">{c.description}</span>
              <span className="font-mono font-bold">SAR {(c.amountSAR || 0).toLocaleString()}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 font-black text-sm">
            <span>Total</span>
            <span className="font-mono text-[#0e2c4c]">SAR {(voucher.totals.totalSAR || 0).toLocaleString()}</span>
          </div>
          {voucher.totals.totalPKR > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>PKR equivalent</span>
              <span className="font-mono">PKR {Math.round(voucher.totals.totalPKR).toLocaleString()}</span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 mt-4">
          Created by {voucher.createdByName} on {new Date(voucher.createdAt).toLocaleString()}
          {voucher.status === 'Cancelled' && ` • Cancelled by ${voucher.cancelledBy || '—'}`}
          {' '}• Read-only shared link — no changes can be made from this view.
        </p>
      </Card>
    </div>
  );
};

export default VoucherSharedView;
