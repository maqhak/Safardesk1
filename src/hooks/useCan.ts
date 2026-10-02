import { useAuth } from '../contexts/AuthContext';
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
    // Agents can view their bookings/visas and create applications
    if (action === 'delete') return false;
    if (['Visas', 'Vouchers', 'Tickets', 'Dashboard'].includes(module)) {
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
  return checkCan(userProfile, module, action);
}

export default useCan;
