import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { 
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, isConfigPlaceholder } from '../services/firebase';
import { UserRole, UserProfile, AuthContextType, UserDoc } from '../types/auth';
import { logAuditEvent, fetchAllUsers } from '../services/userService';
import { createDefaultPermissions } from '../utils/permissions';
import { useToast } from './ToastContext';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const INACTIVITY_WARNING_MS = 28 * 60 * 1000; // 28 minutes warning

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const { warning, info, error: showToastError } = useToast();

  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);

  // Read or create Firestore users/{uid} document with strict field compliance
  const fetchUserProfile = async (firebaseUser: FirebaseUser): Promise<UserProfile> => {
    try {
      const userRef = doc(db, 'users', firebaseUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as UserDoc;
        
        // Enforce Account Suspended check
        if (data.isActive === false) {
          throw new Error('ACCOUNT_SUSPENDED');
        }

        // Update last login timestamp in Firestore
        try {
          await updateDoc(userRef, { lastLoginAt: new Date().toISOString() });
        } catch {
          // ignore
        }

        setUserProfile(data);
        setRole(data.role);
        return data;
      } else {
        // Bootstrap Rule: The very first user created in Firestore becomes the Owner
        const allExistingUsers = await fetchAllUsers();
        const hasExistingOwner = allExistingUsers.some((u) => u.role === 'owner');

        const assignedRole: UserRole = hasExistingOwner ? 'staff' : 'owner';

        const newProfile: UserDoc = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Administrator',
          email: firebaseUser.email || '',
          role: assignedRole,
          isActive: true,
          permissions: assignedRole === 'staff' ? createDefaultPermissions('Semi Admin') : undefined,
          createdAt: new Date().toISOString(),
          createdBy: hasExistingOwner ? 'system_registered' : 'system_bootstrap',
          lastLoginAt: new Date().toISOString(),
        };

        try {
          await setDoc(userRef, newProfile);
        } catch (setErr) {
          console.warn('Could not write new user doc to Firestore:', setErr);
        }

        setUserProfile(newProfile);
        setRole(newProfile.role);
        return newProfile;
      }
    } catch (err: any) {
      if (err?.message === 'ACCOUNT_SUSPENDED') {
        throw err;
      }
      console.warn('Error reading user profile from Firestore:', err);

      // Check local cached users directory
      const localUsers = await fetchAllUsers();
      const matched = localUsers.find((u) => u.email.toLowerCase() === firebaseUser.email?.toLowerCase());
      if (matched) {
        if (!matched.isActive) {
          throw new Error('ACCOUNT_SUSPENDED');
        }
        setUserProfile(matched);
        setRole(matched.role);
        return matched;
      }

      // Default fallback
      const fallbackProfile: UserDoc = {
        uid: firebaseUser.uid,
        name: firebaseUser.displayName || 'SafarDesk Staff',
        email: firebaseUser.email || 'staff@safardesk.com',
        role: 'staff',
        isActive: true,
        permissions: createDefaultPermissions('Semi Admin'),
        createdAt: new Date().toISOString(),
        createdBy: 'system_bootstrap',
      };
      setUserProfile(fallbackProfile);
      setRole(fallbackProfile.role);
      return fallbackProfile;
    }
  };

  // Sign out user with optional reason
  const signOutUser = useCallback(async (reason?: string): Promise<void> => {
    localStorage.removeItem('safardesk_demo_role');
    setIsDemoMode(false);

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    try {
      await firebaseSignOut(auth);
    } catch {
      // ignore
    }

    setUser(null);
    setUserProfile(null);
    setRole(null);
    setLoading(false);

    if (reason) {
      warning(reason, 'Session Expired');
    }
  }, [warning]);

  // Reset inactivity timer on any user action
  const resetInactivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Warning timer at 28 mins
    warningTimerRef.current = setTimeout(() => {
      if (user && !warningShownRef.current) {
        warningShownRef.current = true;
        warning(
          'Your session will expire in 2 minutes due to inactivity. Move your mouse or click anywhere to stay signed in.',
          'Inactivity Warning'
        );
      }
    }, INACTIVITY_WARNING_MS);

    // Auto logout timer at 30 mins
    inactivityTimerRef.current = setTimeout(() => {
      if (user) {
        signOutUser('Your session has expired after 30 minutes of inactivity. Please sign in again.');
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [user, warning, signOutUser]);

  // Attach event listeners for inactivity tracking when signed in
  useEffect(() => {
    if (!user) return;

    resetInactivityTimer();

    const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    
    // Throttle activity handling
    let lastHandled = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastHandled > 3000) { // check every 3s
        lastHandled = now;
        resetInactivityTimer();
      }
    };

    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [user, resetInactivityTimer]);

  // Auth state listener
  useEffect(() => {
    const savedDemoRole = localStorage.getItem('safardesk_demo_role') as UserRole | null;
    
    // Check if there was an active demo session
    if (savedDemoRole) {
      fetchAllUsers().then((users) => {
        const found = users.find((u) => u.role === savedDemoRole && u.isActive) || users[0];
        if (found) {
          setUserProfile(found);
          setRole(found.role);
          setIsDemoMode(true);
          setUser({
            uid: found.uid,
            email: found.email,
            displayName: found.name,
            emailVerified: true,
          } as FirebaseUser);
        }
        setLoading(false);
      });
      return;
    }

    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          try {
            const profile = await fetchUserProfile(currentUser);
            setUser(currentUser);
            setIsDemoMode(false);
          } catch (err: any) {
            if (err?.message === 'ACCOUNT_SUSPENDED') {
              await firebaseSignOut(auth);
              setUser(null);
              setUserProfile(null);
              setRole(null);
              showToastError(
                'Your account has been suspended by the administrator. Please contact your manager or agency owner.',
                'Access Denied'
              );
            }
          }
        } else {
          setUser(null);
          setUserProfile(null);
          setRole(null);
        }
        setLoading(false);
      });
    } catch {
      setLoading(false);
    }

    return () => unsubscribe();
  }, [showToastError]);

  // Sign In with email and password
  const signInWithEmail = async (email: string, password: string): Promise<void> => {
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      // Check demo / local directory
      if (isConfigPlaceholder) {
        const users = await fetchAllUsers();
        const matched = users.find((u) => u.email.toLowerCase() === normalizedEmail);

        if (matched) {
          if (!matched.isActive) {
            throw new Error('Your account has been suspended by the administrator. Please contact your manager or agency owner.');
          }

          setUserProfile(matched);
          setRole(matched.role);
          setIsDemoMode(true);
          setUser({
            uid: matched.uid,
            email: matched.email,
            displayName: matched.name,
            emailVerified: true,
          } as FirebaseUser);
          localStorage.setItem('safardesk_demo_role', matched.role);

          // Audit log the login
          await logAuditEvent({
            action: 'USER_LOGIN',
            userId: matched.uid,
            userName: matched.name,
            userEmail: matched.email,
            userRole: matched.role,
            details: { mode: 'preview_demo', status: 'SUCCESS' },
          });

          setLoading(false);
          return;
        }
      }

      // Real Firebase Auth
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      
      // Fetch Firestore profile and verify isActive
      const profile = await fetchUserProfile(userCredential.user);
      if (!profile.isActive) {
        await firebaseSignOut(auth);
        throw new Error('Your account has been suspended by the administrator. Please contact your manager or agency owner.');
      }

      setUser(userCredential.user);
      setIsDemoMode(false);
      localStorage.removeItem('safardesk_demo_role');

      // Audit log the login
      await logAuditEvent({
        action: 'USER_LOGIN',
        userId: profile.uid,
        userName: profile.name,
        userEmail: profile.email,
        userRole: profile.role,
        details: { mode: 'live_auth', status: 'SUCCESS' },
      });

    } catch (error: any) {
      console.error('Sign in failed:', error);
      if (error?.message?.includes('suspended')) {
        throw error;
      }
      if (error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-credential') {
        throw new Error('Invalid email or password. Please verify your credentials or contact the Owner.');
      }
      if (error?.code === 'auth/too-many-requests') {
        throw new Error('Access temporarily disabled due to many failed login attempts. Please reset your password or try again later.');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Demo sign in preset
  const demoSignIn = async (targetRole: UserRole = 'owner'): Promise<void> => {
    setLoading(true);
    const users = await fetchAllUsers();
    const target = users.find((u) => u.role === targetRole && u.isActive) || users[0];

    setUserProfile(target);
    setRole(target.role);
    setIsDemoMode(true);
    setUser({
      uid: target.uid,
      email: target.email,
      displayName: target.name,
      emailVerified: true,
      isAnonymous: false,
    } as FirebaseUser);

    localStorage.setItem('safardesk_demo_role', target.role);

    await logAuditEvent({
      action: 'USER_LOGIN',
      userId: target.uid,
      userName: target.name,
      userEmail: target.email,
      userRole: target.role,
      details: { mode: '1_click_preset', status: 'SUCCESS' },
    });

    setLoading(false);
  };

  // Switch role for quick testing
  const switchRole = async (newRole: UserRole) => {
    const users = await fetchAllUsers();
    const target = users.find((u) => u.role === newRole && u.isActive);
    if (target) {
      setUserProfile(target);
      setRole(target.role);
      setIsDemoMode(true);
      setUser({
        uid: target.uid,
        email: target.email,
        displayName: target.name,
        emailVerified: true,
      } as FirebaseUser);
      localStorage.setItem('safardesk_demo_role', newRole);
    }
  };

  // Send Firebase password reset email
  const sendPasswordReset = async (targetEmail: string): Promise<void> => {
    if (!targetEmail.trim()) {
      throw new Error('Please provide a valid email address.');
    }

    try {
      if (!isConfigPlaceholder) {
        await sendPasswordResetEmail(auth, targetEmail.trim().toLowerCase());
      }
      await logAuditEvent({
        action: 'PASSWORD_RESET_EMAIL_REQUESTED',
        userId: user?.uid || 'anonymous',
        userName: userProfile?.name || 'Anonymous User',
        userEmail: targetEmail,
        userRole: role || 'staff',
        details: { targetEmail },
      });
    } catch (err: any) {
      console.warn('Password reset failed:', err);
      if (err?.code === 'auth/user-not-found') {
        throw new Error('No registered account was found with this email address.');
      }
      throw err;
    }
  };

  // Change Password for all roles (Re-authentication + updatePassword)
  const changePassword = async (currentPassword: string, newPassword: string): Promise<void> => {
    if (!user || !user.email) {
      throw new Error('No authenticated user session found.');
    }

    if (newPassword.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }

    try {
      if (!isConfigPlaceholder) {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
      }

      await logAuditEvent({
        action: 'USER_PASSWORD_CHANGED',
        userId: user.uid,
        userName: userProfile?.name || 'User',
        userEmail: user.email,
        userRole: role || 'staff',
        details: { status: 'SUCCESS' },
      });
    } catch (err: any) {
      console.error('Password change failed:', err);
      if (err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
        throw new Error('Your current password is incorrect. Please re-enter.');
      }
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        role,
        loading,
        isDemoMode,
        signInWithEmail,
        signOutUser,
        demoSignIn,
        switchRole,
        sendPasswordReset,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
