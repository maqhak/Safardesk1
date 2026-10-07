import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Package, Search, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { useCurrentRate } from '../services/exchangeRateService';
import { LedgerAccountDoc, LedgerEntryDoc } from '../types/accounting';
import {
  fetchLedgerAccounts,
  fetchLedgerEntries,
  postItemServiceEntry,
  voidLedgerEntry,
} from '../services/accountingService';
import { formatMoney } from '../utils/formatters';
const formatPKR = (n: number) => formatMoney(n, 'PKR');

interface ItemServiceRow {
  transNo: string;
  date: string;
  itemName: string;
  description: string;
  supplierName: string | null;
  customerName: string | null;
  buyingPKR: number;
  sellingPKR: number;
  voided: boolean;
}

interface ImportPreviewRow {
  idx: number;
  date: string;
  itemName: string;
  supplierInput: string;
  customerInput: string;
  supplierId: string | null;
  supplierName: string | null;
  customerId: string | null;
  customerName: string | null;
  buyingPKR: number;
  sellingPKR: number;
  rate: number;
  description: string;
  errors: string[];
}

const TEMPLATE_HEADERS = [
  'Date',
  'Item/Service Name',
  'Supplier (Code or Name)',
  'Customer (Code or Name)',
  'Buying Price (PKR)',
  'Selling Price (PKR)',
  'Rate (SAR-PKR)',
  'Description',
];

function stripPrefix(particulars: string): string {
  return particulars.replace(/^(Sale|Purchase):\s*/, '');
}

function splitItemDesc(base: string): { itemName: string; description: string } {
  const idx = base.indexOf(' — ');
  if (idx === -1) return { itemName: base, description: '' };
  return { itemName: base.slice(0, idx), description: base.slice(idx + 3) };
}

