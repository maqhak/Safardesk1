import React, { useState } from 'react';
import { 
  Plus, 
  Download, 
  Filter, 
  FileCheck, 
  Building, 
  Plane, 
  CreditCard, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  HelpCircle,
  RefreshCw,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { CurrencyAmount } from '../components/ui/CurrencyAmount';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DateInput } from '../components/ui/DateInput';
import { Input } from '../components/ui/Input';
import { formatDate, formatMoney } from '../utils/formatters';
import { TENANT } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';

interface SampleBooking {
  id: string;
  referenceNo: string;
  clientName: string;
  serviceType: 'Umrah Visa' | 'Tourist Visa' | 'Hotel Voucher' | 'Airline Ticket';
  sector: string;
  date: string;
  amountSar: number;
  status: 'Issued' | 'Confirmed' | 'Processing' | 'Pending Payment';
}

const SAMPLE_BOOKINGS: SampleBooking[] = [
  {
    id: 'b-101',
    referenceNo: 'VIS-2026-891',
    clientName: 'Al-Madinah Hajj Group (24 Pax)',
    serviceType: 'Umrah Visa',
    sector: 'KSA Electronic Visa',
    date: '2026-10-01',
    amountSar: 10800,
    status: 'Issued',
  },
  {
    id: 'b-102',
    referenceNo: 'VCH-2026-442',
    clientName: 'Farhan Zaidi & Family',
    serviceType: 'Hotel Voucher',
    sector: 'Makkah Clock Royal Tower (5 Nights)',
    date: '2026-09-30',
    amountSar: 6250,
    status: 'Confirmed',
  },
  {
    id: 'b-103',
    referenceNo: 'TCK-2026-118',
    clientName: 'Muhammad Salman Siddiqui',
    serviceType: 'Airline Ticket',
    sector: 'JED - KHI (Saudia SV-702)',
    date: '2026-09-29',
    amountSar: 2450,
    status: 'Confirmed',
  },
  {
    id: 'b-104',
    referenceNo: 'VIS-2026-892',
    clientName: 'Rashid Mahmood & Spouse',
    serviceType: 'Umrah Visa',
    sector: 'Umrah B2B Agent Portal',
    date: '2026-09-29',
    amountSar: 900,
    status: 'Processing',
  },
  {
    id: 'b-105',
    referenceNo: 'VCH-2026-443',
    clientName: 'Al-Khaleej International Tours',
    serviceType: 'Hotel Voucher',
    sector: 'Pullman Zamzam Madinah (3 Nights)',
    date: '2026-09-28',
    amountSar: 3840,
    status: 'Pending Payment',
  },
  {
    id: 'b-106',
    referenceNo: 'TCK-2026-119',
    clientName: 'Syed Ali Raza',
    serviceType: 'Airline Ticket',
    sector: 'RUH - LHE (Flynas XY-311)',
    date: '2026-09-27',
    amountSar: 1890,
    status: 'Issued',
  },
];

