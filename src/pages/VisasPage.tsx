import React, { useState } from 'react';
import { 
  FileCheck, 
  Plus, 
  UploadCloud, 
  Filter, 
  Search, 
  Download, 
  Clock, 
  CheckCircle2, 
  AlertTriangle,
  UserCheck
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { CurrencyAmount } from '../components/ui/CurrencyAmount';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { formatDate } from '../utils/formatters';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';

interface VisaRecord {
  id: string;
  applicantName: string;
  passportNumber: string;
  nationality: string;
  visaType: 'Umrah Visa' | 'Tourist e-Visa' | 'Commercial Visit' | 'Work Visa';
  agentName: string;
  applicationDate: string;
  feeSar: number;
  status: 'Issued' | 'In Process' | 'Rejected' | 'Draft';
}

const SAMPLE_VISAS: VisaRecord[] = [
  {
    id: 'v-01',
    applicantName: 'Tariq Mehmood',
    passportNumber: 'AB8920194',
    nationality: 'Pakistani',
    visaType: 'Umrah Visa',
    agentName: 'Al-Barakah Karachi',
    applicationDate: '2026-10-01',
    feeSar: 450,
    status: 'Issued',
  },
  {
    id: 'v-02',
    applicantName: 'Shabana Tariq',
    passportNumber: 'AB8920195',
    nationality: 'Pakistani',
    visaType: 'Umrah Visa',
    agentName: 'Al-Barakah Karachi',
    applicationDate: '2026-10-01',
    feeSar: 450,
    status: 'Issued',
  },
  {
    id: 'v-03',
    applicantName: 'Kamran Ali Khan',
    passportNumber: 'DG4029182',
    nationality: 'Pakistani',
    visaType: 'Tourist e-Visa',
    agentName: 'Falcon Travels Lahore',
    applicationDate: '2026-09-30',
    feeSar: 540,
    status: 'In Process',
  },
  {
    id: 'v-04',
    applicantName: 'Rashid Minhas',
    passportNumber: 'KL1102938',
    nationality: 'Pakistani',
    visaType: 'Commercial Visit',
    agentName: 'Corporate Desk HQ',
    applicationDate: '2026-09-29',
    feeSar: 820,
    status: 'Issued',
  },
  {
    id: 'v-05',
    applicantName: 'Zubair Ahmad Qureshi',
    passportNumber: 'MN9028192',
    nationality: 'Pakistani',
    visaType: 'Umrah Visa',
    agentName: 'Makkah Direct Rawalpindi',
    applicationDate: '2026-09-28',
    feeSar: 450,
    status: 'Draft',
  },
];

export const VisasPage: React.FC = () => {
  const { success, info } = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const canCreate = useCan('Visas', 'create');

  const filteredVisas = SAMPLE_VISAS.filter(
    (v) =>
      v.applicantName.toLowerCase().includes(search.toLowerCase()) ||
      v.passportNumber.toLowerCase().includes(search.toLowerCase()) ||
      v.agentName.toLowerCase().includes(search.toLowerCase())
  );

  const columns: Column<VisaRecord>[] = [
    {
      key: 'applicantName',
      header: 'Applicant & Passport',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-semibold text-slate-900 block">{row.applicantName}</span>
          <span className="text-xs font-mono text-slate-500">
            {row.passportNumber} • {row.nationality}
          </span>
        </div>
      ),
    },
    {
      key: 'visaType',
      header: 'Visa Category',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
          {row.visaType}
        </span>
      ),
    },
    {
      key: 'agentName',
      header: 'Sub-Agent / Source',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-medium text-slate-700">{row.agentName}</span>
      ),
    },
    {
      key: 'applicationDate',
      header: 'Submission Date',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-slate-600">{formatDate(row.applicationDate)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (row) => {
        if (row.status === 'Issued') return <Badge variant="success" dot>Issued</Badge>;
        if (row.status === 'In Process') return <Badge variant="gold" dot>In Process</Badge>;
        if (row.status === 'Draft') return <Badge variant="neutral" dot>Draft</Badge>;
        return <Badge variant="danger" dot>Rejected</Badge>;
      },
    },
    {
      key: 'feeSar',
      header: 'Visa Fee (SAR / PKR)',
      sortable: true,
      align: 'right',
      render: (row) => <CurrencyAmount amountSar={row.feeSar} size="sm" />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visa Management"
        subtitle="Process and track Umrah electronic visas, tourist e-Visas, passport imports and distributions."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Visas' }]}
        actions={
          canCreate ? (
            <>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<UploadCloud className="w-3.5 h-3.5" />}
                onClick={() => info('Bulk passport Excel/XML import ready in Phase 1.')}
              >
                Batch Import
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={() => setModalOpen(true)}
              >
                New Visa Application
              </Button>
            </>
          ) : null
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Visas Issued This Month"
          value="1,120"
          subValue="Umrah & Tourist Visas"
          icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
          trend={{ value: 16.2 }}
        />
        <StatCard
          label="Currently In Process"
          value="84"
          subValue="Awaiting MoFA confirmation"
          icon={<Clock className="w-5 h-5 text-amber-600" />}
        />
        <StatCard
          label="Sub-Agent Distributions"
          value="42 Agents"
          subValue="Pakistan & Regional B2B"
          icon={<UserCheck className="w-5 h-5" />}
        />
        <StatCard
          label="Total Visa Volume"
          value={<CurrencyAmount amountSar={504000} layout="sar-only" size="lg" />}
          subValue="Gross Visa Billing"
          icon={<FileCheck className="w-5 h-5" />}
        />
      </div>

      {/* Filter and Table */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-72">
            <Input
              placeholder="Search applicant or passport..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Filter className="w-3.5 h-3.5" />}
              onClick={() => info('Filter drawers will activate with Phase 1 Firestore filters.')}
            >
              Filter
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-3.5 h-3.5" />}
              onClick={() => success('Exporting visa manifest to Excel / CSV.')}
            >
              Export
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={filteredVisas}
          keyExtractor={(row) => row.id}
          onRowClick={(row) => info(`Applicant selected: ${row.applicantName} (${row.passportNumber})`)}
        />
      </div>

      {/* New Application Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Register New Visa Application"
        subtitle="Phase 0 UI Scaffold — Visa Module form layout"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setModalOpen(false);
                success('Visa application recorded to draft ledger.');
              }}
            >
              Submit Application
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Applicant Full Name" placeholder="As written in passport" required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Passport Number" placeholder="e.g. AB1234567" required />
            <Input label="Nationality" placeholder="e.g. Pakistani" defaultValue="Pakistani" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Sub-Agent / Booker" placeholder="Select Agent" defaultValue="Al-Barakah Karachi" />
            <Input label="Fee (SAR)" type="number" defaultValue="450" />
          </div>
        </div>
      </Modal>
    </div>
  );
};
