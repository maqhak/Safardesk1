import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  getDoc,
  query,
  where
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { VoucherDoc, VoucherEditPayload, VoucherEditRequest } from '../types/voucher';
import { UserProfile } from '../types/auth';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/agent';
import { logAuditEvent } from './userService';
import { getCurrentRate } from './exchangeRateService';
import { fetchCompanyProfile } from './companyService';
import { postBalancedTransaction, fetchLedgerAccounts } from './accountingService';
import { fetchHotels } from './masterService';

const VOUCHERS_COLLECTION = 'vouchers';
const LEDGER_ACCOUNTS_COLLECTION = 'ledgerAccounts';
const LEDGER_ENTRIES_COLLECTION = 'ledgerEntries';
const SETTINGS_COUNTERS_COLLECTION = 'settings';
const LOCAL_STORAGE_VOUCHERS_KEY = 'safardesk_vouchers_directory';
const EDIT_REQUESTS_COLLECTION = 'voucherEditRequests';
const LOCAL_STORAGE_EDIT_REQUESTS_KEY = 'safardesk_voucher_edit_requests';

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
      return snap.docs.map((d) => d.data() as VoucherDoc);
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
  return [];
}

/**
 * Agent-scoped voucher fetch: server-side where('agentId', '==', agentId).
 * The Firestore rules allow agents per-doc reads only when agentId matches,
 * so an unfiltered collection query is rejected — this filtered query is permitted.
 */
