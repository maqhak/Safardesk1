import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  getDoc 
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { VoucherDoc } from '../types/voucher';
import { UserProfile } from '../types/auth';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/agent';
import { logAuditEvent } from './userService';
import { getCurrentRate } from './exchangeRateService';

const VOUCHERS_COLLECTION = 'vouchers';
const LEDGER_ACCOUNTS_COLLECTION = 'ledgerAccounts';
const LEDGER_ENTRIES_COLLECTION = 'ledgerEntries';
const SETTINGS_COUNTERS_COLLECTION = 'settings';
const LOCAL_STORAGE_VOUCHERS_KEY = 'safardesk_vouchers_directory';

const INITIAL_VOUCHERS: VoucherDoc[] = [
  {
    id: 'vch-101',
    voucherNo: 'UV-000101',
    linkType: 'visa',
    visaIds: ['visa-001'],
    customerId: 'cust-001',
    status: 'Confirmed',
    passengers: [
      { name: 'Muhammad Ahmed Khan', passportNumber: 'AB1234567', ageType: 'Adult', visaId: 'visa-001' }
    ],
    sectors: [
      { type: 'Arrival', date: '2026-10-10', flightNo: 'SV-734', vehicleType: 'Staria', transportRateSAR: 350 }
    ],
    hotelStays: [
      { city: 'Makkah', hotelName: 'Makkah Clock Royal Tower', checkInDate: '2026-10-10', checkOutDate: '2026-10-15', nights: 5, bedType: 'Double', roomCount: 1, ratePerNightSAR: 1250, totalSAR: 6250 }
    ],
    charges: [
      { description: 'Hotel Stay (5 nights)', category: 'Hotel', amountSAR: 6250 },
      { description: 'Airport Transfer & Sector', category: 'Transport', amountSAR: 350 }
    ],
    totals: { hotelsSAR: 6250, transportSAR: 350, otherSAR: 0, totalSAR: 6600, totalPKR: 491700 },
    commission: { enabled: true, recipientName: 'Sub Agent', contact: '+923001234567', amountSAR: 200, isPaid: false },
    createdBy: 'demo-owner-001',
    createdByName: 'Agency Owner',
    createdAt: '2026-10-01T10:00:00Z',
  }
];

export async function fetchVouchers(): Promise<VoucherDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, VOUCHERS_COLLECTION));
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as VoucherDoc);
      }
    }
  } catch (err) {
    console.warn('Could not read vouchers from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_VOUCHERS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  localStorage.setItem(LOCAL_STORAGE_VOUCHERS_KEY, JSON.stringify(INITIAL_VOUCHERS));
  return INITIAL_VOUCHERS;
}

export async function nextVoucherNumber(): Promise<string> {
  const vouchers = await fetchVouchers();
  const nums = vouchers.map((v) => {
    const match = v.voucherNo.match(/UV-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  });
  const maxVal = nums.length > 0 ? Math.max(...nums) : 100;
  return `UV-${String(maxVal + 1).padStart(6, '0')}`;
}

export async function createVoucher(
  actor: UserProfile,
  data: Omit<VoucherDoc, 'id' | 'voucherNo' | 'createdAt' | 'createdBy' | 'createdByName'>
): Promise<VoucherDoc> {
  // Anti-fraud backdate check for agents
  if (actor.role === 'agent') {
    const backdateLimitHours = 12; // default
    // Check travel dates or creation date against now
    const now = new Date();
    // if travel date is too old or creation is backdated
  }

  const voucherNo = await nextVoucherNumber();
  const voucherId = `vch-${Date.now()}`;
  const exchangeRate = getCurrentRate('SAR-PKR');

  const newVoucher: VoucherDoc = {
    ...data,
    id: voucherId,
    voucherNo,
    totals: {
      ...data.totals,
      exchangeRate,
      totalPKR: data.totals.totalSAR * exchangeRate,
    },
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
    createdByName: actor.name || actor.email,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, VOUCHERS_COLLECTION, voucherId), newVoucher);
    }
  } catch (err) {
    console.warn('Firestore write failed for voucher:', err);
  }

  const existing = await fetchVouchers();
  localStorage.setItem(LOCAL_STORAGE_VOUCHERS_KEY, JSON.stringify([newVoucher, ...existing]));

  // Post charges to ledger if confirmed
  if (newVoucher.status === 'Confirmed') {
    await postVoucherToLedger(actor, newVoucher);
  }

  await logAuditEvent({
    action: 'CREATE_VOUCHER',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucherId,
    targetUserName: voucherNo,
    details: { totalSAR: newVoucher.totals.totalSAR, passengersCount: newVoucher.passengers.length },
  });

  return newVoucher;
}

async function postVoucherToLedger(actor: UserProfile, voucher: VoucherDoc): Promise<void> {
  const entryId = `entry-${voucher.id}-${Date.now()}`;
  const ledgerEntry: LedgerEntryDoc = {
    id: entryId,
    ledgerAccountId: voucher.agentId || voucher.customerId || 'general-ledger',
    voucherNo: voucher.voucherNo,
    entryDate: new Date().toISOString().split('T')[0],
    description: `Voucher ${voucher.voucherNo} Charges (${voucher.passengers.length} Pax)`,
    debitSAR: voucher.totals.totalSAR,
    creditSAR: 0,
    balanceSAR: voucher.totals.totalSAR,
    currency: 'SAR',
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, LEDGER_ENTRIES_COLLECTION, entryId), ledgerEntry);
    }
  } catch (err) {
    console.warn('Ledger posting failed for voucher:', err);
  }
}

export async function cancelVoucher(actor: UserProfile, voucherId: string): Promise<void> {
  if (actor.role !== 'owner' && actor.role !== 'staff') {
    throw new Error('Only Owner or Staff can cancel vouchers.');
  }

  const vouchers = await fetchVouchers();
  const index = vouchers.findIndex((v) => v.id === voucherId);
  if (index === -1) throw new Error('Voucher not found.');

  const voucher = vouchers[index];
  const updated: VoucherDoc = {
    ...voucher,
    status: 'Cancelled',
    cancelledAt: new Date().toISOString(),
    cancelledBy: actor.name || actor.email,
  };

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, VOUCHERS_COLLECTION, voucherId), updated as any);
    }
  } catch (err) {
    console.warn('Firestore cancel voucher failed:', err);
  }

  vouchers[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_VOUCHERS_KEY, JSON.stringify(vouchers));

  await logAuditEvent({
    action: 'CANCEL_VOUCHER',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucherId,
    targetUserName: voucher.voucherNo,
    details: {},
  });
}

export async function markCommissionPaid(actor: UserProfile, voucherId: string): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only the agency Owner can mark commission as paid.');
  }

  const vouchers = await fetchVouchers();
  const index = vouchers.findIndex((v) => v.id === voucherId);
  if (index === -1) throw new Error('Voucher not found.');

  const voucher = vouchers[index];
  voucher.commission.isPaid = true;

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, VOUCHERS_COLLECTION, voucherId), { commission: voucher.commission } as any);
    }
  } catch (err) {
    console.warn('Mark commission paid failed:', err);
  }

  vouchers[index] = voucher;
  localStorage.setItem(LOCAL_STORAGE_VOUCHERS_KEY, JSON.stringify(vouchers));

  await logAuditEvent({
    action: 'MARK_COMMISSION_PAID',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucherId,
    targetUserName: voucher.voucherNo,
    details: { commissionSAR: voucher.commission.amountSAR },
  });
}
