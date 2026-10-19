import { 
  LedgerAccountDoc, 
  LedgerEntryDoc, 
  LedgerStatementSummary, 
  ComputedLedgerStatementRow,
  AccountBalanceRow,
  BalancesSummaryData
} from '../types/accounting';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import { aoaToCSV, downloadCSVText } from '../utils/csv';
import { getCurrentRate } from './exchangeRateService';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cached, bust, bustPrefix } from './queryCache';

const ACCOUNTS_COLLECTION = 'ledger_accounts';
const ENTRIES_COLLECTION = 'ledger_entries';

const LOCAL_STORAGE_ACCOUNTS_KEY = 'safardesk_ledger_accounts_v5';
const LOCAL_STORAGE_ENTRIES_KEY = 'safardesk_ledger_entries_v5';

export const INITIAL_LEDGER_ACCOUNTS: LedgerAccountDoc[] = [
  // --- AGENTS ---
  {
    id: 'acc-agt-001',
    accountCode: 'AGT-001',
    accountType: 'agent',
    title: 'Al-Barakah Travel & Tours Karachi',
    linkedId: 'agent-001',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Premium Umrah B2B distributor in Sindh region',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-agt-002',
    accountCode: 'AGT-002',
    accountType: 'agent',
    title: 'Falcon International Travels Lahore',
    linkedId: 'agent-002',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'High volume Umrah and group flight ticketing partner in Punjab',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-agt-003',
    accountCode: 'AGT-003',
    accountType: 'agent',
    title: 'Makkah Direct Rawalpindi',
    linkedId: 'agent-003',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Northern region Umrah group coordinator',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },

  // --- VENDORS (SHIRKAS) ---
  {
    id: 'acc-vnd-001',
    accountCode: 'VND-001',
    accountType: 'vendor',
    title: 'Al-Haramain Group (Sub-Vendor)',
    linkedId: 'vnd-001',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Primary Umrah ground services & visa supplier in Makkah',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-vnd-002',
    accountCode: 'VND-002',
    accountType: 'vendor',
    title: 'Taiba Investments Co.',
    linkedId: 'vnd-002',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Madinah logistics and contracted transportation operator',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-vnd-003',
    accountCode: 'VND-003',
    accountType: 'vendor',
    title: 'Dallah Ground Services',
    linkedId: 'vnd-003',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Airport handling and VIP transport',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },

  // --- HOTELS ---
  {
    id: 'acc-htl-001',
    accountCode: 'HTL-001',
    accountType: 'hotel',
    title: 'Makkah Clock Royal Tower (Fairmont)',
    linkedId: 'htl-001',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: '5-Star Haram view luxury allotment',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-htl-002',
    accountCode: 'HTL-002',
    accountType: 'hotel',
    title: 'Swissôtel Al Maqam Makkah',
    linkedId: 'htl-002',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Abraj Al Bait complex contracted inventory',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-htl-003',
    accountCode: 'HTL-003',
    accountType: 'hotel',
    title: 'The Oberoi Madina',
    linkedId: 'htl-003',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Central Northern Markazia luxury hotel',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },

  // --- BANKS ---
  {
    id: 'acc-bnk-001',
    accountCode: 'BNK-001',
    accountType: 'bank',
    title: 'Al-Rajhi Bank (Main Treasury SAR)',
    linkedId: 'bnk-001',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 150000,
    openingBalancePKR: 11175000,
    notes: 'Main Saudi corporate bank IBAN for MoFA & vendor wires',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-bnk-002',
    accountCode: 'BNK-002',
    accountType: 'bank',
    title: 'Meezan Bank Pakistan (Operations PKR)',
    linkedId: 'bnk-002',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 67114,
    openingBalancePKR: 5000000,
    notes: 'Islamic Banking principal current account for Pakistan collections',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },

  // --- CASH ---
  {
    id: 'acc-csh-001',
    accountCode: 'CSH-001',
    accountType: 'cash',
    title: 'Makkah Office Cash Till (SAR)',
    linkedId: 'csh-001',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 12000,
    openingBalancePKR: 894000,
    notes: 'Petty cash for ground drivers and on-spot hotel deposits',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-csh-002',
    accountCode: 'CSH-002',
    accountType: 'cash',
    title: 'Karachi Branch Cash Drawer (PKR)',
    linkedId: 'csh-002',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 4026,
    openingBalancePKR: 300000,
    notes: 'Counter collections from walk-in agents and passport couriers',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },

  // --- CLIENTS (B2C CUSTOMERS) ---
  {
    id: 'acc-cus-001',
    accountCode: 'CUS-001',
    accountType: 'customer',
    title: 'Tariq Mahmood & Family (VIP Private Client)',
    linkedId: 'cust-001',
    isSystem: false,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Executive family customized Umrah package',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },

  // --- SYSTEM ACCOUNTS (Income & Expense) ---
  {
    id: 'acc-sys-001',
    accountCode: 'SYS-001',
    accountType: 'income',
    title: 'Visa Margin Income',
    linkedId: null,
    isSystem: true,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Automated revenue earned from MoFA visa markup fees',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-sys-002',
    accountCode: 'SYS-002',
    accountType: 'income',
    title: 'Ticket Income',
    linkedId: null,
    isSystem: true,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Revenue from GDS PNR and group airline ticket markups',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-sys-003',
    accountCode: 'SYS-003',
    accountType: 'expense',
    title: 'Commission Expense',
    linkedId: null,
    isSystem: true,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'B2B referral and sub-agent commission payouts',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-sys-004',
    accountCode: 'SYS-004',
    accountType: 'income',
    title: 'Transport Income',
    linkedId: null,
    isSystem: true,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Revenue from intercity bus, coaster and VIP transfers',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-sys-005',
    accountCode: 'SYS-005',
    accountType: 'income',
    title: 'Item/Service Income',
    linkedId: null,
    isSystem: true,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Revenue from item/service sales (non-visa products & services)',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
  {
    id: 'acc-sys-006',
    accountCode: 'SYS-006',
    accountType: 'expense',
    title: 'Item/Service Cost',
    linkedId: null,
    isSystem: true,
    isActive: true,
    openingBalanceSAR: 0,
    openingBalancePKR: 0,
    notes: 'Cost of items/services purchased from suppliers for resale',
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system',
  },
];

export const INITIAL_LEDGER_ENTRIES: LedgerEntryDoc[] = [
  // Entry 1: Agent Visa Invoice (Dr Agent, Cr Visa Margin Income)
  {
    id: 'le-10001',
    entryNo: 'LE-10001',
    date: '2026-09-15',
    accountId: 'acc-agt-001', // Al-Barakah
    entryType: 'Invoice',
    transNo: 'INV-2026-081',
    particulars: 'MoFA Electronic Visas Issued (Batch 12 Pax)',
    invoiceRef: 'INV-2026-081',
    voucherNo: 'UV-000101',
    rate: 74.50,
    debitSAR: 5400,
    creditSAR: 0,
    debitPKR: 402300,
    creditPKR: 0,
    driveFileUrl: null,
    proofType: null,
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-15T10:00:00Z',
    isVoid: false,
    paxCount: 12,
    paxType: 'mofa',
    mofaPax: 12,
    hotelPax: 0,
  },
  {
    id: 'le-10002',
    entryNo: 'LE-10002',
    date: '2026-09-15',
    accountId: 'acc-sys-001', // Visa Margin Income
    entryType: 'Invoice',
    transNo: 'INV-2026-081',
    particulars: 'Revenue recognition — MoFA Electronic Visas (12 Pax @ Al-Barakah)',
    invoiceRef: 'INV-2026-081',
    voucherNo: 'UV-000101',
    rate: 74.50,
    debitSAR: 0,
    creditSAR: 5400,
    debitPKR: 0,
    creditPKR: 402300,
    driveFileUrl: null,
    proofType: null,
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-15T10:00:00Z',
    isVoid: false,
    paxCount: 12,
    paxType: 'mofa',
    mofaPax: 12,
    hotelPax: 0,
  },

  // Entry 2: Voucher Charge: Hotel Stay (Dr Agent, Cr Hotel)
  {
    id: 'le-10003',
    entryNo: 'LE-10003',
    date: '2026-09-20',
    accountId: 'acc-agt-001', // Al-Barakah
    entryType: 'Voucher Charge',
    transNo: 'VCH-MK-9021',
    particulars: 'Fairmont Makkah Clock Tower (5 Nights, Double Room)',
    invoiceRef: 'UV-000101',
    voucherNo: 'UV-000101',
    rate: 74.50,
    debitSAR: 6250,
    creditSAR: 0,
    debitPKR: 465625,
    creditPKR: 0,
    driveFileUrl: 'https://drive.google.com/sample_hotel_voucher.pdf',
    proofType: 'receipt',
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-20T12:00:00Z',
    isVoid: false,
    paxCount: 2,
    paxType: 'hotel',
    mofaPax: 0,
    hotelPax: 2,
  },
  {
    id: 'le-10004',
    entryNo: 'LE-10004',
    date: '2026-09-20',
    accountId: 'acc-htl-001', // Fairmont Hotel
    entryType: 'Voucher Charge',
    transNo: 'VCH-MK-9021',
    particulars: 'Booking confirmed for Pilgrim Ahmed Khan via Al-Barakah',
    invoiceRef: 'UV-000101',
    voucherNo: 'UV-000101',
    rate: 74.50,
    debitSAR: 0,
    creditSAR: 6250,
    debitPKR: 0,
    creditPKR: 465625,
    driveFileUrl: 'https://drive.google.com/sample_hotel_voucher.pdf',
    proofType: 'receipt',
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-20T12:00:00Z',
    isVoid: false,
    paxCount: 2,
    paxType: 'hotel',
    mofaPax: 0,
    hotelPax: 2,
  },

  // Entry 3: Payment from Agent via Al-Rajhi Bank Wire (Dr Bank, Cr Agent)
  {
    id: 'le-10005',
    entryNo: 'LE-10005',
    date: '2026-09-25',
    accountId: 'acc-bnk-001', // Bank Al-Rajhi
    entryType: 'Payment',
    transNo: 'PAY-BNK-7712',
    particulars: 'Bank Wire Inward TT from Al-Barakah Karachi',
    invoiceRef: 'REC-5501',
    voucherNo: null,
    rate: 74.50,
    debitSAR: 8000,
    creditSAR: 0,
    debitPKR: 596000,
    creditPKR: 0,
    driveFileUrl: 'https://drive.google.com/sample_wire_receipt.jpg',
    proofType: 'receipt',
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-25T14:30:00Z',
    isVoid: false,
  },
  {
    id: 'le-10006',
    entryNo: 'LE-10006',
    date: '2026-09-25',
    accountId: 'acc-agt-001', // Al-Barakah
    entryType: 'Payment',
    transNo: 'PAY-BNK-7712',
    particulars: 'Remittance received against outstanding balance via Al-Rajhi',
    invoiceRef: 'REC-5501',
    voucherNo: null,
    rate: 74.50,
    debitSAR: 0,
    creditSAR: 8000,
    debitPKR: 0,
    creditPKR: 596000,
    driveFileUrl: 'https://drive.google.com/sample_wire_receipt.jpg',
    proofType: 'receipt',
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-25T14:30:00Z',
    isVoid: false,
  },

  // Entry 4: A VOIDED ENTRY DEMO (Owner voided with reason, struck-through)
  {
    id: 'le-10007',
    entryNo: 'LE-10007',
    date: '2026-09-28',
    accountId: 'acc-agt-001', // Al-Barakah
    entryType: 'Adjustment',
    transNo: 'ADJ-ERR-001',
    particulars: 'Manual penalty charge — reversed due to airline schedule shift',
    invoiceRef: 'ADJ-ERR-001',
    voucherNo: 'UV-000101',
    rate: 74.50,
    debitSAR: 1500,
    creditSAR: 0,
    debitPKR: 111750,
    creditPKR: 0,
    driveFileUrl: null,
    proofType: null,
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-28T09:00:00Z',
    isVoid: true,
    voidReason: 'Voided by Owner: Duplicate penalty assessed in error, airline schedule waiver confirmed',
    voidedAt: '2026-09-28T11:00:00Z',
    voidedBy: 'Agency Owner',
  },

  // Entry 5: Additional Voucher Charge in October (Dr Agent, Cr Shirka Vendor)
  {
    id: 'le-10008',
    entryNo: 'LE-10008',
    date: '2026-10-01',
    accountId: 'acc-agt-001',
    entryType: 'Voucher Charge',
    transNo: 'VCH-TRN-1011',
    particulars: 'Staria VIP Transfer JED Airport to Makkah Hotel',
    invoiceRef: 'UV-000101',
    voucherNo: 'UV-000101',
    rate: 74.50,
    debitSAR: 350,
    creditSAR: 0,
    debitPKR: 26075,
    creditPKR: 0,
    driveFileUrl: null,
    proofType: null,
    createdBy: 'demo-owner-001',
    createdAt: '2026-10-01T15:00:00Z',
    isVoid: false,
    paxCount: 4,
    paxType: 'hotel',
    mofaPax: 0,
    hotelPax: 4,
  },
  {
    id: 'le-10009',
    entryNo: 'LE-10009',
    date: '2026-10-01',
    accountId: 'acc-vnd-001', // Al-Haramain Group
    entryType: 'Voucher Charge',
    transNo: 'VCH-TRN-1011',
    particulars: 'Ground transport provided for UV-000101',
    invoiceRef: 'UV-000101',
    voucherNo: 'UV-000101',
    rate: 74.50,
    debitSAR: 0,
    creditSAR: 350,
    debitPKR: 0,
    creditPKR: 26075,
    driveFileUrl: null,
    proofType: null,
    createdBy: 'demo-owner-001',
    createdAt: '2026-10-01T15:00:00Z',
    isVoid: false,
  },

  // Entry 6: Falcon International Travels (AGT-002) - Ticket Invoice
  {
    id: 'le-10010',
    entryNo: 'LE-10010',
    date: '2026-09-22',
    accountId: 'acc-agt-002', // Falcon
    entryType: 'Invoice',
    transNo: 'INV-TKT-5510',
    particulars: 'Saudia Airline 20x Group Seats (ISB - JED - ISB)',
    invoiceRef: 'TKT-SV-991',
    voucherNo: null,
    rate: 74.50,
    debitSAR: 42000,
    creditSAR: 0,
    debitPKR: 3129000,
    creditPKR: 0,
    driveFileUrl: null,
    proofType: null,
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-22T08:00:00Z',
    isVoid: false,
    paxCount: 20,
    paxType: 'mofa',
    mofaPax: 20,
    hotelPax: 0,
  },
  {
    id: 'le-10011',
    entryNo: 'LE-10011',
    date: '2026-09-22',
    accountId: 'acc-sys-002', // Ticket Income
    entryType: 'Invoice',
    transNo: 'INV-TKT-5510',
    particulars: 'Group ticket sale to Falcon Travels Lahore',
    invoiceRef: 'TKT-SV-991',
    voucherNo: null,
    rate: 74.50,
    debitSAR: 0,
    creditSAR: 42000,
    debitPKR: 0,
    creditPKR: 3129000,
    driveFileUrl: null,
    proofType: null,
    createdBy: 'demo-owner-001',
    createdAt: '2026-09-22T08:00:00Z',
    isVoid: false,
    paxCount: 20,
    paxType: 'mofa',
    mofaPax: 20,
    hotelPax: 0,
  },
];

/**
 * Fetch all ledger accounts
 */
/**
 * Defensive normalization for legacy ledger account docs. Vendor accounts created
 * by the old createVendor/backfill only carried legacy fields (accountName /
 * agentCode / linkedAgentId) — no title / accountCode — so Balances/Accounts
 * pages rendered them blank. Fill the canonical fields from the legacy ones so a
 * missing title can never render blank again. (Data fix: migration + createVendor
 * now write both shapes; this is the read-side safety net.)
 */
function normalizeLedgerAccount(a: any): LedgerAccountDoc {
  if (!a) return a;
  return {
    ...a,
    title: a.title || a.accountName || 'Unnamed Account',
    accountCode: a.accountCode || a.agentCode || '',
    linkedId: a.linkedId ?? a.linkedAgentId ?? null,
    isSystem: a.isSystem ?? false,
    isActive: a.isActive ?? true,
    openingBalanceSAR: a.openingBalanceSAR ?? a.openingBalance ?? 0,
    openingBalancePKR: a.openingBalancePKR ?? 0,
  };
}

async function fetchLedgerAccountsRaw(): Promise<LedgerAccountDoc[]> {
  let firestoreAccounts: LedgerAccountDoc[] = [];
  let firestoreOk = false;
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, ACCOUNTS_COLLECTION));
      firestoreAccounts = snap.docs.map((d) => ({ ...d.data(), id: (d.data() as any).id || d.id } as LedgerAccountDoc));
      firestoreOk = true;
    }
  } catch (err) {
    console.warn('Could not read accounts from Firestore:', err);
  }

  // Merge both local caches (agentService uses a different key) — Firestore wins on conflict
  const readKey = (key: string): LedgerAccountDoc[] => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  };
  const localAccounts = [
    ...readKey(LOCAL_STORAGE_ACCOUNTS_KEY),
    ...readKey('safardesk_ledger_accounts_directory'),
  ];

  if (!firestoreOk) {
    const seen = new Set<string>();
    return localAccounts.filter((a) => a && a.id && !seen.has(a.id) && (seen.add(a.id), true)).map(normalizeLedgerAccount);
  }

  const seen = new Set(firestoreAccounts.map((a) => a.id));
  const localOnly = localAccounts.filter((a) => a && a.id && !seen.has(a.id));
  return [...firestoreAccounts, ...localOnly].map(normalizeLedgerAccount);
}