export async function fetchVouchersForAgent(agentId: string): Promise<VoucherDoc[]> {
  try {
    if (!isConfigPlaceholder && agentId) {
      const q = query(collection(db, VOUCHERS_COLLECTION), where('agentId', '==', agentId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => d.data() as VoucherDoc);
      return [];
    }
  } catch (err) {
    console.warn('Could not read agent vouchers from Firestore:', err);
  }
  return [];
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
  // Anti-fraud backdate check for agents (settings agentBackdateHours, default 12)
  if (actor.role === 'agent') {
    let backdateLimitHours = 12;
    try {
      const profile = await fetchCompanyProfile();
      if (profile.agentBackdateHours && profile.agentBackdateHours > 0) {
        backdateLimitHours = profile.agentBackdateHours;
      }
    } catch {
      // keep default when settings are unreachable
    }
    const sectorDates = (data.sectors || []).map((s) => s.date).filter(Boolean);
    if (sectorDates.length > 0) {
      const earliestTravel = Math.min(...sectorDates.map((d) => new Date(d).getTime()));
      const cutoff = Date.now() - backdateLimitHours * 3600 * 1000;
      if (earliestTravel < cutoff) {
        throw new Error(
          `Anti-fraud rule: agents cannot create vouchers with a travel date older than ${backdateLimitHours} hours.`
        );
      }
    }
  }

  const voucherNo = await nextVoucherNumber();
  const voucherId = `vch-${Date.now()}`;
  const exchangeRate = getCurrentRate('SAR-PKR');

  // Approval workflow: owner vouchers auto-confirm; staff/agent vouchers
  // need owner approval before ledger posting.
  const initialStatus: VoucherDoc['status'] =
    actor.role === 'owner' ? 'Confirmed' : 'Pending Approval';

  const newVoucher: VoucherDoc = {
    ...data,
    status: initialStatus,
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

export async function postVoucherToLedger(actor: UserProfile, voucher: VoucherDoc): Promise<void> {
  // Fix #18: post SEPARATE balanced charge lines, each tagged with the Voucher No.
  // Fix #15b: empty/zero charge rows never post — skip ledger posting for zero-total vouchers.
  if ((voucher.totals.totalSAR || 0) <= 0) return;

  const [accounts, hotels] = await Promise.all([fetchLedgerAccounts(), fetchHotels()]);
  const findAccount = (linkId?: string | null) =>
    accounts.find((a: any) => a.linkedId === linkId || (a as any).linkedAgentId === linkId);

  // Dr leg: the agent (B2B) or customer (B2C) receivable ledger
  const linked = voucher.agentId || voucher.customerId;
  const receivable = findAccount(linked);
  if (!receivable) {
    throw new Error(
      'Voucher ledger posting failed: no ledger account found for the linked agent/customer. Create it in Masters first.'
    );
  }
  const receivableId = (receivable as any).id;
  const rate = voucher.totals.exchangeRate || getCurrentRate('SAR-PKR');
  const date = new Date().toISOString().split('T')[0];

  // Per hotel charge: Dr Agent/Customer ledger, Cr the hotel's vendor ledger
  for (const stay of voucher.hotelStays || []) {
    const amt = stay.totalSAR || 0;
    if (amt <= 0) continue;
    const hotel = hotels.find((h: any) => h.name === stay.hotelName);
    const vendorAcc = hotel ? findAccount(hotel.vendorId) : undefined;
    if (!vendorAcc) {
      throw new Error(
        `Voucher ledger posting failed: no vendor ledger account found for hotel "${stay.hotelName}".`
      );
    }
    await postBalancedTransaction({
      date,
      entryType: 'Voucher Charge',
      transNo: voucher.voucherNo,
      particulars: `Hotel: ${stay.city} - ${stay.hotelName} (${stay.nights}n, ${stay.bedType} bed)${(stay as any).description ? ` — ${(stay as any).description}` : ''}`,
      voucherNo: voucher.voucherNo,
      rate,
      debitAccountId: receivableId,
      creditAccountId: (vendorAcc as any).id,
      amountSAR: amt,
      hotelPax: voucher.passengers.length,
      createdBy: actor.uid,
    });
  }

  // Transport + other charges: Dr Agent/Customer ledger, Cr Transport Income
  const transportIncome = accounts.find((a: any) => a.id === 'acc-sys-004');
  const postIncomeCredit = async (particulars: string, amt: number) => {
    if (amt <= 0) return;
    if (!transportIncome) {
      throw new Error('Voucher ledger posting failed: Transport Income account (acc-sys-004) not found.');
    }
    await postBalancedTransaction({
      date,
      entryType: 'Voucher Charge',
      transNo: voucher.voucherNo,
      particulars,
      voucherNo: voucher.voucherNo,
      rate,
      debitAccountId: receivableId,
      creditAccountId: (transportIncome as any).id,
      amountSAR: amt,
      createdBy: actor.uid,
    });
  };

  for (const s of voucher.sectors || []) {
    await postIncomeCredit(
      `Transport: ${s.type} sector (${s.isSelfGari ? 'Self Gari' : (s.vehicleType || 'Transport')})${(s as any).vehicleNote ? ` — ${(s as any).vehicleNote}` : ''}`,
      s.transportRateSAR || 0
    );
  }

  const otherSAR = voucher.totals.otherSAR || 0;
  if (otherSAR > 0) {
    await postIncomeCredit('Other voucher charges', otherSAR);
  }
}


/**
 * Owner approves a pending voucher — status becomes Confirmed and
 * charges post to the ledger at approval time (not at creation).
 */
export async function approveVoucher(actor: UserProfile, voucherId: string): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only the Owner can approve vouchers.');
  }
  const vouchers = await fetchVouchers();
  const index = vouchers.findIndex((v) => v.id === voucherId);
  if (index === -1) throw new Error('Voucher not found.');
  const voucher = vouchers[index];
  if (voucher.status !== 'Pending Approval' && voucher.status !== 'Draft') {
    throw new Error('Only pending/draft vouchers can be approved.');
  }
  const updated = {
    ...voucher,
    status: 'Confirmed' as const,
    approvedBy: actor.uid,
    approvedByName: actor.name || actor.email,
    approvedAt: new Date().toISOString(),
  };
  vouchers[index] = updated;
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, VOUCHERS_COLLECTION, voucherId), updated);
    }
  } catch (err) {
    console.warn('Firestore write failed for voucher approval:', err);
  }
  localStorage.setItem(LOCAL_STORAGE_VOUCHERS_KEY, JSON.stringify(vouchers));

  // Post charges to ledger now that the voucher is confirmed
  await postVoucherToLedger(actor, updated);

  await logAuditEvent({
    action: 'VOUCHER_APPROVED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucherId,
    targetUserName: voucher.voucherNo,
    details: { totalSAR: voucher.totals.totalSAR },
  });
}

/**
 * Owner disapproves (sends back) a pending voucher — returns to Draft
 * so the creator can fix and resubmit. Nothing posts to the ledger.
 */
