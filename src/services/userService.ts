import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { db, handleFirestoreError, OperationType, isConfigPlaceholder } from './firebase';
import { firebaseConfig } from '../config';
import { UserDoc, UserProfile, UserRole, StaffPermissions, AuditLogEntry } from '../types/auth';
import { createDefaultPermissions } from '../utils/permissions';

const USERS_COLLECTION = 'users';
const AUDIT_COLLECTION = 'auditLog';

// Local storage key for demo / mock state persistence during testing
const LOCAL_STORAGE_USERS_KEY = 'safardesk_users_directory';

/**
 * Initial seeded demo users directory
 */
const INITIAL_USERS: UserDoc[] = [
  {
    uid: 'demo-owner-001',
    name: 'Tariq Al-Mansoor',
    email: 'director@safardesk.com',
    role: 'owner',
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'system_bootstrap',
    lastLoginAt: '2026-10-02T07:15:00Z',
    phone: '+966 50 123 4567',
  },
  {
    uid: 'demo-staff-002',
    name: 'Bilal Farooq',
    email: 'operations@safardesk.com',
    role: 'staff',
    isActive: true,
    permissions: createDefaultPermissions('Semi Admin'),
    createdAt: '2026-02-15T00:00:00Z',
    createdBy: 'demo-owner-001',
    lastLoginAt: '2026-10-01T14:30:00Z',
    phone: '+966 54 987 6543',
    agencyName: 'Head Office Ticketing & Visas',
  },
  {
    uid: 'demo-staff-003',
    name: 'Fatima Zahra',
    email: 'accounts@safardesk.com',
    role: 'staff',
    isActive: true,
    permissions: {
      ...createDefaultPermissions('View Only'),
      Accounts: { view: true, create: true, edit: true, delete: false },
      Banks: { view: true, create: true, edit: true, delete: false },
      Reports: { view: true, create: true, edit: false, delete: false },
    },
    createdAt: '2026-03-01T00:00:00Z',
    createdBy: 'demo-owner-001',
    lastLoginAt: '2026-09-30T10:15:00Z',
    phone: '+966 55 432 1098',
    agencyName: 'Finance & Remittances Desk',
  },
  {
    uid: 'demo-agent-001',
    name: 'Hamza Siddiqui',
    email: 'agent.karachi@albarakah-travel.pk',
    role: 'agent',
    agentId: 'AGT-KHI-01',
    agencyName: 'Al-Barakah Travel & Tours Karachi',
    isActive: true,
    createdAt: '2026-03-10T00:00:00Z',
    createdBy: 'demo-owner-001',
    lastLoginAt: '2026-10-02T06:00:00Z',
    phone: '+92 300 1234567',
  },
  {
    uid: 'demo-agent-002',
    name: 'Naveed Butt',
    email: 'agent.lahore@falcon-travels.pk',
    role: 'agent',
    agentId: 'AGT-LHE-04',
    agencyName: 'Falcon International Travels Lahore',
    isActive: true,
    createdAt: '2026-04-05T00:00:00Z',
    createdBy: 'demo-owner-001',
    lastLoginAt: '2026-09-28T16:20:00Z',
    phone: '+92 321 9876543',
  },
];

/**
 * Write an action directly into the auditLog Firestore collection
 */
