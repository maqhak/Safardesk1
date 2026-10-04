import { useAuth } from '../contexts/AuthContext';
import { useLicense } from '../contexts/LicenseContext';
import { AppModule, PermissionAction, UserProfile } from '../types/auth';

/**
 * Pure function to check if a user profile can perform an action on a module
 */
export function checkCan(
  profile: UserProfile | null,
  module: AppModule,
  action: PermissionAction = 'view'
): boolean {
  if (!profile) return false;

  // Owner has unrestricted access to all modules and actions
  if (profile.role === 'owner') {
    return true;
  }

  // Agent role is restricted to Agent Portal and agent-specific operations
  if (profile.role === 'agent') {
    // Agents cannot access Settings, Accounts, Banks, Masters, Reports
    if (['Settings', 'Accounts', 'Banks', 'Masters', 'Reports'].includes(module)) {
      return false;
    }
    // Agents can view their own visas/vouchers; they cannot add/import visas
    // (visa import & distribution is owner/staff work). Voucher creation stays.
    if (action === 'delete') return false;
    if (module === 'Visas') {
      return action === 'view';
    }
    if (['Vouchers', 'Tickets', 'Dashboard'].includes(module)) {
      return action === 'view' || action === 'create';
    }
    return false;
  }

  // Staff role: check explicit permissions matrix
  if (profile.role === 'staff') {
    const modulePerms = profile.permissions?.[module];
    if (!modulePerms) return false;
    return Boolean(modulePerms[action]);
  }

  return false;
}

/**
 * React hook to evaluate permission for current authenticated user
 * 
 * @example
 * const canCreateVisa = useCan('Visas', 'create');
 * const canDeleteAccount = useCan('Accounts', 'delete');
 */
export function useCan(module: AppModule, action: PermissionAction = 'view'): boolean {
  const { userProfile } = useAuth();
  const { isReadOnly } = useLicense();
  // Fix #28: in license read-only mode, every mutation is denied app-wide.
  if (isReadOnly && action !== 'view') return false;
  return checkCan(userProfile, module, action);
}

export default useCan;
