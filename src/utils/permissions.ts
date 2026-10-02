import { AppModule, StaffPermissions, PermissionPreset, PermissionAction } from '../types/auth';

export const ALL_MODULES: AppModule[] = [
  'Dashboard',
  'Visas',
  'Vouchers',
  'Tickets',
  'Hotels',
  'Accounts',
  'Banks',
  'Reports',
  'Settings',
  'Masters',
];

export const ALL_ACTIONS: PermissionAction[] = ['view', 'create', 'edit', 'delete'];

export const MODULE_DESCRIPTIONS: Record<AppModule, { title: string; desc: string }> = {
  Dashboard: { title: 'Dashboard', desc: 'KPI metrics, summary widgets and transaction activity' },
  Visas: { title: 'Visa Operations', desc: 'Umrah & tourist visa applications, passport files & distributions' },
  Vouchers: { title: 'Hotel & Service Vouchers', desc: 'Makkah/Madinah room allotments and transport vouchers' },
  Tickets: { title: 'Airline Ticketing Desk', desc: 'GDS PNR ticketing, flight segments and refunds' },
  Hotels: { title: 'Hotel Directory & Rates', desc: 'Contracted inventory, allotments and room categories' },
  Accounts: { title: 'Accounts & Ledgers', desc: 'Agent ledgers, receivables, payables and journal vouchers' },
  Banks: { title: 'Banks & Cash Desks', desc: 'Bank accounts, wire reconciliations and payments' },
  Reports: { title: 'Executive Reports', desc: 'Financial balance sheets, audit statements and analytics' },
  Settings: { title: 'System & Users Settings', desc: 'Tenant branding, user accounts, and forex benchmarks' },
  Masters: { title: 'Master Registries', desc: 'Airlines, airports, vendors and agent directories' },
};

/**
 * Generate full permissions matrix based on preset
 */
export function createDefaultPermissions(preset: PermissionPreset = 'View Only'): StaffPermissions {
  const result = {} as StaffPermissions;

  ALL_MODULES.forEach((mod) => {
    if (preset === 'Full Access') {
      result[mod] = { view: true, create: true, edit: true, delete: true };
    } else if (preset === 'Semi Admin') {
      // Semi Admin has View, Create, Edit on all; Delete disabled; Settings restricted
      result[mod] = {
        view: true,
        create: mod !== 'Settings',
        edit: mod !== 'Settings',
        delete: false,
      };
    } else if (preset === 'View Only') {
      result[mod] = { view: true, create: false, edit: false, delete: false };
    } else {
      // Custom / minimal initial
      result[mod] = {
        view: mod === 'Dashboard' || mod === 'Visas' || mod === 'Vouchers',
        create: false,
        edit: false,
        delete: false,
      };
    }
  });

  return result;
}

/**
 * Detect which preset best matches a given permissions matrix
 */
export function detectPreset(permissions?: StaffPermissions | null): PermissionPreset {
  if (!permissions) return 'Custom';

  let isFull = true;
  let isViewOnly = true;
  let isSemiAdmin = true;

  for (const mod of ALL_MODULES) {
    const p = permissions[mod] || { view: false, create: false, edit: false, delete: false };

    if (!p.view || !p.create || !p.edit || !p.delete) {
      isFull = false;
    }

    if (!p.view || p.create || p.edit || p.delete) {
      isViewOnly = false;
    }

    if (mod === 'Settings') {
      if (!p.view || p.create || p.edit || p.delete) {
        // Semi Admin settings check
      }
    } else {
      if (!p.view || !p.create || !p.edit || p.delete) {
        isSemiAdmin = false;
      }
    }
  }

  if (isFull) return 'Full Access';
  if (isViewOnly) return 'View Only';
  if (isSemiAdmin) return 'Semi Admin';

  return 'Custom';
}
