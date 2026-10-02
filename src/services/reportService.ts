/**
 * Fix #26 — Reports library: real Excel report generators from live data.
 * Every report builds from the same services the screens use (no demo numbers).
 */
import * as XLSX from 'xlsx';
import { fetchVouchers } from './voucherService';
import { fetchVisas } from './visaService';
import { fetchTickets } from './ticketService';
import {
  fetchLedgerAccounts,
  fetchLedgerEntries,
  computeLedgerStatement,
} from './accountingService';
import { fetchAgents } from './agentService';
import { fetchVisaDistributions } from './visaDistributionService';
import { getCurrentRate } from './exchangeRateService';

export interface ReportRange {
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

function inRange(date: string | undefined, range: ReportRange): boolean {
  if (!date) return false;
  const d = date.split('T')[0];
  if (range.from && d < range.from) return false;
  if (range.to && d > range.to) return false;
  return true;
}

function downloadWorkbook(wb: XLSX.WorkBook, fileName: string): void {
  XLSX.writeFile(wb, `${fileName}-${new Date().toISOString().split('T')[0]}.xlsx`);
}

function sheetFromRows(rows: Record<string, any>[], name: string): XLSX.WorkSheet {
  return XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Note: 'No records in the selected period.' }]);
}

/** 1. Agent Ledger Statements (SAR/PKR) — one sheet per agent with running balances. */
export async function generateAgentLedgerStatements(range: ReportRange): Promise<void> {
  const [accounts, entries] = await Promise.all([fetchLedgerAccounts(), fetchLedgerEntries()]);
  const agents = accounts.filter((a) => a.accountType === 'agent');
  const wb = XLSX.utils.book_new();
  for (const acc of agents) {
    const accEntries = entries.filter(
      (e) => e.accountId === (acc as any).id && inRange(e.date, { from: range.from || '1900-01-01', to: range.to || '2100-01-01' })
    );
    const st = computeLedgerStatement(acc, accEntries, 'SAR');
    const rows = st.rows.map((r) => ({
      'Date': r.entry.date,
      'Type': r.entry.entryType,
      'Trans #': r.entry.transNo,
      'Particulars': r.entry.particulars,
      'Rate': r.entry.rate,
      'Debit SAR': r.entry.debitSAR,
      'Credit SAR': r.entry.creditSAR,
      'Balance SAR': Math.round(r.runningBalance * 100) / 100,
      'Debit PKR': r.entry.debitPKR,
      'Credit PKR': r.entry.creditPKR,
    }));
    XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, 'stmt'), (acc.accountCode || acc.title || 'agent').substring(0, 28));
  }
  downloadWorkbook(wb, 'agent-ledger-statements');
}

/** 2. Monthly Visa Issuance & Profitability — from distributions (buying/selling/margin). */
export async function generateVisaProfitability(range: ReportRange): Promise<void> {
  const [distributions, visas] = await Promise.all([fetchVisaDistributions(), fetchVisas()]);
  const rows: Record<string, any>[] = [];
  distributions.forEach((d) => {
    if (!inRange(d.date, range)) return;
    (d.groups || []).forEach((g) => {
      const issued = visas.filter((v) => (g.visaIds || []).includes(v.id)).length;
      rows.push({
        'Distribution No': d.distributionNo,
        'Date': d.date,
        'Group Code': g.groupCode,
        'Group Name': g.groupName,
        'Visas': g.visaCount,
        'Issued (live)': issued,
        'Buying SAR/visa': d.buyingPricePerVisa,
        'Selling SAR/visa': g.sellingPricePerVisa,
        'Total Buying SAR': Math.round(d.buyingPricePerVisa * g.visaCount * 100) / 100,
        'Total Selling SAR': Math.round(g.sellingPricePerVisa * g.visaCount * 100) / 100,
        'Margin SAR': Math.round((g.sellingPricePerVisa - d.buyingPricePerVisa) * g.visaCount * 100) / 100,
      });
    });
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, 'visa-profit'), 'Visa Profitability');
  downloadWorkbook(wb, 'visa-issuance-profitability');
}

