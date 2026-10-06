import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Compass, 
  Lock, 
  Mail, 
  ArrowRight, 
  ShieldCheck, 
  Sparkles, 
  CheckCircle2, 
  UserCheck, 
  Info,
  Building,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { TENANT, DEMO_MODE } from '../config';
import { fetchCompanyProfile } from '../services/companyService';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { UserRole } from '../types/auth';

export const LoginPage: React.FC = () => {
  const { user, userProfile, role, signInWithEmail, demoSignIn, sendPasswordReset, loading } = useAuth();
  const { success, error: showError, info } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>('');
  const { theme } = useTheme();

  useEffect(() => {
    fetchCompanyProfile().then((p) => {
      if (p.logoUrl) setCompanyLogoUrl(p.logoUrl);
    }).catch(() => {});
  }, []);

  // Forgot Password modal state
  const [forgotModalOpen, setForgotModalOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Return to intended page or dashboard/portal
  const destination = (location.state as any)?.from?.pathname || (role === 'agent' ? '/agent-portal' : '/');

  useEffect(() => {
    if (user && !loading) {
      if (role === 'agent') {
        navigate('/agent-portal', { replace: true });
      } else {
        navigate(destination, { replace: true });
      }
    }
  }, [user, role, loading, navigate, destination]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      success(`Welcome back to ${TENANT.shortName}!`, 'Authenticated');
    } catch (err: any) {
      const msg = err?.message || 'Authentication failed. Please verify your credentials.';
      setErrorMessage(msg);
      showError(msg, 'Login Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (targetRole: UserRole) => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await demoSignIn(targetRole);
      success(
        `Signed in as ${targetRole.toUpperCase()} (${
          targetRole === 'owner' ? 'Director' : targetRole === 'staff' ? 'Operations' : 'Sub-Agent'
        })`,
        'Session Initialized'
      );
    } catch {
      showError('Could not initialize demo session.', 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      showError('Please enter your email address.');
      return;
    }

    setResetSubmitting(true);
    try {
      await sendPasswordReset(resetEmail.trim());
      setResetSent(true);
      success('Password reset instructions sent to your email address.', 'Reset Email Dispatched');
    } catch (err: any) {
      showError(err?.message || 'Failed to dispatch reset email.');
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Full background image */}
      <img
        src="/images/umrah-login-bg.jpg"
        alt="Kaaba in Makkah"
        className="absolute inset-0 w-full h-full object-cover"
      />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(135deg, rgba(14,44,76,0.75) 0%, rgba(14,44,76,0.45) 50%, rgba(201,162,39,0.25) 100%)' }}
      />

      {/* Left side — branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 overflow-hidden">
        <div className="relative z-10 flex flex-col justify-end p-12 text-white animate-[fadeIn_1s_ease-out]">
          <div className="mb-6">
            {companyLogoUrl ? (
              <img
                src={companyLogoUrl}
                alt={TENANT.companyName}
                className="w-20 h-20 rounded-2xl object-contain bg-white/95 p-2 shadow-2xl mb-4"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center mb-4">
                <Compass className="w-12 h-12 text-white" />
              </div>
            )}
            <h1 className="text-4xl font-extrabold tracking-tight mb-2">
              {TENANT.companyName}
            </h1>
            <p className="text-lg text-white/90 font-medium">
              {TENANT.tagline}
            </p>
          </div>
          <div className="border-t border-white/20 pt-6">
            <p className="text-sm text-white/80 italic">
              Serving the guests of the Haramain with excellence
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="lg:hidden sm:mx-auto sm:w-full sm:max-w-md text-center mb-8 animate-[fadeIn_0.8s_ease-out]">
          {companyLogoUrl ? (
            <img
              src={companyLogoUrl}
              alt={TENANT.companyName}
              className="inline-block w-16 h-16 rounded-2xl object-contain bg-white p-2 shadow-xl mb-4 border border-slate-200"
            />
          ) : (
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-white shadow-xl mb-4"
              style={{ background: 'var(--theme-gradient)' }}
            >
              <Compass className="w-10 h-10" />
            </div>
          )}
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {TENANT.companyName}
          </h2>
          {!theme.hidePoweredBy && (
            <p className="mt-1 text-sm font-medium text-slate-600">
              Powered by SafarDesk
            </p>
          )}
        </div>

        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <Card className="p-8 shadow-2xl border-white/40 relative overflow-hidden bg-white/75 backdrop-blur-xl animate-[slideUp_0.6s_ease-out]">
            <div
              className="absolute top-0 left-0 right-0 h-1.5"
              style={{ background: 'var(--theme-gradient)' }}
            />
            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900">
                Welcome Back
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                Sign in to {TENANT.companyName}
              </p>
            </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Work Email Address"
              type="email"
              placeholder="e.g. operations@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              leftIcon={<Mail className="w-4 h-4 text-slate-400" />}
            />

            <div>
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                leftIcon={<Lock className="w-4 h-4 text-slate-400" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="hover:text-slate-700 cursor-pointer"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  defaultChecked
                  className="rounded border-slate-300 text-[var(--theme-primary)] focus:ring-[#0e2c4c]"
                />
                <span>Remember terminal</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setResetSent(false);
                  setForgotModalOpen(true);
                }}
                className="text-xs font-semibold text-[var(--theme-primary)] hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              className="w-full mt-2"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Sign In to {TENANT.companyName}
            </Button>
          </form>

          {/* Quick Demo Access Bar — Fix #31: only rendered when VITE_DEMO_MODE=true */}
          {DEMO_MODE && (
          <div className="mt-8 pt-6 border-t border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#c9a227]" />
                <span>1-Click Role Preview</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Test Accounts</span>
            </div>
            
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              Test owner controls, staff permission gating, or agent portal:
            </p>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleDemoLogin('owner')}
                disabled={submitting}
                className="p-2.5 rounded-lg border border-slate-200 hover:border-[#0e2c4c] hover:bg-navy-50/50 text-left transition group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--theme-primary)] group-hover:text-[#163b63]">Owner</span>
                  <Badge variant="gold" size="sm">All</Badge>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 truncate">Unrestricted</p>
              </button>

              <button
                type="button"
                onClick={() => handleDemoLogin('staff')}
                disabled={submitting}
                className="p-2.5 rounded-lg border border-slate-200 hover:border-[#0e2c4c] hover:bg-navy-50/50 text-left transition group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 group-hover:text-[var(--theme-primary)]">Staff</span>
                  <Badge variant="navy" size="sm">Matrix</Badge>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 truncate">Gated access</p>
              </button>

              <button
                type="button"
                onClick={() => handleDemoLogin('agent')}
                disabled={submitting}
                className="p-2.5 rounded-lg border border-slate-200 hover:border-[#0e2c4c] hover:bg-navy-50/50 text-left transition group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 group-hover:text-[var(--theme-primary)]">Agent</span>
                  <Badge variant="success" size="sm">Portal</Badge>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 truncate">B2B view</p>
              </button>
            </div>
          </div>
          )}
        </Card>

        {/* Notice: No public registration */}
        <div className="mt-6 text-center text-xs text-slate-500">
          <p className="text-slate-400">
            Internal Corporate System • Public registration is disabled
          </p>
        </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={forgotModalOpen}
        onClose={() => setForgotModalOpen(false)}
        title="Reset Password"
        subtitle="We will send a password reset link to your registered email"
        size="sm"
        footer={
          resetSent ? (
            <Button variant="primary" size="sm" onClick={() => setForgotModalOpen(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setForgotModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={resetSubmitting}
                onClick={handleForgotPassword}
              >
                Send Reset Link
              </Button>
            </>
          )
        }
      >
        {resetSent ? (
          <div className="text-center py-4 space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900">Email Dispatched</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              If an account exists for <strong>{resetEmail}</strong>, instructions to set a new password have been sent to your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Enter your work email address associated with your SafarDesk profile:
            </p>
            <Input
              label="Work Email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="e.g. staff@company.com"
              required
              autoFocus
            />
          </form>
        )}
      </Modal>
    </div>
  );
};
