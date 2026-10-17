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

interface CodedRow extends ParsedRow {
  agentCode: string;
  vndCode: string;
  payable: number;    // buying per visa, in file currency
  recievable: number; // selling per visa, in file currency
  agentId: string;    // matched agent id ('' if not found)
  vendorId: string;   // matched vendor id ('' if not found)
  buyingSAR: number;
  sellingSAR: number;
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

  // Coded import mode (12-col file: AGENT CODE / VND CODE / PAYABLE / RECIEVABLE)
  const [importMode, setImportMode] = useState<'nusuk' | 'coded'>('nusuk');
  const [codedRows, setCodedRows] = useState<CodedRow[]>([]);
  const [fileCurrency, setFileCurrency] = useState<'PKR' | 'SAR' | ''>('');
  const [fileRate, setFileRate] = useState<number>(0);
  const [codedVendorFallback, setCodedVendorFallback] = useState('');

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

  const downloadCodedSample = async () => {
    const XLSX = await import('xlsx');
    const sample = [
      {
        'Group Number': '480901389509',
        'Group Name': 'LTS DSLR 2 PEX 30 OCT TO 9 NOV 10 DAYS',
        'Mutamer Name': 'Sample Pilgrim One',
        'Nationality': 'Pakistani',
        'Gender': 'Male',
        'Passport Number': 'AB1234567',
        'Mutamer Age': 35,
        'Visa Issue Date': '2026-10-17',
        'AGENT CODE': 'AGT-011',
        'VND CODE': 'VND-001',
        'PAYABLE': 465,
        'RECIEVABLE': 470,
      },
      {
        'Group Number': '480901389509',
        'Group Name': 'LTS DSLR 2 PEX 30 OCT TO 9 NOV 10 DAYS',
        'Mutamer Name': 'Sample Pilgrim Two',
        'Nationality': 'Pakistani',
        'Gender': 'Female',
        'Passport Number': 'CD7654321',
        'Mutamer Age': 28,
        'Visa Issue Date': '2026-10-17',
        'AGENT CODE': 'AGT-011',
        'VND CODE': 'VND-001',
        'PAYABLE': 465,
        'RECIEVABLE': 470,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    ws['!cols'] = [
      { wch: 16 }, { wch: 38 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 16 },
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Coded Import');
    XLSX.writeFile(wb, 'coded_visa_import_sample.xlsx');
    success('Sample template downloaded — AGENT CODE / VND CODE apne system ke codes se replace karein.');
  };

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

        // Detect coded import: 12-col file with AGENT CODE / VND CODE / PAYABLE / RECIEVABLE
        const firstRow = data[0] || {};
        const hasCodedCols = firstRow['AGENT CODE'] !== undefined && (firstRow['PAYABLE'] !== undefined || firstRow['RECIEVABLE'] !== undefined);
        const mode: 'nusuk' | 'coded' = hasCodedCols ? 'coded' : 'nusuk';
        setImportMode(mode);
        setCodedRows([]);
        setFileCurrency('');
        if (mode === 'coded') {
          const r = getCurrentRate('SAR-PKR') || 0;
          setFileRate(r);
        }

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
          // coded columns (empty in nusuk mode)
          agentCode: String(row['AGENT CODE'] || '').trim(),
          vndCode: String(row['VND CODE'] || '').trim(),
          payable: parseFloat(row['PAYABLE']) || 0,
          recievable: parseFloat(row['RECIEVABLE']) || 0,
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
            agentCode: r.agentCode || '',
            vndCode: r.vndCode || '',
            payable: r.payable || 0,
            recievable: r.recievable || 0,
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

        // Coded mode: match AGENT CODE / VND CODE, keep per-row payable/recievable
        if (mode === 'coded') {
          const agentByCode = new Map<string, string>();
          agents.forEach((a: any) => {
            if (a.agentCode) agentByCode.set(String(a.agentCode).trim().toUpperCase(), a.id);
            if (a.accountCode) agentByCode.set(String(a.accountCode).trim().toUpperCase(), a.id);
          });
          const vendorByCode = new Map<string, string>();
          vendors.forEach((v: any) => {
            if (v.vendorCode) vendorByCode.set(String(v.vendorCode).trim().toUpperCase(), v.id);
          });
          const coded: CodedRow[] = rows
            .filter((r) => !r.skipImport)
            .map((r: any, idx: number) => ({
              ...r,
              agentCode: r.agentCode || '',
              vndCode: r.vndCode || '',
              payable: r.payable || 0,
              recievable: r.recievable || 0,
              agentId: agentByCode.get(String(r.agentCode || '').trim().toUpperCase()) || '',
              vendorId: vendorByCode.get(String(r.vndCode || '').trim().toUpperCase()) || '',
              buyingSAR: 0,
              sellingSAR: 0,
            }));
          setCodedRows(coded);
          const unmatchedAgents = coded.filter((c) => !c.agentId).length;
          const unmatchedVendors = coded.filter((c) => !c.vendorId).length;
          success(`Coded file parsed: ${coded.length} visas, ${dups} duplicates skipped. Now select the file currency (PKR/SAR).` +
            (unmatchedAgents ? ` ${unmatchedAgents} row(s) with unknown AGENT CODE.` : '') +
            (unmatchedVendors ? ` ${unmatchedVendors} row(s) with unknown VND CODE.` : ''));
        } else {
          success(`Parsed ${rows.length} rows into ${gmap.size} groups. Skipped ${dups} duplicates.`);
        }
      } catch (err: any) {
        showError('Failed to parse Excel workbook: ' + (err.message || 'Invalid format'));
      }
    };
    reader.readAsBinaryString(file);
  };