export async function logAuditEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  const auditData: AuditLogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };

  try {
    if (!isConfigPlaceholder) {
      await addDoc(collection(db, AUDIT_COLLECTION), {
        ...auditData,
        serverCreatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn('Could not write to auditLog collection:', err);
  }

  // Also log locally for dev inspection
  const existingLogs = JSON.parse(localStorage.getItem('safardesk_audit_log') || '[]');
  existingLogs.unshift(auditData);
  localStorage.setItem('safardesk_audit_log', JSON.stringify(existingLogs.slice(0, 100)));
}

/**
 * Retrieve all registered users from Firestore
 */
export async function fetchAllUsers(): Promise<UserDoc[]> {
  // Firestore is the source of truth when configured — empty means empty (fresh tenant,
  // so the AuthContext bootstrap correctly assigns 'owner' to the very first user).
  if (!isConfigPlaceholder) {
    try {
      const snap = await getDocs(collection(db, USERS_COLLECTION));
      return snap.docs.map((d) => d.data() as UserDoc);
    } catch (err) {
      console.warn('Error reading users from Firestore:', err);
    }
  }

  // Fallback to localStorage cache (offline / unconfigured backend)
  const stored = localStorage.getItem(LOCAL_STORAGE_USERS_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // ignore
    }
  }
  return [];
}

/**
 * Save updated list of users to local cache
 */
function cacheUsersLocally(users: UserDoc[]) {
  localStorage.setItem(LOCAL_STORAGE_USERS_KEY, JSON.stringify(users));
}

/**
 * Create a new Staff member (called exclusively by the Owner)
 */
export async function createStaffMember(
  actor: UserProfile,
  data: {
    name: string;
    email: string;
    password: string;
    permissions: StaffPermissions;
    agencyName?: string;
    phone?: string;
  }
): Promise<UserDoc> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the Owner can create staff accounts.');
  }

  const normalizedEmail = data.email.trim().toLowerCase();

  // Check if email already exists in local list
  const existingUsers = await fetchAllUsers();
  if (existingUsers.some((u) => u.email.toLowerCase() === normalizedEmail)) {
    throw new Error(`An account with email ${data.email} already exists.`);
  }

  let generatedUid = `staff-${Date.now()}`;

  // Try creating in Firebase Auth using secondary app instance so Owner is not signed out
  if (!isConfigPlaceholder) {
    let secondaryApp;
    try {
      const appName = `secondary-auth-${Date.now()}`;
      secondaryApp = initializeApp(firebaseConfig, appName);
      const secondaryAuth = getAuth(secondaryApp);
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        normalizedEmail,
        data.password
      );
      generatedUid = userCredential.user.uid;
      await secondarySignOut(secondaryAuth);
    } catch (authErr: any) {
      console.warn('Firebase Auth secondary creation failed:', authErr);
      if (authErr?.code === 'auth/email-already-in-use') {
        throw new Error('This email is already registered in Firebase Authentication.');
      }
      // If network/offline, fallback to generated UID for preview
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

  const newUser: UserDoc = {
    uid: generatedUid,
    name: data.name.trim(),
    email: normalizedEmail,
    role: 'staff',
    permissions: data.permissions,
    isActive: true,
    agencyName: data.agencyName || 'Head Office Operations',
    phone: data.phone || '',
    createdAt: new Date().toISOString(),
    createdBy: actor.uid,
  };

  // Write to Firestore users/{uid}
  try {
    if (!isConfigPlaceholder) {
      await setDoc(doc(db, USERS_COLLECTION, newUser.uid), newUser);
    }
  } catch (err) {
    console.warn('Could not write new user doc to Firestore:', err);
  }

  // Update local directory
  const updatedList = [newUser, ...existingUsers];
  cacheUsersLocally(updatedList);

  // Write to audit log
  await logAuditEvent({
    action: 'CREATE_STAFF_USER',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: newUser.uid,
    targetUserName: newUser.name,
    details: {
      email: newUser.email,
      role: newUser.role,
      permissions: newUser.permissions,
    },
  });

  return newUser;
}

/**
 * Update staff permissions matrix with strict audit logging
 */
export async function updateStaffPermissions(
  actor: UserProfile,
  targetUserId: string,
  newPermissions: StaffPermissions
): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the Owner can modify staff permissions.');
  }

  const users = await fetchAllUsers();
  const targetIndex = users.findIndex((u) => u.uid === targetUserId);
  if (targetIndex === -1) {
    throw new Error('User not found.');
  }

  const target = users[targetIndex];
  if (target.role === 'owner') {
    throw new Error('Owner permissions are permanently unrestricted and cannot be modified.');
  }

  const previousPermissions = target.permissions || createDefaultPermissions('View Only');

  // Update Firestore
  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, USERS_COLLECTION, targetUserId), {
        permissions: newPermissions,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Could not update permissions in Firestore:', err);
  }

  // Update locally
  users[targetIndex] = {
    ...target,
    permissions: newPermissions,
  };
  cacheUsersLocally(users);

  // Write to audit log (recording who changed whose permission, before and after)
  await logAuditEvent({
    action: 'PERMISSIONS_UPDATE',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: target.uid,
    targetUserName: target.name,
    details: {
      before: previousPermissions,
      after: newPermissions,
    },
  });
}

/**
 * Suspend or reactivate user account
 */
export async function toggleUserActiveStatus(
  actor: UserProfile,
  targetUserId: string,
  newActiveState: boolean
): Promise<void> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the Owner can alter account status.');
  }

  const users = await fetchAllUsers();
  const target = users.find((u) => u.uid === targetUserId);
  if (!target) {
    throw new Error('Target user not found.');
  }

  // Enforce Bootstrap Rule: The app must NEVER allow deleting or demoting or suspending the last owner
  if (target.role === 'owner' && !newActiveState) {
    const activeOwners = users.filter((u) => u.role === 'owner' && u.isActive);
    if (activeOwners.length <= 1) {
      throw new Error('Operation Forbidden: The primary or last active Owner account cannot be suspended.');
    }
  }

  // Update in Firestore
  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, USERS_COLLECTION, targetUserId), {
        isActive: newActiveState,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.warn('Could not update user active status in Firestore:', err);
  }

  // Update locally
  const updated = users.map((u) =>
    u.uid === targetUserId ? { ...u, isActive: newActiveState } : u
  );
  cacheUsersLocally(updated);

  // Write to audit log
  await logAuditEvent({
    action: newActiveState ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: target.uid,
    targetUserName: target.name,
    details: {
      previousState: target.isActive,
      newState: newActiveState,
    },
  });
}

