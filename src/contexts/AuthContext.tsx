import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase, setCachedAccessToken } from '../lib/supabase';
import type { User, UserRole, SalonMembership } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  authInitialized: boolean;
  membership: SalonMembership | null;
  bookingEligible: boolean;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  refreshMembership: () => Promise<void>;
}

const CLIENT_ROLE: UserRole = 'client';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<SalonMembership | null>(null);
  const [bookingEligible, setBookingEligible] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const userIdRef = useRef<string | null>(null);

  const resolveClientUser = useCallback((sessionUser: any): User | null => {
    const role = sessionUser?.user_metadata?.role as UserRole;
    if (role !== CLIENT_ROLE) {
      return null;
    }
    return {
      id: sessionUser.id,
      email: sessionUser.email || '',
      role: CLIENT_ROLE,
    };
  }, []);

  // Load membership using a known userId — no getSession() call
  const loadMembership = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('salon_memberships')
      .select('*')
      .eq('user_id', userId)
      .eq('role', 'client')
      .eq('status', 'active')
      .maybeSingle();

    setMembership(data as SalonMembership | null);

    if (data?.salon_id) {
      const { data: mapping } = await supabase
        .from('client_provider_mappings')
        .select('provider_customer_id')
        .eq('user_id', userId)
        .eq('salon_id', data.salon_id)
        .maybeSingle();

      setBookingEligible(!!mapping?.provider_customer_id);
    } else {
      setBookingEligible(false);
    }
  }, []);

  // Public refreshMembership uses the cached userId
  const refreshMembership = useCallback(async () => {
    if (userIdRef.current) {
      await loadMembership(userIdRef.current);
    }
  }, [loadMembership]);

  // Central handler for session changes — called once per auth event
  const handleSession = useCallback(async (session: any) => {
    if (session?.user) {
      const resolved = resolveClientUser(session.user);
      if (resolved) {
        userIdRef.current = resolved.id;
        setUser(resolved);
        setAccessToken(session.access_token);
        setCachedAccessToken(session.access_token);
        await loadMembership(resolved.id);
      } else {
        console.warn('[Auth] User role is not client:', session.user.user_metadata?.role);
        userIdRef.current = null;
        setUser(null);
        setAccessToken(null);
        setCachedAccessToken(null);
        setMembership(null);
        setBookingEligible(false);
        await supabase.auth.signOut();
      }
    } else {
      userIdRef.current = null;
      setUser(null);
      setAccessToken(null);
      setCachedAccessToken(null);
      setMembership(null);
      setBookingEligible(false);
    }
  }, [resolveClientUser, loadMembership]);

  useEffect(() => {
    let didFinish = false;

    // Safety timeout: if INITIAL_SESSION event never fires, unblock the UI
    const timeout = setTimeout(() => {
      if (!didFinish) {
        console.warn('[Auth] No INITIAL_SESSION event after 4s — unblocking UI');
        setAuthInitialized(true);
      }
    }, 4000);

    // Subscribe to auth state changes — Supabase v2 fires INITIAL_SESSION
    // immediately with the current session. No need to call getSession()
    // at all, which avoids Web Lock contention / deadlocks.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[Auth] State change:', event, session?.user?.id || 'no user');
      didFinish = true;
      clearTimeout(timeout);

      if (session?.access_token) {
        setAccessToken(session.access_token);
        setCachedAccessToken(session.access_token);
      } else {
        setAccessToken(null);
        setCachedAccessToken(null);
      }

      await handleSession(session);
      setAuthInitialized(true);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [handleSession]);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (data.user?.user_metadata?.role !== CLIENT_ROLE) {
      await supabase.auth.signOut();
      throw new Error('This app is for clients only. Please use the professional app instead.');
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    userIdRef.current = null;
    setUser(null);
    setAccessToken(null);
    setCachedAccessToken(null);
    setMembership(null);
    setBookingEligible(false);
  };

  const updateUser = (updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, authInitialized, membership, bookingEligible, accessToken, login, logout, updateUser, refreshMembership }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