/** Cached: accounts rarely change, repeat visits don't re-download. */
export function fetchLedgerAccounts(): Promise<LedgerAccountDoc[]> {
  return cached('ledger:accounts', fetchLedgerAccountsRaw);
}

/** Create or update a ledger account (Firestore + localStorage fallback). */
export async function saveLedgerAccount(account: LedgerAccountDoc): Promise<LedgerAccountDoc> {
  bust('ledger:accounts'); // fresh read after write
  const accounts = await fetchLedgerAccounts();
  const i = accounts.findIndex((a) => a.id === account.id);
  const next = i >= 0 ? accounts.map((a, j) => (j === i ? account : a)) : [account, ...accounts];
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, ACCOUNTS_COLLECTION, account.id), stripUndefinedDeep(account));
    }
  } catch (err) {
    console.warn('Could not save ledger account to Firestore:', err);
  }
  try { localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(next)); } catch { /* storage full/blocked — Firestore is source of truth */ }
  return account;
}
/**
 * Fetch all ledger entries (optionally filtered by accountId)
 */
async function fetchLedgerEntriesRaw(accountId?: string): Promise<LedgerEntryDoc[]> {
  let firestoreEntries: LedgerEntryDoc[] = [];
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, ENTRIES_COLLECTION));
      firestoreEntries = snap.docs.map((d) => ({ ...d.data(), id: (d.data() as any).id || d.id } as LedgerEntryDoc));
    }
  } catch (err) {
    console.warn('Could not read ledger entries from Firestore:', err);
  }

  // Merge local-only entries (e.g. saved before a Firestore sync) — Firestore wins on conflict.
  let localEntries: LedgerEntryDoc[] = [];
  const stored = localStorage.getItem(LOCAL_STORAGE_ENTRIES_KEY);
  if (stored) {
    try {
      localEntries = JSON.parse(stored);
    } catch {
      localEntries = [];
    }
  }
  const byId = new Map<string, LedgerEntryDoc>();
  for (const e of localEntries) if (e?.id) byId.set(e.id, e);
  for (const e of firestoreEntries) if (e?.id) byId.set(e.id, e);
  const list = Array.from(byId.values());

  if (accountId) {
    return list.filter((e) => e.accountId === accountId);
  }
  return list;
}

