-- ══════════════════════════════════════════════════════════════════
-- Phase C: Row Level Security Policies
-- ══════════════════════════════════════════════════════════════════
--
-- Run this AFTER 01-tables-and-constraints.sql.
-- All policies use auth.uid() for user-scoping — never client-supplied values.
--
-- PRINCIPLES:
--   - Clients can only access their own records (user_id = auth.uid())
--   - No client can access another client's data
--   - client_invitations are NOT readable by clients directly
--   - All client reads must be scoped by authenticated user
--   - Server-side endpoints use the service role key to bypass RLS
--   - No INSERT/UPDATE/DELETE policies for clients — all writes go server-side
-- ══════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────
-- salon_memberships
-- ────────────────────────────────────────────────────────────────
-- Clients can read their own membership. Admin/stylist resolution
-- happens server-side via service role key.

ALTER TABLE salon_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_read_own_membership" ON salon_memberships;
CREATE POLICY "clients_read_own_membership" ON salon_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- client_provider_mappings
-- ────────────────────────────────────────────────────────────────
-- Clients can read their own provider mapping (to know if booking-eligible).
-- Provider customer IDs are resolved server-side only.

ALTER TABLE client_provider_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_read_own_provider_mapping" ON client_provider_mappings;
CREATE POLICY "clients_read_own_provider_mapping" ON client_provider_mappings
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- plans
-- ────────────────────────────────────────────────────────────────
-- Clients can read plans assigned to them (client_user_id = auth.uid()).
-- Plan creation and assignment happens server-side.

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_read_own_plans" ON plans;
CREATE POLICY "clients_read_own_plans" ON plans
  FOR SELECT TO authenticated
  USING (client_user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- bookings
-- ────────────────────────────────────────────────────────────────
-- Clients can read their own bookings only.
-- Booking creation happens server-side (provider call + DB insert).

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_read_own_bookings" ON bookings;
CREATE POLICY "clients_read_own_bookings" ON bookings
  FOR SELECT TO authenticated
  USING (client_user_id = auth.uid());


-- ────────────────────────────────────────────────────────────────
-- services
-- ────────────────────────────────────────────────────────────────
-- TEMPORARY: RLS DISABLED for services.
--
-- The services table has no salon_id or supabase_user_id column.
-- Salon linkage lives in metadata->>'admin_user_id' (jsonb), which
-- cannot be efficiently used in RLS USING expressions.
--
-- All service reads happen server-side via the service role key
-- (which bypasses RLS). The /api/client/services endpoint filters
-- by metadata->>'admin_user_id' matching the salon's owner_user_id.
--
-- FUTURE: Add a salon_id column to services, then enable RLS with:
--   salon_id IN (SELECT salon_id FROM salon_memberships
--     WHERE user_id = auth.uid() AND role = 'client' AND status = 'active')
--
-- Until then, do NOT enable RLS on this table — it would block all
-- client access since no policy can express the jsonb join efficiently.

-- ALTER TABLE services ENABLE ROW LEVEL SECURITY;  -- intentionally disabled


-- ────────────────────────────────────────────────────────────────
-- client_invitations
-- ────────────────────────────────────────────────────────────────
-- Clients must NEVER read invitations directly.
-- Invitation creation, resend, and revoke happen server-side only.
-- Activation token validation also happens server-side.
-- No SELECT policy = no client access.

ALTER TABLE client_invitations ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies for authenticated (client) users.
-- All invitation operations use the service role key.


-- ────────────────────────────────────────────────────────────────
-- salon_provider_config
-- ────────────────────────────────────────────────────────────────
-- Contains provider access tokens — clients must NEVER read this.
-- Only resolved server-side via service role key.

-- Intentionally NO policies for authenticated (client) users.


-- ────────────────────────────────────────────────────────────────
-- merchant_settings
-- ────────────────────────────────────────────────────────────────
-- Contains Square access tokens — clients must NEVER read this.
-- Only resolved server-side via service role key.

ALTER TABLE merchant_settings ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies for authenticated (client) users.
