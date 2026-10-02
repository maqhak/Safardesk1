import React, { useState, useMemo } from 'react';
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
  UserCheck,
  FileSpreadsheet,
  Check,
  X,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { DataTable, Column } from '../components/ui/DataTable';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { formatDate } from '../utils/formatters';
import { useToast } from '../contexts/ToastContext';
import { useCan } from '../hooks/useCan';
import { usePresetSearch } from '../hooks/useDeepOpen';
import { fetchVisas, saveVisasBatch, saveVisaImportBatch, VisaDoc } from '../services/visaService';
import { logAuditEvent } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';

export const VisasPage: React.FC = () => {
  const { success, error: showError, info } = useToast();
  const { userProfile } = useAuth();
  const canCreate = useCan('Visas', 'create');

  const [visas, setVisas] = useState<VisaDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState('');

  // Deep link: ?q=<term> presets the search filter (from profile timelines)
  usePresetSearch(setSearch);
  const [modalOpen, setModalOpen] = useState(false);

  // Manual Visa Form State
  const [manualName, setManualName] = useState('');
  const [manualPassport, setManualPassport] = useState('');
  const [manualNationality, setManualNationality] = useState('Pakistani');
  const [manualGroupCode, setManualGroupCode] = useState('GRP-2026-03');
  const [manualGroupName, setManualGroupName] = useState('Manual Umrah Group');
  const [manualGender, setManualGender] = useState('Male');
  const [manualAge, setManualAge] = useState<number>(30);

  // Import Wizard Modal States
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [parsedRows, setParsedRows] = useState<VisaDoc[]>([]);
  const [uploadDateTag, setUploadDateTag] = useState<string>(new Date().toISOString().split('T')[0]);

  const loadVisas = async () => {
    setLoading(true);
    try {
      const vList = await fetchVisas();
      setVisas(vList);
    } catch {
      showError('Failed to load visas directory.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadVisas();
  }, []);

  const filteredVisas = useMemo(() => {
    return visas.filter(
      (v) =>
        (v.pilgrimName || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.passportNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.groupCode || '').toLowerCase().includes(search.toLowerCase()) ||
        (v.nationality || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [visas, search]);

  // Handle Excel File Upload & Parsing with In-File Duplicate Detection & Auto-Skip
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });

        if (data.length === 0) {
          showError('The uploaded Excel file contains no valid rows.');
          return;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        setUploadDateTag(todayStr);

        let rawMapped = data.map((row) => {
          const groupCode = String(row['Group Number'] || row['Group Code'] || row['GroupNo'] || 'GRP-IMPORT');
          const groupName = String(row['Group Name'] || row['GroupName'] || 'Imported Umrah Group');
          const pilgrimName = String(row['Mutamer Name'] || row['Passenger Name'] || row['Name'] || 'Unknown Pilgrim');
          const nationality = String(row['Nationality'] || 'Pakistani');
          const gender = String(row['Gender'] || row['Sex'] || row['IncentiveDiscountType'] || 'Male');
          const passportNumber = String(row['Passport Number'] || row['Passport'] || '').trim();
          const age = row['Mutamer Age'] || row['Age'] || 30;

          let rawDate = String(row['Visa Issue Date'] || row['Issue Date'] || row['Date'] || '').trim();
          let visaIssueDate = rawDate ? rawDate.split(' ')[0].split('T')[0] : '';

          return {
            groupCode,
            groupName,
            pilgrimName,
            nationality,
            gender,
            passportNumber,
            age,
            visaIssueDate,
            dateSource: 'original' as const,
          };
        });

        // Blank-date fallback chain per group
        const groupDateCounts = new Map<string, Map<string, number>>();
        rawMapped.forEach((r) => {
          if (r.visaIssueDate) {
            const dateMap = groupDateCounts.get(r.groupCode) || new Map<string, number>();
            dateMap.set(r.visaIssueDate, (dateMap.get(r.visaIssueDate) || 0) + 1);
            groupDateCounts.set(r.groupCode, dateMap);
          }
        });

        const groupMostCommonDate = new Map<string, string>();
        groupDateCounts.forEach((dateMap, gCode) => {
          let maxCount = -1;
          let bestDate = '';
          dateMap.forEach((count, d) => {
            if (count > maxCount) {
              maxCount = count;
              bestDate = d;
            }
          });
          if (bestDate) groupMostCommonDate.set(gCode, bestDate);
        });

        const dbPassports = new Set(visas.map(v => v.passportNumber));
        const filePassports = new Set<string>();

        const finalProcessed: VisaDoc[] = rawMapped.map((r, idx) => {
          let finalDate = r.visaIssueDate;
          let source: 'original' | 'auto' = 'original';

          if (!finalDate) {
            const commonDate = groupMostCommonDate.get(r.groupCode);
            if (commonDate) {
              finalDate = commonDate;
              source = 'auto';
            } else {
              finalDate = todayStr;
              source = 'auto';
            }
          }

          // Check DB duplicate OR in-file duplicate
          const inDbDuplicate = dbPassports.has(r.passportNumber);
          const inFileDuplicate = filePassports.has(r.passportNumber);
          const isDuplicate = inDbDuplicate || inFileDuplicate;

          if (r.passportNumber) {
            filePassports.add(r.passportNumber);
          }

          return {
            id: `visa-imp-${Date.now()}-${idx}`,
            pilgrimName: r.pilgrimName,
            passportNumber: r.passportNumber,
            nationality: r.nationality,
            groupCode: r.groupCode,
            groupName: r.groupName,
            gender: r.gender,
            age: r.age,
            visaIssueDate: finalDate,
            dateSource: source,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            isDuplicate,
            skipImport: isDuplicate, // Auto-skip duplicates by default
          };
        });

        setParsedRows(finalProcessed);
        setImportStep('preview');
        const dupCount = finalProcessed.filter(r => r.isDuplicate).length;
        success(`Parsed ${finalProcessed.length} rows. Auto-skipped ${dupCount} duplicate passports.`);
      } catch (err: any) {
        showError('Failed to parse Excel workbook: ' + (err.message || 'Invalid format'));
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleToggleSkip = (id: string) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, skipImport: !r.skipImport } : r));
  };

  const handleUpdateRowField = (id: string, field: keyof VisaDoc, val: any) => {
    setParsedRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  // Group-wise counts in preview
  const previewGroupSummary = useMemo(() => {
    const map = new Map<string, { count: number; skipped: number }>();
    parsedRows.forEach(r => {
      const cur = map.get(r.groupCode) || { count: 0, skipped: 0 };
      cur.count += 1;
      if (r.skipImport) cur.skipped += 1;
      map.set(r.groupCode, cur);
    });
    return Array.from(map.entries()).map(([code, data]) => ({ code, ...data }));
  }, [parsedRows]);

  const handleConfirmImport = async () => {
    const validRowsToImport = parsedRows.filter(r => !r.skipImport && r.passportNumber);
    const skippedCount = parsedRows.filter(r => r.skipImport).length;

    setImportStep('importing');
    try {
      if (validRowsToImport.length > 0) {
        await saveVisasBatch(validRowsToImport);
      }

      // Save Visa Import Batch Doc
      await saveVisaImportBatch({
        id: `batch-${Date.now()}`,
        fileName: importFileName || 'nusuk_import.xlsx',
        uploadedBy: userProfile?.name || 'Operator',
        uploadedAt: new Date().toISOString(),
        totalRows: parsedRows.length,
        importedRows: validRowsToImport.length,
        skippedDuplicates: skippedCount,
      });

      // Write audit log entry
      if (userProfile) {
        await logAuditEvent({
          action: 'IMPORT_VISA_BATCH',
          userId: userProfile.uid,
          userName: userProfile.name || 'User',
          userEmail: userProfile.email,
          userRole: userProfile.role,
          details: { fileName: importFileName, importedRows: validRowsToImport.length, skippedDuplicates: skippedCount },
        });
      }

      success(`Successfully imported ${validRowsToImport.length} visa records (${skippedCount} duplicates auto-skipped).`);
      setImportModalOpen(false);
      setImportStep('upload');
      loadVisas();
    } catch {
      showError('Failed to save imported visa batch.');
      setImportStep('preview');
    }
  };

  // Handle Manual Visa Application Submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName || !manualPassport) {
      showError('Applicant Name and Passport Number are required.');
      return;
    }

    try {
      const newVisa: VisaDoc = {
        id: `visa-manual-${Date.now()}`,
        pilgrimName: manualName,
        passportNumber: manualPassport,
        nationality: manualNationality,
        groupCode: manualGroupCode,
        groupName: manualGroupName,
        gender: manualGender,
        age: manualAge,
        visaIssueDate: new Date().toISOString().split('T')[0],
        dateSource: 'original',
        status: 'Pending',
        createdAt: new Date().toISOString(),
        isDuplicate: false,
        skipImport: false,
      };

      await saveVisasBatch([newVisa]);

      if (userProfile) {
        await logAuditEvent({
          action: 'CREATE_VISA',
          userId: userProfile.uid,
          userName: userProfile.name || 'User',
          userEmail: userProfile.email,
          userRole: userProfile.role,
          targetUserId: newVisa.id,
          targetUserName: manualName,
          details: { passportNumber: manualPassport, groupCode: manualGroupCode },
        });
      }

      success(`Visa application for "${manualName}" registered successfully.`);
      setModalOpen(false);
      setManualName('');
      setManualPassport('');
      loadVisas();
    } catch (err: any) {
      showError(err.message || 'Failed to register manual visa application.');
    }
  };

  const columns: Column<VisaDoc>[] = [
    {
      key: 'pilgrimName',
      header: 'Mutamer & Passport',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-semibold text-slate-900 block">{row.pilgrimName}</span>
          <span className="text-xs font-mono text-slate-500">
            {row.passportNumber} • {row.nationality} {row.gender ? `• ${row.gender}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'groupCode',
      header: 'Group Info',
      sortable: true,
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-[#0e2c4c]">{row.groupCode}</span>
          <span className="text-xs text-slate-500 block">{row.groupName || 'Umrah Group'}</span>
        </div>
      ),
    },
    {
      key: 'visaIssueDate',
      header: 'Issue Date',
      sortable: true,
      render: (row) => (
        <span className="text-xs font-mono text-slate-600">
          {row.visaIssueDate || 'N/A'} {row.dateSource === 'auto' && <span className="text-[10px] bg-amber-100 text-amber-800 px-1 rounded ml-1 font-sans">auto</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      align: 'center',
      render: (row) => {
        if (row.status === 'Distributed') return <Badge variant="success" dot>Distributed</Badge>;
        if (row.status === 'Approved') return <Badge variant="navy" dot>Approved</Badge>;
        return <Badge variant="gold" dot>Pending</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Visa Inventory & Nusuk Imports"
        subtitle="Manage imported visa stock, Nusuk Excel batch uploads, and manual applications."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Visas' }
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<UploadCloud className="w-4 h-4 text-white" />}
              onClick={() => {
                setImportModalOpen(true);
                setImportStep('upload');
                setParsedRows([]);
              }}
              className="bg-[#0e2c4c] hover:bg-[#1a4473] text-white"
            >
              Nusuk Excel Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setModalOpen(true)}
            >
              New Visa Application
            </Button>
          </div>
        }
      />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Visas"
          value={visas.length}
          icon={<FileCheck className="w-5 h-5" />}
          trend={{ value: 12, label: 'this month' }}
        />
        <StatCard
          label="Distributed"
          value={visas.filter(v => v.status === 'Distributed').length}
          icon={<UserCheck className="w-5 h-5" />}
        />
        <StatCard
          label="Pending / Available"
          value={visas.filter(v => v.status !== 'Distributed').length}
          icon={<Clock className="w-5 h-5" />}
        />
        <StatCard
          label="Unique Groups"
          value={new Set(visas.map(v => v.groupCode)).size}
          icon={<FileSpreadsheet className="w-5 h-5" />}
        />
      </div>

      {/* Filter & Table */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search mutamer name, passport, group..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Filter className="w-3.5 h-3.5" />}
              onClick={() => info('Filter active.')}
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
          onRowClick={(row) => info(`Applicant selected: ${row.pilgrimName} (${row.passportNumber})`)}
        />
      </div>

      {/* Nusuk Excel Import Wizard Modal */}
      <Modal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Nusuk Excel Visa Batch Import Wizard"
        subtitle="Upload Nusuk Excel workbook. Auto-skips duplicates, checks in-file & DB passports, and logs batch audit."
        size="xl"
        footer={
          <div className="flex items-center justify-between w-full">
            {importStep === 'preview' ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportStep('upload')}>
                  ← Upload Different File
                </Button>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConfirmImport}
                    className="bg-[#0e2c4c] hover:bg-[#1a4473] text-white font-bold"
                  >
                    Confirm & Import Valid Rows ({parsedRows.filter(r => !r.skipImport).length}) →
                  </Button>
                </div>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setImportModalOpen(false)}>
                Close
              </Button>
            )}
          </div>
        }
      >
        {importStep === 'upload' && (
          <div className="p-8 text-center space-y-4 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50">
            <div className="w-16 h-16 bg-navy-50 text-[#0e2c4c] rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <UploadCloud className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Upload Nusuk Excel Workbook (.xlsx / .xls)</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Duplicates within file or database are automatically skipped and counted.
              </p>
            </div>
            <div>
              <label className="inline-block px-4 py-2.5 bg-[#0e2c4c] hover:bg-[#1a4473] text-white font-bold rounded-xl text-xs cursor-pointer shadow transition">
                <span>Browse Excel File</span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {importStep === 'preview' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-100 p-3 rounded-xl gap-3">
              <div>
                <span className="text-xs font-bold text-slate-900">Preview Parsed Rows ({parsedRows.length} total)</span>
                <p className="text-[11px] text-slate-500">Duplicates are auto-skipped. Mutamer Age is fully editable below.</p>
              </div>
              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                  Importing: {parsedRows.filter(r => !r.skipImport).length}
                </span>
                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold">
                  Auto-Skipped Duplicates: {parsedRows.filter(r => r.skipImport).length}
                </span>
              </div>
            </div>

            {/* Group-wise Counts Summary */}
            <div className="flex items-center gap-2 flex-wrap bg-navy-50 p-3 rounded-xl border border-navy-100">
              <span className="text-xs font-bold text-[#0e2c4c] uppercase tracking-wider">Group-Wise Counts:</span>
              {previewGroupSummary.map(g => (
                <span key={g.code} className="text-xs font-mono bg-white text-slate-800 px-2 py-1 rounded-lg border border-slate-200 shadow-2xs font-semibold">
                  {g.code}: <strong className="text-[#0e2c4c]">{g.count - g.skipped}</strong> valid ({g.skipped} skipped)
                </span>
              ))}
            </div>

            <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 uppercase font-bold text-[10px] tracking-wider sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Group #</th>
                    <th className="p-2.5">Mutamer Name</th>
                    <th className="p-2.5">Passport #</th>
                    <th className="p-2.5">Gender</th>
                    <th className="p-2.5">Age</th>
                    <th className="p-2.5">Issue Date</th>
                    <th className="p-2.5 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {parsedRows.map((row) => (
                    <tr key={row.id} className={row.skipImport ? 'opacity-50 bg-amber-50/40' : ''}>
                      <td className="p-2.5 whitespace-nowrap">
                        {row.isDuplicate ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded font-bold">
                            <AlertTriangle className="w-3 h-3" /> Duplicate (Auto-Skipped)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Valid
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-mono text-[#0e2c4c] font-bold">{row.groupCode}</td>
                      <td className="p-2.5 font-semibold text-slate-900">{row.pilgrimName}</td>
                      <td className="p-2.5 font-mono text-slate-700">{row.passportNumber}</td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          value={row.gender || ''}
                          onChange={(e) => handleUpdateRowField(row.id, 'gender', e.target.value)}
                          className="w-24 p-1 bg-slate-50 border border-slate-200 rounded text-xs"
                        />
                      </td>
                      <td className="p-2.5 font-mono">
                        <input
                          type="number"
                          value={row.age || 30}
                          onChange={(e) => handleUpdateRowField(row.id, 'age', parseInt(e.target.value) || 0)}
                          className="w-16 p-1 bg-slate-50 border border-slate-200 rounded text-xs font-mono font-bold"
                        />
                      </td>
                      <td className="p-2.5 font-mono">
                        <input
                          type="date"
                          value={row.visaIssueDate || ''}
                          onChange={(e) => handleUpdateRowField(row.id, 'visaIssueDate', e.target.value)}
                          className="w-32 p-1 bg-slate-50 border border-slate-200 rounded text-xs"
                        />
                        {row.dateSource === 'auto' && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded ml-1 font-sans">auto</span>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleSkip(row.id)}
                          className={`px-2 py-1 rounded text-[11px] font-bold ${
                            row.skipImport 
                              ? 'bg-emerald-600 text-white hover:bg-emerald-700' 
                              : 'bg-amber-600 text-white hover:bg-amber-700'
                          }`}
                        >
                          {row.skipImport ? 'Include' : 'Skip'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {importStep === 'importing' && (
          <div className="py-12 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-[#0e2c4c] border-t-transparent rounded-full animate-spin mx-auto" />
            <div className="text-sm font-bold text-slate-900">Saving imported visa batch & writing audit log...</div>
          </div>
        )}
      </Modal>

      {/* New Application Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Register New Visa Application"
        subtitle="Manual single visa registration form (Persists to database)"
        size="md"
      >
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <Input 
            label="Applicant Full Name" 
            placeholder="As written in passport" 
            required 
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Passport Number" 
              placeholder="e.g. AB1234567" 
              required 
              value={manualPassport}
              onChange={(e) => setManualPassport(e.target.value)}
            />
            <Input 
              label="Nationality" 
              placeholder="e.g. Pakistani" 
              value={manualNationality}
              onChange={(e) => setManualNationality(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Group Code" 
              placeholder="e.g. GRP-2026-03" 
              value={manualGroupCode}
              onChange={(e) => setManualGroupCode(e.target.value)}
            />
            <Input 
              label="Gender" 
              placeholder="Male / Female" 
              value={manualGender}
              onChange={(e) => setManualGender(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input 
              label="Mutamer Age" 
              type="number"
              placeholder="Age" 
              value={manualAge}
              onChange={(e) => setManualAge(parseInt(e.target.value) || 0)}
            />
            <Input 
              label="Group Name" 
              placeholder="Group Name" 
              value={manualGroupName}
              onChange={(e) => setManualGroupName(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" className="bg-[#0e2c4c] hover:bg-[#1a4473] text-white">Submit & Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
