import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { VoucherDoc } from '../../types/voucher';
import { CompanyProfile } from '../../types/company';
import kaabaSketch from '../../assets/voucher/kaaba-sketch.jpg';
import madinahSketch from '../../assets/voucher/madinah-sketch.jpg';
import kaabaColor from '../../assets/voucher/kaaba-color.jpg';
import madinahColor from '../../assets/voucher/madinah-color.jpg';

export type VoucherPrintTheme = 'bw' | 'color';

/**
 * F&S-approved A4 Umrah voucher print document (B&W print theme).
 * Locked design (approved 2026-10-01): pencil-sketch Kaaba + Masjid-e-Nabawi header,
 * company logo/monogram, ribbon, metabar, flight tables, full-width accommodation
 * table, transportation, two-column mutamer tables, includes/remarks/notes,
 * staff contacts, signature stamp, footer. Auto-fits to ONE A4 page.
 * Rendered print-only; screen shows the normal detail modal instead.
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
      if (!el) return;
      const h = el.scrollHeight;
      const pagePx = 297 * 3.779527559 - 4; // A4 height px @96dpi
      if (h > pagePx) setScale(Math.max(0.55, pagePx / h));
      else setScale(1);
    }, 120);
    return () => clearTimeout(t);
  }, [voucher]);

  const pax = voucher.passengers || [];
  const adults = pax.filter(p => p.ageType === 'Adult').length;
  const children = pax.filter(p => p.ageType === 'Child').length;
  const infants = pax.filter(p => p.ageType === 'Infant').length;
  const stays = voucher.hotelStays || [];
  const sectors = voucher.sectors || [];
  const totalNights = stays.reduce((s, h) => s + (h.nights || 0), 0);

  const arrivalSector = sectors.find(s => /^arrival/i.test(s.type));
  const departureSector = sectors.find(s => /^departure/i.test(s.type));
  const fd = voucher.flightDetails;

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const createdStr = fmtDate(voucher.createdAt);

  // Single-line transport summary, e.g. "JED - MAK CAR, remaining by BUS".
  // First group's trip + mode, then the remaining modes — always ONE voucher line.
  const transportGroups: { trips: string; by: string }[] = [];
  {
    let curBy = '';
    let curTrips: string[] = [];
    const flush = () => {
      if (curTrips.length && curBy) transportGroups.push({ trips: curTrips.join(' + '), by: curBy });
      curTrips = [];
    };
    sectors.forEach((s) => {
      const by = s.isSelfGari ? 'SELF GARI' : (s.vehicleType || '—').toUpperCase();
      let trip = s.type;
      const ap = `${s.fromAirport?.iata || ''}${s.toAirport?.iata ? ` - ${s.toAirport.iata}` : ''}`;
      if (ap.trim() && ap.trim() !== '-') trip += ` (${ap.trim()})`;
      if (by !== curBy) { flush(); curBy = by; }
      curTrips.push(trip);
    });
    flush();
  }
  let transportLine = '—';
  if (transportGroups.length === 1) {
    transportLine = `${transportGroups[0].trips} by ${transportGroups[0].by}`;
  } else if (transportGroups.length > 1) {
    const [first, ...rest] = transportGroups;
    const restModes = [...new Set(rest.map((g) => g.by))].join(' + ');
    transportLine = `${first.trips} by ${first.by}, remaining by ${restModes}`;
  }
  const transportByLine = [...new Set(transportGroups.map((g) => g.by))].join(' + ') || '—';

  const half = Math.ceil(pax.length / 2);
  const cols = [pax.slice(0, half), pax.slice(half)];

  const includes = ['Return Air Ticket', 'Airport Transfers', 'Umrah Visa', 'Inter City Transportation', 'Hotel Accommodation', 'Ziarat (As Per Itinerary)', 'Daily Breakfast', '24/7 Assistance'];
  const notes = ['Please keep this voucher with you during travel.', 'Present this voucher at the time of check-in.', 'All timings are local and subject to change.', 'The company is not responsible for any loss of personal belongings.', 'For any assistance, contact our representatives.'];

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/vouchers/shared/${voucher.id}`
    : voucher.voucherNo;
  const brandShort = (company.companyName || 'S').split(/\s+/).filter(w => /[a-zA-Z]/.test(w[0] || '')).map(w => w[0]).join('').slice(0, 3).toUpperCase();

  const isColor = theme === 'color';
  const cssVars: React.CSSProperties = {
    '--fsv-pri': isColor ? '#0e2a5c' : '#111',
    '--fsv-acc': isColor ? '#c9a24b' : '#111',
    '--fsv-imgf': isColor ? 'none' : 'grayscale(1) contrast(1.05)',
    '--fsv-soft': isColor ? '#faf3e3' : '#f4f4f4',
    '--fsv-pagebg': isColor ? '#fffdf6' : '#ffffff',
  } as React.CSSProperties;
  const imgKaaba = isColor ? kaabaColor : kaabaSketch;
  const imgMadinah = isColor ? madinahColor : madinahSketch;

  return (
    <div className={`fsv-root${preview ? ' fsv-preview' : ''}`} style={cssVars}>
      <style>{`
        .fsv-root { position:absolute; left:-12000px; top:0; width:210mm; font-family:Arial,Helvetica,sans-serif; color:#111; background:var(--fsv-pagebg); }
        .fsv-root.fsv-preview { position:static; width:210mm; margin:0 auto; box-shadow:0 4px 24px rgba(0,0,0,.25); }
        @media print {
          .fsv-root { position:static; width:auto; }
          .fsv-root.fsv-preview { box-shadow:none; margin:0; }
          @page { size:A4; margin:0; }
        }
        .fsv-page { width:210mm; height:297mm; overflow:hidden; position:relative; background:#fff; }
        .fsv-fit { width:210mm; transform-origin:top left; position:relative; padding:7mm 8mm; }
        .fsv-vhead { display:flex; align-items:stretch; justify-content:space-between; gap:4mm; }
        .fsv-sketch { width:44mm; }
        .fsv-sketch .fsv-arch { width:44mm; height:30mm; overflow:hidden; border:1.2mm solid var(--fsv-acc); border-radius:22mm 22mm 3mm 3mm; background:#eee; }
        .fsv-sketch img { width:100%; height:100%; object-fit:cover; display:block; filter:var(--fsv-imgf); }
        .fsv-brand { flex:1; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; }
        .fsv-mono { width:26mm; height:26mm; border:1mm solid var(--fsv-acc); border-radius:50%; display:flex; align-items:center; justify-content:center; position:relative; margin-bottom:1.5mm; }
        .fsv-mono::after { content:""; position:absolute; inset:1.6mm; border:.5mm solid var(--fsv-acc); border-radius:50%; }
        .fsv-mono b { font-family:Georgia,serif; font-size:8mm; letter-spacing:.5mm; color:var(--fsv-pri); }
        .fsv-logo { width:30mm; max-height:26mm; object-fit:contain; margin-bottom:1.5mm; }
        .fsv-brand h1 { font-family:Georgia,serif; font-size:6.2mm; letter-spacing:2.2mm; font-weight:normal; color:var(--fsv-pri); }
        .fsv-brand .fsv-tag { font-size:2.5mm; letter-spacing:1.1mm; color:#333; margin-top:1.2mm; }
        .fsv-ribbon { margin:2.6mm 0 0; background:var(--fsv-pri); color:#fff; text-align:center; position:relative; padding:2.2mm 0; }
        .fsv-ribbon::before,.fsv-ribbon::after { content:""; position:absolute; top:50%; width:3.4mm; height:3.4mm; background:var(--fsv-pagebg); border:1mm solid var(--fsv-pri); transform:translateY(-50%) rotate(45deg); }
        .fsv-ribbon::before { left:14mm; } .fsv-ribbon::after { right:14mm; }
        .fsv-ribbon h2 { font-family:Georgia,serif; font-size:5.4mm; letter-spacing:2.6mm; font-weight:normal; }
        .fsv-metabar { display:flex; border:.45mm solid var(--fsv-pri); border-top:none; font-size:3mm; }
        .fsv-metabar>div { flex:1; padding:1.6mm 3mm; display:flex; align-items:center; gap:2.5mm; }
        .fsv-metabar>div+div { border-left:.45mm solid var(--fsv-pri); }
        .fsv-metabar .fsv-lbl { font-size:2.4mm; color:#555; letter-spacing:.6mm; }
        .fsv-metabar .fsv-val { font-weight:bold; font-size:3.4mm; }
        .fsv-counts { display:flex; border:.45mm solid var(--fsv-pri); border-top:none; }
        .fsv-counts .fsv-grp { display:flex; flex:1; }
        .fsv-counts .fsv-grp+.fsv-grp { border-left:.45mm solid var(--fsv-pri); }
        .fsv-c { flex:1; text-align:center; padding:1.5mm 1mm; }
        .fsv-c+.fsv-c { border-left:.25mm solid #999; }
        .fsv-c .fsv-k { font-size:2.3mm; color:#555; letter-spacing:.5mm; }
        .fsv-c .fsv-v { font-size:3.6mm; font-weight:bold; margin-top:.6mm; }
        .fsv-secttl { font-size:3.1mm; font-weight:bold; letter-spacing:.8mm; padding:1.8mm 2.5mm; border:.45mm solid var(--fsv-pri); color:var(--fsv-pri); border-bottom:none; background:var(--fsv-soft); margin-top:2.4mm; }
        table.fsv-vt { width:100%; border-collapse:collapse; }
        table.fsv-vt th { background:var(--fsv-pri); color:#fff; font-size:2.5mm; letter-spacing:.4mm; padding:1.4mm 1.5mm; font-weight:bold; border:.35mm solid var(--fsv-pri); white-space:nowrap; }
        table.fsv-vt td { font-size:2.9mm; padding:1.25mm 1.5mm; border:.35mm solid #555; }
        table.fsv-vt tr:nth-child(even) td { background:#f6f6f6; }
        .fsv-cols2 { display:flex; gap:3mm; }
        .fsv-cols2>.fsv-half { flex:1; min-width:0; }
        .fsv-mutwrap { display:flex; gap:3mm; }
        .fsv-mutwrap table { flex:1; }
        table.fsv-vt.fsv-mut td, table.fsv-vt.fsv-mut th { padding:.95mm 1.2mm; }
        table.fsv-vt.fsv-mut td { font-size:2.85mm; }
        table.fsv-vt.fsv-mut .fsv-nm { font-weight:bold; }
        .fsv-bottom4 { display:flex; gap:3mm; margin-top:2.4mm; }
        .fsv-bbox { flex:1; border:.45mm solid var(--fsv-pri); min-width:0; }
        .fsv-bbox h4 { font-size:2.9mm; letter-spacing:.7mm; background:var(--fsv-soft); padding:1.6mm 2.2mm; border-bottom:.45mm solid var(--fsv-pri); color:var(--fsv-pri); }
        .fsv-bbox .fsv-in { padding:2mm 2.4mm; font-size:2.8mm; line-height:1.55; }
        .fsv-incl { list-style:none; columns:2; column-gap:3mm; }
        .fsv-incl li { font-size:2.7mm; padding:.7mm 0; break-inside:avoid; }
        .fsv-incl li::before { content:"✓ "; font-weight:bold; }
        .fsv-notes { list-style:none; }
        .fsv-notes li { font-size:2.65mm; padding:.8mm 0; }
        .fsv-notes li::before { content:"• "; font-weight:bold; }
        .fsv-qrbox { border:.6mm dashed #555; margin:2mm; min-height:24mm; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1.5mm; color:#555; padding:2mm; }
        .fsv-qrbox span { font-size:2.5mm; font-weight:bold; letter-spacing:.4mm; }
        .fsv-contact { display:flex; border:.45mm solid var(--fsv-pri); margin-top:2.4mm; }
        .fsv-contact>div { flex:1; padding:1.8mm 3mm; display:flex; align-items:center; gap:2.5mm; font-size:3mm; }
        .fsv-contact>div+div { border-left:.45mm solid var(--fsv-pri); }
        .fsv-contact .fsv-k { font-size:2.4mm; color:#555; letter-spacing:.5mm; }
        .fsv-contact .fsv-v { font-weight:bold; font-size:3.3mm; }
        .fsv-stamp { width:22mm; height:22mm; border:.7mm solid var(--fsv-acc); border-radius:50%; display:flex; align-items:center; justify-content:center; text-align:center; font-size:2.2mm; letter-spacing:.4mm; color:#333; transform:rotate(-8deg); flex:0 0 22mm; }
        .fsv-stampimg { width:24mm; height:24mm; object-fit:contain; transform:rotate(-8deg); flex:0 0 24mm; }
        .fsv-foot { margin-top:2.4mm; background:var(--fsv-pri); color:#fff; display:flex; font-size:2.9mm; }
        .fsv-foot>div { flex:1; padding:2mm 3mm; text-align:center; }
        .fsv-foot>div+div { border-left:.3mm solid #666; }
      `}</style>

      <div className="fsv-page">
        <div ref={innerRef} className="fsv-fit" style={{ transform: `scale(${scale})` }}>

          <div className="fsv-vhead">
            <div className="fsv-sketch"><div className="fsv-arch"><img src={imgKaaba} alt="Kaaba Shareef" /></div></div>
            <div className="fsv-brand">
              {company.logoUrl ? (
                <img className="fsv-logo" src={company.logoUrl} alt="Company logo" />
              ) : (
                <div className="fsv-mono"><b>{brandShort}</b></div>
              )}
              <h1>{(company.companyName || 'TRAVEL AND TOURS').toUpperCase()}</h1>
              <div className="fsv-tag">{(company.legalName || 'UMRAH SERVICES | TRAVEL SOLUTIONS').toUpperCase()}</div>
            </div>
            <div className="fsv-sketch"><div className="fsv-arch"><img src={imgMadinah} alt="Masjid-e-Nabawi" /></div></div>
          </div>

          <div className="fsv-ribbon"><h2>UMRAH TRAVEL VOUCHER</h2></div>

          <div className="fsv-metabar">
            <div><span className="fsv-lbl">VOUCHER NO.</span><span className="fsv-val">{voucher.voucherNo}</span></div>
            <div style={{ justifyContent: 'flex-end' }}><span className="fsv-lbl">DATE CREATED</span><span className="fsv-val">{createdStr}</span></div>
          </div>

          <div className="fsv-counts">
            <div className="fsv-grp">
              <div className="fsv-c"><div className="fsv-k">ADULT</div><div className="fsv-v">{adults}</div></div>
              <div className="fsv-c"><div className="fsv-k">CHILD</div><div className="fsv-v">{children}</div></div>
              <div className="fsv-c"><div className="fsv-k">INFANT</div><div className="fsv-v">{infants}</div></div>
              <div className="fsv-c"><div className="fsv-k">GROUP</div><div className="fsv-v" style={{ fontSize: '2.8mm' }}>{groupCode || '—'}</div></div>
            </div>
            <div className="fsv-grp">
              <div className="fsv-c"><div className="fsv-k">ARRIVAL DATE</div><div className="fsv-v" style={{ fontSize: '2.8mm' }}>{fmtDate(arrivalSector?.date)}</div></div>
              <div className="fsv-c"><div className="fsv-k">DEPARTURE DATE</div><div className="fsv-v" style={{ fontSize: '2.8mm' }}>{fmtDate(departureSector?.date)}</div></div>
              <div className="fsv-c"><div className="fsv-k">NIGHTS</div><div className="fsv-v">{totalNights}</div></div>
            </div>
          </div>

          <div className="fsv-cols2">
            <div className="fsv-half">
              <div className="fsv-secttl">KSA ARRIVAL INFORMATION</div>
              <table className="fsv-vt">
                <thead><tr><th>SECTOR</th><th>FLIGHT</th><th>DATE</th><th>TIME</th></tr></thead>
                <tbody>
                  <tr>
                    <td>{arrivalSector?.fromAirport?.iata || ''} - {arrivalSector?.toAirport?.iata || ''}</td>
                    <td>{fd?.allowFlightInfo ? `${fd.departureFlight.airline?.iataCode || ''} ${fd.departureFlight.flightNo || ''}` : `${arrivalSector?.airline?.iataCode || ''} ${arrivalSector?.flightNo || ''}`}</td>
                    <td>{fmtDate(fd?.allowFlightInfo ? fd.departureFlight.date : arrivalSector?.date)}</td>
                    <td>{arrivalSector?.time || ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="fsv-half">
              <div className="fsv-secttl">DEPARTURE INFORMATION</div>
              <table className="fsv-vt">
                <thead><tr><th>SECTOR</th><th>FLIGHT</th><th>DATE</th><th>TIME</th></tr></thead>
                <tbody>
                  <tr>
                    <td>{departureSector?.fromAirport?.iata || ''} - {departureSector?.toAirport?.iata || ''}</td>
                    <td>{fd?.allowFlightInfo ? `${fd.returnFlight.airline?.iataCode || ''} ${fd.returnFlight.flightNo || ''}` : `${departureSector?.airline?.iataCode || ''} ${departureSector?.flightNo || ''}`}</td>
                    <td>{fmtDate(fd?.allowFlightInfo ? fd.returnFlight.date : departureSector?.date)}</td>
                    <td>{departureSector?.time || ''}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="fsv-secttl">ACCOMMODATION</div>
          <table className="fsv-vt">
            <thead><tr><th>CITY</th><th>HOTEL</th><th>CHECK IN</th><th>CHECK OUT</th><th>NIGHTS</th><th>ROOM TYPE</th></tr></thead>
            <tbody>
              {stays.map((h, i) => (
                <tr key={i}>
                  <td>{h.city}{h.isSelfHotel ? ' (SELF)' : ''}</td>
                  <td>{h.hotelName}</td>
                  <td>{fmtDate(h.checkInDate)}</td>
                  <td>{fmtDate(h.checkOutDate)}</td>
                  <td>{h.nights}</td>
                  <td>{h.bedType}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="fsv-secttl">TRANSPORTATION</div>
          <table className="fsv-vt">
            <thead><tr><th>TRANSPORT TRIP</th><th>TRANSPORT BY</th></tr></thead>
            <tbody>
              <tr>
                <td>{transportLine || '—'}</td>
                <td>{transportByLine}</td>
              </tr>
            </tbody>
          </table>

          <div className="fsv-secttl">MUTAMER'S DETAIL</div>
          <div className="fsv-mutwrap">
            {cols.map((col, ci) => (
              <table key={ci} className="fsv-vt fsv-mut">
                <thead><tr><th>NO.</th><th>NAME</th><th>PP NO</th></tr></thead>
                <tbody>
                  {col.map((m, i) => (
                    <tr key={i}>
                      <td>{ci * half + i + 1}</td>
                      <td className="fsv-nm">{m.name}</td>
                      <td>{m.passportNumber}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>

          <div className="fsv-bottom4">
            <div className="fsv-bbox"><h4>PACKAGE INCLUDES</h4><div className="fsv-in"><ul className="fsv-incl">{includes.map(x => <li key={x}>{x}</li>)}</ul></div></div>
            <div className="fsv-bbox"><h4>IMPORTANT NOTES</h4><div className="fsv-in"><ul className="fsv-notes">{notes.map(x => <li key={x}>{x}</li>)}</ul></div></div>
            <div className="fsv-bbox"><h4>SCAN FOR DIGITAL VOUCHER</h4><div className="fsv-qrbox"><QRCode value={shareUrl} size={84} /><span>{voucher.voucherNo}</span></div></div>
          </div>

          <div className="fsv-contact">
            <div><span className="fsv-k">MAKKAH STAFF<br /><span className="fsv-v">{company.mobile || company.phone || '—'}</span></span></div>
            <div><span className="fsv-k">MADINA STAFF<br /><span className="fsv-v">{company.phone || '—'}</span></span></div>
            <div style={{ justifyContent: 'center' }}>
              {company.stampUrl ? (
                <img src={company.stampUrl} alt="Company stamp" className="fsv-stampimg" />
              ) : (
                <div className="fsv-stamp">AUTHORIZED<br />SIGNATURE</div>
              )}
            </div>
            <div style={{ justifyContent: 'center' }}><span className="fsv-k">AUTHORIZED SIGNATURE</span></div>
          </div>

          <div className="fsv-foot">
            <div>{company.address || ''}{company.city ? `, ${company.city}` : ''}</div>
            <div>{company.phone || ''}</div>
            <div>{company.email || ''}</div>
            <div>{company.website || ''}</div>
          </div>

        </div>
      </div>
    </div>
  );
};