export const DashboardPage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, info } = useToast();
  const canCreate = useCan('Dashboard', 'create');

  const [quickEntryModalOpen, setQuickEntryModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<SampleBooking | null>(null);

  // New quick record form state
  const [newClient, setNewClient] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newDate, setNewDate] = useState('2026-10-02');

  const statusBadgeMap: Record<SampleBooking['status'], { variant: any; label: string }> = {
    Issued: { variant: 'success', label: 'Issued' },
    Confirmed: { variant: 'navy', label: 'Confirmed' },
    Processing: { variant: 'gold', label: 'Processing' },
    'Pending Payment': { variant: 'warning', label: 'Pending Payment' },
  };

  const columns: Column<SampleBooking>[] = [
    {
      key: 'referenceNo',
      header: 'Reference #',
      sortable: true,
      width: '140px',
      render: (row) => (
        <span className="font-mono font-semibold text-[#0e2c4c]">
          {row.referenceNo}
        </span>
      ),
    },
    {
      key: 'clientName',
      header: 'Client / Group',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-semibold text-slate-900 block">{row.clientName}</span>
          <span className="text-xs text-slate-400">{row.sector}</span>
        </div>
      ),
    },
    {
      key: 'serviceType',
      header: 'Service Category',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
          {row.serviceType}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Booking Date',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-slate-600">
          {formatDate(row.date)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (row) => {
        const item = statusBadgeMap[row.status];
        return <Badge variant={item.variant} dot>{item.label}</Badge>;
      },
    },
    {
      key: 'amountSar',
      header: 'Amount (SAR / PKR)',
      sortable: true,
      align: 'right',
      render: (row) => (
        <CurrencyAmount amountSar={row.amountSar} layout="stacked" size="sm" />
      ),
    },
  ];

  const handleRowClick = (booking: SampleBooking) => {
    setSelectedBooking(booking);
    setConfirmModalOpen(true);
  };

  const handleCreateSampleRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClient.trim()) return;
    setQuickEntryModalOpen(false);
    success(`New transaction reference generated for ${newClient}`, 'Record Created');
    setNewClient('');
    setNewAmount('');
  };

  return (
    <div className="space-y-6">
      {/* Top Page Header */}
      <PageHeader
        title="Executive Overview"
        subtitle={`Welcome, ${userProfile?.name || 'Administrator'}. Here is your operations snapshot for ${TENANT.companyName}.`}
        breadcrumbs={[{ label: 'Dashboard' }]}
        badge={
          <Badge variant="gold" size="md">
            Forex: 1 SAR = {TENANT.currency.defaultExchangeRate.toFixed(2)} PKR
          </Badge>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => info('Ledgers and status synchronized.', 'Data Refreshed')}
            >
              Refresh
            </Button>
            {canCreate && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setQuickEntryModalOpen(true)}
              >
                New Transaction
              </Button>
            )}
          </>
        }
      />

      {/* KPI Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <StatCard
          label="Total Visas Processed"
          value="1,428"
          subValue="Umrah & Tourist Visas"
          icon={<FileCheck className="w-5 h-5" />}
          trend={{ value: 14.8, label: 'vs last month' }}
        />

        <StatCard
          label="Active Hotel Vouchers"
          value="342"
          subValue="Makkah & Madinah Properties"
          icon={<Building className="w-5 h-5" />}
          trend={{ value: 8.5, label: 'vs last month' }}
        />

        <StatCard
          label="Monthly Ticket Turnover"
          value={<CurrencyAmount amountSar={425800} layout="sar-only" size="lg" />}
          subValue={`≈ ${formatMoney(425800 * TENANT.currency.defaultExchangeRate, 'PKR')}`}
          icon={<Plane className="w-5 h-5" />}
          trend={{ value: 21.2, label: 'vs last month' }}
        />

        <StatCard
          label="Outstanding Receivables"
          value={<CurrencyAmount amountSar={96450} layout="sar-only" size="lg" />}
          subValue={`≈ ${formatMoney(96450 * TENANT.currency.defaultExchangeRate, 'PKR')}`}
          icon={<CreditCard className="w-5 h-5" />}
          trend={{ value: -4.1, label: 'collected this week' }}
        />
      </div>

      {/* Operations Quick Shortcuts & Brand Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Recent Bookings & Transactions Table */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Recent Operations & Bookings
              </h2>
              <p className="text-xs text-slate-500">
                Latest visa applications, hotel vouchers and tickets across agents
              </p>
            </div>
            <span className="text-xs text-slate-400">
              Click row to view details
            </span>
          </div>

          <DataTable
            columns={columns}
            data={SAMPLE_BOOKINGS}
            keyExtractor={(row) => row.id}
            onRowClick={handleRowClick}
          />
        </div>

        {/* Right Col: Quick Currency Calculator & System Status */}
        <div className="space-y-6">
          <Card padding="md">
            <CardHeader
              title="Forex Quick Calculator"
              subtitle={`Benchmark rate: 1 SAR = ${TENANT.currency.defaultExchangeRate.toFixed(2)} PKR`}
            />

            <div className="space-y-3">
              <div className="p-3 bg-navy-50/70 rounded-lg border border-navy-100 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block">Umrah Visa Standard (SAR)</span>
                  <span className="text-lg font-bold font-mono text-[#0e2c4c]">450.00 SAR</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">PKR Equivalent</span>
                  <span className="text-sm font-semibold font-mono text-slate-700">
                    {formatMoney(450 * TENANT.currency.defaultExchangeRate, 'PKR')}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block">Makkah Hotel 5-Star / Night</span>
                  <span className="text-lg font-bold font-mono text-slate-900">1,250.00 SAR</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">PKR Equivalent</span>
                  <span className="text-sm font-semibold font-mono text-slate-700">
                    {formatMoney(1250 * TENANT.currency.defaultExchangeRate, 'PKR')}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 flex items-center justify-between">
                <div>
                  <span className="text-xs text-slate-500 block">Return Saudia SV Airfare</span>
                  <span className="text-lg font-bold font-mono text-slate-900">2,850.00 SAR</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">PKR Equivalent</span>
                  <span className="text-sm font-semibold font-mono text-slate-700">
                    {formatMoney(2850 * TENANT.currency.defaultExchangeRate, 'PKR')}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          {/* Tenant White-Label Deployment Notice */}
          <Card padding="md" className="bg-gradient-to-br from-white to-navy-50/30 border-navy-100">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#0e2c4c] text-white flex items-center justify-center shrink-0 text-xs font-bold">
                P0
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Phase 0 Architecture Ready
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Single-file redeployment via <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">src/config.ts</code>. All 8 CRM modules and Firestore collections configured for Phase 1 business logic.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Quick Entry Modal */}
      <Modal
        isOpen={quickEntryModalOpen}
        onClose={() => setQuickEntryModalOpen(false)}
        title="Create New Operational Transaction"
        subtitle="Quick entry form demonstrating design system input fields"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickEntryModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateSampleRecord}
            >
              Save Record
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateSampleRecord} className="space-y-4">
          <Input
            label="Client or Sub-Agent Name"
            placeholder="e.g. Al-Falah Tours Lahore"
            value={newClient}
            onChange={(e) => setNewClient(e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Amount (SAR)"
              type="number"
              placeholder="e.g. 450"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              helperText={`Approx. ${formatMoney(Number(newAmount || 0) * TENANT.currency.defaultExchangeRate, 'PKR')}`}
            />
            <DateInput
              label="Transaction Date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* Booking View & Confirmation Dialog */}
      {selectedBooking && (
        <ConfirmDialog
          isOpen={confirmModalOpen}
          onClose={() => setConfirmModalOpen(false)}
          onConfirm={() => {
            setConfirmModalOpen(false);
            success(`Status refreshed for ${selectedBooking.referenceNo}`);
          }}
          title={`Booking Details — ${selectedBooking.referenceNo}`}
          message={
            <div className="space-y-2 mt-2">
              <p><strong>Client:</strong> {selectedBooking.clientName}</p>
              <p><strong>Service:</strong> {selectedBooking.serviceType} ({selectedBooking.sector})</p>
              <p><strong>Date:</strong> {formatDate(selectedBooking.date)}</p>
              <div className="p-3 bg-slate-50 rounded border border-slate-200 mt-2">
                <CurrencyAmount amountSar={selectedBooking.amountSar} layout="inline" />
              </div>
            </div>
          }
          confirmLabel="Done"
          variant="primary"
        />
      )}
    </div>
  );
};