export async function disapproveVoucher(actor: UserProfile, voucherId: string, note?: string): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only the Owner can disapprove vouchers.');
  }
  const vouchers = await fetchVouchers();
  const index = vouchers.findIndex((v) => v.id === voucherId);
  if (index === -1) throw new Error('Voucher not found.');
  const voucher = vouchers[index];
  if (voucher.status !== 'Pending Approval' && voucher.status !== 'Draft') {
    throw new Error('Only pending/draft vouchers can be disapproved.');
  }
  const updated = {
    ...voucher,
    status: 'Draft' as const,
    disapprovedBy: actor.uid,
    disapprovedByName: actor.name || actor.email,
    disapprovedAt: new Date().toISOString(),
    disapprovalNote: note?.trim() || '',
  };
  vouchers[index] = updated;
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, VOUCHERS_COLLECTION, voucherId), updated);
    }
  } catch (err) {
    console.warn('Firestore write failed for voucher disapproval:', err);
  }
  localStorage.setItem(LOCAL_STORAGE_VOUCHERS_KEY, JSON.stringify(vouchers));

  await logAuditEvent({
    action: 'VOUCHER_DISAPPROVED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucherId,
    targetUserName: voucher.voucherNo,
    details: { note: note?.trim() || '' },
  });
}

export async function cancelVoucher(actor: UserProfile, voucherId: string): Promise<void> {
  if (actor.role !== 'owner' && actor.role !== 'staff') {
    throw new Error('Only Owner or Staff can cancel vouchers.');
  }

  const vouchers = await fetchVouchers();
  const index = vouchers.findIndex((v) => v.id === voucherId);
  if (index === -1) throw new Error('Voucher not found.');

  const voucher = vouchers[index];
  if (voucher.status === 'Cancelled') throw new Error('Voucher is already cancelled.');

  // Fix #18: post REVERSING ledger entries (mirror of the original charge lines).
  // History is kept — originals are never edited or deleted.
  const [accounts, hotels] = await Promise.all([fetchLedgerAccounts(), fetchHotels()]);
  const findAccount = (linkId?: string | null) =>
    accounts.find((a: any) => a.linkedId === linkId || (a as any).linkedAgentId === linkId);
  const linked = voucher.agentId || voucher.customerId;
  const receivable = findAccount(linked);
  const rate = voucher.totals.exchangeRate || getCurrentRate('SAR-PKR');
  const date = new Date().toISOString().split('T')[0];
  const transportIncome = accounts.find((a: any) => a.id === 'acc-sys-004');

  const postReversal = async (particulars: string, amt: number, creditAccountId: string) => {
    if (amt <= 0 || !receivable) return;
    await postBalancedTransaction({
      date,
      entryType: 'Voucher Charge',
      transNo: voucher.voucherNo,
      particulars: `REVERSAL (cancel ${voucher.voucherNo}): ${particulars}`,
      voucherNo: voucher.voucherNo,
      rate,
      debitAccountId: creditAccountId, // swapped legs
      creditAccountId: (receivable as any).id, // swapped legs
      amountSAR: amt,
      createdBy: actor.uid,
    });
  };

  for (const stay of voucher.hotelStays || []) {
    const amt = stay.totalSAR || 0;
    if (amt <= 0) continue;
    const hotel = hotels.find((h: any) => h.name === stay.hotelName);
    const vendorAcc = hotel ? findAccount(hotel.vendorId) : undefined;
    if (vendorAcc) {
      await postReversal(
        `Hotel: ${stay.city} - ${stay.hotelName} (${stay.nights}n, ${stay.bedType} bed)`,
        amt,
        (vendorAcc as any).id
      );
    }
  }
  for (const s of voucher.sectors || []) {
    if (transportIncome) {
      await postReversal(
        `Transport: ${s.type} sector (${s.isSelfGari ? 'Self Gari' : (s.vehicleType || 'Transport')})${(s as any).vehicleNote ? ` — ${(s as any).vehicleNote}` : ''}`,
        s.transportRateSAR || 0,
        (transportIncome as any).id
      );
    }
  }
  const otherSAR = voucher.totals.otherSAR || 0;
  if (otherSAR > 0 && transportIncome) {
    await postReversal('Other voucher charges', otherSAR, (transportIncome as any).id);
  }

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

/* ------------------------------------------------------------------ */
/* Voucher edit requests — staff/agent edits need owner approval       */
/* ------------------------------------------------------------------ */

export async function fetchEditRequests(): Promise<VoucherEditRequest[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, EDIT_REQUESTS_COLLECTION));
      return snap.docs.map((d) => d.data() as VoucherEditRequest);
    }
  } catch (err) {
    console.warn('Could not read voucher edit requests from Firestore:', err);
  }
  const stored = localStorage.getItem(LOCAL_STORAGE_EDIT_REQUESTS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }
  return [];
}