/** Cached per accountId (or all). Writes bust it via postBalancedTransaction. */
export function fetchLedgerEntries(accountId?: string): Promise<LedgerEntryDoc[]> {
  return cached(`ledger:entries:${accountId || 'all'}`, () => fetchLedgerEntriesRaw(accountId));
}

/**
 * Post a balanced double-entry transaction
 */
export async function postBalancedTransaction(params: {
  date: string;
  entryType: LedgerEntryDoc['entryType'];
  transNo: string;
  particulars: string;
  invoiceRef?: string;
  voucherNo?: string;
  rate: number;
  debitAccountId: string;
  creditAccountId: string;
  amountSAR: number;
  mofaPax?: number;
  hotelPax?: number;
  driveFileUrl?: string;
  proofType?: 'receipt' | 'voice' | null;
  createdBy: string;
}): Promise<{ debitEntry: LedgerEntryDoc; creditEntry: LedgerEntryDoc }> {
  bust('ledger:entries:all'); bustPrefix('ledger:entries:'); // fresh read after write
  const currentEntries = await fetchLedgerEntries();
  const nextNum = currentEntries.length + 10001;

  const amountPKR = Math.round(params.amountSAR * params.rate * 100) / 100;
  const now = new Date().toISOString();

  const debitEntry: LedgerEntryDoc = {
    id: `le-${nextNum}`,
    entryNo: `LE-${nextNum}`,
    date: params.date,
    accountId: params.debitAccountId,
    entryType: params.entryType,
    transNo: params.transNo,
    particulars: params.particulars,
    invoiceRef: params.invoiceRef || null,
    voucherNo: params.voucherNo || null,
    rate: params.rate,
    debitSAR: params.amountSAR,
    creditSAR: 0,
    debitPKR: amountPKR,
    creditPKR: 0,
    driveFileUrl: params.driveFileUrl || null,
    proofType: params.proofType || null,
    createdBy: params.createdBy,
    createdAt: now,
    isVoid: false,
    mofaPax: params.mofaPax || 0,
    hotelPax: params.hotelPax || 0,
    paxCount: (params.mofaPax || 0) + (params.hotelPax || 0),
  };

  const creditEntry: LedgerEntryDoc = {
    id: `le-${nextNum + 1}`,
    entryNo: `LE-${nextNum + 1}`,
    date: params.date,
    accountId: params.creditAccountId,
    entryType: params.entryType,
    transNo: params.transNo,
    particulars: params.particulars,
    invoiceRef: params.invoiceRef || null,
    voucherNo: params.voucherNo || null,
    rate: params.rate,
    debitSAR: 0,
    creditSAR: params.amountSAR,
    debitPKR: 0,
    creditPKR: amountPKR,
    driveFileUrl: params.driveFileUrl || null,
    proofType: params.proofType || null,
    createdBy: params.createdBy,
    createdAt: now,
    isVoid: false,
    mofaPax: params.mofaPax || 0,
    hotelPax: params.hotelPax || 0,
    paxCount: (params.mofaPax || 0) + (params.hotelPax || 0),
  };

  const updated = [debitEntry, creditEntry, ...currentEntries];
  try { localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(updated)); } catch { /* storage full/blocked — Firestore is source of truth */ }

  try {
    if (!isConfigPlaceholder) {
      await Promise.all([
        setDoc(doc(db, ENTRIES_COLLECTION, debitEntry.id), stripUndefinedDeep(debitEntry)),
        setDoc(doc(db, ENTRIES_COLLECTION, creditEntry.id), stripUndefinedDeep(creditEntry)),
      ]);
    }
  } catch (err) {
    console.warn('Could not sync balanced transaction to Firestore:', err);
  }

  return { debitEntry, creditEntry };
}

