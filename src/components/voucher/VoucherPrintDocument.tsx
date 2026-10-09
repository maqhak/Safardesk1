import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { VoucherDoc } from '../../types/voucher';
import { CompanyProfile } from '../../types/company';

export type VoucherPrintTheme = 'bw' | 'color';

/**
 * Hotel Voucher print document — layout per reference voucher UB-103940
 * (approved by owner 2026-10-09, supersedes the F&S sketch design).
 * Sections: header (Hotel Voucher / voucher no / manual no / family head),
 * Mutamers grid, Accommodation grid + total nights, Transport/Services,
 * Departure/Arrival flight tables + QR, Special Instructions (Urdu).
 * Auto-fits to ONE A4 page. Rendered print-only; screen shows the normal
 * detail modal instead.
 */
export const VoucherPrintDocument: React.FC<{
  voucher: VoucherDoc;
  company: CompanyProfile;
  groupCode?: string;
  theme?: VoucherPrintTheme;
  preview?: boolean;
}> = ({ voucher, company, groupCode, theme = 'bw', preview = false }) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      const el = innerRef.current;
      if (el) {
        const h = el.scrollHeight;
        const pagePx = 297 * 3.779527559 - 4; // A4 height px @96dpi
        if (h > pagePx) setScale(Math.max(0.55, pagePx / h));
        else setScale(1);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [voucher]);

  const pax = voucher.passengers || [];
  const stays = voucher.hotelStays || [];
  const totalNights = stays.reduce((s, h) => s + (h.nights || 0), 0);
  const fd = voucher.flightDetails;

  /** 2026-10-18 -> 18-10-26 */
  const fmtShort = (iso?: string) => {
    if (!iso) return '—';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return `${m[3]}-${m[2]}-${m[1].slice(2)}`;
    return iso;
  };
  /** 2026-10-18 -> 18-OCT */
  const fmtDay = (iso?: string) => {
    if (!iso) return '—';
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return `${m[3]}-${months[parseInt(m[2], 10) - 1] || ''}`;
    return iso;
  };

  const dep = fd?.departureFlight;
  const ret = fd?.returnFlight;
  const depSector = dep?.sector || `${dep?.fromAirport?.iata || ''}-${dep?.toAirport?.iata || ''}`;
  const retSector = ret?.sector || `${ret?.fromAirport?.iata || ''}-${ret?.toAirport?.iata || ''}`;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/vouchers/shared/${voucher.id}`
    : voucher.voucherNo;

  const genderShort = (g?: string) => {
    const s = (g || '').toLowerCase();
    if (s.startsWith('f')) return 'F';
    if (s.startsWith('m')) return 'M';
    return '—';
  };

  const instructions: string[] = [
    'آپ کو مکہ اور مدینہ میں ہوٹل میں چیک اِن کیا گیا ہے، اس کے مطابق آپ کو پرنٹ شدہ واؤچر کے ساتھ تمام سہولیات فراہم کی جائیں گی۔',
    'سفری معلومات میں درج شدہ فلائٹ کی مقررہ تاریخ کو ایئرپورٹ پر وقت سے پہلے پہنچنا لازمی ہے۔ کسی بھی تبدیلی کی ذمہ داری مسافر پر ہوگی۔',
    'ممنوعہ اشیاء ساتھ رکھنا منع ہے۔ سعودی عرب میں کسی بھی شکایت کی صورت میں ہمارے نمائندے سے رابطہ کریں۔',
    'ہوٹل سے چیک آؤٹ کا وقت دوپہر 2 بجے ہے۔ اس کے بعد اضافی نائٹ کا چارج لاگو ہوگا۔',
    'واپسی فلائٹ سے 6 گھنٹے پہلے اپنا سامان سمیت مکمل تیار ہو کر ہوٹل کی لابی میں موجود ہوں۔',
    'واؤچر پر درج شدہ فلائٹ کی پابندی آپ کے لیے لازمی ہے۔',
  ];

  return (
    <div className={`hv-root${preview ? ' hv-preview' : ''}`}>
      <style>{`
        .hv-root { position:absolute; left:-12000px; top:0; width:210mm; font-family:Arial,Helvetica,sans-serif; color:#111; background:#fff; }
        .hv-root.hv-preview { position:static; width:210mm; margin:0 auto; box-shadow:0 4px 24px rgba(0,0,0,.25); }
        @media print {
          .hv-root { position:static; width:auto; }
          .hv-root.hv-preview { box-shadow:none; margin:0; }
          @page { size:A4; margin:0; }
        }
        .hv-page { width:210mm; height:297mm; overflow:hidden; position:relative; background:#fff; }
        .hv-fit { width:210mm; transform-origin:top left; position:relative; padding:6mm 7mm; }
        .hv-brandline { display:flex; align-items:center; justify-content:space-between; border-bottom:.6mm solid #111; padding-bottom:2mm; margin-bottom:2mm; }
        .hv-brandline .hv-coname { font-size:4.2mm; font-weight:bold; letter-spacing:.5mm; }
        .hv-brandline .hv-cocontact { font-size:2.8mm; color:#333; }
        .hv-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:2mm; }
        .hv-head .hv-fam { font-size:3.4mm; font-weight:bold; flex:1; }
        .hv-head .hv-title { text-align:center; flex:1; }
        .hv-head .hv-title h1 { font-size:4.6mm; font-weight:normal; letter-spacing:.3mm; }
        .hv-head .hv-vno { font-size:4.6mm; font-weight:bold; margin-top:1mm; }
        .hv-head .hv-manual { flex:1; text-align:right; font-size:3.2mm; font-weight:bold; }
        .hv-secttl { font-size:3.2mm; font-weight:bold; text-align:center; letter-spacing:.5mm; padding:1.6mm; border:.45mm solid #111; background:#e8e8e8; margin-top:2.6mm; }
        table.hv-vt { width:100%; border-collapse:collapse; }
        table.hv-vt th { background:#f0f0f0; font-size:2.7mm; font-weight:bold; padding:1.4mm 1.2mm; border:.35mm solid #111; white-space:nowrap; }
        table.hv-vt td { font-size:2.9mm; padding:1.3mm 1.2mm; border:.35mm solid #111; }
        table.hv-vt tr:nth-child(even) td { background:#fafafa; }
        .hv-totalrow td { font-weight:bold; background:#f0f0f0 !important; }
        .hv-flt2 { display:flex; gap:3mm; align-items:stretch; }
        .hv-flt2 .hv-half { flex:1; min-width:0; }
        .hv-flt2 .hv-qr { flex:0 0 30mm; display:flex; align-items:center; justify-content:center; border:.35mm solid #111; margin-top:2.6mm; padding:2mm; }
        .hv-instr { margin-top:2.6mm; border:.45mm solid #111; padding:2.5mm 3mm; }
        .hv-instr h4 { font-size:3.2mm; font-style:italic; margin-bottom:1.5mm; }
        .hv-instr ul { list-style:none; }
        .hv-instr li { font-size:2.9mm; line-height:1.7; text-align:right; direction:rtl; padding:.6mm 0; }
        .hv-instr li::before { content:"- "; }
        .hv-foot { margin-top:2.6mm; display:flex; justify-content:space-between; font-size:2.7mm; color:#333; border-top:.45mm solid #111; padding-top:2mm; }
      `}</style>

      <div className="hv-page">
        <div ref={innerRef} className="hv-fit" style={{ transform: `scale(${scale})` }}>

          <div className="hv-brandline">
            <div className="hv-coname">{(company.companyName || 'TRAVEL AND TOURS').toUpperCase()}</div>
            <div className="hv-cocontact">{[company.phone, company.email].filter(Boolean).join(' | ')}</div>
          </div>

          <div className="hv-head">
            <div className="hv-fam">Family Head: {voucher.leaderName || pax[0]?.name || '—'}</div>
            <div className="hv-title">
              <h1>Hotel Voucher</h1>
              <div className="hv-vno">{voucher.voucherNo}</div>
            </div>
            <div className="hv-manual">Manual No: {(voucher as any).manualNo || ''}</div>
          </div>

          <div className="hv-secttl">Mutamers</div>
          <table className="hv-vt">
            <thead>
              <tr>
                <th>SNO</th><th>Passport</th><th>Mutamer Name</th><th>G</th><th>PAX</th>
                <th>Bed</th><th>MOFA #</th><th>GRP #</th><th>Visa #</th><th>PNR</th><th>TRNS</th>
              </tr>
            </thead>
            <tbody>
              {pax.map((m, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{m.passportNumber || '—'}</td>
                  <td style={{ fontWeight: 'bold' }}>{m.name}</td>
                  <td>{genderShort((m as any).gender)}</td>
                  <td>{m.ageType}</td>
                  <td>{m.withoutBed ? 'No' : 'Yes'}</td>
                  <td>—</td>
                  <td>{(m as any).groupCode || groupCode || '—'}</td>
                  <td>—</td>
                  <td>{dep?.pnr || '—'}</td>
                  <td style={{ fontWeight: 'bold' }}>{m.trnsPaid ? 'YES' : 'XXXXX'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="hv-secttl">Accommodation</div>
          <table className="hv-vt">
            <thead>
              <tr>
                <th>City</th><th>Hotel Name</th><th>View</th><th>Meal</th><th>Conf#</th>
                <th>Room Type</th><th>Checkin</th><th>Checkout</th><th>Nights</th>
              </tr>
            </thead>
            <tbody>
              {stays.map((h, i) => (
                <tr key={i}>
                  <td>{h.city}</td>
                  <td style={{ fontWeight: 'bold' }}>{h.hotelName}{h.description ? ` (${h.description})` : ''}</td>
                  <td>—</td><td>—</td><td>—</td>
                  <td>{h.bedType}</td>
                  <td>{fmtShort(h.checkInDate)}</td>
                  <td>{fmtShort(h.checkOutDate)}</td>
                  <td>{h.nights}</td>
                </tr>
              ))}
              <tr className="hv-totalrow">
                <td colSpan={8} style={{ textAlign: 'right' }}>Total Nights:</td>
                <td>{totalNights}</td>
              </tr>
            </tbody>
          </table>

          <div className="hv-secttl">Transport / Services</div>
          <table className="hv-vt">
            <thead>
              <tr><th>Travel Date</th><th>Transporter</th><th>Type</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>—</td>
                <td>{voucher.transportCompany || 'Company Transport'}</td>
                <td>{voucher.transportType || '—'}</td>
                <td>{voucher.trip || voucher.remarks || '—'}</td>
              </tr>
            </tbody>
          </table>

          <div className="hv-flt2">
            <div className="hv-half">
              <div className="hv-secttl">Departure (Pakistan to KSA)</div>
              <table className="hv-vt">
                <thead><tr><th>Flight</th><th>Sector</th><th>Departure</th><th>Arrival</th></tr></thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 'bold' }}>{dep?.airline?.iataCode || ''} {dep?.flightNo || '—'}</td>
                    <td>{depSector || '—'}</td>
                    <td>{fmtDay(dep?.date)}{dep?.etd ? ` ${dep.etd}` : ''}</td>
                    <td>{fmtDay(dep?.date)}{dep?.eta ? ` ${dep.eta}` : ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="hv-half">
              <div className="hv-secttl">Arrival (KSA to Pakistan)</div>
              <table className="hv-vt">
                <thead><tr><th>Flight</th><th>Sector</th><th>Departure</th><th>Arrival</th></tr></thead>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 'bold' }}>{ret?.airline?.iataCode || ''} {ret?.flightNo || '—'}</td>
                    <td>{retSector || '—'}</td>
                    <td>{fmtDay(ret?.date)}{ret?.etd ? ` ${ret.etd}` : ''}</td>
                    <td>{fmtDay(ret?.date)}{ret?.eta ? ` ${ret.eta}` : ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="hv-qr">
              <QRCode value={shareUrl} size={88} />
            </div>
          </div>

          <div className="hv-instr">
            <h4><i>Special Instructions:</i></h4>
            <ul>
              {instructions.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>

          <div className="hv-foot">
            <div>Shirka: {(voucher as any).shirkaName || '—'}</div>
            <div>Agent: {(voucher as any).agentName || '—'}</div>
            <div>{company.website || company.email || ''}</div>
          </div>

        </div>
      </div>
    </div>
  );
};
