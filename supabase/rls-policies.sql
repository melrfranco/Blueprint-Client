-- ══════════════════════════════════════════════════════════════════
-- Row Level Security Policies for Blueprint
-- ══════════════════════════════════════════════════════════════════
--
-- Apply these policies in the Supabase dashboard → SQL Editor.
-- All policies use auth.uid() for user-scoping — never client-supplied values.
--
-- PRINCIPLES:
--   - Clients can only access their own records (user_id = auth.uid())
--   - No client can access another client's data
--   - client_invitations are NOT readable by clients directly
--   - All client reads must be scoped by authenticated user
--   - Server-side endpoints use the service role key to bypass RLS
--   - Admin/stylist access is handled server-side, not via RLS
-- ══════════════════════════════════════════════════════════════════

-- ── Enable RLS on all tables ──

ALTER TABLE salon_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_provider_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_invitations ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════
-- salon_memberships
-- ══════════════════════════════════════════════════════════════════

-- Clients can read their own membership
CREATE POLICY "Clients can read own membership"
  ON salon_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admin/stylist can read memberships for their salon (resolved server-side)
-- Note: Full admin access uses service role key which bypasses RLS.
-- This policy allows authenticated users to see their own row only.
CREATE POLICY "Users can read own memberships"
  ON salon_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Prevent clients from inserting/updating/deleting memberships directly
-- All membership writes happen server-side via service role key
-- (No INSERT/UPDATE/DELETE policies for non-service roles)

-- ══════════════════════════════════════════════════════════════════
-- client_provider_mappings
-- ══════════════════════════════════════════════════════════════════

-- Clients can read their own provider mapping (needed for booking_eligible check)
CREATE POLICY "Clients can read own provider mapping"
  ON client_provider_mappings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No direct writes — provider mappings are created server-side only
-- during activation (activate.ts) or admin linking

-- ══════════════════════════════════════════════════════════════════
-- plans
-- ══════════════════════════════════════════════════════════════════

-- Clients can read plans assigned to them
CREATE POLICY "Clients can read own plans"
  ON plans FOR SELECT
  TO authenticated
  USING (client_user_id = auth.uid());

-- Admin/stylist plan access is handled server-side via service role key
-- No direct client writes to plans

-- ══════════════════════════════════════════════════════════════════
-- bookings
-- ══════════════════════════════════════════════════════════════════

-- Clients can read their own bookings
CREATE POLICY "Clients can read own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (client_user_id = auth.uid());

-- No direct client inserts — bookings are created server-side only
-- via /api/bookings/create which uses service role key

-- ══════════════════════════════════════════════════════════════════
-- services (read-only for clients)
-- ══════════════════════════════════════════════════════════════════

-- Clients can read services for salons they belong to
-- This requires a join through salon_memberships to verify membership
CREATE POLICY "Clients can read services for own salon"
  ON services FOR SELECT
  TO authenticated
  USING (
    supabase_user_id IN (
      SELECT s.owner_user_id
      FROM salons s
      INNER JOIN salon_memberships sm
        ON sm.salon_id = s.id
        AND sm.user_id = auth.uid()
        AND sm.status = 'active'
        AND sm.role = 'client'
    )
  );

-- No client writes to services — synced by admin via Square API

-- ══════════════════════════════════════════════════════════════════
-- client_invitations — NOT readable by clients
-- ══════════════════════════════════════════════════════════════════

-- No SELECT policy for clients — invitations are handled server-side
-- only via /api/invitations/* and /api/client/activate endpoints
-- which use the service role key

-- No client writes — invitation creation/resend/revoke is admin/stylist only
-- via /api/invitations/* endpoints with service role key