/**
 * Ensure the Item/Service system accounts exist (for tenants seeded before SYS-005/SYS-006).
 * Creates them in Firestore/local if missing, and returns their ids.
 */
export async function ensureItemServiceAccounts(createdBy: string): Promise<{ incomeId: string; costId: string }> {
  const accounts = await fetchLedgerAccounts();
  let income = accounts.find((a) => a.id === 'acc-sys-005' || a.accountCode === 'SYS-005');
  let cost = accounts.find((a) => a.id === 'acc-sys-006' || a.accountCode === 'SYS-006');
  const now = new Date().toISOString();

  if (!income) {
    income = {
      id: 'acc-sys-005',
      accountCode: 'SYS-005',
      accountType: 'income',
      title: 'Item/Service Income',
      linkedId: null,
      isSystem: true,
      isActive: true,
      openingBalanceSAR: 0,
      openingBalancePKR: 0,
      notes: 'Revenue from item/service sales (non-visa products & services)',
      createdAt: now,
      createdBy,
    };
    await saveLedgerAccount(income);
  }
  if (!cost) {
    cost = {
      id: 'acc-sys-006',
      accountCode: 'SYS-006',
      accountType: 'expense',
      title: 'Item/Service Cost',
      linkedId: null,
      isSystem: true,
      isActive: true,
      openingBalanceSAR: 0,
      openingBalancePKR: 0,
      notes: 'Cost of items/services purchased from suppliers for resale',
      createdAt: now,
      createdBy,
    };
    await saveLedgerAccount(cost);
  }
  return { incomeId: income.id, costId: cost.id };
}

/**
 * Post an Item/Service entry (non-visa product or service sale/purchase).
 * Posts two balanced pairs under one transNo:
 *   1) Dr Customer (selling) / Cr Item-Service Income (selling)
 *   2) Dr Item-Service Cost (buying) / Cr Supplier (buying)
 * Either leg is skipped when its amount is zero.
 */
export async function postItemServiceEntry(params: {
  date: string;
  transNo: string;
  itemName: string;
  description: string;
  supplierAccountId: string | null;
  customerAccountId: string | null;
  buyingSAR: number;
  sellingSAR: number;
  rate: number;
  createdBy: string;
}): Promise<{ transNo: string }> {
  const { incomeId, costId } = await ensureItemServiceAccounts(params.createdBy);
  const baseParticulars = params.description?.trim()
    ? `${params.itemName} — ${params.description.trim()}`
    : params.itemName;

  if (params.customerAccountId && params.sellingSAR > 0) {
    await postBalancedTransaction({
      date: params.date,
      entryType: 'Item/Service',
      transNo: params.transNo,
      particulars: `Sale: ${baseParticulars}`,
      rate: params.rate,
      debitAccountId: params.customerAccountId,
      creditAccountId: incomeId,
      amountSAR: Math.round(params.sellingSAR * 100) / 100,
      createdBy: params.createdBy,
    });
  }

  if (params.supplierAccountId && params.buyingSAR > 0) {
    await postBalancedTransaction({
      date: params.date,
      entryType: 'Item/Service',
      transNo: params.transNo,
      particulars: `Purchase: ${baseParticulars}`,
      rate: params.rate,
      debitAccountId: costId,
      creditAccountId: params.supplierAccountId,
      amountSAR: Math.round(params.buyingSAR * 100) / 100,
      createdBy: params.createdBy,
    });
  }

  return { transNo: params.transNo };
}

