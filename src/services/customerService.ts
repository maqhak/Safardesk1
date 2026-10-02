import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { CustomerDoc } from '../types/customer';
import { LedgerAccountDoc } from '../types/agent';
import { UserProfile } from '../types/auth';
import { logAuditEvent } from './userService';

const CUSTOMERS_COLLECTION = 'customers';
const LEDGER_ACCOUNTS_COLLECTION = 'ledgerAccounts';
const LOCAL_STORAGE_CUSTOMERS_KEY = 'safardesk_customers_directory';

const INITIAL_CUSTOMERS: CustomerDoc[] = [
  {
    id: 'cust-001',
    fullName: 'Muhammad Ahmed Khan',
    passportNumber: 'AB1234567',
    nationality: 'Pakistani',
    gender: 'Male',
    dateOfBirth: '1985-06-12',
    cnic: '42101-9876543-1',
    mobile: '+92 300 1234567',
    email: 'ahmed.khan@gmail.com',
    city: 'Karachi',
    address: 'DHA Phase 6, Karachi',
    channel: 'direct',
    notes: 'Direct B2C walk-in pilgrim for Umrah deluxe package.',
    createdFrom: 'manual',
    createdAt: '2026-02-01T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'cust-002',
    fullName: 'Fatima Bibi',
    passportNumber: 'CD7654321',
    nationality: 'Pakistani',
    gender: 'Female',
    dateOfBirth: '1990-11-20',
    mobile: '+92 321 7654321',
    city: 'Lahore',
    channel: 'agent',
    agentId: 'agt-001',
    notes: 'Referred by Al-Noor Travels sub-agent.',
    createdFrom: 'import',
    createdAt: '2026-02-05T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
];

export async function fetchCustomers(): Promise<CustomerDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, CUSTOMERS_COLLECTION));
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as CustomerDoc);
      }
    }
  } catch (err) {
    console.warn('Could not read customers from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_CUSTOMERS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  localStorage.setItem(LOCAL_STORAGE_CUSTOMERS_KEY, JSON.stringify(INITIAL_CUSTOMERS));
  return INITIAL_CUSTOMERS;
}

export async function createCustomer(
  actor: UserProfile,
  data: Omit<CustomerDoc, 'id' | 'createdAt' | 'createdBy'>
): Promise<CustomerDoc> {
  const cleanPassport = data.passportNumber.trim().toUpperCase();
  if (!cleanPassport) {
    throw new Error('Passport number is required.');
  }

  const existing = await fetchCustomers();
  const dup = existing.find((c) => c.passportNumber.toUpperCase() === cleanPassport);
  if (dup) {
    throw new Error(`Customer with passport number "${cleanPassport}" already exists (Client: ${dup.fullName}).`);
  }

  const customerId = `cust-${Date.now()}`;
  const newCustomer: CustomerDoc = {
    ...data,
    passportNumber: cleanPassport,
    id: customerId,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  // If direct B2C customer, auto-create customer ledger account
  let ledgerDoc: LedgerAccountDoc | null = null;
  if (data.channel === 'direct') {
    ledgerDoc = {
      id: `ledger-cust-${customerId}`,
      accountType: 'customer',
      linkedAgentId: customerId,
      agentCode: `CUST-${customerId.slice(-5)}`,
      accountName: data.fullName,
      openingBalance: 0,
      currentBalanceSAR: 0,
      currency: 'SAR',
      createdAt: new Date().toISOString(),
      createdBy: actor.uid,
    };
  }

  try {
    if (!isConfigPlaceholder) {
      const writes = [setDoc(doc(db, CUSTOMERS_COLLECTION, customerId), newCustomer)];
      if (ledgerDoc) {
        writes.push(setDoc(doc(db, LEDGER_ACCOUNTS_COLLECTION, ledgerDoc.id), ledgerDoc));
      }
      await Promise.all(writes);
    }
  } catch (err) {
    console.warn('Firestore write failed for customer:', err);
  }

  const updatedList = [newCustomer, ...existing];
  localStorage.setItem(LOCAL_STORAGE_CUSTOMERS_KEY, JSON.stringify(updatedList));

  await logAuditEvent({
    action: 'CREATE_CUSTOMER',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: customerId,
    targetUserName: data.fullName,
    details: { passportNumber: cleanPassport, channel: data.channel },
  });

  return newCustomer;
}

export async function updateCustomer(
  actor: UserProfile,
  customerId: string,
  updateData: Partial<CustomerDoc>
): Promise<CustomerDoc> {
  const existing = await fetchCustomers();
  const index = existing.findIndex((c) => c.id === customerId);
  if (index === -1) throw new Error('Customer not found.');

  const updated: CustomerDoc = {
    ...existing[index],
    ...updateData,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, CUSTOMERS_COLLECTION, customerId), updated as any);
    }
  } catch (err) {
    console.warn('Firestore update customer failed:', err);
  }

  existing[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_CUSTOMERS_KEY, JSON.stringify(existing));

  await logAuditEvent({
    action: 'UPDATE_CUSTOMER',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: customerId,
    targetUserName: updated.fullName,
    details: updateData,
  });

  return updated;
}

export async function mergeCustomers(
  actor: UserProfile,
  survivorId: string,
  duplicateId: string
): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Only the agency Owner can merge duplicate customer profiles.');
  }

  const existing = await fetchCustomers();
  const survivor = existing.find((c) => c.id === survivorId);
  const duplicate = existing.find((c) => c.id === duplicateId);

  if (!survivor || !duplicate) throw new Error('Customer profiles not found for merging.');

  try {
    if (!isConfigPlaceholder) {
      await deleteDoc(doc(db, CUSTOMERS_COLLECTION, duplicateId));
    }
  } catch (err) {
    console.warn('Firestore delete duplicate customer failed:', err);
  }

  const filtered = existing.filter((c) => c.id !== duplicateId);
  localStorage.setItem(LOCAL_STORAGE_CUSTOMERS_KEY, JSON.stringify(filtered));

  await logAuditEvent({
    action: 'MERGE_CUSTOMERS',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: survivorId,
    targetUserName: survivor.fullName,
    details: { mergedDuplicateId: duplicateId, duplicateName: duplicate.fullName, duplicatePassport: duplicate.passportNumber },
  });
}