export const ItemServicePage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError } = useToast();
  const isOwner = role === 'owner';
  const isAgent = role === 'agent';
  const canCreate = useCan('Accounts', 'create') || isOwner;
  const masterRate = useCurrentRate('SAR-PKR');

  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<LedgerAccountDoc[]>([]);
  const [entries, setEntries] = useState<LedgerEntryDoc[]>([]);
  const [search, setSearch] = useState<string>('');

  // Create modal
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [itemDate, setItemDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [itemName, setItemName] = useState<string>('');
  const [itemSupplierId, setItemSupplierId] = useState<string>('');
  const [itemCustomerId, setItemCustomerId] = useState<string>('');
  const [itemBuyingPKR, setItemBuyingPKR] = useState<number>(0);
  const [itemSellingPKR, setItemSellingPKR] = useState<number>(0);
  const [itemCurrency, setItemCurrency] = useState<'SAR' | 'PKR' | 'USD'>('PKR');
  const [itemRate, setItemRate] = useState<number>(0);
  const [itemDescription, setItemDescription] = useState<string>('');

  // Bulk import
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [importRows, setImportRows] = useState<ImportPreviewRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (itemRate === 0) setItemRate(masterRate);
  }, [masterRate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accList, entList] = await Promise.all([fetchLedgerAccounts(), fetchLedgerEntries()]);
      setAccounts(accList);
      setEntries(entList.filter((e) => e.entryType === 'Item/Service'));
    } catch {
      showError('Failed to load item/service entries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accountName = (id: string | null | undefined): string | null => {
    if (!id) return null;
    return accounts.find((a) => a.id === id)?.title || null;
  };

  const rows: ItemServiceRow[] = useMemo(() => {
    const groups = new Map<string, LedgerEntryDoc[]>();
    for (const e of entries) {
      const g = groups.get(e.transNo) || [];
      g.push(e);
      groups.set(e.transNo, g);
    }
    const out: ItemServiceRow[] = [];
    groups.forEach((list, transNo) => {
      const first = list[0];
      const base = stripPrefix(first.particulars || '');
      const { itemName: name, description } = splitItemDesc(base);
      let buyingPKR = 0;
      let sellingPKR = 0;
      let supplierName: string | null = null;
      let customerName: string | null = null;
      for (const e of list) {
        if (e.isVoid) continue;
        const isSale = (e.particulars || '').startsWith('Sale:');
        const isPurchase = (e.particulars || '').startsWith('Purchase:');
        if (isSale && e.creditPKR > 0) sellingPKR += e.creditPKR;
        if (isSale && e.debitSAR > 0) customerName = accountName(e.accountId) || customerName;
        if (isPurchase && e.debitPKR > 0) buyingPKR += e.debitPKR;
        if (isPurchase && e.creditSAR > 0) supplierName = accountName(e.accountId) || supplierName;
      }
      out.push({
        transNo,
        date: first.date,
        itemName: name,
        description,
        supplierName,
        customerName,
        buyingPKR: Math.round(buyingPKR * 100) / 100,
        sellingPKR: Math.round(sellingPKR * 100) / 100,
        voided: list.every((e) => e.isVoid),
      });
    });
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, accounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.itemName.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.transNo.toLowerCase().includes(q) ||
        (r.supplierName || '').toLowerCase().includes(q) ||
        (r.customerName || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        buying: acc.buying + (r.voided ? 0 : r.buyingPKR),
        selling: acc.selling + (r.voided ? 0 : r.sellingPKR),
      }),
      { buying: 0, selling: 0 }
    );
  }, [filtered]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      showError('Please enter the Item / Service name.');
      return;
    }
    if (!itemSupplierId && !itemCustomerId) {
      showError('Please select a Supplier (party from) or a Customer (party to).');
      return;
    }
    if (itemSupplierId && itemBuyingPKR <= 0) {
      showError('Buying price must be greater than zero when a Supplier is selected.');
      return;
    }
    if (itemCustomerId && itemSellingPKR <= 0) {
      showError('Selling price must be greater than zero when a Customer is selected.');
      return;
    }
    if (itemBuyingPKR <= 0 && itemSellingPKR <= 0) {
      showError('Enter a Buying price or a Selling price.');
      return;
    }
    const rate = itemRate || masterRate;
    if (!rate || rate <= 0) {
      showError('Please enter a valid exchange rate (1 SAR = ? PKR).');
      return;
    }
    // Entered currency -> SAR derived for ledger (same as Tickets)
    const buyingSAR = itemCurrency === 'PKR' ? Math.round((itemBuyingPKR / rate) * 100) / 100 : Math.round(itemBuyingPKR * 100) / 100;
    const sellingSAR = itemCurrency === 'PKR' ? Math.round((itemSellingPKR / rate) * 100) / 100 : Math.round(itemSellingPKR * 100) / 100;

    setSaving(true);
    try {
      const transNo = `ITM-${Date.now().toString().slice(-6)}`;
      await postItemServiceEntry({
        date: itemDate,
        transNo,
        itemName: itemName.trim(),
        description: itemDescription,
        supplierAccountId: itemSupplierId || null,
        customerAccountId: itemCustomerId || null,
        buyingSAR,
        sellingSAR,
        rate,
        createdBy: userProfile?.name || 'Operator',
      });
      const marginEntered = Math.round((itemSellingPKR - itemBuyingPKR) * 100) / 100;
      success(`Item/Service entry ${transNo} posted.${marginEntered !== 0 ? ` Margin: ${itemCurrency} ${marginEntered.toLocaleString()}` : ''}`);
      setModalOpen(false);
      setItemName('');
      setItemSupplierId('');
      setItemCustomerId('');
      setItemBuyingPKR(0);
      setItemSellingPKR(0);
      setItemDescription('');
      setItemDate(new Date().toISOString().split('T')[0]);
      await loadData();
    } catch {
      showError('Failed to post item/service entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (row: ItemServiceRow) => {
    if (!isOwner) {
      showError('Only the Owner can void entries.');
      return;
    }
    const reason = window.prompt(`Void entry ${row.transNo}? Enter reason:`);
    if (!reason) return;
    try {
      const group = entries.filter((e) => e.transNo === row.transNo && !e.isVoid);
      for (const e of group) {
        await voidLedgerEntry(e.id, reason, userProfile?.name || 'Owner');
      }
      success(`Entry ${row.transNo} voided.`);
      await loadData();
    } catch {
      showError('Failed to void entry.');
    }
  };

  // ---------- Bulk import ----------

  const matchAccount = (input: string, pool: LedgerAccountDoc[]): LedgerAccountDoc | null => {
    const q = (input || '').trim().toLowerCase();
    if (!q) return null;
    // 1) exact account code
    let found = pool.find((a) => a.accountCode.toLowerCase() === q);
    if (found) return found;
    // 2) exact title
    found = pool.find((a) => a.title.toLowerCase() === q);
    if (found) return found;
    // 3) title contains
    found = pool.find((a) => a.title.toLowerCase().includes(q));
    return found || null;
  };

  const parseNum = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    const n = parseFloat(String(v).replace(/,/g, ''));
    return isNaN(n) ? 0 : Math.round(n * 100) / 100;
  };

  const parseDate = (v: any): string => {
    if (v === null || v === undefined || v === '') return new Date().toISOString().split('T')[0];
    // Excel serial date
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return d.toISOString().split('T')[0];
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const m2 = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
    return new Date().toISOString().split('T')[0];
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const today = new Date().toISOString().split('T')[0];
    const sampleSupplier = supplierAccounts[0];
    const sampleCustomer = customerAccounts[0];
    const rows = [
      TEMPLATE_HEADERS,
      [
        today,
        'Visa Service',
        sampleSupplier ? `[${sampleSupplier.accountCode}] ${sampleSupplier.title}` : 'VND-001',
        sampleCustomer ? `[${sampleCustomer.accountCode}] ${sampleCustomer.title}` : 'AGT-001',
        78000,
        89500,
        masterRate || 74.5,
        'Sheraz bhai se Visa service li, customer ko charge ki',
      ],
      [
        today,
        'Hotel Room - Double',
        sampleSupplier ? sampleSupplier.accountCode : '',
        sampleCustomer ? sampleCustomer.accountCode : '',
        112000,
        149000,
        masterRate || 74.5,
        'Walk-in guest, 3 nights',
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 30 }, { wch: 18 }, { wch: 19 }, { wch: 14 }, { wch: 40 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ItemService');
    XLSX.writeFile(wb, 'ItemService-Template.xlsx');
    success('Template downloaded — fill it and upload it back.');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
      if (json.length < 2) {
        showError('File has no data rows.');
        return;
      }
      // Map columns by header name (case-insensitive); fallback to position
      const headerRow = (json[0] as any[]).map((h) => String(h).trim().toLowerCase());
      const colIdx = (names: string[], fallback: number) => {
        for (const n of names) {
          const i = headerRow.findIndex((h) => h.includes(n));
          if (i !== -1) return i;
        }
        return fallback;
      };
      const cDate = colIdx(['date'], 0);
      const cItem = colIdx(['item'], 1);
      const cSup = colIdx(['supplier', 'party from', 'from'], 2);
      const cCus = colIdx(['customer', 'party to', 'to'], 3);
      const cBuy = colIdx(['buying'], 4);
      const cSell = colIdx(['selling'], 5);
      const cRate = colIdx(['rate'], 6);
      const cDesc = colIdx(['description', 'desc'], 7);

      const preview: ImportPreviewRow[] = [];
      for (let i = 1; i < json.length; i++) {
        const r = json[i] as any[];
        const itemName = String(r[cItem] || '').trim();
        if (!itemName && !r[cSup] && !r[cCus] && !r[cBuy] && !r[cSell]) continue; // skip blank rows
        const supplierInput = String(r[cSup] || '').trim();
        const customerInput = String(r[cCus] || '').trim();
        const sup = matchAccount(supplierInput, supplierAccounts);
        const cus = matchAccount(customerInput, customerAccounts);
        const buyingPKR = parseNum(r[cBuy]);
        const sellingPKR = parseNum(r[cSell]);
        const errors: string[] = [];
        if (!itemName) errors.push('Item/Service name missing');
        if (!supplierInput && !customerInput) errors.push('Supplier or Customer required');
        if (supplierInput && !sup) errors.push(`Supplier not found: "${supplierInput}"`);
        if (customerInput && !cus) errors.push(`Customer not found: "${customerInput}"`);
        if (sup && buyingPKR <= 0) errors.push('Buying price must be > 0 for supplier');
        if (cus && sellingPKR <= 0) errors.push('Selling price must be > 0 for customer');
        if (buyingPKR <= 0 && sellingPKR <= 0) errors.push('Buying or Selling price required');
        preview.push({
          idx: i,
          date: parseDate(r[cDate]),
          itemName,
          supplierInput,
          customerInput,
          supplierId: sup?.id || null,
          supplierName: sup?.title || null,
          customerId: cus?.id || null,
          customerName: cus?.title || null,
          buyingPKR,
          sellingPKR,
          rate: parseNum(r[cRate]) || masterRate,
          description: String(r[cDesc] || '').trim(),
          errors,
        });
      }
      if (preview.length === 0) {
        showError('No valid rows found in the file.');
        return;
      }
      setImportRows(preview);
      setImportModalOpen(true);
    } catch (err) {
      showError('Could not read the file. Use the downloaded template.');
    }
  };

  const handleImport = async () => {
    const valid = importRows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      showError('No valid rows to import. Fix the errors first.');
      return;
    }
    setImporting(true);
    let done = 0;
    let failed = 0;
    try {
      for (const r of valid) {
        try {
          const transNo = `ITM-${Date.now().toString().slice(-6)}${done}`;
          await postItemServiceEntry({
            date: r.date,
            transNo,
            itemName: r.itemName,
            description: r.description,
            supplierAccountId: r.supplierId,
            customerAccountId: r.customerId,
            buyingSAR: Math.round((r.buyingPKR / (r.rate || masterRate)) * 100) / 100,
            sellingSAR: Math.round((r.sellingPKR / (r.rate || masterRate)) * 100) / 100,
            rate: r.rate || masterRate,
            createdBy: userProfile?.name || 'Operator',
          });
          done++;
        } catch {
          failed++;
        }
      }
      success(`Imported ${done} entries${failed > 0 ? `, ${failed} failed` : ''}.`);
      setImportModalOpen(false);
      setImportRows([]);
      await loadData();
    } finally {
      setImporting(false);
    }
  };

  const supplierAccounts = accounts.filter((a) => ['vendor', 'hotel', 'agent', 'customer'].includes(a.accountType));
  const customerAccounts = accounts.filter((a) => ['agent', 'customer', 'vendor', 'hotel'].includes(a.accountType));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Item / Service Entries"
        subtitle="Non-visa products & services — bought from a supplier, sold to a customer."
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search item, party, trans #..."
                className="pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs w-56"
              />
            </div>
            {canCreate && !isAgent && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={downloadTemplate}
                >
                  Template
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Upload className="w-4 h-4" />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Excel/CSV
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<Plus className="w-4 h-4" />}
                  onClick={() => {
                    setItemRate(masterRate);
                    setModalOpen(true);
                  }}
                >
                  New Entry
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card padding="sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Buying (PKR)</div>
          <div className="text-xl font-bold font-mono text-amber-700">{formatPKR(totals.buying)}</div>
        </Card>
        <Card padding="sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Selling (PKR)</div>
          <div className="text-xl font-bold font-mono text-emerald-700">{formatPKR(totals.selling)}</div>
        </Card>
        <Card padding="sm">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Margin (PKR)</div>
          <div className={`text-xl font-bold font-mono ${totals.selling - totals.buying >= 0 ? 'text-[var(--theme-primary)]' : 'text-rose-700'}`}>
            {formatPKR(totals.selling - totals.buying)}
          </div>
        </Card>
      </div>

      {/* Entries table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3 font-bold">Date</th>
                <th className="py-3 px-3 font-bold">Trans #</th>
                <th className="py-3 px-3 font-bold">Item / Service</th>
                <th className="py-3 px-3 font-bold">Supplier (From)</th>
                <th className="py-3 px-3 font-bold">Customer (To)</th>
                <th className="py-3 px-3 font-bold text-right">Buying (PKR)</th>
                <th className="py-3 px-3 font-bold text-right">Selling (PKR)</th>
                <th className="py-3 px-3 font-bold text-right">Margin</th>
                {isOwner && <th className="py-3 px-3 font-bold text-center">Action</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isOwner ? 9 : 8} className="py-12 text-center text-slate-500">
                    Loading item/service entries...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isOwner ? 9 : 8} className="py-8 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    No item/service entries yet.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const margin = Math.round((r.sellingPKR - r.buyingPKR) * 100) / 100;
                  return (
                    <tr
                      key={r.transNo}
                      style={!r.voided && idx % 2 === 1 ? { backgroundColor: 'color-mix(in srgb, var(--theme-primary) 8%, #ffffff)' } : undefined}
                      className={`transition-colors ${r.voided ? 'bg-rose-50/40 text-slate-400 line-through opacity-70' : idx % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="py-2.5 px-3 font-mono whitespace-nowrap">{r.date}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[var(--theme-primary)] whitespace-nowrap">{r.transNo}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{r.itemName}</div>
                        {r.description && <div className="text-[11px] text-slate-500">{r.description}</div>}
                      </td>
                      <td className="py-2.5 px-3">{r.supplierName || <span className="text-slate-400">—</span>}</td>
                      <td className="py-2.5 px-3">{r.customerName || <span className="text-slate-400">—</span>}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{r.buyingPKR > 0 ? formatPKR(r.buyingPKR) : <span className="text-slate-400">—</span>}</td>
                      <td className="py-2.5 px-3 text-right font-mono">{r.sellingPKR > 0 ? formatPKR(r.sellingPKR) : <span className="text-slate-400">—</span>}</td>
                      <td className={`py-2.5 px-3 text-right font-mono font-bold ${margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatPKR(margin)}
                      </td>
                      {isOwner && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {!r.voided ? (
                            <button
                              onClick={() => handleVoid(r)}
                              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline"
                            >
                              Void
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-400">Voided</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Item / Service Entry"
        subtitle="Record a non-visa product or service: bought from a supplier, sold to a customer."
        size="lg"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              Post Entry
            </Button>
          </>
        }
      >
        <form onSubmit={handleSave} className="space-y-4 py-2 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Date *</label>
              <input
                type="date"
                value={itemDate}
                onChange={(e) => setItemDate(e.target.value)}
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Item / Service Name *</label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                placeholder="e.g. Visa Service, Hotel Room, PIA Ticket"
                required
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="font-bold text-[var(--theme-primary)] text-xs">Parties</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-amber-700 mb-1">
                  Supplier — Party From (jis se li)
                </label>
                <select
                  value={itemSupplierId}
                  onChange={(e) => setItemSupplierId(e.target.value)}
                  className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- No supplier --</option>
                  {supplierAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.accountCode}] {a.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                  Customer — Party To (jis ko di / charge)
                </label>
                <select
                  value={itemCustomerId}
                  onChange={(e) => setItemCustomerId(e.target.value)}
                  className="w-full p-2 bg-white border border-emerald-300 rounded-lg text-xs font-semibold"
                >
                  <option value="">-- No customer --</option>
                  {customerAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      [{a.accountCode}] {a.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Currency</label>
              <select
                value={itemCurrency}
                onChange={(e) => setItemCurrency(e.target.value as 'SAR' | 'PKR' | 'USD')}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-[var(--theme-primary)]"
              >
                <option value="PKR">PKR — Pakistani Rupee</option>
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="USD">USD — US Dollar</option>
              </select>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Margin: <strong className={itemSellingPKR - itemBuyingPKR >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {itemCurrency} {(Math.round((itemSellingPKR - itemBuyingPKR) * 100) / 100).toLocaleString()}
                </strong>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Buying Price ({itemCurrency})</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemBuyingPKR || ''}
                onChange={(e) => setItemBuyingPKR(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                Supplier ko dena hai
                {itemCurrency === 'PKR' && (itemRate || masterRate) > 0 && itemBuyingPKR > 0 && (
                  <span className="block">≈ SAR {(Math.round((itemBuyingPKR / (itemRate || masterRate)) * 100) / 100).toLocaleString()} ledger</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Selling Price ({itemCurrency})</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={itemSellingPKR || ''}
                onChange={(e) => setItemSellingPKR(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-[var(--theme-primary)]"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                Customer se lena hai
                {itemCurrency === 'PKR' && (itemRate || masterRate) > 0 && itemSellingPKR > 0 && (
                  <span className="block">≈ SAR {(Math.round((itemSellingPKR / (itemRate || masterRate)) * 100) / 100).toLocaleString()} ledger</span>
                )}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Rate (1 SAR = ? PKR)</label>
              <input
                type="number"
                step="0.01"
                value={itemRate || ''}
                onChange={(e) => setItemRate(parseFloat(e.target.value) || masterRate)}
                className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono"
              />
              <div className="text-[10px] text-slate-500 mt-0.5">
                Ledger posts SAR equivalents
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description</label>
            <textarea
              value={itemDescription}
              onChange={(e) => setItemDescription(e.target.value)}
              rows={3}
              placeholder="Manually likhein — kis cheez ki entry hai, koi khaas tafseel..."
              className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
            />
          </div>

          <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
            Posting: Dr Customer (selling) / Cr Item-Service Income + Dr Item-Service Cost (buying) / Cr Supplier — one trans # for both.
          </div>
        </form>
      </Modal>

      {/* Bulk Import Preview Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => { setImportModalOpen(false); setImportRows([]); }}
        title="Bulk Import Preview"
        subtitle={`${importRows.length} rows found — ${importRows.filter((r) => r.errors.length === 0).length} valid, ${importRows.filter((r) => r.errors.length > 0).length} with errors.`}
        size="xl"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setImportModalOpen(false); setImportRows([]); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleImport}
              loading={importing}
              disabled={importRows.filter((r) => r.errors.length === 0).length === 0}
            >
              Import {importRows.filter((r) => r.errors.length === 0).length} Valid Rows
            </Button>
          </>
        }
      >
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 uppercase text-[10px] tracking-wider">
                <th className="py-2 px-2 font-bold">#</th>
                <th className="py-2 px-2 font-bold">Date</th>
                <th className="py-2 px-2 font-bold">Item</th>
                <th className="py-2 px-2 font-bold">Supplier</th>
                <th className="py-2 px-2 font-bold">Customer</th>
                <th className="py-2 px-2 font-bold text-right">Buy</th>
                <th className="py-2 px-2 font-bold text-right">Sell</th>
                <th className="py-2 px-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {importRows.map((r) => (
                <tr key={r.idx} className={`border-t border-slate-100 ${r.errors.length > 0 ? 'bg-rose-50/50' : ''}`}>
                  <td className="py-2 px-2 font-mono text-slate-500">{r.idx}</td>
                  <td className="py-2 px-2 font-mono whitespace-nowrap">{r.date}</td>
                  <td className="py-2 px-2 font-semibold">{r.itemName || <span className="text-slate-400">—</span>}</td>
                  <td className="py-2 px-2">
                    {r.supplierName ? (
                      <span className="text-emerald-700 font-semibold">{r.supplierName}</span>
                    ) : r.supplierInput ? (
                      <span className="text-rose-600">"{r.supplierInput}" ✗</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    {r.customerName ? (
                      <span className="text-emerald-700 font-semibold">{r.customerName}</span>
                    ) : r.customerInput ? (
                      <span className="text-rose-600">"{r.customerInput}" ✗</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono">{r.buyingPKR > 0 ? r.buyingPKR.toLocaleString() : '—'}</td>
                  <td className="py-2 px-2 text-right font-mono">{r.sellingPKR > 0 ? r.sellingPKR.toLocaleString() : '—'}</td>
                  <td className="py-2 px-2">
                    {r.errors.length === 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> OK
                      </span>
                    ) : (
                      <span className="inline-flex items-start gap-1 text-rose-600">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{r.errors.join('; ')}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-slate-500 mt-3 bg-slate-50 border border-slate-200 rounded-lg p-2">
          Supplier/Customer match by <strong>account code</strong> (e.g. VND-003) or <strong>name</strong>. Only valid rows will be imported — each gets its own trans #.
        </div>
      </Modal>
    </div>
  );
};
