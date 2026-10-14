import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { VoucherDoc, DEFAULT_PACKAGE_INCLUDES } from '../../types/voucher';
import { CompanyProfile } from '../../types/company';
import { fetchVendors } from '../../services/masterService';
import { fetchAgents } from '../../services/agentService';
import { fetchVisas } from '../../services/visaService';
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

  // Sub-Vendor display name: resolved live from the voucher's visas
  // (their shirkaIds -> vendor master shirkas array), plus the voucher's
  // own shirkaId as fallback. Multi-shirka visas -> comma-separated list.
  // Stored shirkaName (saved at creation) is the fallback. If nothing
  // resolves, the row is omitted entirely — never fabricated, never crash.
  const [subVendorDisplay, setSubVendorDisplay] = useState<string>(
    (voucher as any).shirkaName || ''
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vendors, visas] = await Promise.all([
          fetchVendors().catch(() => [] as any[]),
          fetchVisas().catch(() => [] as any[]),
        ]);
        if (cancelled) return;
        const nameByShirkaId = new Map<string, string>();
        (vendors || []).forEach((v: any) => {
          (v?.shirkas || []).forEach((s: any) => {
            if (s?.id && s?.name && !nameByShirkaId.has(s.id)) {
              nameByShirkaId.set(s.id, s.name);
            }
          });
        });
        const ids: string[] = [];
        const pushId = (id: any) => {
          if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
        };
        (visas || [])
          .filter((v: any) => (voucher.visaIds || []).includes(v.id))
          .forEach((v: any) => pushId(v.shirkaId));
        pushId((voucher as any).shirkaId);
        const names = ids
          .map((id) => nameByShirkaId.get(id))
          .filter((n): n is string => !!n);
        const uniqueNames = [...new Set(names)];
        if (cancelled) return;
        if (uniqueNames.length > 0) setSubVendorDisplay(uniqueNames.join(', '));
        else if ((voucher as any).shirkaName) setSubVendorDisplay((voucher as any).shirkaName);
        else setSubVendorDisplay('');
      } catch {
        if (!cancelled) setSubVendorDisplay((voucher as any).shirkaName || '');
      }
    })();
    return () => { cancelled = true; };
  }, [voucher]);

  // Agent name under the Madinah arch: prefer the denormalized agentName on
  // the voucher, else resolve from the agents master (best-effort; public
  // shared view may not have auth — then the denormalized value wins).
  const [agentDisplay, setAgentDisplay] = useState<string>(
    (voucher as any).agentName || ''
  );
  useEffect(() => {
    let cancelled = false;
    if ((voucher as any).agentName) { setAgentDisplay((voucher as any).agentName); return; }
    if (!voucher.agentId) { setAgentDisplay(''); return; }
    (async () => {
      try {
        const agents = await fetchAgents().catch(() => [] as any[]);
        if (cancelled) return;
        const found = (agents || []).find((a: any) => a.id === voucher.agentId);
        setAgentDisplay(found?.companyName || found?.name || '');
      } catch {
        if (!cancelled) setAgentDisplay('');
      }
    })();
    return () => { cancelled = true; };
  }, [voucher]);

  // Fit to ONE A4 page: measure the NATURAL content height (zoom briefly
  // reset to 1 — a zoomed scrollHeight lies) and shrink to fit. Re-measure
  // after images load + a delayed re-check so late content can't spill
  // the voucher onto a second page.
  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      const prevZoom = (el as HTMLElement).style.zoom;
      const prevMinH = (el as HTMLElement).style.minHeight;
      (el as HTMLElement).style.zoom = '1';
      // min-height:297mm inflates scrollHeight even when content is shorter —
      // drop it during measurement to get the TRUE content height.
      (el as HTMLElement).style.minHeight = '0';
      const h = el.scrollHeight;
      (el as HTMLElement).style.zoom = prevZoom;
      (el as HTMLElement).style.minHeight = prevMinH;
      const pagePx = 297 * 3.779527559; // A4 height px @96dpi
      if (h > pagePx) setScale(Math.max(0.45, pagePx / h));
      else setScale(1);
    };
    const t1 = setTimeout(measure, 120);
    const t2 = setTimeout(measure, 600);
    const imgs = Array.from(el.querySelectorAll('img'));
    imgs.forEach((img) => img.addEventListener('load', measure));
    return () => {
      cancelled = true;
      clearTimeout(t1);
      clearTimeout(t2);
      imgs.forEach((img) => img.removeEventListener('load', measure));
    };
  }, [voucher, subVendorDisplay]);

  const pax = voucher.passengers || [];
  const adults = pax.filter(p => p.ageType === 'Adult').length;
  const children = pax.filter(p => p.ageType === 'Child').length;
  const infants = pax.filter(p => p.ageType === 'Infant').length;
  const stays = voucher.hotelStays || [];
  const sectors = voucher.sectors || [];
  const totalNights = stays.reduce((s, h) => s + (h.nights || 0), 0);

  const fd = voucher.flightDetails;
  const arrivalSector = sectors.find(s => /^arrival/i.test(s.type));
  const departureSector = sectors.find(s => /^departure/i.test(s.type));

  // Flight times: both DEP + ARR. New vouchers store etd = departure,
  // eta = arrival. Old vouchers stored only etd (the side's time).
  const arrTimes = fd?.allowFlightInfo && fd.arrivalFlight
    ? { dep: fd.arrivalFlight.eta ? (fd.arrivalFlight.etd || '') : '', arr: fd.arrivalFlight.eta || fd.arrivalFlight.etd || '' }
    : { dep: '', arr: arrivalSector?.time || '' };
  const depTimes = fd?.allowFlightInfo && fd.departureFlight
    ? { dep: fd.departureFlight.etd || '', arr: fd.departureFlight.eta || fd.returnFlight?.etd || '' }
    : { dep: '', arr: departureSector?.time || '' };

  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const createdStr = fmtDate(voucher.createdAt);

  // Per-sector transport rows: each Umrah sector on its own row showing
  // exactly which transport the company provides (vs agent's Self Gari).
  interface TransportRow { sector: string; date: string; vehicle: string; provider: string; }
  const transportRows: TransportRow[] = sectors.map((s) => {
    const note = (s as any).vehicleNote ? ` — ${(s as any).vehicleNote}` : '';
    let sectorLabel = s.type;
    const ap = `${s.fromAirport?.iata || ''}${s.toAirport?.iata ? ` → ${s.toAirport.iata}` : ''}`;
    if (ap.trim() && ap.trim() !== '→') sectorLabel += ` (${ap.trim()})`;
    const vehicle = s.isSelfGari ? 'Self Gari' : (s.vehicleType || '—');
    return {
      sector: sectorLabel,
      date: s.date ? fmtDate(s.date) : '—',
      vehicle: vehicle + note,
      provider: s.isSelfGari ? 'Agent (Self)' : 'Company',
    };
  });

  // (All sectors print as individual rows so the voucher shows exactly
  // which transport trips the company provides.)

  const half = Math.ceil(pax.length / 2);
  const cols = [pax.slice(0, half), pax.slice(half)];

  const includes = voucher.packageIncludes && voucher.packageIncludes.length > 0 ? voucher.packageIncludes : DEFAULT_PACKAGE_INCLUDES;
  const notes = ['Please keep this voucher with you during travel.', 'Present this voucher at the time of check-in.', 'All timings are local and subject to change.', 'The company is not responsible for any loss of personal belongings.', 'For any assistance, contact our representatives.'];

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/vouchers/shared/${voucher.id}`
    : voucher.voucherNo;
  const brandShort = (company.companyName || 'S').split(/\s+/).filter(w => /[a-zA-Z]/.test(w[0] || '')).map(w => w[0]).join('').slice(0, 3).toUpperCase();

  // Status watermark (locked spec): Confirmed -> green APPROVED,
  // Draft/Pending -> red NOT APPROVED, Cancelled -> CANCELLED
  const wm = voucher.status === 'Confirmed'
    ? { cls: 'ok', text: 'APPROVED' }
    : voucher.status === 'Cancelled'
    ? { cls: 'no', text: 'CANCELLED' }
    : { cls: 'no', text: 'NOT APPROVED' };

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
          .fsv-root { position:static; width:auto; height:297mm; overflow:hidden; }
          .fsv-root.fsv-preview { box-shadow:none; margin:0; }
          .fsv-page { height:297mm; overflow:hidden; }
          @page { size:A4; margin:0; }
        }
        .fsv-page { width:210mm; height:297mm; overflow:hidden; position:relative; background:#fff; display:flex; align-items:center; justify-content:center; }
        .fsv-watermark { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:50; }
        .fsv-watermark span { display:flex; align-items:center; justify-content:center; text-align:center; width:54mm; height:54mm; border-radius:50%; border:1.6mm solid currentColor; box-shadow:inset 0 0 0 1mm #fff, inset 0 0 0 1.9mm currentColor; font-size:6.5mm; font-weight:bold; letter-spacing:1.2mm; line-height:1.35; padding:6mm; opacity:0.17; transform:rotate(-16deg); }
        .fsv-watermark.ok span { color:#15803d; }
        .fsv-watermark.no span { color:#b91c1c; }
        .fsv-fit { width:210mm; transform-origin:top left; position:relative; padding:7mm 8mm; display:flex; flex-direction:column; box-sizing:border-box; min-height:297mm; }
        .fsv-fit > * { flex-shrink:0; min-width:0; }
        .fsv-vhead { display:flex; align-items:stretch; justify-content:space-between; gap:4mm; }
        .fsv-sketch { width:44mm; }
        .fsv-sketch .fsv-arch { width:44mm; height:30mm; overflow:hidden; border:1.2mm solid var(--fsv-acc); border-radius:22mm 22mm 3mm 3mm; background:#eee; }
        .fsv-sketch img { width:100%; height:100%; object-fit:cover; display:block; filter:var(--fsv-imgf); }
        .fsv-under { text-align:center; font-size:3.2mm; font-weight:bold; margin-top:1.5mm; }
        .fsv-brand { flex:1; min-width:0; text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center; }
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
        .fsv-metabar { display:flex; border:.45mm solid var(--fsv-pri); border-top:none; font-size:2.8mm; }
        .fsv-metabar>div { flex:1; min-width:0; padding:1.2mm 3mm; display:flex; align-items:center; gap:2.5mm; }
        .fsv-metabar>div+div { border-left:.45mm solid var(--fsv-pri); }
        .fsv-metabar .fsv-lbl { font-size:2.2mm; color:#555; letter-spacing:.6mm; }
        .fsv-metabar .fsv-val { font-weight:bold; font-size:3.1mm; }
        .fsv-hcnbar { display:flex; border:.45mm solid var(--fsv-pri); border-top:none; font-size:2.8mm; }
        .fsv-hcnbar>div { flex:1; min-width:0; padding:1.2mm 3mm; display:flex; align-items:center; gap:2.5mm; }
        .fsv-hcnbar>div+div { border-left:.45mm solid var(--fsv-pri); }
        .fsv-hcnbar .fsv-lbl { font-size:2.2mm; color:#555; letter-spacing:.6mm; }
        .fsv-hcnbar .fsv-val { font-weight:bold; font-size:3.1mm; }
        .fsv-counts { display:flex; border:.45mm solid var(--fsv-pri); border-top:none; }
        .fsv-counts .fsv-grp { display:flex; flex:1; min-width:0; }
        .fsv-counts .fsv-grp+.fsv-grp { border-left:.45mm solid var(--fsv-pri); }
        .fsv-c { flex:1; min-width:0; text-align:center; padding:1.1mm 1mm; }
        .fsv-c+.fsv-c { border-left:.25mm solid #999; }
        .fsv-c .fsv-k { font-size:2.2mm; color:#555; letter-spacing:.5mm; }
        .fsv-c .fsv-v { font-size:3.2mm; font-weight:bold; margin-top:.5mm; }
        .fsv-secttl { font-size:2.8mm; font-weight:bold; letter-spacing:.8mm; padding:1.3mm 2.5mm; border:.45mm solid var(--fsv-pri); color:var(--fsv-pri); border-bottom:none; background:var(--fsv-soft); margin-top:2mm; }
        table.fsv-vt { width:100%; border-collapse:collapse; table-layout:fixed; border:.45mm solid var(--fsv-pri); }
        table.fsv-vt th { background:var(--fsv-pri); color:#fff; font-size:2.3mm; letter-spacing:.4mm; padding:1.1mm 1.5mm; font-weight:bold; border:.35mm solid var(--fsv-pri); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        table.fsv-vt td { font-size:2.6mm; padding:.85mm 1.5mm; border:.35mm solid #555; overflow-wrap:break-word; vertical-align:middle; }
        /* Fixed column widths — every table type aligns perfectly, every time */
        .fsv-flight th:nth-child(1), .fsv-flight td:nth-child(1) { width:21%; }
        .fsv-flight th:nth-child(2), .fsv-flight td:nth-child(2) { width:27%; }
        .fsv-flight th:nth-child(3), .fsv-flight td:nth-child(3) { width:20%; }
        .fsv-flight th:nth-child(4), .fsv-flight td:nth-child(4) { width:16%; }
        .fsv-flight th:nth-child(5), .fsv-flight td:nth-child(5) { width:16%; }
        .fsv-acc th:nth-child(1), .fsv-acc td:nth-child(1) { width:13%; }
        .fsv-acc th:nth-child(2), .fsv-acc td:nth-child(2) { width:27%; }
        .fsv-acc th:nth-child(3), .fsv-acc td:nth-child(3) { width:14%; }
        .fsv-acc th:nth-child(4), .fsv-acc td:nth-child(4) { width:14%; }
        .fsv-acc th:nth-child(5), .fsv-acc td:nth-child(5) { width:8%; }
        .fsv-acc th:nth-child(6), .fsv-acc td:nth-child(6) { width:8%; }
        .fsv-acc th:nth-child(7), .fsv-acc td:nth-child(7) { width:16%; }
        .fsv-trn th:nth-child(1), .fsv-trn td:nth-child(1) { width:60%; }
        .fsv-trn th:nth-child(2), .fsv-trn td:nth-child(2) { width:40%; }
        .fsv-mut th:nth-child(1), .fsv-mut td:nth-child(1) { width:10%; }
        .fsv-mut th:nth-child(2), .fsv-mut td:nth-child(2) { width:38%; }
        .fsv-mut th:nth-child(3), .fsv-mut td:nth-child(3) { width:30%; }
        .fsv-mut th:nth-child(4), .fsv-mut td:nth-child(4) { width:22%; }
        table.fsv-vt tr:nth-child(even) td { background:#f6f6f6; }
        .fsv-cols2 { display:flex; gap:3mm; }
        .fsv-cols2>.fsv-half { flex:1; min-width:0; }
        .fsv-mutwrap { display:flex; gap:3mm; }
        .fsv-mutwrap table { flex:1; min-width:0; }
        table.fsv-vt.fsv-mut td, table.fsv-vt.fsv-mut th { padding:.7mm 1.2mm; }
        table.fsv-vt.fsv-flight td { font-weight:bold; }
        table.fsv-vt.fsv-mut td { font-size:2.55mm; }
        table.fsv-vt.fsv-mut .fsv-nm { font-weight:bold; }
        .fsv-bottom4 { display:flex; gap:3mm; margin-top:2mm; align-items:stretch; }
        .fsv-bbox { flex:1; border:.45mm solid var(--fsv-pri); min-width:0; display:flex; flex-direction:column; overflow:hidden; }
        .fsv-bbox h4 { font-size:2.6mm; letter-spacing:.7mm; background:var(--fsv-soft); padding:1.3mm 2.2mm; border-bottom:.45mm solid var(--fsv-pri); color:var(--fsv-pri); }
        .fsv-bbox .fsv-in { padding:1.6mm 2.2mm; font-size:2.6mm; line-height:1.5; flex:1; }
        .fsv-incl { list-style:none; }
        .fsv-incl li { font-size:2.5mm; padding:.6mm 0 .6mm 4mm; text-indent:-4mm; overflow-wrap:break-word; }
        .fsv-incl li::before { content:"✓ "; font-weight:bold; }
        .fsv-notes { list-style:none; }
        .fsv-notes li { font-size:2.45mm; padding:.7mm 0 .7mm 3.4mm; text-indent:-3.4mm; overflow-wrap:break-word; }
        .fsv-notes li::before { content:"• "; font-weight:bold; }
        .fsv-qrbox { border:.6mm dashed #555; margin:1.5mm; min-height:20mm; display:flex; flex:1; flex-direction:column; align-items:center; justify-content:center; gap:1.2mm; color:#555; padding:1.6mm; overflow:hidden; max-width:100%; }
        .fsv-qrbox span { font-size:2.4mm; font-weight:bold; letter-spacing:.4mm; }
        .fsv-contact { display:flex; border:.45mm solid var(--fsv-pri); margin-top:2mm; }
        .fsv-contact>div { flex:1; min-width:0; padding:1.3mm 3mm; display:flex; align-items:center; gap:2.5mm; font-size:2.7mm; }
        .fsv-contact>div+div { border-left:.45mm solid var(--fsv-pri); }
        .fsv-contact .fsv-k { font-size:2.2mm; color:#555; letter-spacing:.5mm; }
        .fsv-contact .fsv-v { font-weight:bold; font-size:3mm; }
        .fsv-stamp { width:22mm; height:22mm; border:.7mm solid var(--fsv-acc); border-radius:50%; display:flex; align-items:center; justify-content:center; text-align:center; font-size:2.2mm; letter-spacing:.4mm; color:#333; transform:rotate(-8deg); flex:0 0 22mm; }
        .fsv-stampimg { width:24mm; height:24mm; object-fit:contain; transform:rotate(-8deg); flex:0 0 24mm; }
        .fsv-foot { margin-top:auto; background:var(--fsv-pri); color:#fff; display:flex; font-size:2.9mm; }
        .fsv-foot>div { flex:1; padding:2mm 3mm; text-align:center; }
        .fsv-foot>div+div { border-left:.3mm solid #666; }
      `}</style>

      <div className="fsv-page">
        <div className={`fsv-watermark ${wm.cls}`}><span>{wm.text}</span></div>
        <div ref={innerRef} className="fsv-fit" style={{ zoom: scale, transformOrigin: 'top left' }}>

          <div className="fsv-vhead">
            <div className="fsv-sketch"><div className="fsv-arch"><img src={imgKaaba} alt="Kaaba Shareef" /></div><div className="fsv-under">Sub-Vendor: {subVendorDisplay || (voucher as any).shirkaName || "—"}</div></div>
            <div className="fsv-brand">
              {company.logoUrl ? (
                <img className="fsv-logo" src={company.logoUrl} alt="Company logo" />
              ) : (
                <div className="fsv-mono"><b>{brandShort}</b></div>
              )}
              <h1>{(company.companyName || 'TRAVEL AND TOURS').toUpperCase()}</h1>
              <div className="fsv-tag">{(company.legalName || 'UMRAH SERVICES | TRAVEL SOLUTIONS').toUpperCase()}</div>
            </div>
            <div className="fsv-sketch"><div className="fsv-arch"><img src={imgMadinah} alt="Masjid-e-Nabawi" /></div><div className="fsv-under">Agent: {agentDisplay || "—"}</div></div>
          </div>

          <div className="fsv-ribbon"><h2>{(voucher as any).voucherKind === 'accommodation' ? 'ACCOMMODATION VOUCHER' : (voucher as any).voucherKind === 'transport' ? 'TRANSPORT VOUCHER' : 'UMRAH TRAVEL VOUCHER'}</h2></div>

          {((voucher as any).makkahHcn || (voucher as any).madinaHcn || (voucher as any).transportHcn) && (
            <div className="fsv-hcnbar">
              <div><span className="fsv-lbl">MAKKAH HCN</span><span className="fsv-val">{(voucher as any).makkahHcn || "—"}</span></div>
              <div style={{ justifyContent: 'center' }}><span className="fsv-lbl">MADINA HCN</span><span className="fsv-val">{(voucher as any).madinaHcn || "—"}</span></div>
              <div style={{ justifyContent: 'flex-end' }}><span className="fsv-lbl">TRANSPORT HCN</span><span className="fsv-val">{(voucher as any).transportHcn || "—"}</span></div>
            </div>
          )}

          <div className="fsv-metabar">
            <div><span className="fsv-lbl">VOUCHER NO.</span><span className="fsv-val">{voucher.voucherNo}</span></div>
            {(subVendorDisplay || (voucher as any).shirkaName) && (
              <div style={{ justifyContent: 'center' }}><span className="fsv-lbl">SUB-VENDOR</span><span className="fsv-val">{subVendorDisplay || (voucher as any).shirkaName}</span></div>
            )}
            {(voucher as any).reference && (
              <div style={{ justifyContent: 'center' }}><span className="fsv-lbl">REFERENCE NUMBER</span><span className="fsv-val">{(voucher as any).reference}</span></div>
            )}
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
              <div className="fsv-c"><div className="fsv-k">ARRIVAL DATE</div><div className="fsv-v" style={{ fontSize: '2.8mm' }}>{fmtDate(fd?.allowFlightInfo && fd.arrivalFlight?.date ? fd.arrivalFlight.date : arrivalSector?.date)}</div></div>
              <div className="fsv-c"><div className="fsv-k">DEPARTURE DATE</div><div className="fsv-v" style={{ fontSize: '2.8mm' }}>{fmtDate(fd?.allowFlightInfo && fd.departureFlight?.date ? fd.departureFlight.date : departureSector?.date)}</div></div>
              <div className="fsv-c"><div className="fsv-k">NIGHTS</div><div className="fsv-v">{totalNights}</div></div>
            </div>
          </div>

          <div className="fsv-cols2">
            <div className="fsv-half">
              <div className="fsv-secttl">KSA ARRIVAL INFORMATION</div>
              <table className="fsv-vt fsv-flight">
                <thead><tr><th>SECTOR</th><th>FLIGHT</th><th>DATE</th><th>DEP. TIME</th><th>ARR. TIME</th></tr></thead>
                <tbody>
                  <tr>
                    <td>{fd?.allowFlightInfo && fd.arrivalFlight ? (fd.arrivalFlight.sector || `${fd.arrivalFlight.fromAirport?.iata || ''}${fd.arrivalFlight.toAirport?.iata ? ` - ${fd.arrivalFlight.toAirport.iata}` : ''}`) : `${arrivalSector?.fromAirport?.iata || ''}${arrivalSector?.toAirport?.iata ? ` - ${arrivalSector.toAirport.iata}` : ''}`}</td>
                    <td>{fd?.allowFlightInfo && fd.arrivalFlight ? `${fd.arrivalFlight.airline?.iataCode || ''} ${fd.arrivalFlight.flightNo || ''}`.trim() : `${arrivalSector?.airline?.iataCode || ''} ${arrivalSector?.flightNo || ''}`.trim()}{fd?.allowFlightInfo && fd.arrivalFlight?.pnr ? <><br /><span style={{ fontSize: '2.4mm', color: '#444' }}>PNR: {fd.arrivalFlight.pnr}</span></> : null}</td>
                    <td>{fmtDate(fd?.allowFlightInfo && fd.arrivalFlight ? fd.arrivalFlight.date : arrivalSector?.date)}</td>
                    <td>{arrTimes.dep || '—'}</td>
                    <td>{arrTimes.arr || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="fsv-half">
              <div className="fsv-secttl">DEPARTURE INFORMATION</div>
              <table className="fsv-vt fsv-flight">
                <thead><tr><th>SECTOR</th><th>FLIGHT</th><th>DATE</th><th>DEP. TIME</th><th>ARR. TIME</th></tr></thead>
                <tbody>
                  <tr>
                    <td>{fd?.allowFlightInfo && fd.departureFlight ? (fd.departureFlight.sector || `${fd.departureFlight.fromAirport?.iata || ''}${fd.departureFlight.toAirport?.iata ? ` - ${fd.departureFlight.toAirport.iata}` : ''}`) : `${departureSector?.fromAirport?.iata || ''}${departureSector?.toAirport?.iata ? ` - ${departureSector.toAirport.iata}` : ''}`}</td>
                    <td>{fd?.allowFlightInfo && fd.departureFlight ? `${fd.departureFlight.airline?.iataCode || ''} ${fd.departureFlight.flightNo || ''}`.trim() : `${departureSector?.airline?.iataCode || ''} ${departureSector?.flightNo || ''}`.trim()}{fd?.allowFlightInfo && fd.departureFlight?.pnr ? <><br /><span style={{ fontSize: '2.4mm', color: '#444' }}>PNR: {fd.departureFlight.pnr}</span></> : null}</td>
                    <td>{fmtDate(fd?.allowFlightInfo && fd.departureFlight ? fd.departureFlight.date : departureSector?.date)}</td>
                    <td>{depTimes.dep || '—'}</td>
                    <td>{depTimes.arr || '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="fsv-secttl">ACCOMMODATION</div>
          <table className="fsv-vt fsv-acc">
            <thead><tr><th>CITY</th><th>HOTEL</th><th>CHECK IN</th><th>CHECK OUT</th><th>NIGHTS</th><th>ROOMS</th><th>ROOM TYPE</th></tr></thead>
            <tbody>
              {stays.map((h, i) => (
                <tr key={i}>
                  <td>{h.city}{h.isSelfHotel ? ' (SELF)' : ''}</td>
                  <td>{h.hotelName}</td>
                  <td>{fmtDate(h.checkInDate)}</td>
                  <td>{fmtDate(h.checkOutDate)}</td>
                  <td>{h.nights}</td>
                  <td>{(h as any).roomCount || '—'}</td>
                  <td>{h.bedType}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="fsv-secttl">TRANSPORTATION</div>
          <table className="fsv-vt fsv-trn">
            <thead><tr><th>TRANSPORT TRIP</th><th>TRANSPORT BY</th></tr></thead>
            <tbody>
              {transportRows.length > 0 ? transportRows.map((r, i) => (
                <tr key={i}>
                  <td className="fsv-nm">{r.sector}</td>
                  <td>{r.vehicle} — {r.provider}</td>
                </tr>
              )) : (
                <tr><td colSpan={2}>—</td></tr>
              )}
            </tbody>
          </table>

          <div className="fsv-secttl">MUTAMER'S DETAIL</div>
          <div className="fsv-mutwrap">
            {cols.map((col, ci) => (
              <table key={ci} className="fsv-vt fsv-mut">
                <thead><tr><th>NO.</th><th>NAME</th><th>PP NO</th><th>TRNS</th></tr></thead>
                <tbody>
                  {col.map((m, i) => (
                    <tr key={i}>
                      <td>{ci * half + i + 1}</td>
                      <td className="fsv-nm">{m.name}</td>
                      <td>{m.passportNumber}</td>
                      <td style={{ fontWeight: 'bold' }}>{m.trnsPaid ? 'YES' : 'XXXXX'}</td>
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
            <div><span className="fsv-k">MAKKAH STAFF{voucher.makkahStaffName ? ` — ${voucher.makkahStaffName}` : ''}<br /><span className="fsv-v">{voucher.makkahStaffPhone || company.makkahStaffPhone || company.mobile || company.phone || '—'}</span></span></div>
            <div><span className="fsv-k">MADINA STAFF{voucher.madinaStaffName ? ` — ${voucher.madinaStaffName}` : ''}<br /><span className="fsv-v">{voucher.madinaStaffPhone || company.madinaStaffPhone || company.phone || '—'}</span></span></div>
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