/**
 * Void a ledger entry (Owner only, with reason). Entries never disappear.
 * Fix #21: voiding posts a mirror REVERSAL entry on the same account (opposite leg),
 * so the original financial history is preserved AND the void is fully auditable.
 * Payments and Journal Vouchers void through here, so they get reversals automatically.
 */
export async function voidLedgerEntry(
  entryId: string,
  voidReason: string,
  voidedBy: string
): Promise<LedgerEntryDoc> {
  const currentEntries = await fetchLedgerEntries();
  const index = currentEntries.findIndex((e) => e.id === entryId);
  if (index === -1) {
    throw new Error('Ledger entry not found');
  }

  const original = currentEntries[index];
  if (original.isVoid) {
    return original; // already voided — never post a duplicate reversal
  }

  const updatedEntry: LedgerEntryDoc = {
    ...original,
    isVoid: true,
    voidReason,
    voidedAt: new Date().toISOString(),
    voidedBy,
  };

  currentEntries[index] = updatedEntry;
  try { localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(currentEntries)); } catch { /* storage full/blocked — Firestore is source of truth */ }

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, ENTRIES_COLLECTION, entryId), stripUndefinedDeep(updatedEntry));
    }
  } catch (err) {
    console.warn('Could not sync void to Firestore:', err);
  }

  // Void = mark isVoid (excluded from all balances/statements). NO reversal entry is
  // posted: the void flag alone removes the entry from balances, and posting a
  // live reversal on top would double-correct the books (bug seen 2026-10-19 on
  // FST PMT-00102: one-sided reversal left a bogus live leg). The struck-through
  // voided entry itself is the audit trail.
  return updatedEntry;
}

/**
 * Computes statement with Previous Balance, running balances in selected currency (SAR or PKR),
 * and totals of Debit, Credit, Mofa PAX and Hotel PAX.
 */
export function computeLedgerStatement(
  account: LedgerAccountDoc,
  entries: LedgerEntryDoc[],
  currency: 'SAR' | 'PKR' | 'USD',
  startDate?: string,
  endDate?: string
): LedgerStatementSummary {
  // Sort all entries strictly in chronological date order, then by createdAt / entryNo
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
    return (a.entryNo || a.transNo || '').localeCompare(b.entryNo || b.transNo || '');
  });

  // Calculate opening balance prior to startDate from all NON-VOID entries
  const usdRate = getCurrentRate('USD-SAR') || 3.75;
  const toCurrency = (sarVal: number, pkrVal: number) =>
    currency === 'SAR' ? sarVal : currency === 'PKR' ? pkrVal : sarVal / usdRate;
  let previousBalance = toCurrency(account.openingBalanceSAR || 0, account.openingBalancePKR || 0);

  const periodRows: ComputedLedgerStatementRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let totalMofaPax = 0;
  let totalHotelPax = 0;

  let runningBalance = previousBalance;

  sorted.forEach((e) => {
    const isDebit = toCurrency(e.debitSAR || 0, e.debitPKR || 0);
    const isCredit = toCurrency(e.creditSAR || 0, e.creditPKR || 0);

    // Check if entry is strictly BEFORE the start period
    if (startDate && e.date < startDate) {
      if (!e.isVoid) {
        previousBalance += isDebit - isCredit;
        runningBalance = previousBalance;
      }
      return;
    }

    // Check if entry is after the end period
    if (endDate && e.date > endDate) {
      return;
    }

    // Within period:
    if (!e.isVoid) {
      runningBalance += isDebit - isCredit;
      totalDebit += isDebit;
      totalCredit += isCredit;

      if (e.mofaPax) totalMofaPax += e.mofaPax;
      if (e.hotelPax) totalHotelPax += e.hotelPax;
    }

    periodRows.push({
      entry: e,
      runningBalance: runningBalance,
      formattedRate: e.rate ? Number(e.rate).toFixed(2) : '—',
    });
  });

  const periodLabel = startDate && endDate 
    ? `${startDate} to ${endDate}`
    : startDate 
    ? `From ${startDate}`
    : endDate 
    ? `Up to ${endDate}`
    : 'All Time';

  return {
    account,
    currency,
    periodLabel,
    startDate,
    endDate,
    previousBalance,
    totalDebit,
    totalCredit,
    closingBalance: runningBalance,
    totalMofaPax,
    totalHotelPax,
    rows: periodRows,
  };
}

/**
 * CSV / Excel Export of any Ledger Statement
 */
export function exportLedgerToCSV(
  statement: LedgerStatementSummary,
  companyName: string
): void {
  const lines: string[] = [];
  const c = statement.currency;

  lines.push(`STATEMENT OF ACCOUNT: ${statement.account.title.toUpperCase()} (${statement.account.accountCode})`);
  lines.push(`Agency: ${companyName}`);
  lines.push(`Account Type: ${statement.account.accountType.toUpperCase()}`);
  lines.push(`Statement Period: ${statement.periodLabel}`);
  lines.push(`Currency: ${c}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('');

  // Table Header
  lines.push('Date,Type,Trans.#,Particulars,Inv-Ref,Rate,Debit (' + c + '),Credit (' + c + '),Running Balance (' + c + '),Status');

  // Previous Balance Row
  lines.push(`"—","Opening","—","Previous Balance (B/F)","—","—",0.00,0.00,${statement.previousBalance.toFixed(2)},"Active"`);

  // Data rows
  statement.rows.forEach((r) => {
    const e = r.entry;
    const debit = c === 'SAR' ? e.debitSAR : e.debitPKR;
    const credit = c === 'SAR' ? e.creditSAR : e.creditPKR;
    const status = e.isVoid ? `VOIDED (${e.voidReason || 'Voided'})` : 'Valid';
    const particularsEscaped = `"${(e.particulars || '').replace(/"/g, '""')}"`;
    const invRef = e.invoiceRef || '—';
    const transNo = e.transNo || '—';
    const voucherRef = e.voucherNo ? ` [Voucher: ${e.voucherNo}]` : '';

    lines.push(
      `"${e.date}","${e.entryType}","${transNo}","${particularsEscaped}${voucherRef}","${invRef}",${Number(e.rate).toFixed(2)},${debit.toFixed(2)},${credit.toFixed(2)},${r.runningBalance.toFixed(2)},"${status}"`
    );
  });

  // Footer / Totals
  lines.push('');
  lines.push(`SUMMARY & TOTALS (${c})`);
  lines.push(`Previous Balance (B/F),${statement.previousBalance.toFixed(2)}`);
  lines.push(`Total Period Debit,${statement.totalDebit.toFixed(2)}`);
  lines.push(`Total Period Credit,${statement.totalCredit.toFixed(2)}`);
  lines.push(`Closing Balance,${statement.closingBalance.toFixed(2)}`);
  lines.push(`Total Mofa PAX,${statement.totalMofaPax}`);
  lines.push(`Total Hotel PAX,${statement.totalHotelPax}`);

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledger_${statement.account.accountCode}_${statement.currency}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function ledgerDownloadName(statement: LedgerStatementSummary, ext: string): string {
  return `ledger_${statement.account.accountCode}_${statement.currency}_${new Date().toISOString().split('T')[0]}.${ext}`;
}

