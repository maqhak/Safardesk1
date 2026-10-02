import React from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart3, 
  Download, 
  FileText, 
  Calendar, 
  Filter, 
  TrendingUp, 
  CreditCard, 
  Users, 
  Plane,
  Building,
  Compass
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../contexts/ToastContext';

interface ReportTemplate {
  title: string;
  category: string;
  description: string;
  icon: any;
  lastGenerated: string;
}

const REPORTS: ReportTemplate[] = [
  {
    title: 'Agent Ledger Statements (SAR / PKR)',
    category: 'Finance',
    description: 'Detailed statement of account with debit, credit, running balance and exchange rate breakdowns.',
    icon: CreditCard,
    lastGenerated: 'Today, 08:30 AM',
  },
  {
    title: 'Monthly Visa Issuance & Profitability',
    category: 'Visas',
    description: 'Breakdown of visas issued by category, country, sub-agent margins and MoFA fees.',
    icon: FileText,
    lastGenerated: 'Yesterday',
  },
  {
    title: 'Hotel Voucher Occupancy & Allotment',
    category: 'Vouchers',
    description: 'Property-wise room night consumption across Makkah & Madinah contracted hotels.',
    icon: Building,
    lastGenerated: '2 days ago',
  },
  {
    title: 'Airline Ticketing Sales & BSP Reconciliation',
    category: 'Ticketing',
    description: 'Daily ticketing sales register, voids, reissues, commissions and airline stock usage.',
    icon: Plane,
    lastGenerated: '3 days ago',
  },
  {
    title: 'Forex Fluctuations & SAR/PKR Gain/Loss',
    category: 'Treasury',
    description: 'Forex impact on cross-border agent remittances and realized exchange rate margins.',
    icon: TrendingUp,
    lastGenerated: 'Weekly on Monday',
  },
  {
    title: 'Sub-Agent Performance League',
    category: 'Commercial',
    description: 'Top booking agents ranked by total revenue, visa volume, and prompt settlement ratios.',
    icon: Users,
    lastGenerated: 'Monthly',
  },
];

export const ReportsPage: React.FC = () => {
  const { success } = useToast();

  const handleDownload = (reportTitle: string) => {
    success(`Generating ${reportTitle} in PDF and Excel format.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Reports & Analytics"
        subtitle="Generate audited financial statements, operational manifests, forex reconciliations, and agent summaries."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Reports' }]}
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Filter className="w-3.5 h-3.5" />}
          >
            Custom Date Range
          </Button>
        }
      />

      {/* Featured Movement Reports Banner */}
      <Card padding="md" className="bg-gradient-to-r from-[#0e2c4c] to-[#1a4473] text-white border-none shadow-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#c9a227] text-white uppercase tracking-wider">
              <Compass className="w-3 h-3" />
              <span>Operational Ground Manifest</span>
            </div>
            <h3 className="text-lg font-bold text-white">Movement Reports: Arrivals, Intercity & Departures</h3>
            <p className="text-xs text-slate-200 max-w-2xl leading-relaxed">
              Consolidated 4-movement manifest (Arrival to Kingdom, Makkah to Madina, Madina to Makkah, Departure from Kingdom) with 4 summary panels, continuous unpaginated grid, and exportable CSVs.
            </p>
          </div>
          <Link to="/tickets/movement-reports">
            <Button variant="primary" className="bg-[#c9a227] hover:bg-[#b08d20] text-white border-none shrink-0 font-bold">
              Open Movement Reports
            </Button>
          </Link>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {REPORTS.map((r, i) => {
          const Icon = r.icon;
          return (
            <Card key={i} hoverEffect padding="md" className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-navy-50 text-[#0e2c4c] flex items-center justify-center border border-navy-100">
                    <Icon className="w-5 h-5" />
                  </div>
                  <Badge variant="navy" size="sm">
                    {r.category}
                  </Badge>
                </div>

                <h3 className="text-base font-bold text-slate-900 tracking-tight mb-1">
                  {r.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {r.description}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-400">
                  Last run: {r.lastGenerated}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => handleDownload(r.title)}
                >
                  Generate
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
