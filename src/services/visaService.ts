import { collection, getDocs, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { logAuditEvent } from './userService';
import { UserProfile } from '../types/auth';

const VISAS_COLLECTION = 'visas';
const VISA_IMPORTS_COLLECTION = 'visa_imports';
const LOCAL_STORAGE_VISAS_KEY = 'safardesk_visas_directory';
const LOCAL_STORAGE_VISA_IMPORTS_KEY = 'safardesk_visa_imports_v1';
const VISA_REQUESTS_COLLECTION = 'visaRequests';
const LOCAL_STORAGE_VISA_REQUESTS_KEY = 'safardesk_visa_requests_v1';

/** Fix #24: agent-submitted pilgrim visa applications (real records, not a toast). */
export interface VisaRequestDoc {
  id: string;
  agentId: string;
  agentName: string;
  pilgrimName: string;
  passportNumber: string;
  status: 'Submitted' | 'Approved' | 'Rejected';
  createdAt: string;
  createdBy: string;
}

export async function fetchVisaRequests(): Promise<VisaRequestDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, VISA_REQUESTS_COLLECTION));
      return snap.docs.map((d) => d.data() as VisaRequestDoc);
    }
  } catch (err) {
    console.warn('Could not read visa requests from Firestore:', err);
  }
  const stored = localStorage.getItem(LOCAL_STORAGE_VISA_REQUESTS_KEY);
  if (stored) {
    try { return JSON.parse(stored); } catch { /* fallback */ }
  }
  return [];
}

export async function submitVisaRequest(
  actor: UserProfile,
  data: { agentId: string; agentName: string; pilgrimName: string; passportNumber: string }
): Promise<VisaRequestDoc> {
  const req: VisaRequestDoc = {
    id: `vreq-${Date.now()}`,
    agentId: data.agentId,
    agentName: data.agentName,
    pilgrimName: data.pilgrimName.trim(),
    passportNumber: data.passportNumber.trim().toUpperCase(),
    status: 'Submitted',
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, VISA_REQUESTS_COLLECTION, req.id), req);
    }
  } catch (err) {
    console.warn('Could not sync visa request to Firestore:', err);
  }
  const existing = await fetchVisaRequests();
  localStorage.setItem(LOCAL_STORAGE_VISA_REQUESTS_KEY, JSON.stringify([req, ...existing]));
  await logAuditEvent({
    action: 'SUBMIT_VISA_REQUEST',
    userId: actor.uid,
    userName: actor.name || 'User',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: req.id,
    targetUserName: req.pilgrimName,
    details: { passportNumber: req.passportNumber, agentId: req.agentId },
  });
  return req;
}

export interface VisaDoc {
  id: string;
  pilgrimName: string;
  passportNumber: string;
  nationality: string;
  groupCode: string;
  groupName?: string;
  gender?: string;
  age?: number | string;
  visaIssueDate?: string;
  dateSource?: 'original' | 'auto';
  agentId?: string;
  status: 'Distributed' | 'Pending' | 'Approved';
  vendorId?: string; // Vendor company the visa was bought from
  shirkaId?: string; // Sub-Shirka (empty = vendor company itself)
  shirkaName?: string; // Denormalized Shirka display name
  createdAt: string;
  isDuplicate?: boolean;
  skipImport?: boolean;
}

export interface VisaImportBatchDoc {
  id: string;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
  totalRows: number;
  importedRows: number;
  skippedDuplicates: number;
  vendorId?: string;
  shirkaId?: string;
  shirkaName?: string;
}

