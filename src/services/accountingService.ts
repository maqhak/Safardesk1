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

const ACCOUNTS_COLLECTION = 'ledger_accounts';
const ENTRIES_COLLECTION = 'ledger_entries';

const LOCAL_STORAGE_ACCOUNTS_KEY = 'safardesk_ledger_accounts_v3';
const LOCAL_STORAGE_ENTRIES_KEY = 'safardesk_ledger_entries_v3';

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
    title: 'Al-Haramain Group (Shirka)',
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
export async function fetchLedgerAccounts(): Promise<LedgerAccountDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, ACCOUNTS_COLLECTION));
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as LedgerAccountDoc);
      }
    }
  } catch (err) {
    console.warn('Could not read accounts from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_ACCOUNTS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(INITIAL_LEDGER_ACCOUNTS));
  return INITIAL_LEDGER_ACCOUNTS;
}

/** Create or update a ledger account (Firestore + localStorage fallback). */
export async function saveLedgerAccount(account: LedgerAccountDoc): Promise<LedgerAccountDoc> {
  const accounts = await fetchLedgerAccounts();
  const i = accounts.findIndex((a) => a.id === account.id);
  const next = i >= 0 ? accounts.map((a, j) => (j === i ? account : a)) : [account, ...accounts];
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, ACCOUNTS_COLLECTION, account.id), account);
    }
  } catch (err) {
    console.warn('Could not save ledger account to Firestore:', err);
  }
  localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(next));
  return account;
}
/**
 * Fetch all ledger entries (optionally filtered by accountId)
 */
export async function fetchLedgerEntries(accountId?: string): Promise<LedgerEntryDoc[]> {
  let list: LedgerEntryDoc[] = INITIAL_LEDGER_ENTRIES;

  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, ENTRIES_COLLECTION));
      if (!snap.empty) {
        list = snap.docs.map((d) => d.data() as LedgerEntryDoc);
      }
    }
  } catch (err) {
    console.warn('Could not read ledger entries from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_ENTRIES_KEY);
  if (stored) {
    try {
      list = JSON.parse(stored);
    } catch {
      list = INITIAL_LEDGER_ENTRIES;
    }
  } else {
    localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(INITIAL_LEDGER_ENTRIES));
  }

  if (accountId) {
    return list.filter((e) => e.accountId === accountId);
  }
  return list;
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
  localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(updated));

  try {
    if (!isConfigPlaceholder) {
      await Promise.all([
        setDoc(doc(db, ENTRIES_COLLECTION, debitEntry.id), debitEntry),
        setDoc(doc(db, ENTRIES_COLLECTION, creditEntry.id), creditEntry),
      ]);
    }
  } catch (err) {
    console.warn('Could not sync balanced transaction to Firestore:', err);
  }

  return { debitEntry, creditEntry };
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
  localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(currentEntries));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, ENTRIES_COLLECTION, entryId), updatedEntry);
    }
  } catch (err) {
    console.warn('Could not sync void to Firestore:', err);
  }

  // Post the mirror reversal entry (opposite leg, same account, same amounts).
  const nextNum = currentEntries.length + 10001;
  const now = new Date().toISOString();
  const reversal: LedgerEntryDoc = {
    ...original,
    id: `le-${nextNum}`,
    entryNo: `LE-${nextNum}`,
    date: now.split('T')[0],
    particulars: `VOID REVERSAL (${original.entryNo}): ${original.particulars} — ${voidReason}`,
    debitSAR: original.creditSAR,
    creditSAR: original.debitSAR,
    debitPKR: original.creditPKR,
    creditPKR: original.debitPKR,
    isVoid: false,
    voidReason: null,
    voidedAt: null,
    voidedBy: null,
    reversalOf: original.entryNo,
    createdBy: voidedBy,
    createdAt: now,
  };
  const withReversal = [reversal, ...currentEntries];
  localStorage.setItem(LOCAL_STORAGE_ENTRIES_KEY, JSON.stringify(withReversal));

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, ENTRIES_COLLECTION, reversal.id), reversal);
    }
  } catch (err) {
    console.warn('Could not sync void reversal to Firestore:', err);
  }

  return updatedEntry;
}

/**
 * Computes statement with Previous Balance, running balances in selected currency (SAR or PKR),
 * and totals of Debit, Credit, Mofa PAX and Hotel PAX.
 */
