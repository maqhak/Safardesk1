import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import {
  fetchVisas,
  saveVisasBatch,
  saveVisaImportBatch,
  VisaDoc,
} from '../services/visaService';
import { fetchVendors } from '../services/masterService';
import { fetchAgents } from '../services/agentService';
import { createVisaDistributionBatch } from '../services/visaDistributionService';
import { getCurrentRate } from '../services/exchangeRateService';
import { logAuditEvent } from '../services/userService';
import { VendorDoc } from '../types/master';
import { AgentDoc } from '../types/agent';
import { PACKAGE_TYPES } from '../types/visaDistribution';

/**
 * Nusuk Group Import — lightweight single-screen flow (new branch).
 * Upload Nusuk Excel -> visas grouped group-wise -> set buying/selling
 * rates ONE BY ONE per group (each row fully independent, no auto-fill
 * cascades) -> one save imports visas and generates VV documents.
 * No new dependencies; xlsx stays lazy-loaded.
 */

interface ParsedRow extends VisaDoc {
  isDuplicate: boolean;
  skipImport: boolean;
}

interface GroupRow {
  groupCode: string;
  groupName: string;
  visas: ParsedRow[]; // valid (non-duplicate) visas only
  dupCount: number;
  agentId: string;
  buying: number;
  selling: number;
  packageType: string; // 10/15/21/28 Days, Long Stay — per group, one by one
}