/** 3. Hotel Voucher Occupancy & Allotment — property-wise room nights from vouchers. */
export async function generateHotelOccupancy(range: ReportRange): Promise<void> {
  const vouchers = await fetchVouchers();
  const map = new Map<string, { hotel: string; city: string; bedType: string; nights: number; paxNights: number; amountSAR: number; vouchers: number }>();
  vouchers.forEach((v) => {
    if (!inRange((v.createdAt || '').split('T')[0], range)) return;
    const pax = v.passengers?.length || 1;
    (v.hotelStays || []).forEach((h) => {
      const key = `${h.hotelName}|${h.city}|${h.bedType || ''}`;
      const cur = map.get(key) || { hotel: h.hotelName, city: h.city, bedType: h.bedType || '', nights: 0, paxNights: 0, amountSAR: 0, vouchers: 0 };
      cur.nights += h.nights || 0;
      cur.paxNights += (h.nights || 0) * pax;
      cur.amountSAR += h.totalSAR || 0;
      cur.vouchers += 1;
      map.set(key, cur);
    });
  });
  const rows = Array.from(map.values()).map((r) => ({
    'Hotel': r.hotel,
    'City': r.city,
    'Bed Type': r.bedType,
    'Room Nights': r.nights,
    'Pax Nights': r.paxNights,
    'Vouchers': r.vouchers,
    'Amount SAR': Math.round(r.amountSAR * 100) / 100,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, 'occupancy'), 'Hotel Occupancy');
  downloadWorkbook(wb, 'hotel-occupancy-allotment');
}

/** 4. Airline Ticketing Sales & BSP Reconciliation — from the ticketing desk. */
export async function generateTicketingSales(range: ReportRange): Promise<void> {
  const tickets = await fetchTickets();
  const rows = tickets
    .filter((t) => inRange(t.flightDate, range))
    .map((t) => ({
      'PNR': t.pnr,
      'Airline': t.airline?.name || '',
      'Flight No': t.flightNo,
      'Sector': `${t.sectorFrom?.iata || ''} → ${t.sectorTo?.iata || ''}`,
      'Flight Date': t.flightDate,
      'Buyer': t.buyerName,
      'Passengers': t.passengers?.length || 0,
      'Cost SAR': t.purchaseCostSAR,
      'Sale SAR': t.salePriceSAR,
      'Margin SAR': t.marginSAR,
      'Status': t.status,
    }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, 'tickets'), 'Ticketing Sales');
  downloadWorkbook(wb, 'ticketing-sales-bsp');
}

/** 5. Forex Fluctuations & SAR/PKR Gain/Loss — entry rate vs current master rate. */
export async function generateForexReport(range: ReportRange): Promise<void> {
  const entries = await fetchLedgerEntries();
  const masterRate = getCurrentRate('SAR-PKR');
  const rows = entries
    .filter((e) => !e.isVoid && inRange(e.date, range) && (e.debitSAR || e.creditSAR))
    .map((e) => {
      const sar = (e.debitSAR || 0) + (e.creditSAR || 0);
      const postedPKR = (e.debitPKR || 0) + (e.creditPKR || 0);
      const atMasterPKR = Math.round(sar * masterRate * 100) / 100;
      return {
        'Date': e.date,
        'Entry No': e.entryNo,
        'Trans #': e.transNo,
        'Particulars': e.particulars,
        'Amount SAR': sar,
        'Entry Rate': e.rate,
        'Posted PKR': postedPKR,
        'At Master Rate PKR': atMasterPKR,
        'Gain/Loss PKR': Math.round((atMasterPKR - postedPKR) * 100) / 100,
      };
    });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, 'forex'), 'Forex Gain Loss');
  downloadWorkbook(wb, 'forex-gain-loss');
}

/** 6. Sub-Agent Performance League — ranked by revenue, volume, settlement. */
export async function generateAgentPerformance(range: ReportRange): Promise<void> {
  const [agents, vouchers, visas, entries, accounts] = await Promise.all([
    fetchAgents(),
    fetchVouchers(),
    fetchVisas(),
    fetchLedgerEntries(),
    fetchLedgerAccounts(),
  ]);
  const rows = agents.map((a) => {
    const myVouchers = vouchers.filter(
      (v) => v.agentId === a.id && inRange((v.createdAt || '').split('T')[0], range)
    );
    const myVisas = visas.filter((v) => v.agentId === a.id && inRange(v.visaIssueDate || v.createdAt, range));
    const acc = accounts.find((x: any) => x.linkedId === a.id);
    const myEntries = acc ? entries.filter((e) => e.accountId === (acc as any).id && !e.isVoid) : [];
    const revenue = myEntries.reduce((s, e) => s + (e.creditSAR || 0), 0);
    const paid = myEntries.reduce((s, e) => s + (e.debitSAR || 0), 0);
    const balance = (acc as any)?.currentBalanceSAR || 0;
    return {
      'Agent Code': (a as any).agentCode || '',
      'Agency': (a as any).companyName || '',
      'Vouchers': myVouchers.length,
      'Visa Volume': myVisas.length,
      'Revenue SAR': Math.round(revenue * 100) / 100,
      'Settled SAR': Math.round(paid * 100) / 100,
      'Outstanding SAR': Math.round(balance * 100) / 100,
      'Settlement %': revenue > 0 ? Math.round((paid / revenue) * 1000) / 10 : 0,
    };
  }).sort((x, y) => y['Revenue SAR'] - x['Revenue SAR']);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromRows(rows, 'agents'), 'Agent Performance');
  downloadWorkbook(wb, 'sub-agent-performance-league');
}
