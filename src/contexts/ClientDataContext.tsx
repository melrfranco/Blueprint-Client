import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import type { Service, MembershipTier, GeneratedPlan, BookingRecord } from '../types';

interface ClientDataContextType {
  services: Service[];
  membershipTiers: MembershipTier[];
  plans: GeneratedPlan[];
  bookings: BookingRecord[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ClientDataContext = createContext<ClientDataContextType | undefined>(undefined);

export const ClientDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, membership } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [plans, setPlans] = useState<GeneratedPlan[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !membership) return;

    setLoading(true);
    setError(null);

    try {
      const salonId = membership.salon_id;

      // Load services via salon-scoped server endpoint
      // The services table has no supabase_user_id column — salon linkage
      // lives in metadata->>'admin_user_id' (jsonb). The server endpoint
      // resolves salon → owner_user_id → filters by metadata, so the client
      // never needs to know about the internal scoping mechanism.
      const servicesRes = await fetch(`/api/client/services?salon_id=${encodeURIComponent(salonId)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!servicesRes.ok) {
        throw new Error('Failed to load services');
      }
      const servicesData = await servicesRes.json();
      setServices((servicesData || []) as Service[]);

      // Load plans for this client (RLS enforces client_user_id = auth.uid())
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('*')
        .eq('client_user_id', user.id);

      if (plansError) throw plansError;
      setPlans((plansData || []) as GeneratedPlan[]);

      // Load bookings for this client (RLS enforces client_user_id = auth.uid())
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('client_user_id', user.id);

      if (bookingsError) throw bookingsError;
      setBookings((bookingsData || []) as BookingRecord[]);

    } catch (err) {
      console.error('Client data load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, membership]);

  useEffect(() => {
    if (isAuthenticated && membership) {
      refresh();
    } else {
      setServices([]);
      setMembershipTiers([]);
      setPlans([]);
      setBookings([]);
      setLoading(false);
    }
  }, [isAuthenticated, membership, refresh]);

  return (
    <ClientDataContext.Provider value={{ services, membershipTiers, plans, bookings, loading, error, refresh }}>
      {children}
    </ClientDataContext.Provider>
  );
};

export const useClientData = () => {
  const context = useContext(ClientDataContext);
  if (!context) {
    throw new Error('useClientData must be used within a ClientDataProvider');
  }
  return context;
};
