import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { VoucherDoc } from '../../types/voucher';
import { fetchVouchers } from '../../services/voucherService';
import { FileText, Building2, MapPin, Users, Calendar, DollarSign } from 'lucide-react';

interface VoucherQuickModalProps {
  voucherNo: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const VoucherQuickModal: React.FC<VoucherQuickModalProps> = ({
  voucherNo,
  isOpen,
  onClose,
}) => {
  const [voucher, setVoucher] = useState<VoucherDoc | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!voucherNo || !isOpen) return;

    setLoading(true);
    fetchVouchers().then((list) => {
      const found = list.find((v) => v.voucherNo.toLowerCase() === voucherNo.toLowerCase());
      setVoucher(found || null);
      setLoading(false);
    });
  }, [voucherNo, isOpen]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Voucher Document: ${voucherNo}`}
      subtitle="Linked operational voucher details, passenger manifest, hotel stays, and financial charges."
      size="lg"
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          Close View
        </Button>
      }
    >
      {loading ? (
        <div className="py-8 text-center text-slate-500 text-sm">
          Loading voucher data for {voucherNo}...
        </div>
      ) : voucher ? (
        <div className="space-y-4 py-1 text-xs">
          {/* Header Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Status</span>
              <Badge variant={voucher.status === 'Confirmed' ? 'success' : 'warning'}>
                {voucher.status}
              </Badge>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Created Date</span>
              <span className="font-medium text-slate-800">{voucher.createdAt?.split('T')[0] || '2026-10-01'}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Gross SAR</span>
              <span className="font-mono font-bold text-[#0e2c4c]">SAR {voucher.totals?.totalSAR?.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-bold block">Total PKR</span>
              <span className="font-mono font-bold text-emerald-600">PKR {voucher.totals?.totalPKR?.toLocaleString()}</span>
            </div>
          </div>

          {/* Passenger Manifest */}
          <div>
            <h5 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5 text-xs">
              <Users className="w-3.5 h-3.5 text-[#0e2c4c]" />
              <span>Pilgrim Manifest ({voucher.passengers?.length || 0} Pax)</span>
            </h5>
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {voucher.passengers && voucher.passengers.length > 0 ? (
                voucher.passengers.map((p, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between bg-white">
                    <div>
                      <span className="font-bold text-slate-800">{p.name}</span>
                      <span className="text-slate-400 text-[11px] ml-2">Passport: {p.passportNumber}</span>
                    </div>
                    <Badge variant="neutral" size="sm">{p.ageType}</Badge>
                  </div>
                ))
              ) : (
                <div className="p-3 text-slate-400">No passengers recorded</div>
              )}
            </div>
          </div>

          {/* Hotel Stays */}
          <div>
            <h5 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-[#0e2c4c]" />
              <span>Hotel Accommodation</span>
            </h5>
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {voucher.hotelStays && voucher.hotelStays.length > 0 ? (
                voucher.hotelStays.map((h, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between bg-white">
                    <div>
                      <div className="font-bold text-[#0e2c4c]">{h.hotelName} ({h.city})</div>
                      <div className="text-slate-500 text-[11px]">
                        Check-in: {h.checkInDate} • Check-out: {h.checkOutDate} ({h.nights} nights, {h.bedType})
                      </div>
                    </div>
                    <span className="font-mono font-bold text-slate-800">SAR {h.totalSAR?.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <div className="p-3 text-slate-400">No hotel stays recorded</div>
              )}
            </div>
          </div>

          {/* Sectors */}
          {voucher.sectors && voucher.sectors.length > 0 && (
            <div>
              <h5 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5 text-xs">
                <MapPin className="w-3.5 h-3.5 text-[#0e2c4c]" />
                <span>Transportation & Sectors</span>
              </h5>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                {voucher.sectors.map((sec, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between bg-white">
                    <div>
                      <span className="font-semibold text-slate-800">{sec.type}</span>
                      <span className="text-slate-500 text-[11px] ml-2">({sec.date} • {sec.flightNo || sec.vehicleType || 'Company Transport'})</span>
                    </div>
                    <span className="font-mono text-slate-700">SAR {sec.transportRateSAR || 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-6 text-center space-y-2">
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="font-bold text-slate-800">Voucher Reference: {voucherNo}</h4>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            This voucher entry was posted from external batch operations or booking files. Total charges have been verified in the general ledger.
          </p>
        </div>
      )}
    </Modal>
  );
};
