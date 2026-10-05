import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where 
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { db, isConfigPlaceholder } from './firebase';
import { firebaseConfig, TENANT } from '../config';
import { AgentDoc, LedgerAccountDoc, AgentBalanceInfo } from '../types/agent';
import { UserProfile, UserDoc } from '../types/auth';
import { logAuditEvent, fetchAllUsers } from './userService';

const AGENTS_COLLECTION = 'agents';
const LEDGER_ACCOUNTS_COLLECTION = 'ledgerAccounts';
const USERS_COLLECTION = 'users';

const LOCAL_STORAGE_AGENTS_KEY = 'safardesk_agents_directory';
const LOCAL_STORAGE_LEDGERS_KEY = 'safardesk_ledger_accounts_directory';

/**
 * Seeded initial agents for development / preview testing
 */
const INITIAL_AGENTS: AgentDoc[] = [
  {
    id: 'agent-001',
    agentCode: 'AGT-001',
    companyName: 'Al-Barakah Travel & Tours Karachi',
    contactPerson: 'Hamza Siddiqui',
    mobile: '+92 300 1234567',
    city: 'Karachi',
    email: 'agent.karachi@albarakah-travel.pk',
    dueLimitSAR: 50000,
    exchangeRatePKRRate: 74.50,
    notes: 'Premium Umrah B2B distributor in Sindh region. Bi-weekly settlement via Al-Rajhi.',
    isActive: true,
    userId: 'demo-agent-001',
    createdAt: '2026-03-10T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'agent-002',
    agentCode: 'AGT-002',
    companyName: 'Falcon International Travels Lahore',
    contactPerson: 'Naveed Butt',
    mobile: '+92 321 9876543',
    city: 'Lahore',
    email: 'agent.lahore@falcon-travels.pk',
    dueLimitSAR: 75000,
    exchangeRatePKRRate: 75.00,
    notes: 'High volume Umrah and group flight ticketing partner in Punjab.',
    isActive: true,
    userId: 'demo-agent-002',
    createdAt: '2026-04-05T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'agent-003',
    agentCode: 'AGT-003',
    companyName: 'Makkah Direct Rawalpindi',
    contactPerson: 'Irfan Abbasi',
    mobile: '+92 333 4567890',
    city: 'Rawalpindi',
    email: 'agent.rwp@makkahdirect.pk',
    dueLimitSAR: 30000,
    exchangeRatePKRRate: 74.20,
    notes: 'Northern region Umrah group coordinator. Currently near credit ceiling.',
    isActive: true,
    userId: 'demo-agent-003',
    createdAt: '2026-05-12T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
];

/**
 * Seeded initial ledger accounts
 */
const INITIAL_LEDGER_ACCOUNTS: LedgerAccountDoc[] = [
  {
    id: 'ledger-agt-001',
    accountType: 'agent',
    linkedAgentId: 'agent-001',
    agentCode: 'AGT-001',
    accountName: 'Al-Barakah Travel & Tours Karachi',
    openingBalance: 0,
    currentBalanceSAR: 14250, // Active receivable
    currency: 'SAR',
    createdAt: '2026-03-10T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'ledger-agt-002',
    accountType: 'agent',
    linkedAgentId: 'agent-002',
    agentCode: 'AGT-002',
    accountName: 'Falcon International Travels Lahore',
    openingBalance: 0,
    currentBalanceSAR: 84200, // OVER LIMIT (84,200 > 75,000)
    currency: 'SAR',
    createdAt: '2026-04-05T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
  {
    id: 'ledger-agt-003',
    accountType: 'agent',
    linkedAgentId: 'agent-003',
    agentCode: 'AGT-003',
    accountName: 'Makkah Direct Rawalpindi',
    openingBalance: 0,
    currentBalanceSAR: 28900, // Within 30,000
    currency: 'SAR',
    createdAt: '2026-05-12T00:00:00Z',
    createdBy: 'demo-owner-001',
  },
];

/**
 * Get all ledger accounts
 */
export async function fetchLedgerAccounts(): Promise<LedgerAccountDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, LEDGER_ACCOUNTS_COLLECTION));
      return snap.docs.map((d) => d.data() as LedgerAccountDoc);
    }
  } catch (err) {
    console.warn('Could not read ledger accounts from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_LEDGERS_KEY);
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
 * Get all agents
 */
export async function fetchAgents(): Promise<AgentDoc[]> {
  try {
    if (!isConfigPlaceholder) {
      const snap = await getDocs(collection(db, AGENTS_COLLECTION));
      return snap.docs.map((d) => d.data() as AgentDoc);
    }
  } catch (err) {
    console.warn('Could not read agents from Firestore:', err);
  }

  const stored = localStorage.getItem(LOCAL_STORAGE_AGENTS_KEY);
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
 * Auto-generate next agent code, e.g. "AGT-001", "AGT-004"
 */
export async function generateNextAgentCode(): Promise<string> {
  const agents = await fetchAgents();
  const codes = agents
    .map((a) => {
      const match = a.agentCode.match(/AGT-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));

  const maxVal = codes.length > 0 ? Math.max(...codes) : 0;
  const nextVal = maxVal + 1;
  return `AGT-${String(nextVal).padStart(3, '0')}`;
}

/**
 * Helper to calculate agent balance in SAR and PKR, and check due-limit
 */
export async function getAgentBalance(agentId: string): Promise<AgentBalanceInfo> {
  const [agents, ledgers] = await Promise.all([fetchAgents(), fetchLedgerAccounts()]);
  const agent = agents.find((a) => a.id === agentId);
  const ledger = ledgers.find((l) => l.linkedAgentId === agentId);

  const balanceSAR = ledger ? ledger.currentBalanceSAR : 0;
  const rate = agent ? agent.exchangeRatePKRRate || TENANT.currency.defaultExchangeRate : TENANT.currency.defaultExchangeRate;
  const dueLimitSAR = agent ? agent.dueLimitSAR : 0;
  const balancePKR = balanceSAR * rate;

  const isOverLimit = balanceSAR > dueLimitSAR;
  const overLimitAmountSAR = isOverLimit ? balanceSAR - dueLimitSAR : 0;

  return {
    agentId,
    agentCode: agent?.agentCode || '',
    companyName: agent?.companyName || 'Unknown Agent',
    balanceSAR,
    balancePKR,
    dueLimitSAR,
    exchangeRatePKRRate: rate,
    isOverLimit,
    overLimitAmountSAR,
  };
}

/**
 * Add Agent Unified Flow (Owner only):
 * 1. Creates Firebase Auth user
 * 2. Creates `users` doc with role "agent" linked to new agentId
 * 3. Creates `agents` doc
 * 4. Auto-creates `ledgerAccounts` doc with opening balance 0
 * 5. Writes to auditLog
 */
export async function createAgentWithCredentials(
  actor: UserProfile,
  data: {
    companyName: string;
    contactPerson: string;
    mobile: string;
    city: string;
    email: string;
    dueLimitSAR: number;
    exchangeRatePKRRate: number;
    loginPassword: string;
    notes?: string;
  }
): Promise<{ agent: AgentDoc; userUid: string }> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the agency Owner can register new B2B agents.');
  }

  const normalizedEmail = data.email.trim().toLowerCase();
  const existingAgents = await fetchAgents();

  if (existingAgents.some((a) => a.email.toLowerCase() === normalizedEmail)) {
    throw new Error(`An agent account with email "${data.email}" is already registered.`);
  }

  const agentCode = await generateNextAgentCode();
  const agentId = `agent-${Date.now()}`;
  let userUid = `user-${agentId}`;

  // 1. Create Firebase Auth user using secondary app instance so Owner remains signed in
  if (!isConfigPlaceholder) {
    let secondaryApp;
    try {
      const appName = `secondary-auth-agent-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);
      const cred = await createUserWithEmailAndPassword(
        secondaryAuth,
        normalizedEmail,
        data.loginPassword
      );
      userUid = cred.user.uid;
      await secondarySignOut(secondaryAuth);
    } catch (authErr: any) {
      console.warn('Firebase Auth user creation warning:', authErr);
      if (authErr?.code === 'auth/email-already-in-use') {
        throw new Error('This email address is already in use by another user account.');
      }
    } finally {
      if (secondaryApp) {
        try {
          await deleteApp(secondaryApp);
        } catch {
          // ignore
        }
      }
    }
  }

  // 2. Create users doc (role: 'agent')
  const userDocData: UserDoc = {
    uid: userUid,
    name: data.contactPerson.trim(),
    email: normalizedEmail,
    role: 'agent',
    agentId: agentId,
    agencyName: data.companyName.trim(),
    isActive: true,
    phone: data.mobile,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
    lastLoginAt: '',
  };

  // 3. Create agents doc
  const agentDocData: AgentDoc = {
    id: agentId,
    agentCode,
    companyName: data.companyName.trim(),
    contactPerson: data.contactPerson.trim(),
    mobile: data.mobile.trim(),
    city: data.city.trim(),
    email: normalizedEmail,
    dueLimitSAR: Number(data.dueLimitSAR) || 0,
    exchangeRatePKRRate: Number(data.exchangeRatePKRRate) || TENANT.currency.defaultExchangeRate,
    notes: data.notes?.trim() || '',
    isActive: true,
    userId: userUid,
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  // 4. Auto-create agent's ledger account doc in ledgerAccounts
  const ledgerDocData: LedgerAccountDoc = {
    id: `ledger-${agentId}`,
    accountType: 'agent',
    linkedAgentId: agentId,
    agentCode,
    accountName: data.companyName.trim(),
    openingBalance: 0,
    currentBalanceSAR: 0,
    currency: 'SAR',
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  // Write to Firestore
  try {
    if (!isConfigPlaceholder) {
      await Promise.all([
        setDoc(doc(db, USERS_COLLECTION, userUid), userDocData),
        setDoc(doc(db, AGENTS_COLLECTION, agentId), agentDocData),
        setDoc(doc(db, LEDGER_ACCOUNTS_COLLECTION, ledgerDocData.id), ledgerDocData),
      ]);
    }
  } catch (err) {
    console.warn('Firestore write failed for agent registration:', err);
  }

  // Update local storage caches
  const updatedAgents = [agentDocData, ...existingAgents];
  localStorage.setItem(LOCAL_STORAGE_AGENTS_KEY, JSON.stringify(updatedAgents));

  const existingLedgers = await fetchLedgerAccounts();
  const updatedLedgers = [ledgerDocData, ...existingLedgers];
  localStorage.setItem(LOCAL_STORAGE_LEDGERS_KEY, JSON.stringify(updatedLedgers));

  const existingUsers = await fetchAllUsers();
  const updatedUsers = [userDocData, ...existingUsers];
  localStorage.setItem('safardesk_users_directory', JSON.stringify(updatedUsers));

  // 5. Write to auditLog
  await logAuditEvent({
    action: 'CREATE_AGENT',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: userUid,
    targetUserName: data.companyName,
    details: {
      agentCode,
      dueLimitSAR: data.dueLimitSAR,
      exchangeRatePKRRate: data.exchangeRatePKRRate,
      city: data.city,
    },
  });

  return { agent: agentDocData, userUid };
}

/**
 * Edit Agent (Owner only)
 */
export async function updateAgent(
  actor: UserProfile,
  agentId: string,
  updateData: Partial<AgentDoc>
): Promise<AgentDoc> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the agency Owner can modify agent settings.');
  }

  const agents = await fetchAgents();
  const index = agents.findIndex((a) => a.id === agentId);
  if (index === -1) {
    throw new Error('Agent record not found.');
  }

  const current = agents[index];
  const updated: AgentDoc = {
    ...current,
    ...updateData,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.uid,
  };

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, AGENTS_COLLECTION, agentId), { ...updated } as any);

      // If companyName or contact changed, sync linked ledger and users
      if (updateData.companyName && current.userId) {
        await updateDoc(doc(db, USERS_COLLECTION, current.userId), {
          agencyName: updateData.companyName,
          name: updateData.contactPerson || current.contactPerson,
        });
      }
    }
  } catch (err) {
    console.warn('Firestore update failed for agent:', err);
  }

  agents[index] = updated;
  localStorage.setItem(LOCAL_STORAGE_AGENTS_KEY, JSON.stringify(agents));

  await logAuditEvent({
    action: 'UPDATE_AGENT',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: current.userId,
    targetUserName: current.companyName,
    details: {
      before: current,
      after: updated,
    },
  });

  return updated;
}

/**
 * Activate / Deactivate Agent (Owner only)
 */
export async function toggleAgentStatus(
  actor: UserProfile,
  agentId: string,
  newActiveState: boolean
): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the Owner can alter agent status.');
  }

  const agents = await fetchAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error('Agent not found.');
  }

  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, AGENTS_COLLECTION, agentId), {
        isActive: newActiveState,
        updatedAt: new Date().toISOString(),
      });

      if (agent.userId) {
        await updateDoc(doc(db, USERS_COLLECTION, agent.userId), {
          isActive: newActiveState,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn('Firestore toggle agent status failed:', err);
  }

  const updatedAgents = agents.map((a) =>
    a.id === agentId ? { ...a, isActive: newActiveState } : a
  );
  localStorage.setItem(LOCAL_STORAGE_AGENTS_KEY, JSON.stringify(updatedAgents));

  await logAuditEvent({
    action: newActiveState ? 'AGENT_ACTIVATED' : 'AGENT_DEACTIVATED',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: agent.userId,
    targetUserName: agent.companyName,
    details: {
      agentCode: agent.agentCode,
      newState: newActiveState,
    },
  });
}

/**
 * Reset Agent login password (Owner only)
 */
export async function resetAgentPasswordByOwner(
  actor: UserProfile,
  agentId: string
): Promise<string> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the Owner can reset agent credentials.');
  }

  const agents = await fetchAgents();
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) {
    throw new Error('Agent not found.');
  }

  // Generate clean temporary password
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let tempPass = 'Safar@Agent-';
  for (let i = 0; i < 4; i++) {
    tempPass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  tempPass += Math.floor(Math.random() * 90 + 10);

  try {
    if (!isConfigPlaceholder && agent.userId) {
      await updateDoc(doc(db, USERS_COLLECTION, agent.userId), {
        temporaryPasswordIssuedAt: new Date().toISOString(),
        mustChangePasswordOnLogin: true,
      });
    }
  } catch (err) {
    console.warn('Firestore password reset note failed:', err);
  }

  await logAuditEvent({
    action: 'AGENT_PASSWORD_RESET_BY_OWNER',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: agent.userId,
    targetUserName: agent.companyName,
    details: {
      agentCode: agent.agentCode,
      email: agent.email,
    },
  });

  return tempPass;
}
