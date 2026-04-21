import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { supabase, getCachedAccessToken } from '../lib/supabase';
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
  const { user, isAuthenticated, membership, accessToken } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [plans, setPlans] = useState<GeneratedPlan[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || !membership) {
      console.log('[ClientData] Skipping refresh — user:', !!user, 'membership:', !!membership);
      return;
    }

    console.log('[ClientData] Refreshing for user:', user.id, 'salon:', membership.salon_id);
    // Only show loading spinner on first load — subsequent refreshes are silent
    if (!hasLoadedOnce.current) setLoading(true);
    setError(null);

    try {
      const salonId = membership.salon_id;

      // Load services via salon-scoped server endpoint
      const servicesRes = await fetch(`/api/client/services?salon_id=${encodeURIComponent(salonId)}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!servicesRes.ok) {
        throw new Error('Failed to load services');
      }
      const servicesData = await servicesRes.json();
      const loadedServices = (servicesData || []) as Service[];
      setServices(loadedServices);
      console.log('[ClientData] Services loaded:', loadedServices.length);

      // Hydrate plan rows from the server response
      const hydratePlanRows = (rows: any[]): GeneratedPlan[] =>
        rows.map((row: any) => {
          const blob = row.plan_data || {};
          return {
            ...blob,
            id: row.id,
            status: row.status || blob.status || 'draft',
            createdAt: blob.createdAt ? new Date(blob.createdAt) : new Date(row.created_at),
            appointments: Array.isArray(blob.appointments)
              ? blob.appointments.map((a: any) => ({ ...a, date: a.date ? new Date(a.date) : new Date() }))
              : [],
            totalCost: typeof blob.totalCost === 'number' ? blob.totalCost : 0,
            membershipStatus: blob.membershipStatus || 'none',
            client: blob.client || { id: user.id, name: '', avatarUrl: '' },
          } as GeneratedPlan;
        });

      // Load plans — use cached access token from AuthContext (no getSession() call)
      let plansRows: any[] = [];
      const token = accessToken || getCachedAccessToken();
      console.log('[ClientData] Token for plans fetch:', token ? 'has token' : 'NO TOKEN');
      if (token) {
        try {
          const plansRes = await fetch('/api/client/plans', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });
          console.log('[ClientData] /api/client/plans status:', plansRes.status);
          if (plansRes.ok) {
            const plansJson = await plansRes.json();
            plansRows = plansJson.plan ? [plansJson.plan] : [];
            console.log('[ClientData] Plan from server:', plansRows.length ? 'found' : 'none');
          } else {
            console.warn('[ClientData] /api/client/plans returned', plansRes.status);
          }
        } catch (e) {
          console.warn('[ClientData] Plans fetch failed:', e);
        }
      }

      setPlans(hydratePlanRows(plansRows));

      // Load bookings for this client
      let bookingsData: any[] = [];
      const { data: bData, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, plan_id, service_variation_id, team_member_id, status, start_at, end_at')
        .eq('client_user_id', user.id)
        .order('start_at', { ascending: true });

      if (bookingsError) {
        console.warn('[ClientData] Bookings query error:', bookingsError.message);
      } else {
        bookingsData = bData || [];
      }

      // Decorate bookings with display-friendly service info
      const serviceByVariation = new Map(
        loadedServices
          .filter((s) => !!s.variation_id)
          .map((s) => [s.variation_id!, s]),
      );
      const decoratedBookings: BookingRecord[] = (bookingsData || []).map((row: any) => {
        const svc = serviceByVariation.get(row.service_variation_id);
        return {
          id: row.id,
          plan_id: row.plan_id,
          service_variation_id: row.service_variation_id,
          team_member_id: row.team_member_id,
          status: row.status,
          start_at: row.start_at,
          end_at: row.end_at,
          service_name: svc
            ? svc.variation_name
              ? `${svc.name} — ${svc.variation_name}`
              : svc.name
            : 'Service',
          service_duration: svc?.duration,
        };
      });
      setBookings(decoratedBookings);
      hasLoadedOnce.current = true;

    } catch (err) {
      console.error('Client data load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [user, membership, accessToken]);

  useEffect(() => {
    if (isAuthenticated && membership && accessToken) {
      refresh();
    } else if (!isAuthenticated) {
      setServices([]);
      setMembershipTiers([]);
      setPlans([]);
      setBookings([]);
      setLoading(false);
      hasLoadedOnce.current = false;
    }
  }, [isAuthenticated, membership, accessToken, refresh]);

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
