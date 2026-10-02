import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  UserCheck, 
  Phone, 
  Mail, 
  MapPin, 
  FileCheck, 
  Building, 
  Calculator, 
  AlertTriangle,
  Merge,
  ExternalLink,
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { DataTable, Column } from '../components/ui/DataTable';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { CustomerDoc } from '../types/customer';
import { fetchCustomers, createCustomer, mergeCustomers } from '../services/customerService';

export const CustomersPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError } = useToast();
  const canView = useCan('Visas', 'view');
  const canCreate = useCan('Visas', 'create');
  const isOwner = role === 'owner';

  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Add Customer Modal
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [creating, setCreating] = useState<boolean>(false);
  const [fullName, setFullName] = useState<string>('');
  const [passportNumber, setPassportNumber] = useState<string>('');
  const [nationality, setNationality] = useState<string>('Pakistani');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [mobile, setMobile] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [city, setCity] = useState<string>('Karachi');
  const [address, setAddress] = useState<string>('');
  const [cnic, setCnic] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Customer Profile Detail Modal / Drawer
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDoc | null>(null);

  // Merge Duplicate Modal (Owner only)
  const [mergeModalOpen, setMergeModalOpen] = useState<boolean>(false);
  const [survivorId, setSurvivorId] = useState<string>('');
  const [duplicateId, setDuplicateId] = useState<string>('');
  const [merging, setMerging] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await fetchCustomers();
      setCustomers(list);
    } catch {
      showError('Failed to load customers database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!fullName.trim() || !passportNumber.trim() || !mobile.trim() || !city.trim()) {
      showError('Please complete all required fields.');
      return;
    }

    setCreating(true);
    try {
      await createCustomer(userProfile, {
        fullName: fullName.trim(),
        passportNumber: passportNumber.trim().toUpperCase(),
        nationality,
        gender,
        mobile: mobile.trim(),
        email: email.trim(),
        city: city.trim(),
        address: address.trim(),
        cnic: cnic.trim(),
        notes: notes.trim(),
        channel: 'direct',
        createdFrom: 'manual',
      });

      success(`Direct B2C customer "${fullName}" created successfully with auto ledger account.`);
      setAddModalOpen(false);
      setFullName('');
      setPassportNumber('');
      setMobile('');
      setEmail('');
      setCity('Karachi');
      setAddress('');
      setCnic('');
      setNotes('');
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to create customer.');
    } finally {
      setCreating(false);
    }
  };

  const handleMerge = async () => {
    if (!userProfile || !survivorId || !duplicateId) return;
    if (survivorId === duplicateId) {
      showError('Survivor and duplicate cannot be the same customer.');
      return;
    }

    setMerging(true);
    try {
      await mergeCustomers(userProfile, survivorId, duplicateId);
      success('Customer profiles merged successfully.');
      setMergeModalOpen(false);
      setSurvivorId('');
      setDuplicateId('');
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to merge profiles.');
    } finally {
      setMerging(false);
    }
  };

  const filteredCustomers = customers.filter((c) =>
    c.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.passportNumber.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase())
  );

  const openProfile = (c: CustomerDoc) => {
    setSelectedCustomer(c);
    setProfileModalOpen(true);
  };

  const columns: Column<CustomerDoc>[] = [
    {
      key: 'fullName',
      header: 'Customer Name',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-bold text-[#0e2c4c]">{row.fullName}</div>
          <div className="text-[11px] text-slate-500">{row.nationality} • {row.gender}</div>
        </div>
      ),
    },
    {
      key: 'passportNumber',
      header: 'Passport No.',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-slate-800">{row.passportNumber}</span>,
    },
    {
      key: 'mobile',
      header: 'Mobile / City',
      sortable: true,
      render: (row) => (
        <div>
          <div className="text-slate-800 font-medium">{row.mobile}</div>
          <div className="text-[11px] text-slate-500">{row.city}</div>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      sortable: true,
      render: (row) => (
        <Badge variant={row.channel === 'direct' ? 'navy' : 'gold'}>
          {row.channel === 'direct' ? 'Direct B2C' : `Agent (${row.agentId || 'Linked'})`}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Button variant="outline" size="sm" onClick={() => openProfile(row)} rightIcon={<ChevronRight className="w-3.5 h-3.5" />}>
          View Profile
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients & Customer Database"
        subtitle="Unified client records feeding B2C direct bookings and agent-driven Umrah/Hajj operations."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Customers' }]}
        actions={
          <div className="flex items-center gap-2">
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Merge className="w-4 h-4 text-amber-600" />}
                onClick={() => setMergeModalOpen(true)}
              >
                Merge Duplicates
              </Button>
            )}
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-4 h-4" />}
                onClick={() => setAddModalOpen(true)}
              >
                Add Customer (B2C)
              </Button>
            )}
          </div>
        }
      />

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Clients Directory</div>
            <div className="text-2xl font-bold text-[#0e2c4c] mt-1">{customers.length}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Unique passport enforcement active</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#0e2c4c]/10 flex items-center justify-center text-[#0e2c4c]">
            <Users className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Direct B2C Walk-ins</div>
            <div className="text-2xl font-bold text-[#0e2c4c] mt-1">
              {customers.filter((c) => c.channel === 'direct').length}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Auto ledger accounts created</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#c9a227]/10 flex items-center justify-center text-[#c9a227]">
            <UserCheck className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Agent-Linked Clients</div>
            <div className="text-2xl font-bold text-[#0e2c4c] mt-1">
              {customers.filter((c) => c.channel === 'agent').length}
            </div>
            <div className="text-[11px] text-slate-500 font-medium mt-0.5">Imported via B2B Sub-Agents</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <Building className="w-6 h-6" />
          </div>
        </Card>
      </div>

      {/* Customers Table */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, passport, mobile, city..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20 focus:border-[#0e2c4c]"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            Showing {filteredCustomers.length} of {customers.length} clients
          </div>
        </div>

        <DataTable
          data={filteredCustomers}
          columns={columns}
          keyExtractor={(row) => row.id}
          loading={loading}
          emptyTitle="No customers found"
          emptyDescription="No client records match your search."
        />
      </Card>

      {/* Add Direct B2C Customer Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Direct B2C Customer"
        subtitle="Create a walk-in client profile. Automatically provisions a customer sub-ledger."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddCustomer} loading={creating}>Save Customer</Button>
          </div>
        }
      >
        <form onSubmit={handleAddCustomer} className="space-y-4">
          <div>
            <Input
              label="Full Legal Name"
              placeholder="e.g. Muhammad Ahmed Khan"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Passport Number"
                placeholder="e.g. AB1234567"
                value={passportNumber}
                onChange={(e) => setPassportNumber(e.target.value.toUpperCase())}
                required
                helperText="Must be unique. Duplicates are blocked."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Nationality"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                required
              />
            </div>
            <div>
              <Input
                label="CNIC (Optional)"
                placeholder="e.g. 42101-9876543-1"
                value={cnic}
                onChange={(e) => setCnic(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="Mobile Number"
                placeholder="e.g. +92 300 1234567"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                required
              />
            </div>
            <div>
              <Input
                label="Email Address"
                type="email"
                placeholder="e.g. client@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Input
                label="City"
                placeholder="e.g. Karachi"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </div>
            <div>
              <Input
                label="Street Address"
                placeholder="e.g. DHA Phase 6"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Notes & Special Requirements</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any package preference or remarks..."
              className="w-full p-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
        </form>
      </Modal>

      {/* Customer Profile & Timeline Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          title={`Customer Profile: ${selectedCustomer.fullName}`}
          subtitle={`Passport: ${selectedCustomer.passportNumber} • Channel: ${selectedCustomer.channel.toUpperCase()}`}
          footer={<Button variant="primary" onClick={() => setProfileModalOpen(false)}>Close Profile</Button>}
        >
          <div className="space-y-6 py-2">
            {/* Identity Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-slate-500 font-semibold block">Full Name</span>
                <span className="font-bold text-slate-900 text-sm">{selectedCustomer.fullName}</span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Passport Number</span>
                <span className="font-mono font-bold text-[#0e2c4c]">{selectedCustomer.passportNumber}</span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Mobile</span>
                <span className="text-slate-800 font-medium">{selectedCustomer.mobile}</span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">City / Address</span>
                <span className="text-slate-800">{selectedCustomer.city} {selectedCustomer.address ? `(${selectedCustomer.address})` : ''}</span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Nationality</span>
                <span className="text-slate-800">{selectedCustomer.nationality} ({selectedCustomer.gender})</span>
              </div>
              <div>
                <span className="text-slate-500 font-semibold block">Channel</span>
                <Badge variant={selectedCustomer.channel === 'direct' ? 'navy' : 'gold'}>
                  {selectedCustomer.channel === 'direct' ? 'Direct B2C' : `Agent (${selectedCustomer.agentId})`}
                </Badge>
              </div>
            </div>

            {/* Timeline Section */}
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#0e2c4c]" />
                <span>Client Activity & Booking Timeline</span>
              </h4>
              <div className="space-y-3">
                <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-bold">1</div>
                    <div>
                      <div className="font-bold text-slate-800">Customer Record Created</div>
                      <div className="text-slate-500">Source: {selectedCustomer.createdFrom} • {new Date(selectedCustomer.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <Badge variant="success">Completed</Badge>
                </div>

                <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#0e2c4c]/10 flex items-center justify-center text-[#0e2c4c] font-bold">2</div>
                    <div>
                      <div className="font-bold text-slate-800">Sub-Ledger Account Active</div>
                      <div className="text-slate-500">Balance: SAR 0.00 (PKR 0.00)</div>
                    </div>
                  </div>
                  <Badge variant="navy">Linked</Badge>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Owner-Only Merge Duplicates Modal */}
      {isOwner && (
        <Modal
          isOpen={mergeModalOpen}
          onClose={() => setMergeModalOpen(false)}
          title="Merge Duplicate Customer Profiles"
          subtitle="Owner-only utility to merge a duplicate client into a survivor profile and reassign all links."
          footer={
            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={() => setMergeModalOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={handleMerge} loading={merging}>Confirm Merge</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Survivor Profile (Keep This)</label>
              <select
                value={survivorId}
                onChange={(e) => setSurvivorId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none"
              >
                <option value="">-- Select Survivor Client --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName} ({c.passportNumber})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Duplicate Profile (Delete & Reassign)</label>
              <select
                value={duplicateId}
                onChange={(e) => setDuplicateId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none"
              >
                <option value="">-- Select Duplicate Client to Merge --</option>
                {customers.filter((c) => c.id !== survivorId).map((c) => (
                  <option key={c.id} value={c.id}>{c.fullName} ({c.passportNumber})</option>
                ))}
              </select>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Merging is irreversible. All visa and booking references will be migrated to the survivor profile.</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
