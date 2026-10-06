import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  KeyRound, 
  Check, 
  Copy, 
  Search, 
  Filter, 
  RefreshCw, 
  Lock, 
  Unlock, 
  AlertTriangle, 
  Eye, 
  CheckCircle2, 
  Sliders, 
  Info, 
  Building,
  UserX,
  UserCheck
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { TENANT } from '../config';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { 
  UserDoc, 
  StaffPermissions, 
  AppModule, 
  PermissionAction, 
  PermissionPreset 
} from '../types/auth';
import { 
  ALL_MODULES, 
  ALL_ACTIONS, 
  MODULE_DESCRIPTIONS, 
  createDefaultPermissions, 
  detectPreset 
} from '../utils/permissions';
import { 
  fetchAllUsers, 
  createStaffMember, 
  updateStaffPermissions, 
  toggleUserActiveStatus, 
  resetUserPasswordByOwner,
  generateTemporaryPassword
} from '../services/userService';
import { formatDate } from '../utils/formatters';

export const UsersAndPermissionsPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError, info } = useToast();

  const [users, setUsers] = useState<UserDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [editPermsModalOpen, setEditPermsModalOpen] = useState<boolean>(false);
  const [targetUser, setTargetUser] = useState<UserDoc | null>(null);

  // New staff form state
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffAgency, setNewStaffAgency] = useState('Head Office Operations');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPreset, setNewStaffPreset] = useState<PermissionPreset>('Semi Admin');
  const [newStaffPermissions, setNewStaffPermissions] = useState<StaffPermissions>(
    createDefaultPermissions('Semi Admin')
  );

  // Edit permissions state
  const [editPreset, setEditPreset] = useState<PermissionPreset>('Custom');
  const [editPermissions, setEditPermissions] = useState<StaffPermissions>(
    createDefaultPermissions('View Only')
  );

  // Temporary password display modal
  const [tempPasswordModalOpen, setTempPasswordModalOpen] = useState<boolean>(false);
  const [issuedTempPassword, setIssuedTempPassword] = useState<string>('');
  const [passwordCopied, setPasswordCopied] = useState<boolean>(false);

  // Suspend confirmation modal
  const [suspendModalOpen, setSuspendModalOpen] = useState<boolean>(false);
  const [suspendLoading, setSuspendLoading] = useState<boolean>(false);

  // Load all users
  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch {
      showError('Could not load users directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  // Preset switch handler for creation
  const handleCreatePresetChange = (preset: PermissionPreset) => {
    setNewStaffPreset(preset);
    setNewStaffPermissions(createDefaultPermissions(preset));
  };

  // Preset switch handler for editing
  const handleEditPresetChange = (preset: PermissionPreset) => {
    setEditPreset(preset);
    setEditPermissions(createDefaultPermissions(preset));
  };

  // Toggle single cell in creation matrix
  const toggleCreatePermission = (mod: AppModule, action: PermissionAction) => {
    setNewStaffPermissions((prev) => {
      const current = prev[mod] || { view: false, create: false, edit: false, delete: false };
      const updated = {
        ...prev,
        [mod]: {
          ...current,
          [action]: !current[action],
        },
      };
      setNewStaffPreset(detectPreset(updated));
      return updated;
    });
  };

  // Toggle single cell in edit matrix
  const toggleEditPermission = (mod: AppModule, action: PermissionAction) => {
    setEditPermissions((prev) => {
      const current = prev[mod] || { view: false, create: false, edit: false, delete: false };
      const updated = {
        ...prev,
        [mod]: {
          ...current,
          [action]: !current[action],
        },
      };
      setEditPreset(detectPreset(updated));
      return updated;
    });
  };

  // Toggle column for all modules
  const toggleColumnAll = (
    action: PermissionAction, 
    isEdit: boolean = false
  ) => {
    const currentMatrix = isEdit ? editPermissions : newStaffPermissions;
    const allEnabled = ALL_MODULES.every((mod) => currentMatrix[mod]?.[action]);

    const updated = { ...currentMatrix };
    ALL_MODULES.forEach((mod) => {
      updated[mod] = {
        ...(updated[mod] || { view: false, create: false, edit: false, delete: false }),
        [action]: !allEnabled,
      };
    });

    if (isEdit) {
      setEditPermissions(updated);
      setEditPreset(detectPreset(updated));
    } else {
      setNewStaffPermissions(updated);
      setNewStaffPreset(detectPreset(updated));
    }
  };

  // Submit new staff
  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!newStaffName.trim() || !newStaffEmail.trim() || !newStaffPassword.trim()) {
      showError('Please complete all required fields.');
      return;
    }

    if (newStaffPassword.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }

    try {
      await createStaffMember(userProfile, {
        name: newStaffName,
        email: newStaffEmail,
        password: newStaffPassword,
        agencyName: newStaffAgency,
        phone: newStaffPhone,
        permissions: newStaffPermissions,
      });

      success(`Staff account for ${newStaffName} created successfully.`);
      setCreateModalOpen(false);
      // Reset form
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      setNewStaffPhone('');
      await loadUsers();
    } catch (err: any) {
      showError(err?.message || 'Failed to create staff account.');
    }
  };

  // Open edit permissions modal
  const openEditPermissions = (user: UserDoc) => {
    setTargetUser(user);
    const existing = user.permissions || createDefaultPermissions('View Only');
    setEditPermissions(existing);
    setEditPreset(detectPreset(existing));
    setEditPermsModalOpen(true);
  };

  // Save updated permissions
  const handleSavePermissions = async () => {
    if (!userProfile || !targetUser) return;

    try {
      await updateStaffPermissions(userProfile, targetUser.uid, editPermissions);
      success(`Updated permissions for ${targetUser.name}.`, 'Permissions Saved');
      setEditPermsModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      showError(err?.message || 'Failed to update permissions.');
    }
  };

  // Open suspend modal
  const openSuspendConfirm = (user: UserDoc) => {
    // Check bootstrap rule: never allow deleting or demoting the last owner
    if (user.role === 'owner') {
      const owners = users.filter((u) => u.role === 'owner' && u.isActive);
      if (owners.length <= 1) {
        showError('Forbidden: The primary or last active Owner account cannot be suspended.');
        return;
      }
    }
    setTargetUser(user);
    setSuspendModalOpen(true);
  };

  // Toggle active status
  const handleToggleActive = async () => {
    if (!userProfile || !targetUser) return;
    setSuspendLoading(true);

    try {
      const newState = !targetUser.isActive;
      await toggleUserActiveStatus(userProfile, targetUser.uid, newState);
      success(
        `Account for ${targetUser.name} has been ${newState ? 'reactivated' : 'suspended'}.`
      );
      setSuspendModalOpen(false);
      await loadUsers();
    } catch (err: any) {
      showError(err?.message || 'Could not update account status.');
    } finally {
      setSuspendLoading(false);
    }
  };

  // Reset password by owner
  const handleResetPassword = async (user: UserDoc) => {
    if (!userProfile) return;
    try {
      const tempPass = await resetUserPasswordByOwner(userProfile, user.uid);
      setTargetUser(user);
      setIssuedTempPassword(tempPass);
      setPasswordCopied(false);
      setTempPasswordModalOpen(true);
      await loadUsers();
    } catch (err: any) {
      showError(err?.message || 'Could not reset password.');
    }
  };

  // Copy temp password
  const copyTempPassword = () => {
    navigator.clipboard.writeText(issuedTempPassword);
    setPasswordCopied(true);
    success('Temporary password copied to clipboard!');
    setTimeout(() => setPasswordCopied(false), 3000);
  };

  // Filtered users
  const filteredUsers = users.filter((u) => {
    const matchesSearch = 
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.agentId && u.agentId.toLowerCase().includes(search.toLowerCase()));

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  // Guard: Owner only screen
  if (role !== 'owner') {
    return (
      <div className="py-12">
        <Card className="max-w-md mx-auto text-center p-8 border-rose-200">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Access Denied</h2>
          <p className="text-xs text-slate-500 mb-4">
            The Users & Permissions console is restricted strictly to the CRM Owner.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Access Permissions"
        subtitle="Manage agency staff credentials, granular module permission matrices, and sub-agent access."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Users & Permissions' },
        ]}
        badge={
          <Badge variant="gold" size="md">
            Owner Security Console
          </Badge>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadUsers}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
              onClick={() => {
                setNewStaffPassword(generateTemporaryPassword());
                setCreateModalOpen(true);
              }}
            >
              Add Staff Member
            </Button>
          </>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total Directory</span>
          <span className="text-2xl font-bold text-slate-900 mt-1 block">{users.length}</span>
          <span className="text-[11px] text-slate-500">All registered system identities</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Staff Members</span>
          <span className="text-2xl font-bold text-[var(--theme-primary)] mt-1 block">
            {users.filter((u) => u.role === 'staff').length}
          </span>
          <span className="text-[11px] text-slate-500">Internal operations & ticketing</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">B2B Sub-Agents</span>
          <span className="text-2xl font-bold text-emerald-700 mt-1 block">
            {users.filter((u) => u.role === 'agent').length}
          </span>
          <span className="text-[11px] text-slate-500">Managed via Agents Master</span>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Suspended</span>
          <span className="text-2xl font-bold text-rose-600 mt-1 block">
            {users.filter((u) => !u.isActive).length}
          </span>
          <span className="text-[11px] text-slate-500">Blocked login access</span>
        </div>
      </div>

      {/* Filter and User Directory Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-72">
            <Input
              placeholder="Search user by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
              {(['all', 'owner', 'staff', 'agent'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1 rounded-md capitalize transition cursor-pointer ${
                    roleFilter === r
                      ? 'bg-[#0e2c4c] text-white font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Access Summary</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.map((u) => {
                const isOwner = u.role === 'owner';
                const isAgent = u.role === 'agent';
                const isStaff = u.role === 'staff';

                return (
                  <tr key={u.uid} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-navy-50 text-[var(--theme-primary)] font-bold text-xs flex items-center justify-center border border-navy-100">
                          {u.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-900 block">{u.name}</span>
                          <span className="text-xs text-slate-400 font-mono">{u.email}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {isOwner && <Badge variant="gold">Owner</Badge>}
                      {isStaff && <Badge variant="navy">Staff</Badge>}
                      {isAgent && (
                        <div className="flex items-center gap-1">
                          <Badge variant="success">Agent</Badge>
                          <span className="text-[11px] font-mono text-slate-500">
                            ({u.agentId || 'External'})
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {isOwner ? (
                        <span className="text-xs text-slate-600 font-medium flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-[#c9a227]" />
                          <span>Unrestricted (All Modules)</span>
                        </span>
                      ) : isAgent ? (
                        <span className="text-xs text-slate-500 italic">
                          Agent Portal Only (Read-Only Matrix)
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {detectPreset(u.permissions)} Preset
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {u.isActive ? (
                        <Badge variant="success" dot>Active</Badge>
                      ) : (
                        <Badge variant="danger" dot>Suspended</Badge>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-xs font-mono text-slate-500">
                      {formatDate(u.createdAt)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {isStaff && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Sliders className="w-3.5 h-3.5 text-[var(--theme-primary)]" />}
                            onClick={() => openEditPermissions(u)}
                          >
                            Permissions
                          </Button>
                        )}

                        {!isOwner && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<KeyRound className="w-3.5 h-3.5 text-slate-500" />}
                            onClick={() => handleResetPassword(u)}
                            title="Generate a temporary password to share manually"
                          >
                            Reset Key
                          </Button>
                        )}

                        {!isOwner && (
                          <Button
                            variant={u.isActive ? 'outline' : 'primary'}
                            size="sm"
                            onClick={() => openSuspendConfirm(u)}
                            className={u.isActive ? 'hover:text-rose-600 hover:border-rose-300' : ''}
                          >
                            {u.isActive ? 'Suspend' : 'Reactivate'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE STAFF MODAL WITH PERMISSION MATRIX */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Staff Member"
        subtitle="Set staff credentials and configure granular module permissions"
        size="2xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreateStaff}>
              Create Staff Account
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateStaff} className="space-y-6">
          {/* User Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Staff Full Name"
              placeholder="e.g. Bilal Farooq"
              value={newStaffName}
              onChange={(e) => setNewStaffName(e.target.value)}
              required
            />
            <Input
              label="Official Email Address"
              type="email"
              placeholder="e.g. operations@safardesk.com"
              value={newStaffEmail}
              onChange={(e) => setNewStaffEmail(e.target.value)}
              required
            />
            <div className="sm:col-span-2">
              <Input
                label="Initial Password (Set by Owner)"
                value={newStaffPassword}
                onChange={(e) => setNewStaffPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                helperText="Share this password with the staff member. They can change it from their profile."
                required
              />
            </div>
          </div>

          {/* Permission Matrix Section */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900">Module Permission Matrix</h4>
                <p className="text-xs text-slate-500">Configure View, Create, Edit, and Delete privileges per module</p>
              </div>

              {/* Presets Selector */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-500 font-semibold mr-1">Presets:</span>
                {(['Full Access', 'Semi Admin', 'View Only'] as PermissionPreset[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleCreatePresetChange(p)}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition cursor-pointer ${
                      newStaffPreset === p
                        ? 'bg-[#0e2c4c] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Matrix Table */}
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Module</th>
                    {ALL_ACTIONS.map((action) => (
                      <th key={action} className="py-2.5 px-3 text-center uppercase tracking-wider w-20">
                        <button
                          type="button"
                          onClick={() => toggleColumnAll(action, false)}
                          className="hover:text-[var(--theme-primary)] underline cursor-pointer"
                          title={`Toggle all ${action} permissions`}
                        >
                          {action}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 bg-white">
                  {ALL_MODULES.map((mod) => {
                    const info = MODULE_DESCRIPTIONS[mod];
                    const perms = newStaffPermissions[mod] || { view: false, create: false, edit: false, delete: false };

                    return (
                      <tr key={mod} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900 block">{info.title}</span>
                          <span className="text-[11px] text-slate-400 block truncate max-w-xs">{info.desc}</span>
                        </td>
                        {ALL_ACTIONS.map((action) => (
                          <td key={action} className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={perms[action]}
                              onChange={() => toggleCreatePermission(mod, action)}
                              className="w-4 h-4 rounded border-slate-300 text-[var(--theme-primary)] focus:ring-[#0e2c4c] cursor-pointer"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </form>
      </Modal>

      {/* EDIT PERMISSIONS MODAL */}
      <Modal
        isOpen={editPermsModalOpen}
        onClose={() => setEditPermsModalOpen(false)}
        title={`Edit Permissions — ${targetUser?.name || 'Staff'}`}
        subtitle="Changes are recorded in the security auditLog collection with before/after diff"
        size="2xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditPermsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSavePermissions}>
              Save Permission Matrix
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
            <div>
              <span className="text-xs text-slate-500 font-semibold mr-1">Active Preset:</span>
              <Badge variant="navy">{editPreset}</Badge>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-500 font-semibold mr-1">Quick Presets:</span>
              {(['Full Access', 'Semi Admin', 'View Only'] as PermissionPreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleEditPresetChange(p)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition cursor-pointer ${
                    editPreset === p
                      ? 'bg-[#0e2c4c] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Matrix Table */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Module</th>
                  {ALL_ACTIONS.map((action) => (
                    <th key={action} className="py-2.5 px-3 text-center uppercase tracking-wider w-20">
                      <button
                        type="button"
                        onClick={() => toggleColumnAll(action, true)}
                        className="hover:text-[var(--theme-primary)] underline cursor-pointer"
                        title={`Toggle all ${action} permissions`}
                      >
                        {action}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 bg-white">
                {ALL_MODULES.map((mod) => {
                  const info = MODULE_DESCRIPTIONS[mod];
                  const perms = editPermissions[mod] || { view: false, create: false, edit: false, delete: false };

                  return (
                    <tr key={mod} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3">
                        <span className="font-semibold text-slate-900 block">{info.title}</span>
                        <span className="text-[11px] text-slate-400 block truncate max-w-xs">{info.desc}</span>
                      </td>
                      {ALL_ACTIONS.map((action) => (
                        <td key={action} className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={perms[action]}
                            onChange={() => toggleEditPermission(mod, action)}
                            className="w-4 h-4 rounded border-slate-300 text-[var(--theme-primary)] focus:ring-[#0e2c4c] cursor-pointer"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* TEMPORARY PASSWORD REVEAL MODAL */}
      <Modal
        isOpen={tempPasswordModalOpen}
        onClose={() => setTempPasswordModalOpen(false)}
        title="Temporary Password Generated"
        subtitle={`One-time password for ${targetUser?.name || 'Staff'}`}
        size="sm"
        footer={
          <Button variant="primary" size="sm" onClick={() => setTempPasswordModalOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs text-slate-600 leading-relaxed">
            A temporary password has been generated for <strong>{targetUser?.name}</strong> ({targetUser?.email}). This is shown <strong>only once</strong> to the Owner:
          </p>

          <div className="p-4 bg-slate-100 rounded-xl border border-slate-300 flex items-center justify-between">
            <span className="font-mono text-base font-bold text-slate-900 select-all tracking-wider">
              {issuedTempPassword}
            </span>
            <Button
              variant="outline"
              size="sm"
              leftIcon={passwordCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              onClick={copyTempPassword}
            >
              {passwordCopied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
            Please share this password with the staff member via a secure internal channel.
          </div>
        </div>
      </Modal>

      {/* SUSPEND / REACTIVATE CONFIRM DIALOG */}
      {targetUser && (
        <ConfirmDialog
          isOpen={suspendModalOpen}
          onClose={() => setSuspendModalOpen(false)}
          onConfirm={handleToggleActive}
          loading={suspendLoading}
          title={targetUser.isActive ? `Suspend Account — ${targetUser.name}` : `Reactivate Account — ${targetUser.name}`}
          message={
            targetUser.isActive ? (
              <p>
                Are you sure you want to suspend <strong>{targetUser.name}</strong>? They will be immediately blocked from signing into {TENANT.companyName} with a clear suspension alert.
              </p>
            ) : (
              <p>
                Are you sure you want to reactivate <strong>{targetUser.name}</strong>? Their access permissions will be restored.
              </p>
            )
          }
          confirmLabel={targetUser.isActive ? 'Suspend Account' : 'Reactivate'}
          variant={targetUser.isActive ? 'danger' : 'primary'}
        />
      )}
    </div>
  );
};
