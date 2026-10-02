import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db, isConfigPlaceholder } from './firebase';

const VISAS_COLLECTION = 'visas';
const LOCAL_STORAGE_VISAS_KEY = 'safardesk_visas_directory';

export interface VisaDoc {
  id: string;
  pilgrimName: string;
  passportNumber: string;
  nationality: string;
  groupCode: string;
  agentId?: string;
  status: 'Distributed' | 'Pending' | 'Approved';
  createdAt: string;
}

const INITIAL_VISAS: VisaDoc[] = [
  {
    id: 'visa-001',
    pilgrimName: 'Muhammad Ahmed Khan',
    passportNumber: 'AB1234567',
    nationality: 'Pakistani',
    groupCode: 'GRP-2026-01',
    status: 'Distributed',
    createdAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'visa-002',
    pilgrimName: 'Fatima Bibi',
    passportNumber: 'CD7654321',
    nationality: 'Pakistani',
    groupCode: 'GRP-2026-01',
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