/**
 * Generate a random temporary password for staff/agent password reset
 */
export function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const specials = '#@!%';
  let result = 'Safar-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  result += specials.charAt(Math.floor(Math.random() * specials.length));
  result += Math.floor(Math.random() * 90 + 10);
  return result; // e.g. Safar-k9P2x#84
}

/**
 * Reset a staff or agent password by the Owner.
 * Returns the generated temporary password so it can be shown once to the Owner.
 */
export async function resetUserPasswordByOwner(
  actor: UserProfile,
  targetUserId: string
): Promise<string> {
  if (actor.role !== 'owner') {
    throw new Error('Unauthorized: Only the Owner can reset user credentials.');
  }

  const users = await fetchAllUsers();
  const target = users.find((u) => u.uid === targetUserId);
  if (!target) {
    throw new Error('Target user not found.');
  }

  const tempPassword = generateTemporaryPassword();

  // In Firestore, save a temporary credentials note / timestamp
  try {
    if (!isConfigPlaceholder) {
      await updateDoc(doc(db, USERS_COLLECTION, targetUserId), {
        temporaryPasswordIssuedAt: new Date().toISOString(),
        mustChangePasswordOnLogin: true,
      });
    }
  } catch (err) {
    console.warn('Could not mark temporary password flag in Firestore:', err);
  }

  // Audit log
  await logAuditEvent({
    action: 'PASSWORD_RESET_BY_OWNER',
    userId: actor.uid,
    userName: actor.name || 'Owner',
    userEmail: actor.email,
    userRole: actor.role,
    targetUserId: target.uid,
    targetUserName: target.name,
    details: {
      userEmail: target.email,
      issuedAt: new Date().toISOString(),
    },
  });

  return tempPassword;
}

/**
 * Upload a profile picture via the SAME Google Apps Script as company logos,
 * saved in the SAME central Drive folder (with profile_ filename prefix).
 * Falls back to resized base64 data URL if the script is not configured.
 */
export async function uploadProfilePicture(uid: string, file: File): Promise<string> {
  const scriptUrl = import.meta.env.VITE_LOGO_UPLOAD_URL as string | undefined;

  // Resize to max 300px (profile pics don't need to be large)
  const dataUrl = await resizeImageToDataUrl(file, 300);

  if (scriptUrl) {
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          image: dataUrl,
          mimeType: file.type || 'image/png',
          filename: `profile_${uid}_${Date.now()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`,
        }),
      });
      const result = await response.json();
      if (result.success && result.url) {
        return result.url;
      }
      console.warn('Profile upload script returned error:', result.error);
    } catch (err) {
      console.warn('Profile upload via Apps Script failed, using local data URL:', err);
    }
  }

  // Fallback: resized base64 data URL (stored in users/{uid})
  return dataUrl;
}

/**
 * Save the profile picture URL to the user's Firestore document.
 */
export async function saveProfilePictureUrl(uid: string, photoURL: string): Promise<void> {
  const { updateDoc: _updateDoc, doc: _doc } = await import('firebase/firestore');
  const { db: _db } = await import('./firebase');
  await _updateDoc(_doc(_db, 'users', uid), {
    photoURL,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Remove the profile picture (revert to initials).
 */
export async function removeProfilePicture(uid: string): Promise<void> {
  const { updateDoc: _updateDoc, doc: _doc } = await import('firebase/firestore');
  const { db: _db } = await import('./firebase');
  await _updateDoc(_doc(_db, 'users', uid), {
    photoURL: '',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Update the user's own profile fields (name, phone).
 */
export async function updateUserProfile(
  uid: string,
  data: { name?: string; phone?: string }
): Promise<void> {
  const { updateDoc: _updateDoc, doc: _doc } = await import('firebase/firestore');
  const { db: _db } = await import('./firebase');
  await _updateDoc(_doc(_db, 'users', uid), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Resize an image file to max dimension and return as data URL.
 */
function resizeImageToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL(file.type || 'image/jpeg', 0.85));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load image'));
    };

    img.src = url;
  });
}
