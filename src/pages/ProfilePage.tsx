import React from 'react';
import { User, ShieldCheck, Mail, Phone, Building, Calendar, Key, CheckCircle } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { formatDate } from '../utils/formatters';

export const ProfilePage: React.FC = () => {
  const { userProfile, role, isDemoMode } = useAuth();
  const { success, info } = useToast();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="User Profile & Account"
        subtitle="Manage your personal details, operational privileges, and security settings."
        breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Profile' }]}
        badge={
          <Badge variant="navy" size="md">
            Role: {role?.toUpperCase() || 'STAFF'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card padding="lg" className="md:col-span-1 text-center flex flex-col items-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#0e2c4c] to-[#c9a227] text-white flex items-center justify-center font-bold text-2xl shadow-md border-2 border-white mb-3">
            {userProfile?.name
              ? userProfile.name
                  .split(' ')
                  .map((n: string) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()
              : 'SD'}
          </div>

          <h3 className="text-lg font-bold text-slate-900 tracking-tight">
            {userProfile?.name || 'SafarDesk User'}
          </h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            {userProfile?.email || 'user@safardesk.com'}
          </p>

          <div className="mt-3">
            <Badge variant={role === 'owner' ? 'gold' : role === 'agent' ? 'success' : 'navy'}>
              {role?.toUpperCase()}
            </Badge>
          </div>

          {isDemoMode && (
            <div className="mt-4 p-2.5 rounded-lg bg-gold-50 border border-gold-200 text-xs text-amber-900 w-full text-left">
              <span className="font-semibold block mb-0.5">Demo Active Session</span>
              <span>Switch roles anytime via the top right avatar menu.</span>
            </div>
          )}
        </Card>

        {/* Details Card */}
        <Card padding="lg" className="md:col-span-2 space-y-5">
          <CardHeader
            title="Account Information"
            subtitle="Details associated with your Firestore users record"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block mb-0.5 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Full Name
              </span>
              <span className="text-sm font-semibold text-slate-800">
                {userProfile?.name || '—'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block mb-0.5 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5" /> Email Address
              </span>
              <span className="text-sm font-semibold text-slate-800 font-mono">
                {userProfile?.email || '—'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block mb-0.5 flex items-center gap-1">
                <Building className="w-3.5 h-3.5" /> Assigned Agency Desk
              </span>
              <span className="text-sm font-semibold text-slate-800">
                {userProfile?.agencyName || 'Head Office Operations'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block mb-0.5 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Direct Contact
              </span>
              <span className="text-sm font-semibold text-slate-800 font-mono">
                {userProfile?.phone || '+966 50 000 0000'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block mb-0.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Access Role
              </span>
              <span className="text-sm font-semibold text-slate-800 capitalize">
                {role || 'staff'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <span className="text-slate-400 block mb-0.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Account Created
              </span>
              <span className="text-sm font-semibold text-slate-800 font-mono">
                {formatDate(userProfile?.createdAt || '2026-01-01')}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Security Credentials</span>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Key className="w-3.5 h-3.5" />}
              onClick={() => info('Use the Change Password option in the top avatar menu.')}
            >
              Update Password
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};