  // Coded mode: recompute SAR values when currency or rate changes
  React.useEffect(() => {
    if (importMode !== 'coded' || !fileCurrency) return;
    const rate = fileCurrency === 'SAR' ? 1 : (fileRate > 0 ? fileRate : 1);
    setCodedRows((prev) => prev.map((c) => ({
      ...c,
      buyingSAR: fileCurrency === 'SAR'
        ? Math.round(c.payable * 100) / 100
        : Math.round((c.payable / rate) * 100) / 100,
      sellingSAR: fileCurrency === 'SAR'
        ? Math.round(c.recievable * 100) / 100
        : Math.round((c.recievable / rate) * 100) / 100,
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileCurrency, fileRate, importMode]);

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

  // ---------- Coded import: auto-distribute by AGENT CODE / VND CODE ----------
  const codedReady = codedRows.filter((c) => c.agentId && (c.vendorId || codedVendorFallback) && c.sellingSAR > 0);
  const codedBlocked = codedRows.filter((c) => !c.agentId || (!(c.vendorId || codedVendorFallback)) || !(c.sellingSAR > 0));

  const handleCodedSave = async () => {
    if (!fileCurrency) {
      showError('Please select the file currency (PKR or SAR) first.');
      return;
    }
    if (fileCurrency === 'PKR' && !(fileRate > 0)) {
      showError('Please enter the SAR→PKR rate for conversion.');
      return;
    }
    if (codedReady.length === 0) {
      showError('No ready rows: every row needs a matched AGENT CODE, a vendor, and a selling amount.');
      return;
    }
    const confirmed = window.confirm(
      `Import ${codedReady.length} visas and auto-generate VVs?\n` +
      (codedBlocked.length > 0 ? `${codedBlocked.length} row(s) will be imported as undistributed (unmatched code or missing rate).\n` : '') +
      `Currency: ${fileCurrency}${fileCurrency === 'PKR' ? ` @ ${fileRate}` : ''}.`
    );
    if (!confirmed) return;
    setSaving(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const rate = fileCurrency === 'SAR' ? (getCurrentRate('SAR-PKR') || 0) : fileRate;

      // 1. Import ALL valid coded visas (ready + blocked — no data loss)
      const allValid: VisaDoc[] = codedRows.map((c) => ({
        ...(c as unknown as VisaDoc),
        vendorId: c.vendorId || codedVendorFallback || undefined,
        shirkaId: undefined,
        shirkaName: undefined,
      } as VisaDoc));
      if (allValid.length > 0) await saveVisasBatch(allValid);
      await saveVisaImportBatch({
        id: `batch-${Date.now()}`,
        fileName: fileName || 'coded_import.xlsx',
        uploadedBy: userProfile?.name || 'Operator',
        uploadedAt: new Date().toISOString(),
        totalRows: allValid.length,
        importedRows: allValid.length,
        skippedDuplicates: 0,
        vendorId: '',
        shirkaId: undefined,
        shirkaName: undefined,
      });

      // 2. Auto-distribute ready rows — one batch per vendor
      const byVendor = new Map<string, CodedRow[]>();
      codedReady.forEach((c) => {
        const vId = c.vendorId || codedVendorFallback;
        const list = byVendor.get(vId) || [];
        list.push(c);
        byVendor.set(vId, list);
      });
      let vvCount = 0;
      for (const [vId, list] of byVendor.entries()) {
        // Group by agent + rates (rows may carry different rates)
        const gmap = new Map<string, { agentId: string; buying: number; selling: number; groupCode: string; groupName: string; visaIds: string[] }>();
        list.forEach((c) => {
          const key = `${c.agentId}|${c.buyingSAR}|${c.sellingSAR}`;
          let g = gmap.get(key);
          if (!g) {
            g = { agentId: c.agentId, buying: c.buyingSAR, selling: c.sellingSAR, groupCode: c.groupCode, groupName: c.groupName, visaIds: [] };
            gmap.set(key, g);
          }
          g.visaIds.push(c.id);
        });
        const agentGroupMap = new Map<string, {
          agentId: string; sellingPricePerVisa: number; buyingPricePerVisa: number;
          groupCode: string; groupName: string; visaIds: string[]; exchangeRateSARPKR: number;
        }>();
        gmap.forEach((g, key) => {
          agentGroupMap.set(key, {
            agentId: g.agentId,
            sellingPricePerVisa: g.selling,
            buyingPricePerVisa: g.buying,
            groupCode: g.groupCode,
            groupName: g.groupName,
            visaIds: g.visaIds,
            exchangeRateSARPKR: rate,
          });
        });
        const res = await createVisaDistributionBatch({
          vendorId: vId,
          agentGroupMap,
          date: todayStr,
          createdBy: userProfile?.name || 'Operator',
        });
        vvCount += res.invoices.length;
      }

      if (userProfile) {
        await logAuditEvent({
          action: 'CODED_IMPORT',
          userId: userProfile.uid,
          userName: userProfile.name || 'User',
          userEmail: userProfile.email,
          userRole: userProfile.role,
          details: { fileName, visas: allValid.length, vvs: vvCount, currency: fileCurrency },
        }).catch(() => {});
      }

      setDone(true);
      success(
        `Imported ${allValid.length} visas. ${vvCount} VV(s) auto-generated.` +
        (codedBlocked.length > 0 ? ` ${codedBlocked.length} row(s) kept as undistributed (fix codes/rates and distribute manually).` : '')
      );
    } catch (err: any) {
      showError(err.message || 'Failed to complete coded import.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={importMode === 'coded' ? 'Coded Import' : 'Nusuk Group Import'}
        subtitle={importMode === 'coded'
          ? 'Upload the 12-column file — AGENT CODE / VND CODE / PAYABLE / RECIEVABLE are read from each row, VVs auto-generate.'
          : 'Upload a Nusuk file — visas land group-wise, set buying / selling rates one by one per group, generate VVs in one save.'}
      />

      {/* STEP 1 */}
      <Card padding="md" className="border-slate-200">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-3">
          Step 1 — {importMode === 'coded' ? 'Coded Excel File (12 columns)' : 'Sub-Vendor & Nusuk File'}
        </h3>
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
            <button
              type="button"
              onClick={downloadCodedSample}
              className="mt-2 text-[11px] font-bold text-sky-700 hover:text-sky-900 underline underline-offset-2"
            >
              Download coded sample template (12 columns)
            </button>
          </div>
        </div>
      </Card>

      {/* STEP 2 */}
      {parsed && importMode === 'nusuk' && (
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

      {parsed && importMode === 'coded' && (
        <Card padding="md" className="border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Step 2 — File Currency &amp; Auto-Mapped Preview</h3>
            <span className="text-[11px] text-slate-500 font-medium">{codedRows.length} visas • {codedReady.length} ready • {codedBlocked.length} blocked</span>
          </div>
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl mb-4">
            <div className="text-xs font-bold text-sky-900 mb-2">PAYABLE / RECIEVABLE amounts kis currency me hain?</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer bg-white border border-slate-300 rounded-lg px-4 py-2.5">
                <input type="radio" name="fileCurrency" checked={fileCurrency === 'PKR'} onChange={() => setFileCurrency('PKR')} className="w-4 h-4" />PKR — Pakistani Rupee
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer bg-white border border-slate-300 rounded-lg px-4 py-2.5">
                <input type="radio" name="fileCurrency" checked={fileCurrency === 'SAR'} onChange={() => setFileCurrency('SAR')} className="w-4 h-4" />SAR — Saudi Riyal
              </label>
              {fileCurrency === 'PKR' && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-600">Rate (1 SAR = ? PKR):</span>
                  <input type="number" min="0" step="0.01" value={fileRate || ''} onChange={(e) => setFileRate(parseFloat(e.target.value) || 0)} className="w-28 p-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold" />
                </div>
              )}
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Default Vendor (jin rows me VND CODE nahi / match nahi hua)</label>
            <select value={codedVendorFallback} onChange={(e) => setCodedVendorFallback(e.target.value)} className="w-full sm:w-80 p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900">
              <option value="">-- Select fallback vendor --</option>
              {vendors.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}
            </select>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse min-w-[980px]">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-2.5">Pilgrim</th><th className="p-2.5">Passport</th><th className="p-2.5">Agent Code → Agent</th><th className="p-2.5">VND Code → Vendor</th>
                  <th className="p-2.5 text-right">Payable ({fileCurrency || '?'})</th><th className="p-2.5 text-right">Recievable ({fileCurrency || '?'})</th>
                  <th className="p-2.5 text-right">Buying (SAR)</th><th className="p-2.5 text-right">Selling (SAR)</th><th className="p-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {codedRows.slice(0, 100).map((c) => {
                  const agent = agents.find((a: any) => a.id === c.agentId);
                  const vendor = vendors.find((v: any) => v.id === (c.vendorId || codedVendorFallback));
                  const blocked = !c.agentId || (!(c.vendorId || codedVendorFallback)) || !(c.sellingSAR > 0);
                  return (
                    <tr key={c.id} className={blocked ? 'bg-rose-50/50' : ''}>
                      <td className="p-2.5 font-semibold text-slate-900">{c.pilgrimName}</td>
                      <td className="p-2.5 font-mono text-slate-600">{c.passportNumber || '—'}</td>
                      <td className="p-2.5"><span className="font-mono text-slate-500">{c.agentCode || '—'}</span>{' → '}{agent ? (<span className="font-semibold text-emerald-700">{(agent as any).title || (agent as any).companyName}</span>) : (<span className="font-bold text-rose-600">NOT FOUND</span>)}</td>
                      <td className="p-2.5"><span className="font-mono text-slate-500">{c.vndCode || '—'}</span>{' → '}{vendor ? (<span className="font-semibold text-emerald-700">{vendor.name}</span>) : (<span className="font-bold text-rose-600">NOT FOUND</span>)}</td>
                      <td className="p-2.5 text-right font-mono text-rose-700">{c.payable ? c.payable.toLocaleString() : '—'}</td>
                      <td className="p-2.5 text-right font-mono text-emerald-700">{c.recievable ? c.recievable.toLocaleString() : '—'}</td>
                      <td className="p-2.5 text-right font-mono">{c.buyingSAR ? `SAR ${c.buyingSAR.toLocaleString()}` : '—'}</td>
                      <td className="p-2.5 text-right font-mono font-bold">{c.sellingSAR ? `SAR ${c.sellingSAR.toLocaleString()}` : '—'}</td>
                      <td className="p-2.5 text-center">{!fileCurrency ? (<span className="text-[10px] font-bold text-amber-700">PICK CURRENCY</span>) : blocked ? (<span className="text-[10px] font-bold text-rose-700">BLOCKED</span>) : (<span className="text-[10px] font-bold text-emerald-700">READY</span>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {codedRows.length > 100 && (<p className="text-[11px] text-slate-500 mt-2">Showing first 100 of {codedRows.length} rows.</p>)}
          <div className="flex items-center justify-end gap-3 mt-4">
            {done ? (
              <Button variant="primary" onClick={() => navigate('/visas/invoices')} rightIcon={<ArrowRight className="w-4 h-4" />}>View Generated VVs</Button>
            ) : (
              <Button variant="primary" onClick={handleCodedSave} disabled={saving || !fileCurrency || codedReady.length === 0} rightIcon={<CheckCircle2 className="w-4 h-4" />}>
                {saving ? 'Saving…' : `Import & Auto-Generate VVs (${codedReady.length} ready)`}
              </Button>
            )}
          </div>
          {codedBlocked.length > 0 && fileCurrency && (
            <p className="text-[11px] text-amber-700 font-medium mt-2">{codedBlocked.length} row(s) blocked (unknown code or missing rate) — imported as undistributed, distribute manually later.</p>
          )}
        </Card>
      )}

      {!parsed && (
        <Card padding="md" className="border-dashed border-slate-300 text-center py-10">
          <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">
            {importMode === 'coded'
              ? 'Upload the 12-column coded Excel file above — rows will auto-map by AGENT CODE / VND CODE.'
              : 'Upload a Nusuk Excel file above — groups will appear here, group-wise, ready for one-by-one rates.'}
          </p>
        </Card>
      )}
    </div>
  );
};

export default NusukGroupImportPage;
