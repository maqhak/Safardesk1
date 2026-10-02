import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';
import { logAuditEvent } from './userService';
import { UserProfile } from '../types/auth';

const VISAS_COLLECTION = 'visas';
const VISA_IMPORTS_COLLECTION = 'visa_imports';
const LOCAL_STORAGE_VISAS_KEY = 'safardesk_visas_directory';
const LOCAL_STORAGE_VISA_IMPORTS_KEY = 'safardesk_visa_imports_v1';

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
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, VISAS_COLLECTION));
      if (!snap.empty) {
        return snap.docs.map((d) => d.data() as VisaDoc);
      }
    }
  } catch (err) {
    console.warn('Could not read visas from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_VISAS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // fallback
    }
  }

  localStorage.setItem(LOCAL_STORAGE_VISAS_KEY, JSON.stringify(INITIAL_VISAS));
  return INITIAL_VISAS;
}

export async function saveVisasBatch(newVisas: VisaDoc[]): Promise<void> {
  const existing = await fetchVisas();
  const combined = [...newVisas, ...existing];
  localStorage.setItem(LOCAL_STORAGE_VISAS_KEY, JSON.stringify(combined));

  if (!isConfigPlaceholder) {
    try {
      await Promise.all(newVisas.map((v) => setDoc(doc(db, VISAS_COLLECTION, v.id), v)));
    } catch (err) {
      console.warn('Could not save visa batch to Firestore:', err);
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
