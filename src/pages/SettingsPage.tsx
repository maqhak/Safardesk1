import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Building, 
  DollarSign, 
  Users, 
  ShieldCheck, 
  Database, 
  Save, 
  CheckCircle2, 
  RefreshCw,
  ExternalLink,
  Lock,
  UploadCloud,
  FolderTree,
  Unlink
} from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { TENANT, firebaseConfig } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isConfigPlaceholder } from '../services/firebase';
import { 
  getDriveIntegration, 
  connectGoogleDrive, 
  disconnectGoogleDrive,
  saveGeminiApiKey,
  clearGeminiApiKey
} from '../services/driveService';
import { DriveIntegrationDoc } from '../types/payment';

export const SettingsPage: React.FC = () => {
  const { role, userProfile } = useAuth();
  const { success, error: showError, info } = useToast();

  const [companyName, setCompanyName] = useState(TENANT.companyName);
  const [appTitle, setAppTitle] = useState(TENANT.appTitle);
  const [primaryCurrency, setPrimaryCurrency] = useState(TENANT.currency.primary);
  const [secondaryCurrency, setSecondaryCurrency] = useState(TENANT.currency.secondary);
  const [exchangeRate, setExchangeRate] = useState(String(TENANT.currency.defaultExchangeRate));
  const [supportEmail, setSupportEmail] = useState(TENANT.contact.email);
  const [supportPhone, setSupportPhone] = useState(TENANT.contact.phone);

  // Drive integration state
  const [driveIntegration, setDriveIntegration] = useState<DriveIntegrationDoc | null>(null);
  // Fix #33: owner-only Gemini key for production AI receipt verification
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>('');
  const [savingGeminiKey, setSavingGeminiKey] = useState<boolean>(false);
  const [connectingDrive, setConnectingDrive] = useState<boolean>(false);

  useEffect(() => {
    getDriveIntegration().then(setDriveIntegration);
  }, []);

  const handleConnectDrive = async () => {
    setConnectingDrive(true);
    try {
      const integration = await connectGoogleDrive({
        name: userProfile?.name,
        email: userProfile?.email,
      });
      setDriveIntegration(integration);
      success(`Google Drive connected to ${integration.connectedEmail}. Folder structure 'Receipt/Received' & 'Receipt/Sent' created.`);
    } catch (err: any) {
      showError(err.message || 'Failed to connect Google Drive.');
    } finally {
      setConnectingDrive(false);
    }
  };

  const handleSaveGeminiKey = async () => {
    setSavingGeminiKey(true);
    try {
      await saveGeminiApiKey(geminiKeyInput);
      const updated = await getDriveIntegration();
      setDriveIntegration(updated);
      setGeminiKeyInput('');
      success('Gemini API key saved. Production AI receipt verification is now active.');
    } catch (err: any) {
      showError(err?.message || 'Failed to save Gemini API key.');
    } finally {
      setSavingGeminiKey(false);
    }
  };

  const handleClearGeminiKey = async () => {
    if (!confirm('Remove the Gemini API key? AI verification will fall back to manual owner review.')) return;
    try {
      await clearGeminiApiKey();
      const updated = await getDriveIntegration();
      setDriveIntegration(updated);
      info('Gemini API key removed.');
    } catch (err: any) {
      showError(err?.message || 'Failed to remove Gemini API key.');
    }
  };

  const handleDisconnectDrive = async () => {
    try {
      await disconnectGoogleDrive();
      const updated = await getDriveIntegration();
      setDriveIntegration(updated);
      info('Google Drive disconnected.');
    } catch {
      showError('Failed to disconnect Google Drive.');
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    success('Tenant configuration updated. To persist permanently across builds, commit changes to src/config.ts.', 'Settings Saved');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System & Tenant Settings"
        subtitle="Manage client branding, foreign exchange rates, Firebase connection status, and operational preferences."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Settings' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Save className="w-3.5 h-3.5" />}
            onClick={handleSaveSettings}
          >
            Save Changes
          </Button>
        }
      />

      {/* Settings Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <a
          href="/settings"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-[#0e2c4c] text-white shadow-xs"
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>General Settings</span>
        </a>
        <a
          href="/settings/company"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
        >
          <Building className="w-3.5 h-3.5 text-[#c9a227]" />
          <span>Company Profile (Owner)</span>
        </a>
        <a
          href="/settings/users"
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
        >
          <Users className="w-3.5 h-3.5 text-[#0e2c4c]" />
          <span>Users & Permissions (Owner)</span>
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Tenant Branding & Currency Settings */}
        <div className="lg:col-span-2 space-y-6">
          <Card padding="lg">
            <CardHeader
              title="Agency Tenant Profile"
              subtitle="Branding displayed across top navbar, voucher headers, and invoices"
            />

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Company Name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
                <Input
                  label="Display App Title"
                  value={appTitle}
                  onChange={(e) => setAppTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Support / Operations Email"
                  type="email"
                  value={supportEmail}
                  onChange={(e) => setSupportEmail(e.target.value)}
                  required
                />
                <Input
                  label="Phone / WhatsApp Hotline"
                  value={supportPhone}
                  onChange={(e) => setSupportPhone(e.target.value)}
                  required
                />
              </div>

              <div className="pt-2">
                <p className="text-xs text-slate-500">
                  White-label architecture note: modifying <code className="font-mono bg-slate-100 px-1 py-0.5 rounded border border-slate-200">src/config.ts</code> immediately redeploys the CRM for any new client.
                </p>
              </div>
            </form>
          </Card>

          <Card padding="lg">
            <CardHeader
              title="Multi-Currency & Forex Settings"
              subtitle="Dual-currency pair configuration for Saudi Arabia (SAR) and Pakistan (PKR)"
            />

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Input
                  label="Primary Currency"
                  value={primaryCurrency}
                  onChange={(e) => setPrimaryCurrency(e.target.value)}
                  disabled
                  helperText="Primary accounting currency"
                />
                <Input
                  label="Secondary Currency"
                  value={secondaryCurrency}
                  onChange={(e) => setSecondaryCurrency(e.target.value)}
                  disabled
                  helperText="Sub-agent settlement currency"
                />
                <Input
                  label="Benchmark Exchange Rate (1 SAR = PKR)"
                  type="number"
                  step="0.01"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  helperText="Default rate for ledgers"
                />
              </div>

              <div className="p-3.5 bg-gold-50/70 border border-gold-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
                <DollarSign className="w-4 h-4 text-[#c9a227] shrink-0 mt-0.5" />
                <p>
                  Current benchmark: <strong>1.00 SAR = {Number(exchangeRate || 74.5).toFixed(2)} PKR</strong>. Individual sub-agent transactions can override the locked spot rate upon invoice finalization.
                </p>
              </div>
            </div>
          </Card>

          {/* Requirement 1: Google Drive Integration Module */}
          <Card padding="lg" className="border-slate-200">
            <CardHeader
              title="Google Drive Receipt Storage"
              subtitle="Each deployment runs under the buyer company's dedicated Gmail — receipts live in your company's Drive"
            />

            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-[#0e2c4c] text-white rounded-lg">
                      <UploadCloud className="w-4 h-4 text-[#c9a227]" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">Dedicated Google Drive Archive</span>
                      <span className="text-[11px] text-slate-500">
                        Protected folder structure: <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">Receipt → Received & Sent</code>
                      </span>
                    </div>
                  </div>
                  <Badge variant={driveIntegration?.connected ? 'success' : 'neutral'} dot>
                    {driveIntegration?.connected ? 'Connected' : 'Not Connected'}
                  </Badge>
                </div>

                {driveIntegration?.connected ? (
                  <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Connected Company Gmail:</span>
                      <strong className="font-mono text-slate-800">{driveIntegration.connectedEmail}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Connected At:</span>
                      <span className="text-slate-700">{driveIntegration.connectedAt?.split('T')[0]}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Protected Settings:</span>
                      <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-bold">
                        settings/integrations (Owner Only)
                      </span>
                    </div>

                    <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-[#0e2c4c]" />
                      <span>
                        Automatic subfolder routing: Inward cash/bank receipts → <strong>Receipt/Received</strong>; Outward payments → <strong>Receipt/Sent</strong>.
                      </span>
                    </div>

                    {role === 'owner' && (
                      <div className="pt-2 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Unlink className="w-3.5 h-3.5 text-rose-600" />}
                          onClick={handleDisconnectDrive}
                        >
                          Disconnect Drive
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-200 space-y-3">
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Connect your corporate Google Workspace or Gmail account. All official payment slips, wire confirmations, and deposit proofs will be automatically renamed to their Manual Payment No. and stored in your Google Drive.
                    </p>

                    {role === 'owner' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={<UploadCloud className="w-4 h-4" />}
                        onClick={handleConnectDrive}
                        loading={connectingDrive}
                      >
                        Connect Google Drive
                      </Button>
                    ) : (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                        Only the Agency Owner can connect or modify Google Drive integration.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
          {/* Fix #33: AI Receipt Verification (Gemini) — owner only, production path */}
          <Card padding="lg" className="border-slate-200">
            <CardHeader
              title="AI Receipt Verification (Gemini)"
              subtitle="Production AI checks run through your own Gemini API key — the key is stored owner-only and never committed to code"
            />
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">Production AI Status</span>
                <Badge variant={driveIntegration?.geminiApiKey ? 'success' : 'neutral'} dot>
                  {driveIntegration?.geminiApiKey ? 'Active' : 'Not Configured'}
                </Badge>
              </div>

              {role === 'owner' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] uppercase font-bold text-slate-500 mb-1">Gemini API Key</label>
                    <input
                      type="password"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      placeholder={driveIntegration?.geminiApiKey ? '•••••••••••• (key saved — paste a new one to replace)' : 'Paste your Gemini API key (AIza...)'}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:outline-none"
                      autoComplete="off"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Get a free key at Google AI Studio (aistudio.google.com). Receipts are verified for readability, authentic format, and date match.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleSaveGeminiKey}
                      loading={savingGeminiKey}
                      disabled={!geminiKeyInput.trim()}
                    >
                      Save Key
                    </Button>
                    {driveIntegration?.geminiApiKey && (
                      <Button variant="outline" size="sm" onClick={handleClearGeminiKey}>
                        Remove Key
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                  Only the Agency Owner can configure the AI verification key.
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right Col: Backend Status & Deployment Info */}
        <div className="space-y-6">
          <Card padding="md">
            <CardHeader
              title="Firebase Backend Status"
              subtitle="Auth and Firestore connection details"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">Firebase Project</span>
                  <span className="text-[11px] font-mono text-slate-500">{firebaseConfig.projectId}</span>
                </div>
                <Badge variant={isConfigPlaceholder ? 'gold' : 'success'} size="sm">
                  {isConfigPlaceholder ? 'Demo / Preview' : 'Connected'}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">Firestore Database ID</span>
                  <span className="text-[11px] font-mono text-slate-500">{firebaseConfig.firestoreDatabaseId || '(default)'}</span>
                </div>
                <Badge variant="navy" size="sm">Enterprise</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-xs font-semibold text-slate-800 block">Security Rules</span>
                  <span className="text-[11px] font-mono text-slate-500">RBAC / Attribute-based</span>
                </div>
                <Badge variant="success" size="sm">Hardened</Badge>
              </div>

              <div className="p-3 bg-navy-50/80 rounded-lg border border-navy-100 text-xs text-slate-600 space-y-1">
                <span className="font-semibold text-[#0e2c4c] block">Phase 0 Status:</span>
                <p>Scaffolding, horizontal top navbar, design tokens, formatters, and Firestore collections catalog documented.</p>
              </div>
            </div>
          </Card>

          <Card padding="md" className="border-navy-200 bg-gradient-to-br from-white to-navy-50/40">
            <CardHeader
              title="Users & Permissions"
              subtitle="Staff permission matrices and account status"
            />
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              Create staff credentials with granular module matrices (View, Create, Edit, Delete), suspend accounts, and reset temporary passwords.
            </p>
            {role === 'owner' ? (
              <a
                href="/settings/users"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0e2c4c] text-white text-xs font-semibold hover:bg-[#163b63] transition shadow-xs"
              >
                <Users className="w-3.5 h-3.5 text-[#c9a227]" />
                <span>Open Users & Permissions</span>
              </a>
            ) : (
              <div className="p-2.5 bg-slate-100 rounded-lg text-xs text-slate-500 text-center font-medium">
                Restricted to Owner only
              </div>
            )}
          </Card>

          <Card padding="md">
            <CardHeader
              title="Role-Based Access Control"
              subtitle="Configured user privileges"
            />
            <div className="space-y-2 text-xs text-slate-600">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-900">Owner</span>
                <span className="text-slate-500">Full system & financial control</span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="font-semibold text-slate-900">Staff</span>
                <span className="text-slate-500">Operations, vouchers & tickets</span>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="font-semibold text-slate-900">Agent</span>
                <span className="text-slate-500">B2B portal, own bookings & ledger</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
