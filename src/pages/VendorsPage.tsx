import React, { useState, useEffect } from 'react';
import { 
  Database, 
  UserPlus, 
  Search, 
  RefreshCw, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  FileText, 
  Sliders, 
  Check, 
  ShieldAlert 
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { CurrencyAmount } from '../components/ui/CurrencyAmount';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { VendorDoc } from '../types/master';
import { LedgerAccountDoc } from '../types/agent';
import { 
  fetchVendors, 
  createVendor, 
  updateVendor, 
  toggleVendorStatus, 
  generateNextVendorCode 
} from '../services/masterService';
import { fetchLedgerAccounts } from '../services/agentService';
import { formatMoney } from '../utils/formatters';

export const VendorsPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError, info } = useToast();
  const canView = useCan('Masters', 'view');
  const canCreate = useCan('Masters', 'create');
  const canEdit = useCan('Masters', 'edit');

  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [ledgers, setLedgers] = useState<LedgerAccountDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [nextCode, setNextCode] = useState<string>('VND-003');

  // Add Vendor Modal
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('Saudi Arabia');
  const [city, setCity] = useState('Makkah');
  const [contactPerson, setContactPerson] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  // Edit Vendor Modal
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [targetVendor, setTargetVendor] = useState<VendorDoc | null>(null);
  const [editName, setEditName] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editing, setEditing] = useState<boolean>(false);

  // View Ledger Modal
  const [ledgerModalOpen, setLedgerModalOpen] = useState<boolean>(false);
  const [selectedLedger, setSelectedLedger] = useState<LedgerAccountDoc | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vList, lList, code] = await Promise.all([
        fetchVendors(),
        fetchLedgerAccounts(),
        generateNextVendorCode(),
      ]);
      setVendors(vList);
      setLedgers(lList);
      setNextCode(code);
    } catch {
      showError('Could not load vendors registry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const getVendorBalanceSAR = (vendorId: string) => {
    const l = ledgers.find((item) => item.linkedAgentId === vendorId);
    return l ? l.currentBalanceSAR : 0;
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!name.trim() || !contactPerson.trim() || !mobile.trim()) {
      showError('Please complete required fields.');
      return;
    }

    setCreating(true);
    try {
      await createVendor(userProfile, {
        name,
        country,
        city,
        contactPerson,
        mobile,
        email,
        notes,
      });

      success(`Vendor / Shirka "${name}" created with auto ledger account.`);
      setAddModalOpen(false);
      setName('');
      setContactPerson('');
      setMobile('');
      setEmail('');
      setNotes('');
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to create vendor.');
    } finally {
      setCreating(false);
    }
  };

  const openEditVendor = (v: VendorDoc) => {
    setTargetVendor(v);
    setEditName(v.name);
    setEditCountry(v.country);
    setEditCity(v.city || 'Makkah');
    setEditContact(v.contactPerson);
    setEditMobile(v.mobile);
    setEditEmail(v.email);
    setEditNotes(v.notes);
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !targetVendor) return;

    setEditing(true);
    try {
      await updateVendor(userProfile, targetVendor.id, {
        name: editName,
        country: editCountry,
        city: editCity,
        contactPerson: editContact,
        mobile: editMobile,
        email: editEmail,
        notes: editNotes,
      });

      success(`Vendor ${targetVendor.vendorCode} updated successfully.`);
      setEditModalOpen(false);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to update vendor.');
    } finally {
      setEditing(false);
    }
  };

  const handleToggleStatus = async (v: VendorDoc) => {
    if (!userProfile) return;
    try {
      await toggleVendorStatus(userProfile, v.id);
      success(`Vendor ${v.vendorCode} status updated.`);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to toggle status.');
    }
  };

  const openLedger = (v: VendorDoc) => {
    const l = ledgers.find((item) => item.linkedAgentId === v.id);
    setSelectedLedger(l || {
      id: `ledger-${v.id}`,
      accountType: 'vendor',
      linkedAgentId: v.id,
      agentCode: v.vendorCode,
      accountName: v.name,
      openingBalance: 0,
      currentBalanceSAR: 0,
      currency: 'SAR',
      createdAt: v.createdAt,
      createdBy: v.createdBy,
    });
    setTargetVendor(v);
    setLedgerModalOpen(true);
  };

  const filteredVendors = vendors.filter((v) =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.vendorCode.toLowerCase().includes(search.toLowerCase()) ||
    v.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
    v.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saudi Shirka & Service Vendors"
        subtitle="Manage official Saudi-side partners from whom visas and hotels are purchased. Sub-ledgers are auto-created."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters', href: '/masters' }, { label: 'Vendors' }]}
        actions={
          canCreate ? (
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UserPlus className="w-3.5 h-3.5" />}
              onClick={() => setAddModalOpen(true)}
            >
              Add Vendor / Shirka
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search vendor code, name or contact..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
        <Button variant="outline" size="sm" leftIcon={<RefreshCw className="w-3.5 h-3.5" />} onClick={loadData}>
          Refresh
        </Button>
      </div>

      {/* Vendors Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
            <tr>
              <th className="py-3.5 px-4 w-28">Code</th>
              <th className="py-3.5 px-4">Vendor / Shirka Name</th>
              <th className="py-3.5 px-4">Contact Person & Mobile</th>
              <th className="py-3.5 px-4">Country</th>
              <th className="py-3.5 px-4 text-right">Payable Balance (SAR)</th>
              <th className="py-3.5 px-4 text-center">Status</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredVendors.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-semibold text-slate-700">No vendor records found</p>
                </td>
              </tr>
            ) : (
              filteredVendors.map((v) => {
                const balance = getVendorBalanceSAR(v.id);
                return (
                  <tr key={v.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-xs text-[#0e2c4c] bg-navy-50 px-2 py-1 rounded border border-navy-100">
                        {v.vendorCode}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-900 block">{v.name}</span>
                      <span className="text-xs text-slate-400 font-mono">{v.email}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="font-medium text-slate-800 block">{v.contactPerson}</span>
                      <span className="text-slate-500 font-mono">{v.mobile}</span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                      {v.country}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs font-bold text-slate-900">
                      {formatMoney(balance, 'SAR')}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {v.isActive ? <Badge variant="success" dot>Active</Badge> : <Badge variant="danger" dot>Inactive</Badge>}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<FileText className="w-3.5 h-3.5 text-[#0e2c4c]" />}
                          onClick={() => openLedger(v)}
                        >
                          Ledger
                        </Button>
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Sliders className="w-3.5 h-3.5 text-slate-500" />}
                            onClick={() => openEditVendor(v)}
                          >
                            Edit
                          </Button>
                        )}
                        {role === 'owner' && (
                          <Button
                            variant={v.isActive ? 'outline' : 'primary'}
                            size="sm"
                            onClick={() => handleToggleStatus(v)}
                          >
                            {v.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ADD VENDOR MODAL */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Saudi Shirka / Service Vendor"
        subtitle={`Auto-assigns code ${nextCode} and provisions ledger account`}
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={creating} onClick={handleAddVendor}>
              Save Vendor
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddVendor} className="space-y-4">
          <Input
            label="Vendor / Shirka Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Al-Haramain Group (Shirka)"
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Person"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              placeholder="e.g. Sheikh Mansoor"
              required
            />
            <Input
              label="Mobile Number"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="e.g. +966 55 000 0000"
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              defaultValue="Saudi Arabia"
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. partner@shirka.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">Notes / Terms</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contract terms, visa quota allocation notes..."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
        </form>
      </Modal>

      {/* EDIT VENDOR MODAL */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Edit Vendor — ${targetVendor?.vendorCode}`}
        subtitle="Update partner details"
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={editing} onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveEdit} className="space-y-4">
          <Input
            label="Vendor Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Person"
              value={editContact}
              onChange={(e) => setEditContact(e.target.value)}
              required
            />
            <Input
              label="Mobile"
              value={editMobile}
              onChange={(e) => setEditMobile(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Country"
              value={editCountry}
              onChange={(e) => setEditCountry(e.target.value)}
              required
            />
            <Input
              label="Email"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* VIEW LEDGER MODAL */}
      <Modal
        isOpen={ledgerModalOpen}
        onClose={() => setLedgerModalOpen(false)}
        title={`Vendor Ledger — ${targetVendor?.name}`}
        subtitle={`Vendor Code: ${targetVendor?.vendorCode} • Country: ${targetVendor?.country}`}
        size="md"
        footer={
          <Button variant="outline" size="sm" onClick={() => setLedgerModalOpen(false)}>
            Close
          </Button>
        }
      >
        {selectedLedger && (
          <div className="space-y-4 pt-1">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 uppercase font-medium block">Payable Balance (SAR)</span>
                <span className="text-xl font-bold font-mono text-[#0e2c4c]">
                  {formatMoney(selectedLedger.currentBalanceSAR, 'SAR')}
                </span>
              </div>
              <Badge variant="navy">Verified Payable</Badge>
            </div>
            <p className="text-xs text-slate-500">
              All hotel block purchases and visa quotas sourced from this Shirka are recorded in this sub-ledger.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};
