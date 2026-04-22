import { getCachedAccessToken } from '../lib/supabase';

const API_BASE = '/api';

async function getAccessToken(): Promise<string | null> {
  return getCachedAccessToken();
}

export interface TimeSlot {
  start_at: string;
  end_at: string;
  available: boolean;
  team_member_id?: string;
}

export interface AvailabilityResponse {
  date: string;
  slots: TimeSlot[];
}

export interface RangeAvailabilityResponse {
  date: string;
  days: number;
  slots: TimeSlot[];
}

export interface BookingResult {
  id: string | null;
  provider_booking_id: string;
  status: string;
  start_at: string;
  end_at: string;
  warning?: string;
}

export interface ActivationDetails {
  invite_name: string;
  invite_email: string;
  salon_name: string;
  token_valid: boolean;
  booking_eligible: boolean;
}

export interface ActivationPayload {
  token?: string;
  claim_code?: string;
  email: string;
  password: string;
}

export interface ActivationLookupParams {
  token?: string;
  claimCode?: string;
}

export interface ActivationResult {
  success: boolean;
  booking_eligible: boolean;
  message?: string;
}

export const apiClient = {
  // ── Activation ──

  async getActivationDetails(params: ActivationLookupParams | string): Promise<ActivationDetails> {
    // Backwards compatible: accept a bare token string.
    const { token, claimCode } = typeof params === 'string' ? { token: params, claimCode: undefined } : params;

    const qs = token
      ? `token=${encodeURIComponent(token)}`
      : claimCode
        ? `claim_code=${encodeURIComponent(claimCode)}`
        : '';

    if (!qs) throw new Error('Missing activation token or claim code');

    const response = await fetch(`${API_BASE}/client/activate?${qs}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || 'Invalid or expired activation credential');
    }

    return response.json();
  },

  async completeActivation(payload: ActivationPayload): Promise<ActivationResult> {
    const response = await fetch(`${API_BASE}/client/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Activation failed');
    }

    return data;
  },

  // ── Membership ──

  async acceptMembership(planId: string): Promise<{ code: string; message: string }> {
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE}/client/accept-membership`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ plan_id: planId }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || 'Failed to accept membership');
    }
    return data;
  },

  // ── Auth ──

  async login(): Promise<void> {
    // Login is handled directly via Supabase in AuthContext
    // This method exists for future server-side login flows
    throw new Error('Use AuthContext.login() for client authentication');
  },

  async logout(): Promise<void> {
    // Logout is handled directly via Supabase in AuthContext
    throw new Error('Use AuthContext.logout() for client authentication');
  },

  // ── Booking ──

  async getAvailability(params: {
    serviceVariationId: string;
    date: string;
    teamMemberId?: string;
  }): Promise<AvailabilityResponse> {
    const token = await getAccessToken();
    const paramsObj = new URLSearchParams({
      service_variation_id: params.serviceVariationId,
      date: params.date,
    });
    if (params.teamMemberId) {
      paramsObj.set('team_member_id', params.teamMemberId);
    }

    const response = await fetch(`${API_BASE}/bookings/availability?${paramsObj}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch availability');
    }

    return data;
  },

  async getAvailabilityRange(params: {
    serviceVariationId: string;
    date: string;
    days: number;
    teamMemberId?: string;
  }): Promise<RangeAvailabilityResponse> {
    const token = await getAccessToken();
    const paramsObj = new URLSearchParams({
      service_variation_id: params.serviceVariationId,
      date: params.date,
      days: String(params.days),
    });
    if (params.teamMemberId) {
      paramsObj.set('team_member_id', params.teamMemberId);
    }

    const response = await fetch(`${API_BASE}/bookings/availability?${paramsObj}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch availability');
    }

    return data;
  },

  async createBooking(params: {
    serviceVariationId: string;
    startAt: string;
    teamMemberId?: string;
    planId?: string;
  }): Promise<BookingResult> {
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE}/bookings/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        service_variation_id: params.serviceVariationId,
        start_at: params.startAt,
        team_member_id: params.teamMemberId || undefined,
        plan_id: params.planId || undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.message || 'Failed to create booking');
    }

    return data;
  },
};
