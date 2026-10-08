import { User as FirebaseUser } from 'firebase/auth';

export type UserRole = 'owner' | 'staff' | 'agent';

export type AppModule = 
  | 'Dashboard'
  | 'Visas'
  | 'Vouchers'
  | 'Tickets'
  | 'Hotels'
  | 'Accounts'
  | 'Banks'
  | 'Reports'
  | 'Settings'
  | 'Masters';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export interface ModulePermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export type StaffPermissions = Record<AppModule, ModulePermissions>;

export type PermissionPreset = 'Full Access' | 'Semi Admin' | 'View Only' | 'Custom';

export interface UserDoc {
  uid: string;
  name: string;
  displayName?: string;
  email: string;
  role: UserRole;
  agentId?: string | null; // only for agent role
  agencyName?: string;
  permissions?: StaffPermissions; // per staff
  isActive: boolean;
  createdAt: string;
  createdBy: string;
  lastLoginAt?: string;
  phone?: string;
  photoURL?: string; // profile picture (data URL or https URL)
}

// Backwards-compatible alias for AuthContext
export type UserProfile = UserDoc;

export interface AuditLogEntry {
  id?: string;
  timestamp: string;
  action: string; // 'USER_LOGIN', 'PERMISSIONS_UPDATE', 'USER_STATUS_CHANGE', 'PASSWORD_RESET', etc.
  userId: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  targetUserId?: string;
  targetUserName?: string;
  details: Record<string, any>;
  userAgent?: string;
  ipAddress?: string;
}

export interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  isDemoMode: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOutUser: (reason?: string) => Promise<void>;
  demoSignIn: (role?: UserRole) => Promise<void>;
  switchRole: (newRole: UserRole) => void;
  sendPasswordReset: (email: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}
