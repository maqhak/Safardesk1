import React from 'react';
import { ManualInvoiceDoc } from '../../types/invoice';
import { CompanyProfile } from '../../types/company';

/**
 * Branded A4 manual-invoice print document.
 * Navy (#0e2c4c) + gold (#c9a227) theme, matching the ledger statement.
 * Rendered print-only (or preview); screen shows the list/detail UI instead.
 */
export const InvoicePrintDocument: React.FC<{
  invoice: ManualInvoiceDoc;
  company: CompanyProfile;
  preview?: boolean;
}> = ({ invoice, company, preview = false }) => {
  const fmt = (n: number) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (iso?: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const cur = invoice.currency;

  return (
    <div className={`inv-root${preview ? ' inv-preview' : ''}`}>
      <style>{`
        .inv-root { position:absolute; left:-12000px; top:0; width:210mm; font-family:Arial,Helvetica,sans-serif; color:#111; background:#fff; }
        .inv-root.inv-preview { position:static; width:210mm; margin:0 auto; box-shadow:0 4px 24px rgba(0,0,0,.25); }
        @media print {
          .inv-root { position:static; width:auto; }
          .inv-root.inv-preview { box-shadow:none; margin:0; }
          @page { size:A4; margin:12mm; }
        }
        .inv-head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1.2mm solid #0e2c4c; padding-bottom:4mm; }
        .inv-brand { font-size:8mm; font-weight:900; color:#0e2c4c; letter-spacing:.3mm; }
        .inv-sub { font-size:3mm; color:#555; margin-top:1mm; }
        .inv-badge { background:#0e2c4c; color:#fff; padding:3mm 6mm; text-align:center; }
        .inv-badge .t { font-size:5.5mm; font-weight:900; letter-spacing:2mm; }
        .inv-badge .n { font-size:4mm; font-weight:700; color:#c9a227; margin-top:1mm; }
        .inv-meta { display:flex; justify-content:space-between; margin-top:5mm; font-size:3.4mm; }
        .inv-meta .k { color:#666; text-transform:uppercase; letter-spacing:.4mm; font-size:2.8mm; }
        .inv-meta .v { font-weight:700; margin-top:.8mm; }
        .inv-table { width:100%; border-collapse:collapse; table-layout:fixed; margin-top:6mm; font-size:3.4mm; border:.45mm solid #0e2c4c; }
        .inv-table th { background:#0e2c4c; color:#fff; text-align:left; padding:2.5mm 3mm; font-size:3mm; letter-spacing:.3mm; border:.35mm solid #0e2c4c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .inv-table th.r, .inv-table td.r { text-align:right; }
        .inv-table td { padding:2.5mm 3mm; border:.35mm solid #555; overflow-wrap:break-word; vertical-align:middle; }
        .inv-table th:nth-child(1), .inv-table td:nth-child(1) { width:10mm; }
        .inv-table th:nth-child(3), .inv-table td:nth-child(3) { width:20mm; }
        .inv-table th:nth-child(4), .inv-table td:nth-child(4) { width:30mm; }
        .inv-table th:nth-child(5), .inv-table td:nth-child(5) { width:35mm; }
        .inv-table tr:nth-child(even) td { background:#faf8f0; }
        .inv-totals { margin-left:auto; width:80mm; margin-top:5mm; font-size:3.4mm; }
        .inv-totals .row { display:flex; justify-content:space-between; padding:1.8mm 0; border-bottom:.3mm solid #eee; }
        .inv-totals .row.grand { font-weight:900; font-size:4.2mm; color:#0e2c4c; border-top:.7mm solid #0e2c4c; border-bottom:none; }
        .inv-notes { margin-top:6mm; font-size:3.2mm; color:#444; }
        .inv-sign { display:flex; justify-content:space-between; margin-top:16mm; font-size:3.2mm; }
        .inv-sign .line { border-top:.4mm solid #333; padding-top:1.5mm; width:55mm; text-align:center; }
      `}</style>

      <div className="inv-head">
        <div>
          <div className="inv-brand">{company.companyName || 'Company'}</div>
          <div className="inv-sub">{[company.address, company.city, company.phone, company.email].filter(Boolean).join(' • ')}</div>
        </div>
        <div className="inv-badge">
          <div className="t">INVOICE</div>
          <div className="n">{invoice.invoiceNo}</div>
        </div>
      </div>

      <div className="inv-meta">
        <div>
          <div className="k">Bill To</div>
          <div className="v" style={{ fontSize: '4.2mm' }}>{invoice.partyName}</div>
          <div style={{ color: '#666', marginTop: '.8mm' }}>{invoice.partyType ? invoice.partyType.charAt(0).toUpperCase() + invoice.partyType.slice(1) : ''}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="k">Invoice Date</div>
          <div className="v">{fmtDate(invoice.date)}</div>
          <div className="k" style={{ marginTop: '2.5mm' }}>Due Date</div>
          <div className="v">{invoice.dueDate ? fmtDate(invoice.dueDate) : '—'}</div>
          <div className="k" style={{ marginTop: '2.5mm' }}>Currency</div>
          <div className="v">{cur}{cur === 'SAR' ? ` (Rate: ${invoice.rate} PKR)` : ''}</div>
        </div>
      </div>

      <table className="inv-table">
        <thead><tr><th style={{ width: '10mm' }}>#</th><th>Description</th><th className="r" style={{ width: '20mm' }}>Qty</th><th className="r" style={{ width: '30mm' }}>Rate ({cur})</th><th className="r" style={{ width: '35mm' }}>Amount ({cur})</th></tr></thead>
        <tbody>
          {invoice.lines.map((l, i) => (
            <tr key={l.id}>
              <td>{i + 1}</td>
              <td>{l.description}</td>
              <td className="r">{l.qty}</td>
              <td className="r">{fmt(l.rate)}</td>
              <td className="r">{fmt(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="inv-totals">
        <div className="row"><span>Subtotal</span><span>{cur} {fmt(invoice.subtotal)}</span></div>
        {invoice.discount > 0 && <div className="row"><span>Discount</span><span>− {cur} {fmt(invoice.discount)}</span></div>}
        <div className="row grand"><span>Total</span><span>{cur} {fmt(invoice.total)}</span></div>
        {cur === 'SAR' && <div className="row"><span>PKR Equivalent</span><span>PKR {fmt(invoice.totalPKR)}</span></div>}
        {cur === 'PKR' && <div className="row"><span>SAR Equivalent</span><span>SAR {fmt(invoice.totalSAR)}</span></div>}
      </div>

      {invoice.notes && <div className="inv-notes"><strong>Notes:</strong> {invoice.notes}</div>}

      <div className="inv-sign">
        <div><div className="line">Prepared By</div></div>
        <div><div className="line">Authorized Signature</div></div>
      </div>
    </div>
  );
};