function statementTableRows(statement: LedgerStatementSummary): Array<Array<string | number>> {
  const c = statement.currency;
  const showRate = c === 'PKR'; // exchange rate shown only in PKR ledger/entries
  const rows: Array<Array<string | number>> = [];
  const header: Array<string | number> = ['S#', 'Date', 'Inv/Vou', 'Description', 'PNR / Passport', 'Ticket # / Group', 'Sector'];
  if (showRate) header.push('Rate (1 SAR = PKR)');
  header.push(`Debit (${c})`, `Credit (${c})`, `Balance (${c})`);
  rows.push(header);
  const opening: Array<string | number> = ['', '—', '—', 'Previous Balance (B/F)', '', '', ''];
  if (showRate) opening.push('');
  opening.push(0, 0, Number(statement.previousBalance.toFixed(2)));
  rows.push(opening);
  statement.rows.forEach((r, i) => {
    const e = r.entry;
    const s = toSampleLedgerRow(e.particulars, e.invoiceRef, e.transNo, (e as any).voucherNo);
    const debit = c === 'SAR' ? e.debitSAR : e.debitPKR;
    const credit = c === 'SAR' ? e.creditSAR : e.creditPKR;
    const row: Array<string | number> = [
      i + 1,
      fmtDateDMY(e.date),
      s.invVou || '—',
      s.description + (e.isVoid ? ` (VOIDED: ${e.voidReason || 'Voided'})` : ''),
      s.pnr,
      s.ticketNo,
      s.sector,
    ];
    if (showRate) row.push(Number(Number(e.rate).toFixed(2)));
    row.push(
      Number(debit.toFixed(2)),
      Number(credit.toFixed(2)),
      Number(r.runningBalance.toFixed(2)),
    );
    rows.push(row);
  });
  return rows;
}

/** Real CSV download of the ledger statement (detailed sample-style columns). */
export function exportLedgerDetailedCSV(statement: LedgerStatementSummary, companyName: string): void {
  const c = statement.currency;
  const aoa: Array<Array<string | number>> = [
    [`STATEMENT OF ACCOUNT: ${statement.account.title.toUpperCase()} (${statement.account.accountCode})`],
    [`Agency: ${companyName}`],
    [`Account Type: ${statement.account.accountType.toUpperCase()}`, `Currency: ${c}`],
    [`Statement Period: ${statement.periodLabel}`, `Generated: ${new Date().toLocaleString()}`],
    [],
  ];
  const tableRows = statementTableRows(statement);
  aoa.push(...tableRows);
  aoa.push([], []);
  aoa.push(
    [`SUMMARY & TOTALS (${c})`],
    ['Previous Balance (B/F)', Number(statement.previousBalance.toFixed(2))],
    ['Total Period Debit', Number(statement.totalDebit.toFixed(2))],
    ['Total Period Credit', Number(statement.totalCredit.toFixed(2))],
    ['Closing Balance', Number(statement.closingBalance.toFixed(2))],
    ['Total Mofa PAX', statement.totalMofaPax],
    ['Total Hotel PAX', statement.totalHotelPax],
  );
  downloadCSVText(aoaToCSV(aoa), ledgerDownloadName(statement, 'csv'));
}

/**
 * Split a ledger entry into the sample-style columns:
 * S# | DATE | INV/VOU | DESCRIPTION | PNR | TICKET # | SECTOR | DEBIT | CREDIT | BALANCE
 * Visa pax lines ("Visa — Name | PP: XXXXX | GRP (Group Name) — SAR 450/visa") are
 * broken into: DESCRIPTION=name, PNR=passport, TICKET #=group — exactly like the
 * reference statement (one pax per single line).
 */
export interface SampleLedgerRow {
  invVou: string;
  description: string;
  pnr: string;
  ticketNo: string;
  sector: string;
}
export function toSampleLedgerRow(particulars: string, invoiceRef?: string | null, transNo?: string | null, voucherNo?: string | null): SampleLedgerRow {
  const p = particulars || '';
  const visa = p.match(/^Visa [\u2014-]\s*(.+?)\s*\|\s*PP:\s*([A-Za-z0-9]+)\s*\|\s*(.+?)(?:\s*[\u2014-]\s*SAR|$)/);
  if (visa) {
    return {
      invVou: invoiceRef || transNo || '',
      description: visa[1].trim(),
      pnr: visa[2].trim().toUpperCase(),
      ticketNo: visa[3].trim(),
      sector: '',
    };
  }
  return {
    invVou: invoiceRef || transNo || '',
    description: p,
    pnr: '',
    ticketNo: voucherNo ? `Voucher ${voucherNo}` : '',
    sector: '',
  };
}

function fmtDateDMY(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '—');
}

function fmtBalCrDr(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (Math.abs(n) < 0.005) return '0.00';
  return `${abs} ${n < 0 ? 'Cr' : 'Dr'}`;
}

/** Branded PDF download of the ledger statement — sample-style dense layout.
 * Matches the reference statement: S# | DATE | INV/VOU | DESCRIPTION | PNR |
 * TICKET # | SECTOR | DEBIT | CREDIT | BALANCE (Cr/Dr). One pax per single line,
 * ~35 rows per portrait A4 page.
 */
