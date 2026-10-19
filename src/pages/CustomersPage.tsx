import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ChevronRight,
  Pencil,
  Trash2
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DataTable, Column } from '../components/ui/DataTable';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { CustomerDoc } from '../types/customer';
import { AgentsPage } from './AgentsPage';
import { fetchCustomers, createCustomer, mergeCustomers, updateCustomer, deleteCustomer } from '../services/customerService';
import { fetchVisas } from '../services/visaService';
import { fetchVouchers } from '../services/voucherService';
import { fetchLedgerAccounts, fetchLedgerEntries } from '../services/accountingService';
import { fetchPayments } from '../services/paymentService';
import { fetchTickets } from '../services/ticketService';
import { fetchJournalVouchers } from '../services/journalVoucherService';
import { fetchVisaInvoices } from '../services/visaDistributionService';
import { useCurrentRate } from '../services/exchangeRateService';
import ProfileTimeline from '../components/ProfileTimeline';

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
  const { userProfile, role } = useAuth();
  const { success, error: showError } = useToast();
  const canView = useCan('Visas', 'view');
  const canCreate = useCan('Visas', 'create');
  const isOwner = role === 'owner';
  const canManage = role === 'owner' || role === 'staff';

  const [customers, setCustomers] = useState<CustomerDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');

  // Add Customer Modal
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'customers' | 'agents'>('customers');
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

  // Customer Profile Detail Modal / Drawer & Live Timeline States
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDoc | null>(null);
  const [customerVisas, setCustomerVisas] = useState<any[]>([]);
  const [customerVouchers, setCustomerVouchers] = useState<any[]>([]);
  const [customerLedgerAccount, setCustomerLedgerAccount] = useState<any>(null);
  const [customerLedgerEntries, setCustomerLedgerEntries] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [customerTickets, setCustomerTickets] = useState<any[]>([]);
  const [customerJVs, setCustomerJVs] = useState<any[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);
  const masterRate = useCurrentRate('SAR-PKR');

  // Merge Duplicate Modal (Owner only)
  const [mergeModalOpen, setMergeModalOpen] = useState<boolean>(false);
  const [survivorId, setSurvivorId] = useState<string>('');
  const [duplicateId, setDuplicateId] = useState<string>('');
  const [merging, setMerging] = useState<boolean>(false);

  // Edit Customer Modal state
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [customerToEdit, setCustomerToEdit] = useState<CustomerDoc | null>(null);
  const [editing, setEditing] = useState<boolean>(false);
  const [editFullName, setEditFullName] = useState<string>('');
  const [editPassportNumber, setEditPassportNumber] = useState<string>('');
  const [editNationality, setEditNationality] = useState<string>('Pakistani');
  const [editGender, setEditGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [editDateOfBirth, setEditDateOfBirth] = useState<string>('');
  const [editMobile, setEditMobile] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editCity, setEditCity] = useState<string>('');
  const [editAddress, setEditAddress] = useState<string>('');
  const [editCnic, setEditCnic] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  // Delete Customer confirm state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerDoc | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

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

  // Fetch live timeline data when a customer is selected
  useEffect(() => {
    if (!selectedCustomer) return;
    const loadCustomerDetails = async () => {
      setLoadingTimeline(true);
      try {
        const [visas, vouchers, accounts, entries, payments, tickets, jvs, invoices] = await Promise.all([
          fetchVisas(),
          fetchVouchers(),
          fetchLedgerAccounts(),
          fetchLedgerEntries(),
          fetchPayments(),
          fetchTickets(),
          fetchJournalVouchers(),
          fetchVisaInvoices(),
        ]);

        const matchedVisas = visas.filter(
          (v: any) => 
            (v.passportNumber && v.passportNumber.toUpperCase() === selectedCustomer.passportNumber.toUpperCase()) ||
            (v.pilgrimName && v.pilgrimName.toLowerCase() === selectedCustomer.fullName.toLowerCase())
        );
        setCustomerVisas(matchedVisas);

        const visaIds = new Set(matchedVisas.map((v: any) => v.id));
        const matchedVouchers = vouchers.filter((vo: any) => {
          const hasVisa = vo.visaIds?.some((id: string) => visaIds.has(id));
          const hasPassport = vo.passengers?.some((p: any) => p.passportNumber?.toUpperCase() === selectedCustomer.passportNumber.toUpperCase());
          return hasVisa || hasPassport;
        });
        setCustomerVouchers(matchedVouchers);

        const acc = accounts.find((a: any) => a.linkedAgentId === selectedCustomer.id || a.accountName.toLowerCase() === selectedCustomer.fullName.toLowerCase());
        setCustomerLedgerAccount(acc || null);

        if (acc) {
          setCustomerLedgerEntries(entries.filter((e: any) => e.accountId === acc.id));
          setCustomerPayments(payments.filter((p: any) => p.fromAccountId === acc.id || p.toAccountId === acc.id));
          // Tickets bought for this customer (direct B2C)
          setCustomerTickets(tickets.filter((t: any) =>
            t.buyerId === selectedCustomer.id ||
            (t.passportNumber && t.passportNumber.toUpperCase() === selectedCustomer.passportNumber.toUpperCase())
          ));
          // Journal vouchers touching this customer's ledger account
          setCustomerJVs(jvs.filter((jv: any) =>
            (jv.lines || []).some((l: any) => l.accountId === acc.id)
          ));
          // VV documents are B2B (agent-level); B2C customers have none
          setCustomerInvoices([]);
        } else {
          setCustomerLedgerEntries([]);
          setCustomerPayments([]);
          setCustomerTickets([]);
          setCustomerJVs([]);
          setCustomerInvoices([]);
        }
      } catch (err) {
        console.warn('Failed to load customer timeline details:', err);
      } finally {
        setLoadingTimeline(false);
      }
    };
    loadCustomerDetails();
  }, [selectedCustomer]);

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

  // Open Edit Customer Modal (prefilled)
  const openEditCustomer = (c: CustomerDoc) => {
    setCustomerToEdit(c);
    setEditFullName(c.fullName || '');
    setEditPassportNumber(c.passportNumber || '');
    setEditNationality(c.nationality || 'Pakistani');
    setEditGender(c.gender || 'Male');
    setEditDateOfBirth(c.dateOfBirth || '');
    setEditMobile(c.mobile || '');
    setEditEmail(c.email || '');
    setEditCity(c.city || '');
    setEditAddress(c.address || '');
    setEditCnic(c.cnic || '');
    setEditNotes(c.notes || '');
    setEditModalOpen(true);
  };

  // Save Edit Customer
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile || !customerToEdit) return;

    if (!editFullName.trim() || !editPassportNumber.trim() || !editMobile.trim() || !editCity.trim()) {
      showError('Full name, passport number, mobile, and city are required.');
      return;
    }

    setEditing(true);
    try {
      await updateCustomer(userProfile, customerToEdit.id, {
        fullName: editFullName.trim(),
        passportNumber: editPassportNumber.trim().toUpperCase(),
        nationality: editNationality,
        gender: editGender,
        dateOfBirth: editDateOfBirth,
        mobile: editMobile.trim(),
        email: editEmail.trim(),
        city: editCity.trim(),
        address: editAddress.trim(),
        cnic: editCnic.trim(),
        notes: editNotes.trim(),
      });

      success(`Customer "${editFullName}" updated successfully.`);
      setEditModalOpen(false);
      setCustomerToEdit(null);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to update customer.');
    } finally {
      setEditing(false);
    }
  };

  // Delete customer (permanent — blocked when the ledger has history)
  const handleDeleteClick = (c: CustomerDoc) => {
    setCustomerToDelete(c);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!userProfile || !customerToDelete) return;
    setDeleting(true);
    try {
      await deleteCustomer(userProfile, customerToDelete.id);
      success(`Customer "${customerToDelete.fullName}" deleted permanently.`);
      setDeleteConfirmOpen(false);
      setCustomerToDelete(null);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to delete customer.');
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const filteredCustomers = customers.filter((c) =>
    c.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.passportNumber.toLowerCase().includes(search.toLowerCase()) ||
    c.mobile.includes(search) ||
    c.city.toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<CustomerDoc>[] = [
    {
      key: 'name',
      header: 'Full Name & Passport',
      render: (row) => (
        <div>
          <div className="font-bold text-slate-900 text-xs">{row.fullName}</div>
          <div className="text-[11px] font-mono text-[var(--theme-primary)] font-semibold">{row.passportNumber}</div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact & City',
      render: (row) => (
        <div>
          <div className="text-xs text-slate-800">{row.mobile}</div>
          <div className="text-[11px] text-slate-500">{row.city} {row.nationality ? `(${row.nationality})` : ''}</div>
        </div>
      ),
    },
    {
      key: 'channel',
      header: 'Channel & Source',
      render: (row) => (
        <div>
          <Badge variant={row.channel === 'direct' ? 'navy' : 'gold'} size="sm">
            {row.channel === 'direct' ? 'Direct B2C' : `Agent (${row.agentId || 'B2B'})`}
          </Badge>
          <span className="text-[10px] text-slate-400 block mt-0.5">Source: {row.createdFrom}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedCustomer(row);
              setProfileModalOpen(true);
            }}
          >
            View Profile & Timeline
          </Button>
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Pencil className="w-3.5 h-3.5 text-slate-500" />}
              onClick={() => openEditCustomer(row)}
              title="Edit Customer Details"
            >
              Edit
            </Button>
          )}
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Trash2 className="w-3.5 h-3.5 text-rose-500" />}
              onClick={() => handleDeleteClick(row)}
              title="Delete Customer Permanently"
              className="hover:text-rose-600 hover:border-rose-300"
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers & Agents"
        subtitle="Manage B2C direct customers, pilgrim profiles, and B2B sub-agent partnerships."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Customers & Agents' }]}
        actions={
          activeTab === 'customers' ? (
            <div className="flex items-center gap-2">
              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Merge className="w-3.5 h-3.5" />}
                  onClick={() => setMergeModalOpen(true)}
                >
                  Merge Duplicates
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setAddModalOpen(true)}
                className="bg-[#0e2c4c] hover:bg-[#1a4473]"
              >
                + Add Customer
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        {[
          { key: 'customers', label: 'Customers', icon: Users },
          { key: 'agents', label: 'B2B Sub-Agents', icon: UserCheck },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key as 'customers' | 'agents')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                isActive
                  ? 'bg-[#0e2c4c] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'agents' ? (
        <AgentsPage />
      ) : (
      <>
      {/* Search Bar */}
      <Card padding="md" className="border-slate-200 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, passport number, mobile, or city..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
          />
        </div>
      </Card>

      {/* Customers Table */}
      <Card padding="none" className="border-slate-200 shadow-xs overflow-hidden">
        <DataTable
          columns={columns}
          data={filteredCustomers}
          keyExtractor={(c) => c.id}
          loading={loading}
          emptyTitle="No customers found"
          emptyDescription="There are no customer profiles available in the directory."
        />
      </Card>

      </>
      )}

      {/* Add Customer Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Direct B2C Customer"
        subtitle="Register a direct traveler profile. Automatically provisions a dedicated B2C financial sub-ledger account."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleAddCustomer} loading={creating} className="bg-[#0e2c4c]">
              Create Customer
            </Button>
          </div>
        }
      >
        <form onSubmit={handleAddCustomer} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name (As in Passport) *"
              placeholder="e.g. Muhammad Ahmed Khan"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Input
              label="Passport Number *"
              placeholder="e.g. AB1234567"
              value={passportNumber}
              onChange={(e) => setPassportNumber(e.target.value.toUpperCase())}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Nationality</label>
              <input
                type="text"
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Gender</label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <Input
              label="Mobile Number *"
              placeholder="e.g. +92 300 1234567"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="e.g. ahmed@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="CNIC / National ID"
              placeholder="e.g. 42101-9988776-1"
              value={cnic}
              onChange={(e) => setCnic(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="City *"
              placeholder="e.g. Karachi"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
            />
            <Input
              label="Street Address"
              placeholder="e.g. DHA Phase 6"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
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

      {/* Customer Profile & Live Timeline Modal */}
      {selectedCustomer && (
        <Modal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          title={`Customer Profile: ${selectedCustomer.fullName}`}
          subtitle={`Passport: ${selectedCustomer.passportNumber} • Channel: ${selectedCustomer.channel.toUpperCase()}`}
          size="lg"
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
                <span className="font-mono font-bold text-[var(--theme-primary)]">{selectedCustomer.passportNumber}</span>
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

            {/* Live Timeline Section */}
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-[var(--theme-primary)]" />
                  <span>Client Activity & Booking Live Timeline</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Balance: SAR {(customerLedgerAccount?.currentBalanceSAR || 0).toLocaleString()} (PKR {Math.round((customerLedgerAccount?.currentBalanceSAR || 0) * masterRate).toLocaleString()})
                </span>
              </h4>

              {loadingTimeline ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading live timeline records...</div>
              ) : (
                <ProfileTimeline
                  accountId={customerLedgerAccount?.id || null}
                  visas={customerVisas}
                  vouchers={customerVouchers}
                  tickets={customerTickets}
                  jvs={customerJVs}
                  invoices={customerInvoices}
                  payments={customerPayments}
                  entries={customerLedgerEntries}
                  masterRate={masterRate}
                  onNavigate={(path) => { setProfileModalOpen(false); navigate(path); }}
                />
              )}
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

      {/* Edit Customer Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Customer"
        subtitle={`Update profile for ${customerToEdit?.fullName}`}
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
        <form onSubmit={handleSaveEdit} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name (As in Passport) *"
              value={editFullName}
              onChange={(e) => setEditFullName(e.target.value)}
              required
            />
            <Input
              label="Passport Number *"
              value={editPassportNumber}
              onChange={(e) => setEditPassportNumber(e.target.value.toUpperCase())}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Nationality</label>
              <input
                type="text"
                value={editNationality}
                onChange={(e) => setEditNationality(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Gender</label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as any)}
                className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <Input
              label="Date of Birth"
              type="date"
              value={editDateOfBirth}
              onChange={(e) => setEditDateOfBirth(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Mobile Number *"
              value={editMobile}
              onChange={(e) => setEditMobile(e.target.value)}
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="City *"
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              required
            />
            <Input
              label="CNIC / National ID"
              value={editCnic}
              onChange={(e) => setEditCnic(e.target.value)}
            />
          </div>

          <Input
            label="Street Address"
            value={editAddress}
            onChange={(e) => setEditAddress(e.target.value)}
          />

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Notes & Special Requirements</label>
            <textarea
              rows={3}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full p-3 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
        </form>
      </Modal>

      {/* Delete Customer Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title={`Delete Customer — ${customerToDelete?.fullName}`}
        message={
          <p>
            Are you sure you want to delete customer <strong>{customerToDelete?.fullName}</strong> (Passport: {customerToDelete?.passportNumber})?
            This will also remove their linked ledger account.
            This will permanently delete this record. This data cannot be recovered.
          </p>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
      />
    </div>
  );
};
