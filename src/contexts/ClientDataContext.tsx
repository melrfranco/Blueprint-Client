import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { Service, MembershipTier, GeneratedPlan, BookingRecord } from '../types';

interface ClientDataContextType {
  services: Service[];
  membershipTiers: MembershipTier[];
  plans: GeneratedPlan[];
  bookings: BookingRecord[];
  loading: boolean;
  error: string | null;
}

const ClientDataContext = createContext<ClientDataContextType | undefined>(undefined);

export const ClientDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [services, setServices] = useState<Service[]>([]);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTier[]>([]);
  const [plans, setPlans] = useState<GeneratedPlan[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Placeholder for future implementation
  // Will load client data from Supabase in Phase 2+

  return (
    <ClientDataContext.Provider value={{ services, membershipTiers, plans, bookings, loading, error }}>
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