export function exportLedgerToPDF(statement: LedgerStatementSummary, companyName: string, companyCity?: string): void {
  const c = statement.currency;
  const NAVY: [number, number, number] = [14, 44, 76];
  const GOLD: [number, number, number] = [201, 162, 39];
  const DARK: [number, number, number] = [30, 41, 59];
  const GREY: [number, number, number] = [100, 116, 139];

  // Landscape A4 — same breathing room as the printed statement
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;
  const margin = 12;
  const printDate = new Date().toLocaleDateString('en-GB');

  const money = (n: number) => n !== 0 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
  const moneyBlank = (n: number) => n !== 0 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  // ---- Header (matches the print view) ----
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(companyName.toUpperCase(), margin, 14);

  // Gold accent line under company name
  doc.setFillColor(...GOLD);
  doc.rect(margin, 16.5, 40, 1, 'F');

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  if (companyCity) doc.text(`${companyCity} Office`, margin, 21);

  // Right block: STATEMENT OF ACCOUNT badge
  const badgeText = 'STATEMENT OF ACCOUNT';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  const badgeW = doc.getTextWidth(badgeText) + 8;
  doc.setFillColor(...NAVY);
  doc.rect(pageW - margin - badgeW, 7, badgeW, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(badgeText, pageW - margin - badgeW / 2, 12, { align: 'center' });

  doc.setTextColor(...GREY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Currency: ${c}`, pageW - margin, 18, { align: 'right' });
  doc.text(`Print Date: ${printDate}`, pageW - margin, 22.5, { align: 'right' });

  // ---- Account info block (like print) ----
  const infoY = 28;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, infoY, pageW - margin, infoY);

  doc.setTextColor(...GREY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('ACCOUNT TITLE & CODE', margin, infoY + 4.5);
  doc.text('STATEMENT PERIOD', pageW - margin, infoY + 4.5, { align: 'right' });

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`${statement.account.title} (${statement.account.accountCode})`, margin, infoY + 10);
  doc.setFontSize(9);
  doc.text(statement.periodLabel || 'All Time', pageW - margin, infoY + 10, { align: 'right' });

  doc.setTextColor(...GREY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Type: ${statement.account.accountType}`, margin, infoY + 14.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(
    `Closing Balance: ${c} ${money(statement.closingBalance)}`,
    pageW - margin, infoY + 14.5, { align: 'right' }
  );

  // ---- Table (same columns as print) ----
  const showRate = c === 'PKR';
  const headRow = ['DATE', 'TYPE', 'TRANS.#', 'PARTICULARS', 'INV-REF'];
  if (showRate) headRow.push('RATE');
  headRow.push(`DEBIT (${c})`, `CREDIT (${c})`, `BALANCE (${c})`);

  const body: string[][] = [];
  // Opening balance row
  const openingRow = [statement.startDate || '—', 'Opening', '—', 'Previous Balance (B/F)', '—'];
  if (showRate) openingRow.push('—');
  openingRow.push('0.00', '0.00', money(statement.previousBalance));
  body.push(openingRow);

  statement.rows.forEach((r) => {
    const e = r.entry;
    const debit = c === 'SAR' ? e.debitSAR : c === 'PKR' ? e.debitPKR : (e.debitSAR || 0) / 3.75;
    const credit = c === 'SAR' ? e.creditSAR : c === 'PKR' ? e.creditPKR : (e.creditSAR || 0) / 3.75;
    const row = [
      fmtDateDMY(e.date),
      e.entryType || '',
      e.transNo || '',
      e.particulars + (e.isVoid ? ' (VOIDED)' : ''),
      e.invoiceRef || '—',
    ];
    if (showRate) row.push(e.rate ? Number(e.rate).toFixed(2) : '—');
    row.push(moneyBlank(debit || 0), moneyBlank(credit || 0), money(r.runningBalance));
    body.push(row);
  });

  // Column widths (landscape A4 usable width = 273mm)
  const colStyles: Record<number, any> = {
    0: { cellWidth: 22 },
    1: { cellWidth: 20 },
    2: { cellWidth: 24 },
    3: { cellWidth: 'auto' },
    4: { cellWidth: 24 },
  };
  let idx = 5;
  if (showRate) {
    colStyles[idx] = { cellWidth: 16, halign: 'right' };
    idx += 1;
  }
  colStyles[idx] = { cellWidth: 28, halign: 'right' };
  colStyles[idx + 1] = { cellWidth: 28, halign: 'right' };
  colStyles[idx + 2] = { cellWidth: 30, halign: 'right' };

  autoTable(doc, {
    startY: infoY + 19,
    head: [headRow],
    body,
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 1.8,
      lineWidth: 0.1,
      lineColor: [203, 213, 225],
      textColor: DARK,
      valign: 'middle',
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: colStyles,
    // Opening row: amber tint like print
    didParseCell: (data: any) => {
      if (data.row.index === 0 && data.section === 'body') {
        data.cell.styles.fillColor = [255, 251, 235];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    // Footer on every page: page number + totals on last page
    didDrawPage: (d: any) => {
      doc.setFontSize(7.5);
      doc.setTextColor(...GREY);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `${companyName} — Statement of Account — ${statement.account.title} (${statement.account.accountCode})`,
        margin, pageH - 8
      );
      doc.text(`Page ${d.pageNumber} of ${d.pageCount || ''}`, pageW - margin, pageH - 8, { align: 'right' });
    },
  });

  // ---- Totals footer (after table, on the last page) ----
  const afterY = (doc as any).lastAutoTable.finalY + 6;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(margin, afterY, pageW - margin, afterY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...DARK);
  doc.text('PERIOD TOTALS', margin, afterY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Total Debit: ${c} ${money(statement.totalDebit)}`, margin, afterY + 10.5);
  doc.text(`Total Credit: ${c} ${money(statement.totalCredit)}`, margin + 70, afterY + 10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(`Closing Balance: ${c} ${money(statement.closingBalance)}`, pageW - margin, afterY + 10.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(
    `Total Mofa PAX: ${statement.totalMofaPax || 0}    Total Hotel PAX: ${statement.totalHotelPax || 0}`,
    margin, afterY + 15.5
  );

  doc.save(ledgerDownloadName(statement, 'pdf'));
}

/**
 * Computes all account balances directly from ledgerEntries (single source of truth).
 * Enforces: no separately stored balances that can drift.
 */
export function computeAllAccountBalances(
  accounts: LedgerAccountDoc[],
  entries: LedgerEntryDoc[]
): BalancesSummaryData {
  const activeEntries = entries.filter((e) => !e.isVoid);

  const processAccountRow = (acc: LedgerAccountDoc): AccountBalanceRow => {
    const accEntries = activeEntries.filter((e) => e.accountId === acc.id);
    let netSAR = acc.openingBalanceSAR || 0;
    let netPKR = acc.openingBalancePKR || 0;
    let lastDate: string | null = null;

    accEntries.forEach((e) => {
      netSAR += (e.debitSAR || 0) - (e.creditSAR || 0);
      netPKR += (e.debitPKR || 0) - (e.creditPKR || 0);
      if (!lastDate || e.date > lastDate) {
        lastDate = e.date;
      }
    });

    // Default credit limits for agents
    let defaultLimit = 0;
    if (acc.accountType === 'agent') {
      if (acc.accountCode === 'AGT-001') defaultLimit = 15000;
      else if (acc.accountCode === 'AGT-002') defaultLimit = 40000;
      else if (acc.accountCode === 'AGT-003') defaultLimit = 20000;
      else defaultLimit = 25000;
    }

    const limit = acc.creditLimitSAR ?? defaultLimit;
    const isOverLimit = acc.accountType === 'agent' && limit > 0 && netSAR > limit;
    const overDueAmountSAR = isOverLimit ? netSAR - limit : 0;

    return {
      account: acc,
      balanceSAR: Math.round(netSAR * 100) / 100,
      balancePKR: Math.round(netPKR * 100) / 100,
      creditLimitSAR: limit,
      isOverLimit,
      overDueAmountSAR,
      lastEntryDate: lastDate,
      entriesCount: accEntries.length,
    };
  };

  const agents: AccountBalanceRow[] = [];
  const hotelsVendors: AccountBalanceRow[] = [];
  const banks: AccountBalanceRow[] = [];
  const cash: AccountBalanceRow[] = [];
  const customers: AccountBalanceRow[] = [];

  accounts.forEach((acc) => {
    const row = processAccountRow(acc);
    if (acc.accountType === 'agent') {
      agents.push(row);
    } else if (acc.accountType === 'hotel' || acc.accountType === 'vendor') {
      hotelsVendors.push(row);
    } else if (acc.accountType === 'bank') {
      banks.push(row);
    } else if (acc.accountType === 'cash') {
      cash.push(row);
    } else if (acc.accountType === 'customer') {
      customers.push(row);
    }
  });

  const sumSection = (rows: AccountBalanceRow[]) => ({
    sar: rows.reduce((sum, r) => sum + r.balanceSAR, 0),
    pkr: rows.reduce((sum, r) => sum + r.balancePKR, 0),
  });

  const agTot = sumSection(agents);
  const hvTot = sumSection(hotelsVendors);
  const bkTot = sumSection(banks);
  const csTot = sumSection(cash);
  const cuTot = sumSection(customers);

  // Grand totals:
  // Total Receivable = Agents (receivable) + Customers (receivable)
  const totalReceivableSAR = agTot.sar + cuTot.sar;
  const totalReceivablePKR = agTot.pkr + cuTot.pkr;

  // Total Payable = Hotels/Vendors (payable) - in double-entry liabilities carry credit balances
  const totalPayableSAR = Math.abs(hvTot.sar);
  const totalPayablePKR = Math.abs(hvTot.pkr);

  // Net Position (receivable − payable)
  const netPositionSAR = totalReceivableSAR - totalPayableSAR;
  const netPositionPKR = totalReceivablePKR - totalPayablePKR;

  return {
    lastRecomputedAt: new Date().toISOString(),
    agents,
    hotelsVendors,
    banks,
    cash,
    customers,

    totalAgentsSAR: agTot.sar,
    totalAgentsPKR: agTot.pkr,
    totalHotelsVendorsSAR: hvTot.sar,
    totalHotelsVendorsPKR: hvTot.pkr,
    totalBanksSAR: bkTot.sar,
    totalBanksPKR: bkTot.pkr,
    totalCashSAR: csTot.sar,
    totalCashPKR: csTot.pkr,
    totalCustomersSAR: cuTot.sar,
    totalCustomersPKR: cuTot.pkr,

    totalReceivableSAR,
    totalReceivablePKR,
    totalPayableSAR,
    totalPayablePKR,
    netPositionSAR,
    netPositionPKR,
  };
}

/**
 * Cache per-account balance on the account doc only as a recomputed snapshot
 * with a "last recomputed" timestamp.
 */
export async function cacheAccountBalancesSnapshot(summary: BalancesSummaryData): Promise<void> {
  const allRows = [
    ...summary.agents,
    ...summary.hotelsVendors,
    ...summary.banks,
    ...summary.cash,
    ...summary.customers,
  ];

  const currentAccounts = await fetchLedgerAccounts();
  const updatedAccounts = currentAccounts.map((acc) => {
    const row = allRows.find((r) => r.account.id === acc.id);
    if (!row) return acc;
    return {
      ...acc,
      currentBalanceSAR: row.balanceSAR,
      currentBalancePKR: row.balancePKR,
      lastRecomputedAt: summary.lastRecomputedAt,
      creditLimitSAR: row.creditLimitSAR,
    };
  });

  try { localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(updatedAccounts)); } catch { /* storage full/blocked — Firestore is source of truth */ }

  try {
    if (!isConfigPlaceholder) {
      await Promise.all(
        updatedAccounts.map((a) => setDoc(doc(db, ACCOUNTS_COLLECTION, a.id), stripUndefinedDeep(a), { merge: true }))
      );
    }
  } catch (err) {
    console.warn('Could not sync balance snapshot to Firestore:', err);
  }
}

/**
 * Export Day Book / Chronological Journal to CSV
 */
export function exportDayBookToCSV(
  entries: LedgerEntryDoc[],
  accounts: LedgerAccountDoc[],
  currency: 'SAR' | 'PKR' | 'USD',
  companyName: string
): void {
  const lines: string[] = [];
  lines.push(`DAY BOOK / GENERAL CHRONOLOGICAL JOURNAL`);
  lines.push(`Agency: ${companyName}`);
  lines.push(`Currency View: ${currency}`);
  lines.push(`Total Transactions: ${entries.length}`);
  lines.push(`Exported: ${new Date().toLocaleString()}`);
  lines.push('');

  lines.push(`Date,Trans.#,Account Code,Account Title,Account Type,Type,Particulars,Rate,Debit (${currency}),Credit (${currency}),Status`);

  const accMap = new Map(accounts.map((a) => [a.id, a]));

  let totalDebit = 0;
  let totalCredit = 0;

  entries.forEach((e) => {
    const acc = accMap.get(e.accountId);
    const usdR = getCurrentRate('USD-SAR') || 3.75;
    const debit = currency === 'SAR' ? e.debitSAR : currency === 'PKR' ? e.debitPKR : (e.debitSAR || 0) / usdR;
    const credit = currency === 'SAR' ? e.creditSAR : currency === 'PKR' ? e.creditPKR : (e.creditSAR || 0) / usdR;
    if (!e.isVoid) {
      totalDebit += debit;
      totalCredit += credit;
    }

    const status = e.isVoid ? `VOIDED (${e.voidReason || 'Voided'})` : 'Valid';
    const accCode = acc ? acc.accountCode : '—';
    const accType = acc ? acc.accountType.toUpperCase() : '—';
    const accTitle = `"${(acc?.title || '').replace(/"/g, '""')}"`;
    const particulars = `"${(e.particulars || '').replace(/"/g, '""')}"`;

    lines.push(
      `"${e.date}","${e.transNo || e.entryNo}","${accCode}",${accTitle},"${accType}","${e.entryType}",${particulars},${Number(e.rate).toFixed(2)},${debit.toFixed(2)},${credit.toFixed(2)},"${status}"`
    );
  });

  lines.push('');
  lines.push(`TOTALS (${currency}),,,,,,,,${totalDebit.toFixed(2)},${totalCredit.toFixed(2)}`);

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `day_book_${currency}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
