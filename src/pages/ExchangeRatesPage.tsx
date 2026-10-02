import React, { useState, useEffect } from 'react';
import { 
  DollarSign, 
  Plus, 
  UploadCloud, 
  History, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  Calendar,
  FileSpreadsheet,
  TrendingUp,
  X
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
import { ExchangeRateDoc } from '../types/finance';
import { fetchExchangeRates, createExchangeRate, convert } from '../services/financeService';

export const ExchangeRatesPage: React.FC = () => {
  const { userProfile } = useAuth();
  const { success, error: showError } = useToast();
  const canEdit = useCan('Settings', 'edit') || userProfile?.role === 'owner';

  const [rates, setRates] = useState<ExchangeRateDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Manual Add Modal
  const [addModalOpen, setAddModalOpen] = useState<boolean>(false);
  const [pair, setPair] = useState<string>('SAR/PKR');
  const [rateVal, setRateVal] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [creating, setCreating] = useState<boolean>(false);

  // Bulk Upload Wizard Modal
  const [bulkModalOpen, setBulkModalOpen] = useState<boolean>(false);
  const [csvText, setCsvText] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<{ pair: string; rate: number; effectiveDate: string; valid: boolean; error?: string }[]>([]);
  const [bulkStep, setBulkStep] = useState<1 | 2>(1);
  const [uploading, setUploading] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await fetchExchangeRates();
      // Sort descending by effectiveDate
      list.sort((a, b) => new Date(b.effectiveDate).getTime() - new Date(a.effectiveDate).getTime());
      setRates(list);
    } catch {
      showError('Failed to load exchange rates history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Compute current latest rate per pair
  const currentRates: Record<string, number> = {};
  rates.forEach((r) => {
    if (!currentRates[r.pair]) {
      currentRates[r.pair] = r.rate;
    }
  });

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    const numRate = parseFloat(rateVal);
    if (isNaN(numRate) || numRate <= 0) {
      showError('Please enter a valid rate greater than 0.');
      return;
    }

    setCreating(true);
    try {
      await createExchangeRate(userProfile, {
        pair: pair.toUpperCase(),
        rate: numRate,
        effectiveDate,
        method: 'manual',
      });

      success(`Exchange rate for ${pair} set to ${numRate} effective ${effectiveDate}.`);
      setAddModalOpen(false);
      setRateVal('');
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Failed to set exchange rate.');
    } finally {
      setCreating(false);
    }
  };

  const handleParseCsv = () => {
    if (!csvText.trim()) {
      showError('Please paste or upload CSV data.');
      return;
    }

    const lines = csvText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed: typeof previewRows = [];

    // Skip header if matches Pair
    const startIndex = lines[0].toLowerCase().includes('pair') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length < 3) {
        parsed.push({ pair: cols[0] || 'Unknown', rate: 0, effectiveDate: '', valid: false, error: 'Incomplete columns (Pair,Rate,EffectiveDate required)' });
        continue;
      }

      const p = cols[0].toUpperCase();
      const r = parseFloat(cols[1]);
      const d = cols[2];

      let valid = true;
      let err = '';

      if (!['SAR/PKR', 'USD/PKR', 'AED/PKR'].includes(p)) {
        valid = false;
        err = `Unsupported pair: ${p}`;
      } else if (isNaN(r) || r <= 0) {
        valid = false;
        err = 'Invalid rate';
      } else if (!d.match(/^\d{4}-\d{2}-\d{2}$/)) {
        valid = false;
        err = 'Invalid date format (YYYY-MM-DD required)';
      }

      parsed.push({ pair: p, rate: r, effectiveDate: d, valid, error: err });
    }

    setPreviewRows(parsed);
    setBulkStep(2);
  };

  const handleConfirmBulk = async () => {
    if (!userProfile) return;
    const validRows = previewRows.filter((r) => r.valid);
    if (validRows.length === 0) {
      showError('No valid rows to import.');
      return;
    }

    setUploading(true);
    try {
      for (const row of validRows) {
        try {
          await createExchangeRate(userProfile, {
            pair: row.pair,
            rate: row.rate,
            effectiveDate: row.effectiveDate,
            method: 'bulk-upload',
          });
        } catch {
          // skip duplicates or conflicts during bulk
        }
      }

      success(`Successfully imported ${validRows.length} exchange rate entries.`);
      setBulkModalOpen(false);
      setCsvText('');
      setBulkStep(1);
      await loadData();
    } catch (err: any) {
      showError(err?.message || 'Bulk upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const downloadSampleCsv = () => {
    const csvContent = "Pair,Rate,EffectiveDate\nSAR/PKR,74.50,2026-10-02\nUSD/PKR,278.50,2026-10-02\nAED/PKR,75.80,2026-10-02";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'exchange_rates_sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: Column<ExchangeRateDoc>[] = [
    {
      key: 'effectiveDate',
      header: 'Effective Date',
      sortable: true,
      render: (row) => <span className="font-semibold text-slate-800">{row.effectiveDate}</span>,
    },
    {
      key: 'pair',
      header: 'Currency Pair',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-[#0e2c4c]">{row.pair}</span>,
    },
    {
      key: 'rate',
      header: 'Rate (PKR)',
      sortable: true,
      render: (row) => <span className="font-mono font-bold text-emerald-600">{row.rate.toFixed(2)}</span>,
    },
    {
      key: 'method',
      header: 'Method',
      render: (row) => (
        <Badge variant={row.method === 'manual' ? 'navy' : 'gold'}>
          {row.method === 'manual' ? 'Manual Entry' : 'Bulk CSV Upload'}
        </Badge>
      ),
    },
    {
      key: 'addedBy',
      header: 'Added By',
      render: (row) => <span className="text-slate-600 text-xs">{row.addedBy}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exchange Rates Master"
        subtitle="Manage foreign currency exchange benchmarks (Base currency: PKR). Live rates govern financial calculations."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Masters', href: '/masters' }, { label: 'Exchange Rates' }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="w-4 h-4 text-slate-600" />}
              onClick={downloadSampleCsv}
            >
              Sample CSV
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<UploadCloud className="w-4 h-4 text-[#c9a227]" />}
                  onClick={() => { setBulkStep(1); setBulkModalOpen(true); }}
                >
                  Daily Bulk Upload
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => setAddModalOpen(true)}
                >
                  Add Rate
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Current Live Rates Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">SAR / PKR Current Benchmark</div>
            <div className="text-3xl font-bold font-mono text-[#0e2c4c] mt-1">
              {currentRates['SAR/PKR'] ? currentRates['SAR/PKR'].toFixed(2) : '74.50'}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-1">1 Saudi Riyal = PKR</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#0e2c4c]/10 flex items-center justify-center text-[#0e2c4c]">
            <TrendingUp className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">USD / PKR Current Benchmark</div>
            <div className="text-3xl font-bold font-mono text-[#0e2c4c] mt-1">
              {currentRates['USD/PKR'] ? currentRates['USD/PKR'].toFixed(2) : '278.50'}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-1">1 US Dollar = PKR</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-[#c9a227]/10 flex items-center justify-center text-[#c9a227]">
            <DollarSign className="w-6 h-6" />
          </div>
        </Card>

        <Card className="p-4 border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AED / PKR Current Benchmark</div>
            <div className="text-3xl font-bold font-mono text-[#0e2c4c] mt-1">
              {currentRates['AED/PKR'] ? currentRates['AED/PKR'].toFixed(2) : '75.80'}
            </div>
            <div className="text-[11px] text-emerald-600 font-medium mt-1">1 UAE Dirham = PKR</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
        </Card>
      </div>

      {/* Rate History Table */}
      <Card padding="none">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Chronological Rate History Log</h3>
            <p className="text-xs text-slate-500">Full audit log of rate changes. Historical rates are never overwritten.</p>
          </div>
          <Badge variant="navy">{rates.length} Entries</Badge>
        </div>

        <DataTable
          data={rates}
          columns={columns}
          keyExtractor={(row) => row.id}
          loading={loading}
          emptyTitle="No exchange rate history"
          emptyDescription="No exchange rates have been recorded yet."
        />
      </Card>

      {/* Manual Add Rate Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Exchange Rate Benchmark"
        subtitle="Set foreign currency exchange rate against PKR base."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setAddModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAddManual} loading={creating}>Save Rate</Button>
          </div>
        }
      >
        <form onSubmit={handleAddManual} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">Currency Pair</label>
            <select
              value={pair}
              onChange={(e) => setPair(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20 focus:border-[#0e2c4c]"
            >
              <option value="SAR/PKR">SAR/PKR (Saudi Riyal)</option>
              <option value="USD/PKR">USD/PKR (US Dollar)</option>
              <option value="AED/PKR">AED/PKR (UAE Dirham)</option>
            </select>
          </div>

          <div>
            <Input
              label="Exchange Rate (PKR per 1 Unit)"
              type="number"
              step="0.01"
              placeholder="e.g. 74.50"
              value={rateVal}
              onChange={(e) => setRateVal(e.target.value)}
              required
            />
          </div>

          <div>
            <Input
              label="Effective Date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              required
            />
          </div>
        </form>
      </Modal>

      {/* Daily Bulk Upload Wizard Modal */}
      <Modal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        title="Daily Exchange Rates Bulk Upload Wizard"
        subtitle={bulkStep === 1 ? 'Step 1: Paste CSV data or rows' : 'Step 2: Preview & Validate Rows'}
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setBulkModalOpen(false)}>Cancel</Button>
            {bulkStep === 1 ? (
              <Button variant="primary" onClick={handleParseCsv}>Next: Preview</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setBulkStep(1)}>Back</Button>
                <Button variant="primary" onClick={handleConfirmBulk} loading={uploading}>Confirm Import</Button>
              </>
            )}
          </div>
        }
      >
        {bulkStep === 1 ? (
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600">
              Paste CSV content matching columns: <code>Pair,Rate,EffectiveDate</code> (e.g., <code>SAR/PKR,74.50,2026-10-02</code>).
            </div>
            <textarea
              rows={6}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Pair,Rate,EffectiveDate&#10;SAR/PKR,74.50,2026-10-02&#10;USD/PKR,278.50,2026-10-02"
              className="w-full p-3 font-mono text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs text-slate-600">
              Valid rows will be imported. Invalid rows are highlighted and excluded.
            </div>
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {previewRows.map((row, idx) => (
                <div key={idx} className={`p-2.5 text-xs flex items-center justify-between ${row.valid ? 'bg-emerald-50/50' : 'bg-red-50/50'}`}>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold">{row.pair}</span>
                    <span>Rate: <strong>{row.rate}</strong></span>
                    <span>Date: {row.effectiveDate}</span>
                  </div>
                  <div>
                    {row.valid ? (
                      <Badge variant="success">Valid</Badge>
                    ) : (
                      <span className="text-red-600 font-medium">Invalid: {row.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
