import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  BarChart3, 
  Download, 
  FileText, 
  Calendar, 
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
import {
  generateAgentLedgerStatements,
  generateVisaProfitability,
  generateHotelOccupancy,
  generateTicketingSales,
  generateForexReport,
  generateAgentPerformance,
} from '../services/reportService';

interface ReportTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: any;
}

const REPORTS: ReportTemplate[] = [
  {
    id: 'agent-statements',
    title: 'Agent Ledger Statements (SAR / PKR)',
    category: 'Finance',
    description: 'Detailed statement of account with debit, credit, running balance and exchange rate breakdowns.',
    icon: CreditCard,
  },
  {
    id: 'visa-profit',
    title: 'Monthly Visa Issuance & Profitability',
    category: 'Visas',
    description: 'Breakdown of visas issued by category, country, sub-agent margins and MoFA fees.',
    icon: FileText,
  },
  {
    id: 'hotel-occupancy',
    title: 'Hotel Voucher Occupancy & Allotment',
    category: 'Vouchers',
    description: 'Property-wise room night consumption across Makkah & Madinah contracted hotels.',
    icon: Building,
  },
  {
    id: 'ticketing',
    title: 'Airline Ticketing Sales & BSP Reconciliation',
    category: 'Ticketing',
    description: 'Daily ticketing sales register, voids, reissues, commissions and airline stock usage.',
    icon: Plane,
  },
  {
    id: 'forex',
    title: 'Forex Fluctuations & SAR/PKR Gain/Loss',
    category: 'Treasury',
    description: 'Forex impact on cross-border agent remittances and realized exchange rate margins.',
    icon: TrendingUp,
  },
  {
    id: 'agent-league',
    title: 'Sub-Agent Performance League',
    category: 'Commercial',
    description: 'Top booking agents ranked by total revenue, visa volume, and prompt settlement ratios.',
    icon: Users,
  },
];

export const ReportsPage: React.FC = () => {
  const { success, error: showError } = useToast();
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const handleDownload = async (reportId: string, reportTitle: string) => {
    setGeneratingId(reportId);
    try {
      const range = { from: dateFrom || undefined, to: dateTo || undefined };
      switch (reportId) {
        case 'agent-statements': await generateAgentLedgerStatements(range); break;
        case 'visa-profit': await generateVisaProfitability(range); break;
        case 'hotel-occupancy': await generateHotelOccupancy(range); break;
        case 'ticketing': await generateTicketingSales(range); break;
        case 'forex': await generateForexReport(range); break;
        case 'agent-league': await generateAgentPerformance(range); break;
        default: throw new Error('Unknown report.');
      }
      success(`${reportTitle} downloaded as CSV.`);
    } catch (err: any) {
      showError(err?.message || `Failed to generate ${reportTitle}.`);
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Executive Reports & Analytics"
        subtitle="Generate audited financial statements, operational manifests, forex reconciliations, and agent summaries."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Reports' }]}
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date"
              className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date"
              className="p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
            />
          </div>
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
                  Live data • CSV
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-3.5 h-3.5" />}
                  onClick={() => handleDownload(r.id, r.title)}
                  disabled={generatingId !== null}
                >
                  {generatingId === r.id ? 'Generating...' : 'Generate'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
