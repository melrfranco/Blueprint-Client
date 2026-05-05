/**
 * Auth helpers for booking endpoints.
 *
 * Validates the authenticated client user, verifies salon membership,
 * checks booking eligibility (provider mapping exists), and resolves
 * the provider-side customer ID — all server-side only.
 *
 * SECURITY MODEL:
 * - Token validation uses a Supabase client initialized with the ANON key.
 *   This forces Supabase's GoTrue server to verify the JWT signature,
 *   expiration, and claims — rejecting invalid, expired, or spoofed tokens.
 * - Database queries that must bypass RLS use a separate service role client.
 * - All queries are scoped by the verified user.id — never by client-supplied values.
 */

import { createClient } from '@supabase/supabase-js';
import { log } from './logger.js';

export interface AuthenticatedClient {
  userId: string;
  salonId: string;
  providerCustomerId: string; // resolved from client_provider_mappings
  bookingEligible: boolean;
}

/**
 * Authenticate and authorize a client user for booking operations.
 *
 * Steps:
 * 1. Validate Bearer token via Supabase GoTrue (anon key client) → verified user.id
 * 2. Verify user role = client (from verified user_metadata)
 * 3. Verify active salon membership (scoped by verified user.id)
 * 4. Verify provider mapping exists (scoped by verified user.id + salon_id)
 * 5. Return resolved client context with provider customer ID
 *
 * Throws with descriptive messages and HTTP status codes on each failure.
 * No booking endpoint can be accessed with an invalid or spoofed token
 * because Supabase's GoTrue server validates the JWT cryptographically.
 */
export async function authenticateClient(
  authHeader: string | undefined,
  requestedSalonId?: string
): Promise<AuthenticatedClient> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing or invalid authorization header'), { status: 401 });
  }

  const token = authHeader.slice(7);

  // ── Step 1: Verify JWT using anon key client ──
  // The anon key client sends the token to Supabase's GoTrue server,
  // which validates the JWT signature, expiration, and claims.
  // This rejects invalid, expired, or spoofed tokens.
  // Do NOT use the service role key client here — it bypasses JWT verification.
  const supabaseAnon = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!
  );

  const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !userData?.user) {
    log('AUTH_TOKEN_INVALID', { error: authError?.message });
    throw Object.assign(new Error('Invalid or expired token'), { status: 401, code: 'UNAUTHORIZED' });
  }

  // user.id is now cryptographically verified — safe to use as scope key
  const userId = userData.user.id;
  const role = userData.user.user_metadata?.role;

  // ── Step 2: Verify client role ──
  if (role !== 'client') {
    log('AUTH_ROLE_MISMATCH', { userId, role });
    throw Object.assign(new Error('This endpoint is for clients only'), { status: 403, code: 'FORBIDDEN' });
  }

  // ── Steps 3-4: Privileged DB queries using service role ──
  // These queries need to bypass RLS to read membership and provider mapping.
  // They are scoped exclusively by the verified userId — never by client input.
  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // ── Step 3: Verify active salon membership (scoped by verified userId) ──
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('salon_memberships')
    .select('salon_id, status')
    .eq('user_id', userId)
    .eq('role', 'client')
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError || !membership) {
    log('AUTH_NO_MEMBERSHIP', { userId });
    throw Object.assign(new Error('No active salon membership found'), { status: 403, code: 'NO_MEMBERSHIP' });
  }

  const salonId = membership.salon_id;

  // If a specific salon was requested, verify it matches the verified membership
  if (requestedSalonId && requestedSalonId !== salonId) {
    log('AUTH_SALON_MISMATCH', { userId, requestedSalonId, actualSalonId: salonId });
    throw Object.assign(new Error('Salon ID does not match your membership'), { status: 403, code: 'SALON_MISMATCH' });
  }

  // ── Step 4: Verify provider mapping exists (scoped by verified userId + salonId) ──
  const { data: providerMapping, error: mappingError } = await supabaseAdmin
    .from('client_provider_mappings')
    .select('provider_customer_id, provider_type')
    .eq('user_id', userId)
    .eq('salon_id', salonId)
    .maybeSingle();

  if (mappingError) {
    log('AUTH_PROVIDER_MAPPING_ERROR', { userId, error: mappingError.message });
  }

  if (!providerMapping?.provider_customer_id) {
    log('AUTH_NOT_BOOKING_ELIGIBLE', { userId, salonId });
    throw Object.assign(
      new Error('Booking is not available for your account yet. Your salon needs to complete provider setup.'),
      { status: 403, code: 'NOT_BOOKING_ELIGIBLE' }
    );
  }

  return {
    userId,
    salonId,
    providerCustomerId: providerMapping.provider_customer_id,
    bookingEligible: true,
  };
}
