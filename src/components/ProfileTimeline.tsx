import React, { useMemo } from 'react';
import { Badge, BadgeVariant } from './ui/Badge';
import { ExternalLink } from 'lucide-react';

export interface ProfileTimelineRow {
  key: string;
  date: string;
  type: string;
  badgeVariant: BadgeVariant;
  ref: string;
  title: string;
  detail: string;
  amountSAR: number;
  amountPKR: number;
  /** Signed balance impact on the profile's account in SAR. null = no ledger impact. */
  impactSAR: number | null;
  /** Running account balance after this row (ledger entries only). */
  runningSAR?: number;
  navPath: string;
}

interface ProfileTimelineProps {
  /** Ledger account id of the profile (agent or customer). May be null. */
  accountId: string | null;
  visas: any[];
  vouchers: any[];
  tickets: any[];
  jvs: any[];
  invoices: any[];
  payments: any[];
  /** Ledger entries already filtered to this account. */
  entries: any[];
  masterRate: number;
  onNavigate: (path: string) => void;
}

const fmtSAR = (n: number) =>
  `${n < 0 ? '-' : ''}SAR ${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/** Deep link for a ledger entry: resolve to its source record. */
function entryNavPath(e: any, accountId: string | null): string {
  const ref = e.transNo || e.entryNo || '';
  const t = (e.entryType || '').toLowerCase();
  if (t.includes('payment') && ref) return `/accounts/payments?q=${encodeURIComponent(ref)}`;
  if (t.includes('journal') && ref) return `/accounts/journal-vouchers?open=${encodeURIComponent(ref)}`;
  if ((t.includes('voucher') || e.voucherNo) && (e.voucherNo || ref)) {
    const v = e.voucherNo || ref;
    return `/vouchers?open=${encodeURIComponent(v)}`;
  }
  if (t.includes('invoice') && ref) return `/visas/invoices?open=${encodeURIComponent(ref)}`;
  if (accountId) return `/accounts?accountId=${encodeURIComponent(accountId)}`;
  return '/accounts';
}

const ProfileTimeline: React.FC<ProfileTimelineProps> = ({
  accountId,
  visas,
  vouchers,
  tickets,
  jvs,
  invoices,
  payments,
  entries,
  masterRate,
  onNavigate,
}) => {
  const rows = useMemo<ProfileTimelineRow[]>(() => {
    const out: ProfileTimelineRow[] = [];

    // --- 1. Ledger entries: oldest-first for running balance, then flipped ---
    const sortedEntries = [...entries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    // transNo -> net impact on this account
    const impactByTransNo = new Map<string, number>();
    let running = 0;
    const entryRows: ProfileTimelineRow[] = sortedEntries.map((e: any, i: number) => {
      const dr = e.debitSAR || 0;
      const cr = e.creditSAR || 0;
      const net = dr - cr;
      running += net;
      const ref = e.transNo || e.entryNo || `LE-${i}`;
      impactByTransNo.set(ref, (impactByTransNo.get(ref) || 0) + net);
      return {
        key: `entry-${e.id || i}`,
        date: e.date,
        type: 'Ledger Entry',
        badgeVariant: 'navy' as BadgeVariant,
        ref,
        title: e.particulars || e.entryType || 'Ledger entry',
        detail: `${e.entryType || ''}${e.invoiceRef ? ` • Inv ${e.invoiceRef}` : ''}`.trim(),
        amountSAR: dr - cr,
        amountPKR: (e.debitPKR || 0) - (e.creditPKR || 0),
        impactSAR: net,
        runningSAR: running,
        navPath: entryNavPath(e, accountId),
      };
    });
    out.push(...entryRows);

    const impactOf = (ref: string): number | null =>
      impactByTransNo.has(ref) ? impactByTransNo.get(ref)! : null;

    // --- 2. Vouchers ---
    vouchers.forEach((vo: any, i: number) => {
      const totalSAR = vo.totals?.totalSAR || vo.totalSAR || 0;
      out.push({
        key: `voucher-${vo.id || i}`,
        date: vo.createdAt?.split('T')[0] || vo.date || '',
        type: 'Voucher',
        badgeVariant: 'gold',
        ref: vo.voucherNo || vo.id,
        title: `Umrah Voucher ${vo.voucherNo || ''}`.trim(),
        detail: `Status: ${vo.status || '—'}`,
        amountSAR: totalSAR,
        amountPKR: Math.round(totalSAR * masterRate),
        impactSAR: impactOf(vo.voucherNo) ?? totalSAR,
        navPath: `/vouchers?open=${encodeURIComponent(vo.voucherNo || vo.id)}`,
      });
    });

    // --- 3. Tickets ---
    tickets.forEach((t: any, i: number) => {
      const saleSAR = t.salePriceSAR || t.amountSAR || 0;
      out.push({
        key: `ticket-${t.id || i}`,
        date: t.createdAt?.split('T')[0] || t.issueDate || t.date || '',
        type: 'Ticket',
        badgeVariant: 'info',
        ref: t.pnr || t.id,
        title: `Ticket ${t.pnr || ''} — ${t.airline?.name || ''}`.trim(),
        detail: `${t.passengerName || ''} • Status: ${t.status || '—'}`.trim(),
        amountSAR: saleSAR,
        amountPKR: Math.round(saleSAR * masterRate),
        impactSAR: impactOf(t.pnr) ?? saleSAR,
        navPath: `/tickets?open=${encodeURIComponent(t.pnr || t.id)}`,
      });
    });

    // --- 4. Visa distribution invoices ---
    invoices.forEach((inv: any, i: number) => {
      const totalSAR = inv.sellingTotalSAR || 0;
      out.push({
        key: `invoice-${inv.id || i}`,
        date: inv.createdAt?.split('T')[0] || inv.date || '',
        type: 'Visa Invoice',
        badgeVariant: 'warning',
        ref: inv.invoiceNo || inv.id,
        title: `Visa Invoice ${inv.invoiceNo || ''}`.trim(),
        detail: `${inv.visaCount || 0} visas • Margin SAR ${(inv.marginSAR || 0).toLocaleString()}`,
        amountSAR: totalSAR,
        amountPKR: Math.round(totalSAR * (inv.exchangeRate || masterRate)),
        impactSAR: impactOf(inv.invoiceNo) ?? totalSAR,
        navPath: `/visas/invoices?open=${encodeURIComponent(inv.invoiceNo || inv.id)}`,
      });
    });

    // --- 5. Payments ---
    payments.forEach((p: any, i: number) => {
      const amtSAR = p.amountSAR || 0;
      const received = p.entryType === 'cash-received' || p.entryType === 'bank-received';
      out.push({
        key: `payment-${p.id || i}`,
        date: p.date || '',
        type: 'Payment',
        badgeVariant: received ? 'success' : 'danger',
        ref: p.paymentNo || p.id,
        title: `Payment ${p.paymentNo || ''} (${p.entryType || ''})`.trim(),
        detail: p.particulars || '',
        amountSAR: amtSAR,
        amountPKR: p.amountPKR || Math.round(amtSAR * (p.exchangeRate || masterRate)),
        impactSAR: impactOf(p.paymentNo) ?? (received ? -amtSAR : amtSAR),
        navPath: `/accounts/payments?q=${encodeURIComponent(p.paymentNo || p.id)}`,
      });
    });

    // --- 6. Journal vouchers touching this account ---
    jvs.forEach((jv: any, i: number) => {
      const myLines = (jv.lines || []).filter((l: any) => accountId && l.accountId === accountId);
      if (accountId && myLines.length === 0) return;
      const net = myLines.reduce(
        (s: number, l: any) => s + (l.debitSAR || 0) - (l.creditSAR || 0),
        0
      );
      const totalSAR = jv.totalDebitSAR || 0;
      out.push({
        key: `jv-${jv.id || i}`,
        date: jv.date || '',
        type: 'Journal Voucher',
        badgeVariant: 'neutral',
        ref: jv.jvNo || jv.id,
        title: `JV ${jv.jvNo || ''} — ${jv.tag || ''}`.trim(),
        detail: (jv.detailsBox || '').slice(0, 90),
        amountSAR: totalSAR,
        amountPKR: Math.round(totalSAR * (jv.exchangeRate || masterRate)),
        impactSAR: impactOf(jv.jvNo) ?? (myLines.length ? net : null),
        navPath: `/accounts/journal-vouchers?open=${encodeURIComponent(jv.jvNo || jv.id)}`,
      });
    });

    // --- 7. Visas (no ledger impact of their own) ---
    visas.forEach((v: any, i: number) => {
      out.push({
        key: `visa-${v.id || i}`,
        date: v.createdAt?.split('T')[0] || v.issueDate || '',
        type: 'Visa',
        badgeVariant: 'info',
        ref: v.visaNo || v.passportNumber || v.id,
        title: `Visa: ${v.pilgrimName || v.visaNo || ''}`.trim(),
        detail: `Type: ${v.visaType || '—'} • Status: ${v.status || '—'}`,
        amountSAR: 0,
        amountPKR: 0,
        impactSAR: null,
        navPath: `/visas?q=${encodeURIComponent(v.passportNumber || v.pilgrimName || '')}`,
      });
    });

    // Newest first
    out.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    return out;
  }, [accountId, visas, vouchers, tickets, jvs, invoices, payments, entries, masterRate]);

  if (rows.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500">
        No activity records found for this profile yet.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
      {rows.map((r) => (
        <div
          key={r.key}
          onClick={() => onNavigate(r.navPath)}
          className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-slate-50 hover:border-[#0e2c4c]/30 transition cursor-pointer shadow-xs"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0">
              <Badge variant={r.badgeVariant} size="sm">{r.type}</Badge>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-800 truncate">{r.title}</div>
              <div className="text-slate-500 text-[11px] truncate">
                {r.date ? new Date(r.date).toLocaleDateString() : '—'} • Ref: <span className="font-mono">{r.ref}</span>
                {r.detail ? ` • ${r.detail}` : ''}
              </div>
              {typeof r.runningSAR === 'number' && (
                <div className="text-[11px] font-mono text-slate-600">
                  Balance after: <strong>SAR {r.runningSAR.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                </div>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-slate-900">{fmtSAR(r.amountSAR)}</div>
            <div className="text-[11px] font-mono text-slate-500">
              {r.impactSAR === null ? (
                <span>No ledger impact</span>
              ) : (
                <span className={r.impactSAR >= 0 ? 'text-slate-700' : 'text-emerald-700'}>
                  Impact: {r.impactSAR >= 0 ? '+' : ''}{fmtSAR(r.impactSAR)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 justify-end text-[var(--theme-primary)] font-bold mt-0.5">
              <span>Open</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProfileTimeline;
