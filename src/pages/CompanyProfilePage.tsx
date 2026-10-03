import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  UploadCloud, 
  Save, 
  RefreshCw, 
  FileText, 
  Printer, 
  Hash, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Image as ImageIcon,
  ExternalLink,
  ShieldCheck,
  Server,
  Layers,
  Sparkles,
  Play
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCompanyProfile } from '../contexts/CompanyContext';
import { 
  fetchCompanyProfile, 
  saveCompanyProfile, 
  uploadCompanyLogo, 
  nextNumber, 
  peekNextNumber 
} from '../services/companyService';
import { CompanyProfile, NumberSequenceType } from '../types/company';
import { TENANT, firebaseConfig } from '../config';
import { formatDate } from '../utils/formatters';

export const CompanyProfilePage: React.FC = () => {
  const { userProfile, role } = useAuth();
  const { success, error: showError, info } = useToast();
  const { updateCachedProfile } = useCompanyProfile();

  const [formData, setFormData] = useState<CompanyProfile>({
    companyName: TENANT.companyName,
    legalName: '',
    logoUrl: '',
    stampUrl: '',
    address: '',
    city: '',
    country: '',
    phone: '',
    mobile: '',
    email: '',
    website: '',
    taxRegNo: '',
    voucherPrefix: 'UV-',
    invoicePrefix: 'INV-',
    paymentPrefix: 'PAY-',
    jvPrefix: 'JV-',
    baseCurrency: 'PKR',
    defaultForeignCurrency: 'SAR',
    agentBackdateHours: 12,
    statementFooterNote: '',
    makkahStaffName: '',
    makkahStaffPhone: '',
    madinaStaffName: '',
    madinaStaffPhone: '',
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [uploadingLogo, setUploadingLogo] = useState<boolean>(false);

  // Counter preview strings
  const [counterPreviews, setCounterPreviews] = useState<Record<NumberSequenceType, string>>({
    voucher: 'UV-000123',
    invoice: 'INV-001046',
    payment: 'PAY-000490',
    jv: 'JV-000083',
  });

  // Selected preview document type
  const [previewDocType, setPreviewDocType] = useState<'voucher' | 'statement'>('voucher');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchCompanyProfile();
      setFormData(data);
      updateCachedProfile(data);

      const [v, inv, pay, jv] = await Promise.all([
        peekNextNumber('voucher'),
        peekNextNumber('invoice'),
        peekNextNumber('payment'),
        peekNextNumber('jv'),
      ]);
      setCounterPreviews({ voucher: v, invoice: inv, payment: pay, jv });
    } catch {
      showError('Could not load company settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInputChange = (field: keyof CompanyProfile, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showError('Please upload a valid image file (PNG, JPG).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showError('Stamp image size must be less than 2MB.');
      return;
    }
    setUploadingLogo(true);
    try {
      const downloadUrl = await uploadCompanyLogo(file);
      setFormData((prev) => ({ ...prev, stampUrl: downloadUrl }));
      success('Company stamp uploaded successfully.');
    } catch (err: any) {
      showError(err?.message || 'Failed to upload stamp.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showError('Please upload a valid image file (PNG, JPG, SVG).');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showError('Logo image size must be less than 2MB.');
      return;
    }

    setUploadingLogo(true);
    try {
      const downloadUrl = await uploadCompanyLogo(file);
      setFormData((prev) => ({ ...prev, logoUrl: downloadUrl }));
      success('Company logo uploaded successfully.');
    } catch (err: any) {
      showError(err?.message || 'Failed to upload logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (!formData.companyName.trim()) {
      showError('Company Name is required.');
      return;
    }

    setSaving(true);
    try {
      const saved = await saveCompanyProfile(userProfile, formData);
      setFormData(saved);
      updateCachedProfile(saved);
      success('Company profile & document numbering saved successfully.', 'Configuration Updated');

      // Refresh counter previews
      const [v, inv, pay, jv] = await Promise.all([
        peekNextNumber('voucher'),
        peekNextNumber('invoice'),
        peekNextNumber('payment'),
        peekNextNumber('jv'),
      ]);
      setCounterPreviews({ voucher: v, invoice: inv, payment: pay, jv });
    } catch (err: any) {
      showError(err?.message || 'Failed to save company settings.');
    } finally {
      setSaving(false);
    }
  };

  // Test atomic counter increment live
  const handleTestNextNumber = async (type: NumberSequenceType) => {
    try {
      const generated = await nextNumber(type);
      success(`Incremented & generated live sequence number: ${generated}`, 'Sequence Tested');
      const updated = await peekNextNumber(type);
      setCounterPreviews((prev) => ({ ...prev, [type]: updated }));
    } catch {
      showError('Counter generation failed.');
    }
  };

  // Guard: Owner only screen
  if (role !== 'owner') {
    return (
      <div className="py-12">
        <Card className="max-w-md mx-auto text-center p-8 border-rose-200">
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-200">
            <Building2 className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Owner Access Required</h2>
          <p className="text-xs text-slate-500 mb-4">
            The Company Profile and Print Setup module is reserved strictly for the CRM Owner.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Profile & Print Setup"
        subtitle="Manage official agency identity, letterhead, document numbering prefixes, and print templates."
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Company Profile' },
        ]}
        badge={
          <Badge variant="gold" size="md">
            Owner Only
          </Badge>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={loadData}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={saving}
              leftIcon={<Save className="w-3.5 h-3.5" />}
              onClick={handleSave}
            >
              Save Company Settings
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Settings Form Sections (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            
            {/* 1. COMPANY IDENTITY */}
            <Card padding="lg">
              <CardHeader
                title="1. Company Identity & Branding"
                subtitle="Official trading name, legal registration, and logo for all print headers"
              />

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Trading Company Name"
                    value={formData.companyName}
                    onChange={(e) => handleInputChange('companyName', e.target.value)}
                    placeholder="e.g. SafarDesk Travel & Tours"
                    required
                  />
                  <Input
                    label="Legal Registered Name"
                    value={formData.legalName}
                    onChange={(e) => handleInputChange('legalName', e.target.value)}
                    placeholder="e.g. SafarDesk Global Pvt. Ltd."
                  />
                </div>

                <Input
                  label="Tax / VAT Registration No."
                  value={formData.taxRegNo}
                  onChange={(e) => handleInputChange('taxRegNo', e.target.value)}
                  placeholder="e.g. VAT-300189201940003 or NTN-1829012-4"
                  helperText="Printed prominently on invoices and official statements"
                />

                {/* Logo Upload Box */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 tracking-wide block mb-1.5">
                    Official Agency Logo (Printed on Letterhead & Vouchers)
                  </label>
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                    {formData.logoUrl ? (
                      <div className="relative w-24 h-24 rounded-lg border border-slate-200 bg-white p-2 flex items-center justify-center shrink-0 shadow-xs">
                        <img
                          src={formData.logoUrl}
                          alt="Company Logo Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-lg border border-slate-200 bg-slate-100 flex flex-col items-center justify-center text-slate-400 shrink-0">
                        <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
                        <span className="text-[10px]">No Logo</span>
                      </div>
                    )}

                    <div className="space-y-1.5 flex-1 text-center sm:text-left">
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="hidden"
                          />
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e2c4c] text-white text-xs font-semibold hover:bg-[#163b63] transition shadow-xs">
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>{uploadingLogo ? 'Uploading...' : 'Upload Logo'}</span>
                          </span>
                        </label>
                        {formData.logoUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleInputChange('logoUrl', '')}
                            className="text-xs text-rose-600 hover:text-rose-700"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Supported formats: PNG, JPG, WebP, SVG. Recommended height: 80px transparent background.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Company Stamp Upload Box */}
                <div className="mt-4">
                  <label className="text-xs font-semibold text-slate-700 tracking-wide block mb-1.5">
                    Company Stamp / Seal (Printed on Vouchers)
                  </label>
                  <div className="flex flex-col sm:flex-row items-center gap-4 p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                    {formData.stampUrl ? (
                      <div className="relative w-24 h-24 rounded-full border border-slate-200 bg-white p-2 flex items-center justify-center shrink-0 shadow-xs overflow-hidden">
                        <img
                          src={formData.stampUrl}
                          alt="Company Stamp Preview"
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-24 h-24 rounded-full border border-slate-200 bg-slate-100 flex flex-col items-center justify-center text-slate-400 shrink-0">
                        <ImageIcon className="w-8 h-8 opacity-40 mb-1" />
                        <span className="text-[10px]">No Stamp</span>
                      </div>
                    )}

                    <div className="space-y-1.5 flex-1 text-center sm:text-left">
                      <div className="flex items-center gap-2 justify-center sm:justify-start">
                        <label className="cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleStampUpload}
                            className="hidden"
                          />
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0e2c4c] text-white text-xs font-semibold hover:bg-[#163b63] transition shadow-xs">
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span>{uploadingLogo ? 'Uploading...' : 'Upload Stamp'}</span>
                          </span>
                        </label>
                        {formData.stampUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleInputChange('stampUrl', '')}
                            className="text-xs text-rose-600 hover:text-rose-700"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Aap ki office ki gol muhar — voucher par signature wali jagah lagegi. PNG/JPG, 2MB tak.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* 2. CONTACT & LOCATION */}
            <Card padding="lg">
              <CardHeader
                title="2. Contact & Headquarters"
                subtitle="Official office address and inquiry hotlines displayed on statement headers"
              />

              <div className="space-y-4">
                <Input
                  label="Office Physical Address"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="e.g. Suite 402, Al-Mansoor Executive Towers, Ibrahim Al-Khalil Road"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="City"
                    value={formData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    placeholder="e.g. Makkah Mukarramah / Karachi"
                  />
                  <Input
                    label="Country"
                    value={formData.country}
                    onChange={(e) => handleInputChange('country', e.target.value)}
                    placeholder="e.g. Kingdom of Saudi Arabia / Pakistan"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Official Phone / Desk"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="e.g. +966 12 558 7890"
                  />
                  <Input
                    label="Mobile / WhatsApp Hotline"
                    value={formData.mobile}
                    onChange={(e) => handleInputChange('mobile', e.target.value)}
                    placeholder="e.g. +966 50 123 4567"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Official Operations Email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="e.g. operations@safardesk.com"
                  />
                  <Input
                    label="Website URL"
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    placeholder="e.g. https://safardesk.com"
                  />
                </div>
              </div>
            </Card>

            {/* 3. DOCUMENT NUMBERING (PREFIXES) */}
            <Card padding="lg">
              <CardHeader
                title="3. Document Numbering Prefixes"
                subtitle="Atomically incremented via nextNumber(type) transactions in settings/counters"
              />

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Input
                      label="Voucher Prefix"
                      value={formData.voucherPrefix}
                      onChange={(e) => handleInputChange('voucherPrefix', e.target.value)}
                      placeholder="e.g. UV-"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Preview: <strong className="font-mono text-slate-800">{counterPreviews.voucher}</strong></span>
                      <button
                        type="button"
                        onClick={() => handleTestNextNumber('voucher')}
                        className="text-[#0e2c4c] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Test Increment
                      </button>
                    </div>
                  </div>

                  <div>
                    <Input
                      label="Invoice Prefix"
                      value={formData.invoicePrefix}
                      onChange={(e) => handleInputChange('invoicePrefix', e.target.value)}
                      placeholder="e.g. INV-"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Preview: <strong className="font-mono text-slate-800">{counterPreviews.invoice}</strong></span>
                      <button
                        type="button"
                        onClick={() => handleTestNextNumber('invoice')}
                        className="text-[#0e2c4c] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Test Increment
                      </button>
                    </div>
                  </div>

                  <div>
                    <Input
                      label="Payment / Receipt Prefix"
                      value={formData.paymentPrefix}
                      onChange={(e) => handleInputChange('paymentPrefix', e.target.value)}
                      placeholder="e.g. PAY-"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Preview: <strong className="font-mono text-slate-800">{counterPreviews.payment}</strong></span>
                      <button
                        type="button"
                        onClick={() => handleTestNextNumber('payment')}
                        className="text-[#0e2c4c] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Test Increment
                      </button>
                    </div>
                  </div>

                  <div>
                    <Input
                      label="Journal Voucher Prefix"
                      value={formData.jvPrefix}
                      onChange={(e) => handleInputChange('jvPrefix', e.target.value)}
                      placeholder="e.g. JV-"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Preview: <strong className="font-mono text-slate-800">{counterPreviews.jv}</strong></span>
                      <button
                        type="button"
                        onClick={() => handleTestNextNumber('jv')}
                        className="text-[#0e2c4c] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3" /> Test Increment
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            {/* 4. OPERATIONAL DEFAULTS & STATEMENT FOOTER NOTE */}
            <Card padding="lg">
              <CardHeader
                title="4. Operational Defaults & Audit Policy"
                subtitle="Base accounting currency, foreign exchange benchmark, and backdating thresholds"
              />

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Input
                      label="Base Accounting Currency"
                      value="PKR"
                      disabled
                      helperText="Strictly fixed to PKR"
                    />
                  </div>

                  <div>
                    <Input
                      label="Default Foreign Currency"
                      value={formData.defaultForeignCurrency}
                      onChange={(e) => handleInputChange('defaultForeignCurrency', e.target.value)}
                      placeholder="SAR"
                      helperText="Primary Umrah / KSA currency"
                    />
                  </div>

                  <div>
                    <Input
                      label="Agent Backdating Limit (Hours)"
                      type="number"
                      min={0}
                      max={72}
                      value={formData.agentBackdateHours}
                      onChange={(e) => handleInputChange('agentBackdateHours', Number(e.target.value))}
                      placeholder="12"
                      helperText="Default 12 hours (editable)"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 tracking-wide block mb-1.5">
                    Official Statement & Voucher Footer Note
                  </label>
                  <textarea
                    rows={3}
                    value={formData.statementFooterNote}
                    onChange={(e) => handleInputChange('statementFooterNote', e.target.value)}
                    placeholder="Enter legal disclaimer, bank wire instructions, or discrepancy notification period..."
                    className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0e2c4c]/20 focus:border-[#0e2c4c] leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Printed at the bottom of all generated customer invoices, agent statements, and hotel vouchers.
                  </p>
                </div>
              </div>
            </Card>
          </form>
        </div>

        {/* RIGHT COLUMN: Live Print Preview & System Information (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* LIVE PRINT PREVIEW PANEL */}
          <Card padding="none" className="overflow-hidden border-[#0e2c4c]/20 shadow-md">
            {/* Header Switcher */}
            <div className="px-5 py-3.5 bg-[#0e2c4c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-gold-400" />
                <span className="text-xs font-bold uppercase tracking-wider">Live Document Print Preview</span>
              </div>
              
              <div className="flex items-center rounded-md bg-white/10 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPreviewDocType('voucher')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer font-medium ${
                    previewDocType === 'voucher' ? 'bg-[#c9a227] text-white font-bold' : 'text-slate-200'
                  }`}
                >
                  Voucher
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDocType('statement')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer font-medium ${
                    previewDocType === 'statement' ? 'bg-[#c9a227] text-white font-bold' : 'text-slate-200'
                  }`}
                >
                  Statement
                </button>
              </div>
            </div>

            {/* Document Paper Container */}
            <div className="p-6 bg-white min-h-[480px] flex flex-col justify-between text-slate-900 text-xs shadow-inner">
              
              {/* Paper Letterhead Header */}
              <div>
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4 mb-4">
                  <div className="space-y-1 max-w-[65%]">
                    <h2 className="text-base font-extrabold text-[#0e2c4c] tracking-tight uppercase">
                      {formData.companyName || 'SAFARDESK TRAVEL & TOURS'}
                    </h2>
                    {formData.legalName && (
                      <p className="text-[10px] text-slate-500 font-medium">
                        {formData.legalName}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-600 leading-tight">
                      {formData.address || 'Al-Mansoor District, Makkah Mukarramah, KSA'}
                    </p>
                    <p className="text-[10px] text-slate-600">
                      {[formData.city, formData.country].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-[10px] font-mono text-slate-700">
                      Phone: {formData.phone || '+966 12 558 7890'} | Email: {formData.email || 'operations@safardesk.com'}
                    </p>
                    {formData.taxRegNo && (
                      <p className="text-[10px] font-mono font-semibold text-[#0e2c4c]">
                        Tax / VAT Reg: {formData.taxRegNo}
                      </p>
                    )}
                  </div>

                  {/* Logo or fallback emblem */}
                  <div className="text-right shrink-0">
                    {formData.logoUrl ? (
                      <img
                        src={formData.logoUrl}
                        alt="Logo"
                        className="h-14 max-w-[130px] object-contain ml-auto"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-[#0e2c4c] text-gold-400 font-extrabold text-lg flex items-center justify-center shadow-xs ml-auto border border-gold-400/30">
                        {formData.companyName.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span className="text-[9px] font-mono text-slate-400 block mt-1">OFFICIAL DOCUMENT</span>
                  </div>
                </div>

                {/* Document Banner */}
                <div className="bg-slate-100 p-2.5 rounded border border-slate-200 flex items-center justify-between mb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Document Type</span>
                    <span className="text-xs font-bold text-[#0e2c4c] uppercase">
                      {previewDocType === 'voucher' ? 'Umrah Hotel & Transfer Voucher' : 'Sub-Agent Statement of Account'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-slate-500 block">Number</span>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      {previewDocType === 'voucher' ? counterPreviews.voucher : counterPreviews.invoice}
                    </span>
                  </div>
                </div>

                {/* Sample Body Rows */}
                <div className="space-y-2 border border-slate-100 rounded p-3 bg-slate-50/50">
                  <div className="flex justify-between text-[11px] pb-1 border-b border-slate-200">
                    <span className="text-slate-500">Date Issued:</span>
                    <span className="font-mono font-medium">{formatDate(new Date())}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pb-1 border-b border-slate-200">
                    <span className="text-slate-500">Party / Guest Lead:</span>
                    <span className="font-semibold">Al-Barakah Travel & Tours (Group 18 Pax)</span>
                  </div>
                  <div className="flex justify-between text-[11px] pb-1 border-b border-slate-200">
                    <span className="text-slate-500">Primary / Foreign Currency:</span>
                    <span className="font-mono font-semibold">{formData.baseCurrency} / {formData.defaultForeignCurrency}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Backdating Authorization:</span>
                    <span className="font-mono text-emerald-700">Within {formData.agentBackdateHours} Hours limit</span>
                  </div>
                </div>
              </div>

              {/* Statement Footer Note */}
              <div className="mt-6 pt-3 border-t border-slate-200 text-[10px] text-slate-500 leading-relaxed italic">
                {formData.statementFooterNote ||
                  'Official computer generated statement. All transactions are subject to airline audit and hotel terms.'}
              </div>
            </div>
          </Card>

          {/* 4. SYSTEM SECTION (READ-ONLY FOR DEPLOYMENT AUDIT) */}
          <Card padding="md" className="border-slate-200">
            <CardHeader
              title="System & Deployment Audit"
              subtitle="Confirms active client configuration during multi-tenant deployments"
            />

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Deployed Tenant:</span>
                <span className="font-bold text-slate-900">{TENANT.companyName}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Firebase Project ID:</span>
                <span className="font-mono text-slate-800">{firebaseConfig.projectId}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Database Document:</span>
                <span className="font-mono text-slate-800">settings/company</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">Sequence Counters Doc:</span>
                <span className="font-mono text-slate-800">settings/counters</span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-slate-600 font-medium">SafarDesk Version:</span>
                <Badge variant="navy">v1.0.0-Phase0</Badge>
              </div>

              <div className="p-3 bg-navy-50/70 border border-navy-100 rounded-lg text-[11px] text-slate-600 flex items-start gap-2">
                <Server className="w-4 h-4 text-[#0e2c4c] shrink-0 mt-0.5" />
                <p>
                  To change client tenants on fresh deployment, modify <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">src/config.ts</code>. The app will sync automatically with the corresponding Firebase backend.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