async function persistEditRequests(list: VoucherEditRequest[]): Promise<void> {
  localStorage.setItem(LOCAL_STORAGE_EDIT_REQUESTS_KEY, JSON.stringify(list));
}

export async function requestVoucherEdit(
  actor: UserProfile,
  voucher: VoucherDoc,
  payload: VoucherEditPayload,
  reason: string
): Promise<VoucherEditRequest> {
  if (!reason.trim()) throw new Error('Please write a reason for this edit request.');
  const requests = await fetchEditRequests();
  const req: VoucherEditRequest = {
    id: `ver-${Date.now()}`,
    voucherId: voucher.id,
    voucherNo: voucher.voucherNo,
    requestedBy: actor.uid,
    requestedByName: actor.name || actor.email,
    requestedByRole: actor.role,
    requestedAt: new Date().toISOString(),
    reason: reason.trim(),
    status: 'pending',
    newData: payload,
  };
  const next = [req, ...requests];
  await persistEditRequests(next);
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, EDIT_REQUESTS_COLLECTION, req.id), req as any);
    }
  } catch (err) {
    console.warn('Could not save edit request to Firestore:', err);
  }
  await logAuditEvent({
    action: 'VOUCHER_EDIT_REQUESTED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucher.id,
    targetUserName: voucher.voucherNo,
    details: { reason: req.reason },
  });
  return req;
}

/** Post REVERSAL entries for a voucher's current charges (edit flow). History is kept. */
async function reverseVoucherCharges(actor: UserProfile, voucher: VoucherDoc): Promise<void> {
  if ((voucher.totals.totalSAR || 0) <= 0) return;
  const [accounts, hotels] = await Promise.all([fetchLedgerAccounts(), fetchHotels()]);
  const findAccount = (linkId?: string | null) =>
    accounts.find((a: any) => a.linkedId === linkId || (a as any).linkedAgentId === linkId);
  const linked = voucher.agentId || voucher.customerId;
  const receivable = findAccount(linked);
  const rate = voucher.totals.exchangeRate || getCurrentRate('SAR-PKR');
  const date = new Date().toISOString().split('T')[0];
  const transportIncome = accounts.find((a: any) => a.id === 'acc-sys-004');

  const postReversal = async (particulars: string, amt: number, creditAccountId: string) => {
    if (amt <= 0 || !receivable) return;
    await postBalancedTransaction({
      date,
      entryType: 'Voucher Charge',
      transNo: voucher.voucherNo,
      particulars: `REVERSAL (edit ${voucher.voucherNo}): ${particulars}`,
      voucherNo: voucher.voucherNo,
      rate,
      debitAccountId: creditAccountId,
      creditAccountId: (receivable as any).id,
      amountSAR: amt,
      createdBy: actor.uid,
    });
  };

  for (const stay of voucher.hotelStays || []) {
    const amt = stay.totalSAR || 0;
    if (amt <= 0) continue;
    const hotel = hotels.find((h: any) => h.name === stay.hotelName);
    const vendorAcc = hotel ? findAccount(hotel.vendorId) : undefined;
    if (vendorAcc) {
      await postReversal(
        `Hotel: ${stay.city} - ${stay.hotelName} (${stay.nights}n, ${stay.bedType} bed)`,
        amt,
        (vendorAcc as any).id
      );
    }
  }
  for (const s of voucher.sectors || []) {
    if (transportIncome) {
      await postReversal(
        `Transport: ${s.type} sector (${s.isSelfGari ? 'Self Gari' : (s.vehicleType || 'Transport')})${(s as any).vehicleNote ? ` — ${(s as any).vehicleNote}` : ''}`,
        s.transportRateSAR || 0,
        (transportIncome as any).id
      );
    }
  }
  const otherSAR = voucher.totals.otherSAR || 0;
  if (otherSAR > 0 && transportIncome) {
    await postReversal('Other voucher charges', otherSAR, (transportIncome as any).id);
  }
}