export function computeLedgerStatement(
  account: LedgerAccountDoc,
  entries: LedgerEntryDoc[],
  currency: 'SAR' | 'PKR',
  startDate?: string,
  endDate?: string
): LedgerStatementSummary {
  // Sort all entries strictly in chronological date order, then by createdAt / entryNo
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.entryNo.localeCompare(b.entryNo);
  });

  // Calculate opening balance prior to startDate from all NON-VOID entries
  let previousBalance = currency === 'SAR' ? (account.openingBalanceSAR || 0) : (account.openingBalancePKR || 0);

  const periodRows: ComputedLedgerStatementRow[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let totalMofaPax = 0;
  let totalHotelPax = 0;

  let runningBalance = previousBalance;

  sorted.forEach((e) => {
    const isDebit = currency === 'SAR' ? e.debitSAR : e.debitPKR;
    const isCredit = currency === 'SAR' ? e.creditSAR : e.creditPKR;

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
      formattedRate: e.rate ? e.rate.toFixed(2) : '—',
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
      `"${e.date}","${e.entryType}","${transNo}","${particularsEscaped}${voucherRef}","${invRef}",${e.rate.toFixed(2)},${debit.toFixed(2)},${credit.toFixed(2)},${r.runningBalance.toFixed(2)},"${status}"`
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
  const rows: Array<Array<string | number>> = [];
  rows.push(['Date', 'Type', 'Trans.#', 'Particulars', 'Inv-Ref', 'Rate', `Debit (${c})`, `Credit (${c})`, `Balance (${c})`]);
  rows.push(['—', 'Opening', '—', 'Previous Balance (B/F)', '—', '—', 0, 0, Number(statement.previousBalance.toFixed(2))]);
  statement.rows.forEach((r) => {
    const e = r.entry;
    const debit = c === 'SAR' ? e.debitSAR : e.debitPKR;
    const credit = c === 'SAR' ? e.creditSAR : e.creditPKR;
    rows.push([
      e.date, e.entryType, e.transNo || '—',
      (e.particulars || '') + (e.voucherNo ? ` [Voucher: ${e.voucherNo}]` : '') + (e.isVoid ? ` (VOIDED: ${e.voidReason || 'Voided'})` : ''),
      e.invoiceRef || '—', Number(e.rate.toFixed(2)),
      Number(debit.toFixed(2)), Number(credit.toFixed(2)), Number(r.runningBalance.toFixed(2)),
    ]);
  });
  return rows;
}

/** Real Excel (.xlsx) download of the ledger statement. */
export function exportLedgerToExcel(statement: LedgerStatementSummary, companyName: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx');
  const c = statement.currency;
  const wb = XLSX.utils.book_new();
  const title = `STATEMENT OF ACCOUNT: ${statement.account.title.toUpperCase()} (${statement.account.accountCode})`;
  const header: Array<Array<string | number>> = [
    [title],
    [`Agency: ${companyName}`],
    [`Account Type: ${statement.account.accountType.toUpperCase()}`, `Currency: ${c}`],
    [`Statement Period: ${statement.periodLabel}`, `Generated: ${new Date().toLocaleString()}`],
    [],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...header, ...statementTableRows(statement)]);
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 60 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  const footerRow = header.length + statementTableRows(statement).length + 2;
  const footer = [
    [`SUMMARY & TOTALS (${c})`],
    ['Previous Balance (B/F)', Number(statement.previousBalance.toFixed(2))],
    ['Total Period Debit', Number(statement.totalDebit.toFixed(2))],
    ['Total Period Credit', Number(statement.totalCredit.toFixed(2))],
    ['Closing Balance', Number(statement.closingBalance.toFixed(2))],
    ['Total Mofa PAX', statement.totalMofaPax],
    ['Total Hotel PAX', statement.totalHotelPax],
  ];
  XLSX.utils.sheet_add_aoa(ws, footer, { origin: `A${footerRow}` });
  XLSX.utils.book_append_sheet(wb, ws, 'Statement');
  XLSX.writeFile(wb, ledgerDownloadName(statement, 'xlsx'));
}

/** Branded PDF download of the ledger statement. */
export function exportLedgerToPDF(statement: LedgerStatementSummary, companyName: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { jsPDF } = require('jspdf');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('jspdf-autotable');
  const c = statement.currency;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header band
  doc.setFillColor(14, 44, 76);
  doc.rect(0, 0, 297, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(companyName, 14, 11);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Statement of Account — ${statement.account.title} (${statement.account.accountCode})`, 14, 18);

  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  const metaY = 32;
  doc.text(`Account Type: ${statement.account.accountType.toUpperCase()}`, 14, metaY);
  doc.text(`Period: ${statement.periodLabel}`, 110, metaY);
  doc.text(`Currency: ${c}`, 200, metaY);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, metaY + 6);
  doc.text(`Previous Balance (B/F): ${c} ${statement.previousBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 110, metaY + 6);

  const body = statement.rows.map((r) => {
    const e = r.entry;
    const debit = c === 'SAR' ? e.debitSAR : e.debitPKR;
    const credit = c === 'SAR' ? e.creditSAR : e.creditPKR;
    return [
      e.date, e.entryType, e.transNo || '—',
      (e.particulars || '') + (e.voucherNo ? ` [Voucher: ${e.voucherNo}]` : '') + (e.isVoid ? ' (VOIDED)' : ''),
      e.invoiceRef || '—', e.rate.toFixed(2),
      debit > 0 ? debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—',
      credit > 0 ? credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—',
      r.runningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 }),
    ];
  });

  (doc as any).autoTable({
    startY: metaY + 12,
    head: [['Date', 'Type', 'Trans.#', 'Particulars', 'Inv-Ref', 'Rate', `Debit (${c})`, `Credit (${c})`, `Balance (${c})`]],
    body,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [14, 44, 76], textColor: 255, fontStyle: 'bold' },
    columnStyles: { 3: { cellWidth: 95 } },
  });

  const fy = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Debit: ${c} ${statement.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 14, fy);
  doc.text(`Total Credit: ${c} ${statement.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 110, fy);
  doc.text(`Closing Balance: ${c} ${statement.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, 200, fy);

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

  localStorage.setItem(LOCAL_STORAGE_ACCOUNTS_KEY, JSON.stringify(updatedAccounts));

  try {
    if (!isConfigPlaceholder) {
      await Promise.all(
        updatedAccounts.map((a) => setDoc(doc(db, ACCOUNTS_COLLECTION, a.id), a, { merge: true }))
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
  currency: 'SAR' | 'PKR',
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
    const debit = currency === 'SAR' ? e.debitSAR : e.debitPKR;
    const credit = currency === 'SAR' ? e.creditSAR : e.creditPKR;
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
      `"${e.date}","${e.transNo || e.entryNo}","${accCode}",${accTitle},"${accType}","${e.entryType}",${particulars},${e.rate.toFixed(2)},${debit.toFixed(2)},${credit.toFixed(2)},"${status}"`
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