export const NusukGroupImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { userProfile } = useAuth();

  const [vendors, setVendors] = useState<VendorDoc[]>([]);
  const [agents, setAgents] = useState<AgentDoc[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [shirkaId, setShirkaId] = useState('');
  const [fileName, setFileName] = useState('');
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [parsed, setParsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const [vList, aList] = await Promise.all([
          fetchVendors().catch(() => []),
          fetchAgents().catch(() => []),
        ]);
        setVendors((vList as VendorDoc[]).filter((v) => v.isActive !== false));
        setAgents((aList as AgentDoc[]).filter((a: any) => a.isActive !== false));
      } catch { /* lists stay empty */ }
    })();
  }, []);

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  const shirkas = (selectedVendor as any)?.shirkas || [];
  const shirkaName = (() => {
    if (!selectedVendor) return '';
    const shk = shirkas.find((s: any) => s.id === shirkaId);
    return shk ? `${selectedVendor.name} — ${shk.name}` : selectedVendor.name;
  })();

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx'); // lazy — keeps bundle light
        const workbook = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
        if (data.length === 0) {
          showError('The uploaded Excel file contains no valid rows.');
          return;
        }
        const todayStr = new Date().toISOString().split('T')[0];

        // 8-column mapping (same contract as the main importer)
        const raw = data.map((row: any) => ({
          groupCode: String(row['Group Number'] || row['Group Code'] || row['GroupNo'] || 'GRP-IMPORT'),
          groupName: String(row['Group Name'] || row['GroupName'] || 'Imported Umrah Group'),
          pilgrimName: String(row['Mutamer Name'] || row['Passenger Name'] || row['Name'] || 'Unknown Pilgrim'),
          nationality: String(row['Nationality'] || 'Pakistani'),
          gender: String(row['Gender'] || row['Sex'] || row['IncentiveDiscountType'] || 'Male'),
          passportNumber: String(row['Passport Number'] || row['Passport'] || '').trim(),
          age: row['Mutamer Age'] || row['Age'] || 30,
          visaIssueDate: String(row['Visa Issue Date'] || row['Issue Date'] || row['Date'] || '').trim().split(' ')[0].split('T')[0],
        }));

        // Blank-date fallback: group's most common date -> upload date
        const groupDates = new Map<string, Map<string, number>>();
        raw.forEach((r: any) => {
          if (r.visaIssueDate) {
            const m = groupDates.get(r.groupCode) || new Map<string, number>();
            m.set(r.visaIssueDate, (m.get(r.visaIssueDate) || 0) + 1);
            groupDates.set(r.groupCode, m);
          }
        });
        const groupBestDate = new Map<string, string>();
        groupDates.forEach((m, code) => {
          let best = '', bestN = -1;
          m.forEach((n, d) => { if (n > bestN) { bestN = n; best = d; } });
          if (best) groupBestDate.set(code, best);
        });

        const existing = await fetchVisas().catch(() => []);
        const dbPassports = new Set(existing.map((v: any) => v.passportNumber));
        const filePassports = new Set<string>();

        const rows: ParsedRow[] = raw.map((r: any, idx: number) => {
          const dup = dbPassports.has(r.passportNumber) || filePassports.has(r.passportNumber);
          if (r.passportNumber) filePassports.add(r.passportNumber);
          return {
            id: `visa-ngi-${Date.now()}-${idx}`,
            pilgrimName: r.pilgrimName,
            passportNumber: r.passportNumber,
            nationality: r.nationality,
            groupCode: r.groupCode,
            groupName: r.groupName,
            gender: r.gender,
            age: r.age,
            visaIssueDate: r.visaIssueDate || groupBestDate.get(r.groupCode) || todayStr,
            dateSource: (r.visaIssueDate ? 'original' : 'auto') as const,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            isDuplicate: dup,
            skipImport: dup,
          } as ParsedRow;
        });

        // Group-wise (valid visas per group; duplicates counted separately)
        const gmap = new Map<string, GroupRow>();
        rows.forEach((r) => {
          let g = gmap.get(r.groupCode);
          if (!g) {
            g = { groupCode: r.groupCode, groupName: r.groupName, visas: [], dupCount: 0, agentId: '', buying: 0, selling: 0, packageType: '' };
            gmap.set(r.groupCode, g);
          }
          if (r.skipImport) g.dupCount += 1;
          else g.visas.push(r);
        });
        setGroups(Array.from(gmap.values()));
        setParsed(true);
        const dups = rows.filter((r) => r.skipImport).length;
        success(`Parsed ${rows.length} rows into ${gmap.size} groups. Skipped ${dups} duplicates.`);
      } catch (err: any) {
        showError('Failed to parse Excel workbook: ' + (err.message || 'Invalid format'));
      }
    };
    reader.readAsBinaryString(file);
  };

  // One-by-one: each input touches ONLY its own group row. No auto-fill, no cascades.
  const updateGroup = (code: string, field: 'agentId' | 'buying' | 'selling' | 'packageType', value: any) => {
    setGroups((prev) => prev.map((g) => (g.groupCode === code ? { ...g, [field]: value } : g)));
  };

  // Pre-save check summary (Fix: user asked for visible validation before save)
  const preSaveCheck = useMemo(() => {
    let valid = 0, dups = 0, blankPassport = 0, autoDate = 0;
    const blankGroups = new Set<string>();
    groups.forEach((g) => {
      dups += g.dupCount;
      g.visas.forEach((v) => {
        valid += 1;
        if (!v.passportNumber) { blankPassport += 1; blankGroups.add(g.groupCode); }
        if (v.dateSource === 'auto') autoDate += 1;
      });
    });
    return { valid, dups, blankPassport, autoDate, blankGroups: Array.from(blankGroups) };
  }, [groups]);

  const totals = useMemo(() => {
    let visas = 0, buy = 0, sell = 0;
    groups.forEach((g) => {
      visas += g.visas.length;
      buy += g.visas.length * (g.buying || 0);
      sell += g.visas.length * (g.selling || 0);
    });
    return { visas, buy, sell, margin: sell - buy };
  }, [groups]);

  const completeGroups = groups.filter((g) => g.visas.length > 0 && g.agentId && g.buying > 0 && g.selling > 0);
  const incompleteGroups = groups.filter((g) => g.visas.length > 0 && !(g.agentId && g.buying > 0 && g.selling > 0));

  const handleSave = async () => {
    if (!vendorId) {
      showError('Please select the Sub-Vendor first — every visa must carry a Sub-Vendor stamp.');
      return;
    }
    if (completeGroups.length === 0) {
      showError('No complete group: each group needs an Agent plus Buying and Selling rates.');
      return;
    }
    setSaving(true);
    try {
      // 1. Import ALL valid visas (even from incomplete groups — no data loss)
      const allValid: VisaDoc[] = [];
      groups.forEach((g) =>
        g.visas.forEach((v) =>
          allValid.push({ ...v, vendorId, shirkaId: shirkaId || undefined, shirkaName: shirkaName || undefined } as VisaDoc)
        )
      );
      if (allValid.length > 0) await saveVisasBatch(allValid);
      await saveVisaImportBatch({
        id: `batch-${Date.now()}`,
        fileName: fileName || 'nusuk_import.xlsx',
        uploadedBy: userProfile?.name || 'Operator',
        uploadedAt: new Date().toISOString(),
        totalRows: allValid.length + groups.reduce((s, g) => s + g.dupCount, 0),
        importedRows: allValid.length,
        skippedDuplicates: groups.reduce((s, g) => s + g.dupCount, 0),
        vendorId,
        shirkaId: shirkaId || undefined,
        shirkaName: shirkaName || undefined,
      });

      // 2. Distribute complete groups -> VV documents (per-group rates preserved)
      const rate = getCurrentRate('SAR-PKR') || 0;
      const agentGroupMap = new Map<string, {
        agentId: string; sellingPricePerVisa: number; buyingPricePerVisa: number;
        groupCode: string; groupName: string; visaIds: string[]; exchangeRateSARPKR: number;
        packageType?: string;
      }>();
      completeGroups.forEach((g) => {
        agentGroupMap.set(`${g.groupCode}-${g.agentId}`, {
          agentId: g.agentId,
          sellingPricePerVisa: g.selling,
          buyingPricePerVisa: g.buying,
          groupCode: g.groupCode,
          groupName: g.groupName,
          visaIds: g.visas.map((v) => v.id),
          exchangeRateSARPKR: rate,
          packageType: g.packageType || undefined,
        });
      });
      await createVisaDistributionBatch({
        vendorId,
        shirkaId: shirkaId || undefined,
        agentGroupMap,
        date: new Date().toISOString().split('T')[0],
        createdBy: userProfile?.name || 'Operator',
      });

      if (userProfile) {
        await logAuditEvent({
          action: 'NUSUK_GROUP_IMPORT',
          userId: userProfile.uid,
          userName: userProfile.name || 'User',
          userEmail: userProfile.email,
          userRole: userProfile.role,
          details: { fileName, groups: completeGroups.length, visas: allValid.length },
        }).catch(() => {});
      }

      setDone(true);
      success(
        `Imported ${allValid.length} visas in ${groups.length} groups. ` +
        `${completeGroups.length} groups distributed to VV.` +
        (incompleteGroups.length > 0 ? ` ${incompleteGroups.length} group(s) skipped (incomplete rates) — visas kept as undistributed.` : '')
      );
    } catch (err: any) {
      showError(err.message || 'Failed to complete Nusuk group import.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nusuk Group Import"
        subtitle="Upload a Nusuk file — visas land group-wise, set buying / selling rates one by one per group, generate VVs in one save."
      />

      {/* STEP 1 */}
      <Card padding="md" className="border-slate-200">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3">Step 1 — Sub-Vendor &amp; Nusuk File</h3>
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Sub-Vendor (Vendor) *</label>
            <select
              value={vendorId}
              onChange={(e) => { setVendorId(e.target.value); setShirkaId(''); }}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
            >
              <option value="">-- Select Vendor --</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Shirka (Sub-Vendor)</label>
            <select
              value={shirkaId}
              onChange={(e) => setShirkaId(e.target.value)}
              disabled={!vendorId}
              className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 disabled:opacity-50"
            >
              <option value="">-- Vendor itself --</option>
              {shirkas.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Nusuk Excel File *</label>
            <label className="flex items-center gap-2 p-2.5 bg-white border border-dashed border-slate-300 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer hover:border-slate-400">
              <Upload className="w-4 h-4 text-slate-400" />
              <span className="truncate">{fileName || 'Choose .xlsx file…'}</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
            </label>
          </div>
        </div>
      </Card>

      {/* STEP 2 */}
      {parsed && (
        <Card padding="md" className="border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
              Step 2 — Groups &amp; Rates <span className="text-slate-400 normal-case font-medium">(each row independent — change one by one)</span>
            </h3>
            <span className="text-[11px] text-slate-500 font-medium">
              {groups.length} groups • {totals.visas} visas
            </span>
          </div>

          {/* Pre-save check — visible validation before Import */}
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-semibold">
            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />{preSaveCheck.valid} valid visas
            </span>
            {preSaveCheck.dups > 0 && (
              <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />{preSaveCheck.dups} duplicate(s) will be skipped
              </span>
            )}
            {preSaveCheck.blankPassport > 0 && (
              <span className="px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800" title={`Groups: ${preSaveCheck.blankGroups.join(', ')}`}>
                <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />{preSaveCheck.blankPassport} blank passport(s) — {preSaveCheck.blankGroups.join(', ')}
              </span>
            )}
            {preSaveCheck.autoDate > 0 && (
              <span className="px-2.5 py-1.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-800">
                {preSaveCheck.autoDate} visa(s) with auto-filled issue date
              </span>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Group</th>
                  <th className="p-2.5">Visas</th>
                  <th className="p-2.5">B2B Agent *</th>
                  <th className="p-2.5">Package Type</th>
                  <th className="p-2.5 text-right">Buying / Visa (SAR) *</th>
                  <th className="p-2.5 text-right">Selling / Visa (SAR) *</th>
                  <th className="p-2.5 text-right">Total Sale</th>
                  <th className="p-2.5 text-right">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {groups.map((g) => {
                  const complete = g.agentId && g.buying > 0 && g.selling > 0;
                  return (
                    <tr key={g.groupCode} className={complete ? '' : 'bg-amber-50/40'}>
                      <td className="p-2.5">
                        <div className="font-mono font-bold text-[var(--theme-primary)]">{g.groupCode}</div>
                        <div className="text-[11px] text-slate-500">{g.groupName}</div>
                        {g.dupCount > 0 && (
                          <div className="text-[10px] text-amber-700 font-semibold inline-flex items-center gap-1 mt-0.5">
                            <AlertTriangle className="w-3 h-3" /> {g.dupCount} duplicate(s) skipped
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 font-mono font-bold">{g.visas.length}</td>
                      <td className="p-2.5">
                        <select
                          value={g.agentId}
                          onChange={(e) => updateGroup(g.groupCode, 'agentId', e.target.value)}
                          className="w-44 p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
                        >
                          <option value="">-- Select Agent --</option>
                          {agents.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.title || a.companyName} ({a.accountCode || a.agentCode})</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2.5">
                        <select
                          value={g.packageType}
                          onChange={(e) => updateGroup(g.groupCode, 'packageType', e.target.value)}
                          className="w-32 p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900"
                        >
                          <option value="">-- None --</option>
                          {PACKAGE_TYPES.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number" min="0" step="1"
                          value={g.buying || ''}
                          onChange={(e) => updateGroup(g.groupCode, 'buying', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-28 p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-rose-700 text-right"
                        />
                      </td>
                      <td className="p-2.5">
                        <input
                          type="number" min="0" step="1"
                          value={g.selling || ''}
                          onChange={(e) => updateGroup(g.groupCode, 'selling', parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className="w-28 p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-emerald-700 text-right"
                        />
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold">
                        {g.selling > 0 ? `SAR ${(g.visas.length * g.selling).toLocaleString()}` : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-700">
                        {g.buying > 0 && g.selling > 0 ? `SAR ${(g.visas.length * (g.selling - g.buying)).toLocaleString()}` : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                <tr>
                  <td className="p-2.5" colSpan={1}>Total</td>
                  <td className="p-2.5 font-mono">{totals.visas}</td>
                  <td className="p-2.5 text-[10px] text-slate-500 font-medium" colSpan={2}>{completeGroups.length}/{groups.length} groups complete</td>
                  <td className="p-2.5 text-right font-mono text-rose-700">SAR {totals.buy.toLocaleString()}</td>
                  <td className="p-2.5 text-right font-mono text-emerald-700">SAR {totals.sell.toLocaleString()}</td>
                  <td className="p-2.5 text-right font-mono" colSpan={2}>Margin SAR {totals.margin.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {incompleteGroups.length > 0 && (
            <p className="text-[11px] text-amber-700 font-medium mt-2">
              {incompleteGroups.length} group(s) incomplete (missing agent or rates) — their visas will still be imported, but no VV will be generated for them yet.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 mt-4">
            {done ? (
              <Button variant="primary" onClick={() => navigate('/visas/invoices')} rightIcon={<ArrowRight className="w-4 h-4" />}>
                View Generated VVs
              </Button>
            ) : (
              <Button variant="primary" onClick={handleSave} disabled={saving || completeGroups.length === 0} rightIcon={<CheckCircle2 className="w-4 h-4" />}>
                {saving ? 'Saving…' : `Import & Generate VVs (${completeGroups.length} groups)`}
              </Button>
            )}
          </div>
        </Card>
      )}

      {!parsed && (
        <Card padding="md" className="border-dashed border-slate-300 text-center py-10">
          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Upload a Nusuk Excel file above — groups will appear here, group-wise, ready for one-by-one rates.</p>
        </Card>
      )}
    </div>
  );
};

export default NusukGroupImportPage;
