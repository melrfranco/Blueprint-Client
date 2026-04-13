-- ══════════════════════════════════════════════════════════════════
-- Phase 1 Backfill: Create salons, memberships, and set salon_id
-- on existing core rows.
--
-- Prerequisites:
--   1. Run 01-tables-and-constraints.sql first (adds salon_id columns)
--   2. This script is idempotent — safe to re-run.
--
-- Strategy:
--   Each admin who has a merchant_settings row gets:
--     a) a salons row (if not exists)
--     b) a salon_memberships row with role='owner' (if not exists)
--     c) salon_id backfilled on their clients, services, square_team_members
-- ══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- Step 2a: Create salon rows for admins who don't have one yet
-- ────────────────────────────────────────────────────────────────

INSERT INTO salons (name, slug, owner_user_id)
SELECT
  COALESCE(
    au.raw_user_meta_data->>'business_name',
    'My Salon'
  ) AS name,
  LOWER(
    REPLACE(
      COALESCE(
        au.raw_user_meta_data->>'business_name',
        'my-salon'
      ),
      ' ',
      '-'
    )
  ) || '-' || LEFT(ms.supabase_user_id::text, 8) AS slug,
  ms.supabase_user_id AS owner_user_id
FROM merchant_settings ms
JOIN auth.users au ON au.id = ms.supabase_user_id
WHERE NOT EXISTS (
  SELECT 1 FROM salons s WHERE s.owner_user_id = ms.supabase_user_id
)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Step 2b: Create owner salon_memberships for each admin
-- ────────────────────────────────────────────────────────────────

INSERT INTO salon_memberships (user_id, salon_id, role, status)
SELECT
  s.owner_user_id AS user_id,
  s.id AS salon_id,
  'owner' AS role,
  'active' AS status
FROM salons s
WHERE NOT EXISTS (
  SELECT 1 FROM salon_memberships sm
  WHERE sm.user_id = s.owner_user_id
    AND sm.salon_id = s.id
    AND sm.role = 'owner'
)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────
-- Step 3a: Backfill salon_id on clients
-- Join: clients.supabase_user_id → salons.owner_user_id
-- ────────────────────────────────────────────────────────────────

UPDATE clients c
SET salon_id = s.id
FROM salons s
WHERE c.supabase_user_id = s.owner_user_id
  AND c.salon_id IS NULL;

-- ────────────────────────────────────────────────────────────────
-- Step 3b: Backfill salon_id on services
-- Join: services.metadata->>'admin_user_id' → salons.owner_user_id
-- Fallback: services with source='square' and no metadata.admin_user_id
--           try to match via merchant_settings chain
-- ────────────────────────────────────────────────────────────────

-- Primary path: metadata has admin_user_id
UPDATE services svc
SET salon_id = s.id
FROM salons s
WHERE svc.metadata->>'admin_user_id' = s.owner_user_id::text
  AND svc.salon_id IS NULL;

-- Fallback: square-sourced services with no admin_user_id in metadata
-- Try to resolve via: find any client row for the same admin, use that salon
-- (This catches services synced before the metadata.admin_user_id field was added)
UPDATE services svc
SET salon_id = s.id
FROM salons s
WHERE svc.source = 'square'
  AND svc.salon_id IS NULL
  AND s.owner_user_id IN (
    SELECT DISTINCT c.supabase_user_id
    FROM clients c
    WHERE c.salon_id IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM services svc2
    WHERE svc2.salon_id = s.id
      AND svc2.metadata->>'square_variation_id' = svc.metadata->>'square_variation_id'
  );

-- ────────────────────────────────────────────────────────────────
-- Step 3c: Backfill salon_id on square_team_members
-- Join: square_team_members.supabase_user_id → salons.owner_user_id
-- ────────────────────────────────────────────────────────────────

UPDATE square_team_members stm
SET salon_id = s.id
FROM salons s
WHERE stm.supabase_user_id = s.owner_user_id
  AND stm.salon_id IS NULL;

-- ────────────────────────────────────────────────────────────────
-- Verification queries (run manually to check coverage)
-- ────────────────────────────────────────────────────────────────

-- SELECT 'clients without salon_id' AS label, COUNT(*) FROM clients WHERE salon_id IS NULL;
-- SELECT 'services without salon_id' AS label, COUNT(*) FROM services WHERE salon_id IS NULL;
-- SELECT 'team without salon_id' AS label, COUNT(*) FROM square_team_members WHERE salon_id IS NULL;
-- SELECT 'admins without salon' AS label, COUNT(*) FROM merchant_settings ms WHERE NOT EXISTS (SELECT 1 FROM salons s WHERE s.owner_user_id = ms.supabase_user_id);