const INITIAL_VISAS: VisaDoc[] = [
  {
    id: 'visa-001',
    pilgrimName: 'Muhammad Ahmed Khan',
    passportNumber: 'AB1234567',
    nationality: 'Pakistani',
    groupCode: 'GRP-2026-01',
    groupName: 'Al-Haramain Group 01',
    gender: 'Male',
    age: 42,
    visaIssueDate: '2026-02-01',
    dateSource: 'original',
    status: 'Distributed',
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'visa-002',
    pilgrimName: 'Fatima Bibi',
    passportNumber: 'CD7654321',
    nationality: 'Pakistani',
    groupCode: 'GRP-2026-01',
    groupName: 'Al-Haramain Group 01',
    gender: 'Female',
    age: 39,
    visaIssueDate: '2026-02-02',
    dateSource: 'original',
    agentId: 'agt-001',
    status: 'Distributed',
    createdAt: '2026-02-05T00:00:00Z',
  },
];

export async function fetchVisas(): Promise<VisaDoc[]> {
  let firestoreVisas: VisaDoc[] = [];
  let firestoreOk = false;

  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, VISAS_COLLECTION));
      firestoreVisas = snap.docs.map((d) => d.data() as VisaDoc);
      firestoreOk = true;
    }
  } catch (err) {
    console.warn('Could not read visas from Firestore:', err);
  }

  // Merge with localStorage (in case Firestore writes failed silently)
  let localVisas: VisaDoc[] = [];
  const stored = localStorage.getItem(LOCAL_STORAGE_VISAS_KEY);
  if (stored) {
    try {
      localVisas = JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  if (!firestoreOk) {
    return localVisas;
  }

  // Dedupe: Firestore wins, local-only records appended
  const seen = new Set(firestoreVisas.map((v) => v.id));
  const localOnly = localVisas.filter((v) => !seen.has(v.id));
  return [...firestoreVisas, ...localOnly];
}

export async function saveVisasBatch(newVisas: VisaDoc[]): Promise<void> {
  const existing = await fetchVisas();
  const combined = [...newVisas, ...existing];
  localStorage.setItem(LOCAL_STORAGE_VISAS_KEY, JSON.stringify(combined));

  if (!isConfigPlaceholder) {
    try {
      await Promise.all(newVisas.map((v) => setDoc(doc(db, VISAS_COLLECTION, v.id), v)));
    } catch (err: any) {
      console.warn('Could not save visa batch to Firestore:', err);
      // Surface Firestore errors so the user knows data may not be synced
      throw new Error(`Saved locally, but Firestore sync failed: ${err?.message || err}. Check your connection and Firestore rules.`);
    }
  }
}

export async function saveVisaImportBatch(batch: VisaImportBatchDoc): Promise<void> {
  const stored = localStorage.getItem(LOCAL_STORAGE_VISA_IMPORTS_KEY);
  const existing: VisaImportBatchDoc[] = stored ? JSON.parse(stored) : [];
  localStorage.setItem(LOCAL_STORAGE_VISA_IMPORTS_KEY, JSON.stringify([batch, ...existing]));

  if (!isConfigPlaceholder) {
    try {
      await setDoc(doc(db, VISA_IMPORTS_COLLECTION, batch.id), batch);
    } catch (err) {
      console.warn('Could not save visa import batch to Firestore:', err);
    }
  }
}

/** Delete undistributed visas by their IDs (e.g. leftover stock after distribution). */
export async function deleteVisasBatch(visaIds: string[]): Promise<void> {
  if (visaIds.length === 0) return;

  // Update localStorage
  const stored = localStorage.getItem(LOCAL_STORAGE_VISAS_KEY);
  if (stored) {
    try {
      const existing: VisaDoc[] = JSON.parse(stored);
      const remaining = existing.filter((v) => !visaIds.includes(v.id));
      localStorage.setItem(LOCAL_STORAGE_VISAS_KEY, JSON.stringify(remaining));
    } catch {
      // fallback
    }
  }

  // Delete from Firestore
  if (!isConfigPlaceholder) {
    try {
      await Promise.all(visaIds.map((id) => deleteDoc(doc(db, VISAS_COLLECTION, id))));
    } catch (err) {
      console.warn('Could not delete visas from Firestore:', err);
      throw err;
    }
  }
}
