import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, UserRole, SalonMembership } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  authInitialized: boolean;
  membership: SalonMembership | null;
  bookingEligible: boolean;
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

  const refreshMembership = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      setMembership(null);
      setBookingEligible(false);
      return;
    }

    const { data } = await supabase
      .from('salon_memberships')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('role', 'client')
      .eq('status', 'active')
      .maybeSingle();

    setMembership(data as SalonMembership | null);

    // Check provider mapping for booking eligibility
    if (data?.salon_id) {
      const { data: mapping } = await supabase
        .from('client_provider_mappings')
        .select('provider_customer_id')
        .eq('user_id', session.user.id)
        .eq('salon_id', data.salon_id)
        .maybeSingle();

      setBookingEligible(!!mapping?.provider_customer_id);
    } else {
      setBookingEligible(false);
    }
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('[Auth] Initializing...');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[Auth] getSession error:', sessionError.message);
        }

        if (session?.user) {
          console.log('[Auth] Session found, user:', session.user.id, 'role:', session.user.user_metadata?.role);
          const resolved = resolveClientUser(session.user);
          if (resolved) {
            setUser(resolved);
            await refreshMembership();
            console.log('[Auth] Membership loaded');
          } else {
            console.warn('[Auth] User role is not client:', session.user.user_metadata?.role);
          }
        } else {
          console.log('[Auth] No active session');
        }
      } catch (error) {
        console.error('[Auth] Initialization error:', error);
      } finally {
        setAuthInitialized(true);
        console.log('[Auth] Initialization complete');
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const resolved = resolveClientUser(session.user);
        if (resolved) {
          setUser(resolved);
          await refreshMembership();
        } else {
          setUser(null);
          setMembership(null);
          setBookingEligible(false);
          await supabase.auth.signOut();
        }
      } else {
        setUser(null);
        setMembership(null);
        setBookingEligible(false);
      }
      setAuthInitialized(true);
    });

    return () => subscription.unsubscribe();
  }, [resolveClientUser, refreshMembership]);

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
    setUser(null);
    setMembership(null);
    setBookingEligible(false);
  };

  const updateUser = (updates: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...updates } : null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, authInitialized, membership, bookingEligible, login, logout, updateUser, refreshMembership }}>
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
