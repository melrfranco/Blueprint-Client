// Placeholder entities for future implementation

export type UserRole = 'client';

export interface User {
  id: string;
  email: string;
  role: UserRole;
}

export interface Service {
  id: string;
  version?: number;
  name: string;
  category: string;
  cost: number;
  duration: number;
}

export interface Client {
  id: string;
  externalId?: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl: string;
}

export interface MembershipTier {
  id: string;
  name: string;
  minSpend: number;
  perks: string[];
  color: string;
}

export type PlanStatus = 'draft' | 'active' | 'archived';
export type MembershipStatus = 'none' | 'offered' | 'active';

export interface PlanAppointment {
  id: string;
  date: Date;
  services: Service[];
  notes?: string;
}

export interface GeneratedPlan {
  id: string;
  client: Client;
  appointments: PlanAppointment[];
  totalCost: number;
  status: PlanStatus;
  membershipStatus: MembershipStatus;
  createdAt: Date;
  stylistId?: string;
}

export interface BookingRecord {
  id: string;
  planId: string;
  squareBookingId?: string;
  startAt: string;
  status: string;
  services: { name: string }[];
}

export interface Salon {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

export interface SalonMembership {
  id: string;
  user_id: string;
  salon_id: string;
  role: 'owner' | 'stylist' | 'client';
  status: 'active' | 'inactive' | 'pending';
  joined_at: string;
  client_identity: {
    display_name: string;
    phone?: string;
    notes?: string;
  };
}

export interface ClientInvitation {
  id: string;
  salon_id: string;
  plan_id: string;
  invited_by_user_id: string;
  invite_email: string;
  invite_phone?: string;
  invite_name: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  activation_token: string;
  activation_expires_at: string;
  accepted_at?: string;
  accepted_user_id?: string;
  provider_customer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientProviderMapping {
  id: string;
  salon_id: string;
  user_id: string;
  provider_type: 'square' | 'vagaro' | 'mindbody';
  provider_customer_id: string;
  synced_at: string;
  raw_data?: any;
}
