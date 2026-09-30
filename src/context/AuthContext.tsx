import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { CurrentUser } from '../types';

interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: CurrentUser['role'];
  organization: string | null;
  clearance: CurrentUser['clearance'];
  is_active: boolean;
  expires_at: string | null;
}

export type AuthStatus =
  /** Still resolving the stored session. */
  | 'loading'
  | 'signed_out'
  /** Signed in, but no profile row — they cannot see anything until invited. */
  | 'no_profile'
  | 'signed_in'
  /** Backend not configured; the portal runs read-only and says so. */
  | 'unconfigured';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: CurrentUser | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toCurrentUser(row: ProfileRow): CurrentUser {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    role: row.role,
    organization: row.organization,
    clearance: row.clearance,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>(
    isSupabaseConfigured ? 'loading' : 'unconfigured',
  );
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let cancelled = false;

    /**
     * The profile is the authority on who someone is. Roles are never taken
     * from client state — the previous build let anyone pick "trustee" from a
     * menu — and never from the JWT, which the browser also holds.
     */
    const loadProfile = async (activeSession: Session | null) => {
      if (!activeSession) {
        if (cancelled) return;
        setUser(null);
        setStatus('signed_out');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, organization, clearance, is_active, expires_at')
        .eq('id', activeSession.user.id)
        .maybeSingle<ProfileRow>();

      if (cancelled) return;

      const expired = data?.expires_at != null && new Date(data.expires_at) <= new Date();

      if (error || !data || !data.is_active || expired) {
        if (error) console.error('Could not load profile', error);
        setUser(null);
        setStatus('no_profile');
        return;
      }

      setUser(toCurrentUser(data));
      setStatus('signed_in');
    };

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      void loadProfile(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn: AuthContextValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setStatus('signed_out');
  };

  const requestPasswordReset: AuthContextValue['requestPasswordReset'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider value={{ status, session, user, signIn, signOut, requestPasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
