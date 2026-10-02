import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Compass, Loader2, ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { TENANT } from '../../config';
import { AppModule, PermissionAction } from '../../types/auth';
import { checkCan } from '../../hooks/useCan';
import { Button } from '../ui/Button';

interface ProtectedRouteProps {
  children?: React.ReactNode;
  requiredModule?: AppModule;
  requiredAction?: PermissionAction;
  ownerOnly?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children,
  requiredModule,
  requiredAction = 'view',
  ownerOnly = false,
}) => {
  const { user, userProfile, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-[#0e2c4c] flex items-center justify-center text-[#c9a227] shadow-lg mb-4 animate-pulse">
          <Compass className="w-8 h-8" />
        </div>
        <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-[#0e2c4c]" />
          <span>Authenticating with {TENANT.shortName}...</span>
        </div>
        <p className="text-xs text-slate-400 mt-1">Verifying credentials and security permissions</p>
      </div>
    );
  }

  // Unauthenticated user -> redirect to /login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Account Suspended check
  if (userProfile && !userProfile.isActive) {
    return <Navigate to="/login" replace />;
  }

  // Agent Role Constraint: Agents are strictly redirected to Agent Portal routes only
  if (role === 'agent') {
    if (!location.pathname.startsWith('/agent-portal')) {
      return <Navigate to="/agent-portal" replace />;
    }
    return children ? <>{children}</> : null;
  }

  // If user is Owner or Staff but visits /agent-portal, they can still view it, or redirect if needed

  // Owner Only Guard
  if (ownerOnly && role !== 'owner') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-rose-200 shadow-sm text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
            Owner Access Required
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            This module is reserved exclusively for the agency Owner. Your current account does not have executive privileges to configure users and global permissions.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to="/">
              <Button variant="primary" size="sm" leftIcon={<Home className="w-3.5 h-3.5" />}>
                Return to Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Module Permission Guard for Staff
  if (requiredModule && role === 'staff') {
    const hasPermission = checkCan(userProfile, requiredModule, requiredAction);

    if (!hasPermission) {
      return (
        <div className="min-h-[70vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-2">
              Access Restricted
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              Your staff account does not have <strong>{requiredAction.toUpperCase()}</strong> permission for the <strong>{requiredModule}</strong> module. Please request access from the agency Owner.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link to="/">
                <Button variant="outline" size="sm" leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  return children ? <>{children}</> : null;
};
