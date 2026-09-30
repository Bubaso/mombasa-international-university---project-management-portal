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
  /** Signed in, but the portal will not let them in; `denial` says why. */
  | 'no_profile'
  | 'signed_in'
  /** Backend not configured; the portal runs read-only and says so. */
  | 'unconfigured';

/**
 * Why a verified sign-in still gets nowhere.
 *
 * These were one state and one sentence — "no profile, or expired" — which is
 * four different problems with four different fixes presented as one riddle.
 * Somebody who has just made their own account and their own profile row
 * needs to know which of the four it is, and the portal knows.
 */
export type AccessDenial =
  /** The query came back empty: no row this account can see carries its id. */
  | { kind: 'no_row'; userId: string; email: string | null }
  /** A row exists and says this person is no longer active. */
  | { kind: 'inactive'; userId: string; email: string | null }
  /** A row exists and its access ran out. */
  | { kind: 'expired'; userId: string; email: string | null; expiresAt: string }
  /** The database refused the question. Its answer is worth more than ours. */
  | { kind: 'error'; userId: string; email: string | null; message: string };

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  user: CurrentUser | null;
  /** Set whenever status is 'no_profile', and null otherwise. */
  denial: AccessDenial | null;
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
  const [denial, setDenial] = useState<AccessDenial | null>(null);

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
        setDenial(null);
        setStatus('signed_out');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, organization, clearance, is_active, expires_at')
        .eq('id', activeSession.user.id)
        .maybeSingle<ProfileRow>();

      if (cancelled) return;

      const who = { userId: activeSession.user.id, email: activeSession.user.email ?? null };

      const refuse = (reason: AccessDenial) => {
        setUser(null);
        setDenial(reason);
        setStatus('no_profile');
      };

      // An empty result and a refused query are not the same thing, and the
      // portal no longer reports them as if they were.
      //
      // A row can also be invisible rather than absent. Every policy in this
      // schema closes when app.current_clearance() is null, and that function
      // answers null for a profile that is inactive or past its date — so
      // such a row does not read as inactive, it does not read at all, and
      // this arrives here as 'no_row'. The screen says which id it asked
      // about so the difference can be checked in one query.
      if (error) return refuse({ ...who, kind: 'error', message: error.message });
      if (!data) return refuse({ ...who, kind: 'no_row' });
      if (!data.is_active) return refuse({ ...who, kind: 'inactive' });
      if (data.expires_at != null && new Date(data.expires_at) <= new Date()) {
        return refuse({ ...who, kind: 'expired', expiresAt: data.expires_at });
      }

      setDenial(null);
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
    setDenial(null);
    setStatus('signed_out');
  };

  const requestPasswordReset: AuthContextValue['requestPasswordReset'] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`,
    });
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider
      value={{ status, session, user, denial, signIn, signOut, requestPasswordReset }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
