-- ══════════════════════════════════════════════════════════════════
-- Phase A + B: Table Creation, Constraints, Indexes
--
-- Run this FIRST, before the RLS script.
-- Uses IF NOT EXISTS so it's safe to re-run.
--
-- TABLE CLASSIFICATION:
--   EXISTING (created by Blueprint-Pro admin onboarding):
--     salons, merchant_settings, clients, services, square_team_members, plans
--   NEW (required by Blueprint-Client architecture):
--     salon_memberships, client_provider_mappings, client_invitations,
--     bookings, salon_provider_config
-- ══════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- EXISTING TABLES (Blueprint-Pro admin schema)
-- These will be skipped if they already exist.
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS salons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merchant_settings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  square_access_token  text,
  square_merchant_id   text,
  settings             jsonb DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL DEFAULT 'Client',
  email            text,
  phone            text,
  avatar_url       text,
  external_id      text UNIQUE,  -- Square customer ID
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS services (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  duration   integer,        -- minutes
  price      numeric,
  source     text,           -- 'square' | 'manual' | etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  category   text,
  cost       numeric,
  metadata   jsonb DEFAULT '{}'  -- Square-specific: { square_variation_id, square_item_id, variation_name, admin_user_id, ... }
);

CREATE TABLE IF NOT EXISTS square_team_members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  square_team_member_id text NOT NULL,
  merchant_id           text,
  name                  text,
  email                 text,
  phone                 text,
  permissions           jsonb DEFAULT '{}',
  raw                   jsonb DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid REFERENCES clients(id) ON DELETE SET NULL,
  client_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  salon_id        uuid REFERENCES salons(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'draft',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- NEW TABLES (Blueprint-Client architecture)
-- ────────────────────────────────────────────────────────────────

-- Links a user to a salon with a role (owner/admin/stylist/client)
CREATE TABLE IF NOT EXISTS salon_memberships (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id        uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  role            text NOT NULL,  -- 'owner' | 'admin' | 'stylist' | 'client'
  status          text NOT NULL DEFAULT 'active',  -- 'active' | 'inactive' | 'pending'
  joined_at       timestamptz NOT NULL DEFAULT now(),
  client_identity jsonb DEFAULT '{}',  -- { display_name, phone, email }
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Maps a client user to their provider-side customer ID
CREATE TABLE IF NOT EXISTS client_provider_mappings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id             uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  provider_type        text NOT NULL DEFAULT 'square',
  provider_customer_id text NOT NULL,  -- Square customer ID
  synced_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Client invitations — activation tokens stored as SHA-256 hashes
CREATE TABLE IF NOT EXISTS client_invitations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id              uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  plan_id               uuid REFERENCES plans(id) ON DELETE SET NULL,
  invited_by_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_email          text NOT NULL,
  invite_phone          text,
  invite_name           text NOT NULL,
  status                text NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'expired' | 'revoked'
  activation_token      text NOT NULL,  -- SHA-256 hash of the raw token (never plaintext)
  activation_expires_at timestamptz NOT NULL,
  accepted_at           timestamptz,
  accepted_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider_customer_id  text,  -- Square customer ID, resolved at invite time
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Booking records — one per provider booking
CREATE TABLE IF NOT EXISTS bookings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salon_id             uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  plan_id              uuid REFERENCES plans(id) ON DELETE SET NULL,
  provider_booking_id  text,  -- Square booking ID
  service_variation_id text NOT NULL,
  team_member_id       text,
  status               text NOT NULL DEFAULT 'PENDING',
  start_at             timestamptz NOT NULL,
  end_at               timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Provider config keyed by salon_id (replaces owner_user_id resolution)
CREATE TABLE IF NOT EXISTS salon_provider_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon_id      uuid NOT NULL REFERENCES salons(id) ON DELETE CASCADE,
  provider_type text NOT NULL DEFAULT 'square',
  access_token  text NOT NULL,
  location_id   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);


-- ══════════════════════════════════════════════════════════════════
-- Phase A2: Add missing columns to existing tables
-- ══════════════════════════════════════════════════════════════════
-- Must run BEFORE indexes/constraints that reference these columns.
-- Uses DO blocks so ALTER TABLE won't fail if column already exists.
-- ══════════════════════════════════════════════════════════════════

-- plans.client_user_id — set when a client activates via invitation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'client_user_id'
  ) THEN
    ALTER TABLE plans ADD COLUMN client_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- plans.salon_id — links plan to a salon
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'salon_id'
  ) THEN
    ALTER TABLE plans ADD COLUMN salon_id uuid REFERENCES salons(id) ON DELETE CASCADE;
  END IF;
END $$;

-- salons.slug — URL-safe identifier
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'salons' AND column_name = 'slug'
  ) THEN
    ALTER TABLE salons ADD COLUMN slug text UNIQUE;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════
-- Phase B: Constraints, Indexes, Unique Constraints
-- ══════════════════════════════════════════════════════════════════
-- All columns referenced below are guaranteed to exist at this point.
-- ══════════════════════════════════════════════════════════════════

-- ── salon_memberships ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_salon_memberships_user_salon_role
  ON salon_memberships (user_id, salon_id, role);

CREATE INDEX IF NOT EXISTS idx_salon_memberships_user_id
  ON salon_memberships (user_id);

CREATE INDEX IF NOT EXISTS idx_salon_memberships_salon_id
  ON salon_memberships (salon_id);

-- ── client_provider_mappings ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_provider_mappings_user_salon
  ON client_provider_mappings (user_id, salon_id);

CREATE INDEX IF NOT EXISTS idx_client_provider_mappings_salon_id
  ON client_provider_mappings (salon_id);

-- ── client_invitations ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_invitations_token
  ON client_invitations (activation_token);

CREATE INDEX IF NOT EXISTS idx_client_invitations_salon_email_status
  ON client_invitations (salon_id, invite_email, status);

CREATE INDEX IF NOT EXISTS idx_client_invitations_salon_id
  ON client_invitations (salon_id);

-- ── bookings ──
CREATE INDEX IF NOT EXISTS idx_bookings_client_user_id
  ON bookings (client_user_id);

CREATE INDEX IF NOT EXISTS idx_bookings_salon_id
  ON bookings (salon_id);

CREATE INDEX IF NOT EXISTS idx_bookings_duplicate_check
  ON bookings (client_user_id, salon_id, service_variation_id, start_at);

CREATE INDEX IF NOT EXISTS idx_bookings_status
  ON bookings (status);

-- ── salon_provider_config ──
CREATE UNIQUE INDEX IF NOT EXISTS idx_salon_provider_config_salon_id
  ON salon_provider_config (salon_id);

-- ── plans ──
CREATE INDEX IF NOT EXISTS idx_plans_client_user_id
  ON plans (client_user_id);

-- ── merchant_settings ──
CREATE INDEX IF NOT EXISTS idx_merchant_settings_supabase_user_id
  ON merchant_settings (supabase_user_id);

-- ── services ──
-- GIN index on metadata for @> (contains) queries used by service lookups
CREATE INDEX IF NOT EXISTS idx_services_metadata_gin
  ON services USING gin (metadata);

CREATE INDEX IF NOT EXISTS idx_services_source
  ON services (source);

-- ── clients ──
CREATE INDEX IF NOT EXISTS idx_clients_supabase_user_id
  ON clients (supabase_user_id);

-- ── square_team_members ──
CREATE INDEX IF NOT EXISTS idx_square_team_members_supabase_user_id
  ON square_team_members (supabase_user_id);

CREATE INDEX IF NOT EXISTS idx_square_team_members_square_id
  ON square_team_members (square_team_member_id);
