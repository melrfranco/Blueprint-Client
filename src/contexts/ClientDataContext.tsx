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
      const loadedServices = (servicesData || []) as Service[];
      setServices(loadedServices);

      // Load plans for this client (RLS enforces client_user_id = auth.uid())
      // Plans store rich data in plan_data jsonb column (written by Pro)
      const { data: plansData, error: plansError } = await supabase
        .from('plans')
        .select('id, status, plan_data, created_at')
        .eq('client_user_id', user.id);

      if (plansError) throw plansError;

      // Self-heal: if the RLS-gated query returned zero plans, call the
      // server link endpoint, which uses the service role to re-link any
      // orphaned plans from accepted invitations and returns the authoritative
      // list. Fixes users whose activation predates the multi-plan link fix,
      // or whose plans are missing salon_id / client_user_id in the DB.
      let plansRows = plansData || [];
      if (plansRows.length === 0) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const accessToken = session?.access_token;
          if (accessToken) {
            const linkRes = await fetch('/api/client/link-plans', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
            });
            if (linkRes.ok) {
              const linkJson = await linkRes.json();
              if (Array.isArray(linkJson.plans) && linkJson.plans.length > 0) {
                plansRows = linkJson.plans;
                console.info(
                  '[ClientData] Self-heal linked plans:',
                  linkJson.plans_linked,
                  '| now owning:',
                  linkJson.plans_owned,
                );
              }
            } else {
              console.warn('[ClientData] link-plans endpoint returned', linkRes.status);
            }
          }
        } catch (e) {
          console.warn('[ClientData] link-plans self-heal failed:', e);
        }
      }

      const hydratedPlans: GeneratedPlan[] = plansRows.map((row: any) => {
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
      setPlans(hydratedPlans);

      // Load bookings for this client (RLS enforces client_user_id = auth.uid())
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('id, plan_id, service_variation_id, team_member_id, status, start_at, end_at')
        .eq('client_user_id', user.id)
        .order('start_at', { ascending: true });

      if (bookingsError) throw bookingsError;

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
