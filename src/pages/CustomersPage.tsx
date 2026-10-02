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
import { fetchVisas } from '../services/visaService';
import { fetchVouchers } from '../services/voucherService';
import { fetchLedgerAccounts, fetchLedgerEntries } from '../services/accountingService';
import { fetchPayments } from '../services/paymentService';

export const CustomersPage: React.FC = () => {
  const navigate = useNavigate();
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

  // Customer Profile Detail Modal / Drawer & Live Timeline States
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDoc | null>(null);
  const [customerVisas, setCustomerVisas] = useState<any[]>([]);
  const [customerVouchers, setCustomerVouchers] = useState<any[]>([]);
  const [customerLedgerAccount, setCustomerLedgerAccount] = useState<any>(null);
  const [customerLedgerEntries, setCustomerLedgerEntries] = useState<any[]>([]);
  const [customerPayments, setCustomerPayments] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);

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

  // Fetch live timeline data when a customer is selected
  useEffect(() => {
    if (!selectedCustomer) return;
    const loadCustomerDetails = async () => {
      setLoadingTimeline(true);
      try {
        const [visas, vouchers, accounts, entries, payments] = await Promise.all([
          fetchVisas(),
          fetchVouchers(),
          fetchLedgerAccounts(),
          fetchLedgerEntries(),
          fetchPayments(),
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
        } else {
          setCustomerLedgerEntries([]);
          setCustomerPayments([]);
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
          <div className="text-[11px] font-mono text-[#0e2c4c] font-semibold">{row.passportNumber}</div>
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
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Direct B2C Customers & Pilgrims"
        subtitle="Manage B2C direct customer profiles, passports, direct ledgers, and view unified booking activity timelines."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Customers' }]}
        actions={
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
        }
      />

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

            {/* Live Timeline Section */}
            <div>
              <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileCheck className="w-4 h-4 text-[#0e2c4c]" />
                  <span>Client Activity & Booking Live Timeline</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500">
                  Balance: SAR {(customerLedgerAccount?.currentBalanceSAR || 0).toLocaleString()} (PKR {Math.round((customerLedgerAccount?.currentBalanceSAR || 0) * 74.50).toLocaleString()})
                </span>
              </h4>

              {loadingTimeline ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading live timeline records...</div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {/* 1. Customer Record Created */}
                  <div 
                    onClick={() => setProfileModalOpen(false)}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:bg-slate-50 transition cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600 font-bold shrink-0">1</div>
                      <div>
                        <div className="font-bold text-slate-800">Customer Record Created ({selectedCustomer.createdFrom})</div>
                        <div className="text-slate-500 text-[11px]">{new Date(selectedCustomer.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <Badge variant="success">Active</Badge>
                  </div>

                  {/* 2. Sub-Ledger Account Active & Balance */}
                  <div 
                    onClick={() => { setProfileModalOpen(false); navigate('/accounting'); }}
                    className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:bg-slate-50 transition cursor-pointer shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0e2c4c]/10 flex items-center justify-center text-[#0e2c4c] font-bold shrink-0">2</div>
                      <div>
                        <div className="font-bold text-slate-800">B2C Sub-Ledger Account & Current Balance</div>
                        <div className="text-slate-600 font-mono text-[11px]">
                          SAR {(customerLedgerAccount?.currentBalanceSAR || 0).toLocaleString()} (PKR {Math.round((customerLedgerAccount?.currentBalanceSAR || 0) * 74.50).toLocaleString()})
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[#0e2c4c] font-bold">
                      <span>View Ledger</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* 3. Visas from imports */}
                  {customerVisas.map((v: any, idx: number) => (
                    <div 
                      key={v.id || idx}
                      onClick={() => { setProfileModalOpen(false); navigate('/visas'); }}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:bg-slate-50 transition cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 font-bold shrink-0">V</div>
                        <div>
                          <div className="font-bold text-slate-800">Visa Record: {v.visaNo || v.pilgrimName}</div>
                          <div className="text-slate-500 text-[11px]">Type: {v.visaType} • Status: {v.status} • Batch: {v.batchNo}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-blue-600 font-bold">
                        <span>Open Visa</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}

                  {/* 4. Vouchers */}
                  {customerVouchers.map((vo: any, idx: number) => (
                    <div 
                      key={vo.id || idx}
                      onClick={() => { setProfileModalOpen(false); navigate('/vouchers'); }}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:bg-slate-50 transition cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 font-bold shrink-0">U</div>
                        <div>
                          <div className="font-bold text-slate-800">Umrah Voucher #{vo.voucherNo || vo.id}</div>
                          <div className="text-slate-500 text-[11px]">Total: SAR {(vo.totalSAR || 0).toLocaleString()} • Status: {vo.status}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-amber-600 font-bold">
                        <span>Open Voucher</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}

                  {/* 5. Payments */}
                  {customerPayments.map((p: any, idx: number) => (
                    <div 
                      key={p.id || idx}
                      onClick={() => { setProfileModalOpen(false); navigate('/payments'); }}
                      className="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:bg-slate-50 transition cursor-pointer shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 font-bold shrink-0">$</div>
                        <div>
                          <div className="font-bold text-slate-800">Payment {p.paymentNo} ({p.entryType})</div>
                          <div className="text-slate-500 text-[11px]">SAR {(p.amountSAR || 0).toLocaleString()} (PKR {(p.amountPKR || 0).toLocaleString()}) • {p.date}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-purple-600 font-bold">
                        <span>Open Payment</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ))}
                </div>
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
    </div>
  );
};