async function applyEditPayload(
  actor: UserProfile,
  voucher: VoucherDoc,
  payload: VoucherEditPayload
): Promise<VoucherDoc> {
  // 1) Reverse old charge postings (history kept in ledger)
  await reverseVoucherCharges(actor, voucher);

  // 2) Update the voucher document
  const exchangeRate = getCurrentRate('SAR-PKR');
  const updated: VoucherDoc = {
    ...voucher,
    visaIds: payload.visaIds,
    agentId: payload.agentId,
    shirkaVendorId: payload.shirkaVendorId,
    shirkaId: (payload as any).shirkaId,
    shirkaName: (payload as any).shirkaName,
    passengers: payload.passengers,
    sectors: payload.sectors,
    hotelStays: payload.hotelStays,
    flightDetails: payload.flightDetails,
    charges: payload.charges,
    totals: { ...payload.totals, exchangeRate },
    commission: payload.commission,
    updatedAt: new Date().toISOString(),
  };

  const vouchers = await fetchVouchers();
  const index = vouchers.findIndex((v) => v.id === voucher.id);
  if (index !== -1) vouchers[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_VOUCHERS_KEY, JSON.stringify(vouchers));
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, VOUCHERS_COLLECTION, voucher.id), updated as any);
    }
  } catch (err) {
    console.warn('Could not update edited voucher in Firestore:', err);
  }

  // 3) Post the new charge lines
  await postVoucherToLedger(actor, updated);
  return updated;
}

/** Owner applies an edit directly (no approval needed). */
export async function applyVoucherEditDirect(
  actor: UserProfile,
  voucherId: string,
  payload: VoucherEditPayload
): Promise<VoucherDoc> {
  const vouchers = await fetchVouchers();
  const voucher = vouchers.find((v) => v.id === voucherId);
  if (!voucher) throw new Error('Voucher not found.');
  if (voucher.status === 'Cancelled') throw new Error('Cannot edit a cancelled voucher.');
  const updated = await applyEditPayload(actor, voucher, payload);
  await logAuditEvent({
    action: 'VOUCHER_EDITED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucher.id,
    targetUserName: voucher.voucherNo,
    details: { totalSAR: updated.totals.totalSAR },
  });
  return updated;
}

/** Owner approves a pending edit request — reversals + new postings. */
export async function approveVoucherEdit(
  actor: UserProfile,
  requestId: string,
  note?: string
): Promise<VoucherDoc> {
  const requests = await fetchEditRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Edit request not found.');
  if (req.status !== 'pending') throw new Error('This request is already reviewed.');
  const vouchers = await fetchVouchers();
  const voucher = vouchers.find((v) => v.id === req.voucherId);
  if (!voucher) throw new Error('Voucher not found.');
  if (voucher.status === 'Cancelled') throw new Error('Cannot edit a cancelled voucher.');

  const updated = await applyEditPayload(actor, voucher, req.newData);

  const next = requests.map((r) =>
    r.id === requestId
      ? { ...r, status: 'approved' as const, reviewedBy: actor.uid, reviewedByName: actor.name || actor.email, reviewedAt: new Date().toISOString(), reviewNote: note?.trim() || '' }
      : r
  );
  await persistEditRequests(next);
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, EDIT_REQUESTS_COLLECTION, requestId), next.find((r) => r.id === requestId) as any);
    }
  } catch (err) {
    console.warn('Could not update edit request in Firestore:', err);
  }
  await logAuditEvent({
    action: 'VOUCHER_EDIT_APPROVED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: voucher.id,
    targetUserName: voucher.voucherNo,
    details: { requestedBy: req.requestedByName, note: note?.trim() || '' },
  });
  return updated;
}

/** Owner rejects a pending edit request — voucher stays unchanged. */
export async function rejectVoucherEdit(
  actor: UserProfile,
  requestId: string,
  note?: string
): Promise<void> {
  const requests = await fetchEditRequests();
  const req = requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Edit request not found.');
  if (req.status !== 'pending') throw new Error('This request is already reviewed.');
  const next = requests.map((r) =>
    r.id === requestId
      ? { ...r, status: 'rejected' as const, reviewedBy: actor.uid, reviewedByName: actor.name || actor.email, reviewedAt: new Date().toISOString(), reviewNote: note?.trim() || '' }
      : r
  );
  await persistEditRequests(next);
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, EDIT_REQUESTS_COLLECTION, requestId), next.find((r) => r.id === requestId) as any);
    }
  } catch (err) {
    console.warn('Could not update edit request in Firestore:', err);
  }
  await logAuditEvent({
    action: 'VOUCHER_EDIT_REJECTED',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: req.voucherId,
    targetUserName: req.voucherNo,
    details: { requestedBy: req.requestedByName, note: note?.trim() || '' },
  });
}
