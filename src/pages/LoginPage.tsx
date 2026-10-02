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
import { TENANT } from '../config';
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
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-navy-50/50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      
      {/* Brand Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#0e2c4c] text-[#c9a227] shadow-xl mb-4 border border-[#163b63]">
          <Compass className="w-10 h-10 stroke-[2.2]" />
        </div>
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          {TENANT.shortName}
        </h2>
        <p className="mt-1 text-sm font-medium text-slate-600">
          {TENANT.appTitle}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {TENANT.tagline}
        </p>
      </div>

      {/* Main Login Card */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <Card className="p-8 shadow-xl border-slate-200/90 relative overflow-hidden">
          
          {/* Top Brand Accent Stripe */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#0e2c4c] via-[#c9a227] to-[#0e2c4c]" />

          <div className="mb-6">
            <h3 className="text-lg font-bold text-slate-900">
              Sign In to Your Workspace
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Private agency CRM. Every staff and agent account is created by the Owner.
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
              placeholder="e.g. operations@safardesk.com"
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
                  className="rounded border-slate-300 text-[#0e2c4c] focus:ring-[#0e2c4c]"
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
                className="text-xs font-semibold text-[#0e2c4c] hover:underline cursor-pointer"
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
              Sign In to SafarDesk
            </Button>
          </form>

          {/* Quick Demo Access Bar */}
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
                  <span className="text-xs font-bold text-[#0e2c4c] group-hover:text-[#163b63]">Owner</span>
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
                  <span className="text-xs font-bold text-slate-800 group-hover:text-[#0e2c4c]">Staff</span>
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
                  <span className="text-xs font-bold text-slate-800 group-hover:text-[#0e2c4c]">Agent</span>
                  <Badge variant="success" size="sm">Portal</Badge>
                </div>
                <p className="text-[10px] text-slate-400 mt-1 truncate">B2B view</p>
              </button>
            </div>
          </div>
        </Card>

        {/* Notice: No public registration */}
        <div className="mt-6 text-center text-xs text-slate-500">
          <p className="text-slate-400">
            Internal Corporate System • Public registration is disabled
          </p>
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
              placeholder="e.g. staff@safardesk.com"
              required
              autoFocus
            />
          </form>
        )}
      </Modal>
    </div>
  );
};
