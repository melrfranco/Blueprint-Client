/**
 * Provider factory — resolves the correct BookingProvider for a salon.
 *
 * Reads the salon's provider config from the database and returns
 * the appropriate adapter instance. Currently only Square is supported,
 * but the factory pattern allows adding more providers without changing
 * any booking endpoint code.
 *
 * ──────────────────────────────────────────────────────────────────
 * TEMPORARY ASSUMPTION — SERVICE RESOLUTION VIA owner_user_id
 * ──────────────────────────────────────────────────────────────────
 * The current implementation resolves provider credentials by looking up
 * the salon's owner_user_id, then querying merchant_settings by that
 * owner's Supabase user ID. This is a TEMPORARY shortcut that couples
 * provider credential resolution to the salon owner's user identity.
 *
 * This must be replaced with a proper salon-scoped or provider-scoped
 * model where:
 *   - Provider credentials are stored keyed by salon_id (not user_id)
 *   - The salon_provider_config table becomes the authoritative source
 *   - No user_id resolution step is needed
 *   - Provider credentials survive ownership changes
 *
 * Do NOT extend this owner_user_id pattern to new code.
 * See: /api/client/services.ts for a similar temporary pattern
 * (resolves salon → owner_user_id → filters services by metadata).
 * ──────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import type { BookingProvider } from './booking-provider';
import { SquareBookingAdapter } from './square-booking-adapter';
import { log } from './logger';

interface ProviderConfig {
  provider_type: string;
  access_token: string;
  location_id: string;
}

export async function resolveProvider(salonId: string): Promise<BookingProvider> {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Resolve salon → owner user ID
  const { data: salon, error: salonError } = await supabase
    .from('salons')
    .select('owner_user_id')
    .eq('id', salonId)
    .maybeSingle();

  log('PROVIDER_RESOLVE_START', { salonId });

  if (salonError || !salon?.owner_user_id) {
    log('PROVIDER_SALON_NOT_FOUND', { salonId, error: salonError?.message });
    throw new Error('Salon not found');
  }

  log('PROVIDER_SALON_FOUND', { salonId, ownerUserId: salon.owner_user_id });

  // Load provider config from salon_provider_config
  // This table maps salons to their booking provider settings.
  // If no config exists, fall back to merchant_settings (Square legacy path).
  const { data: providerConfig } = await supabase
    .from('salon_provider_config')
    .select('*')
    .eq('salon_id', salonId)
    .maybeSingle();

  let config: ProviderConfig;

  if (providerConfig) {
    log('PROVIDER_CONFIG_FOUND', { salonId, providerType: providerConfig.provider_type });
    config = {
      provider_type: providerConfig.provider_type,
      access_token: providerConfig.access_token,
      location_id: providerConfig.location_id,
    };
  } else {
    log('PROVIDER_NO_SALON_CONFIG', { salonId, ownerUserId: salon.owner_user_id });

    // Try multiple resolution paths for merchant_settings
    let merchant: any = null;

    // Path 1: Direct lookup by salon owner_user_id
    const { data: m1 } = await supabase
      .from('merchant_settings')
      .select('square_access_token')
      .eq('supabase_user_id', salon.owner_user_id)
      .maybeSingle();
    merchant = m1;

    log('PROVIDER_MERCHANT_LOOKUP_OWNER', {
      salonId,
      ownerUserId: salon.owner_user_id,
      found: !!merchant,
      hasSquareAccessToken: !!merchant?.square_access_token,
    });

    // Path 2: If owner_user_id didn't match, try salon_memberships owner/admin
    if (!merchant?.square_access_token) {
      const { data: adminMembership } = await supabase
        .from('salon_memberships')
        .select('user_id')
        .eq('salon_id', salonId)
        .in('role', ['owner', 'admin'])
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (adminMembership?.user_id && adminMembership.user_id !== salon.owner_user_id) {
        log('PROVIDER_TRYING_ADMIN_MEMBERSHIP', { salonId, adminUserId: adminMembership.user_id });
        const { data: m2 } = await supabase
          .from('merchant_settings')
          .select('square_access_token')
          .eq('supabase_user_id', adminMembership.user_id)
          .maybeSingle();
        if (m2?.square_access_token) {
          merchant = m2;
          log('PROVIDER_FOUND_VIA_ADMIN_MEMBERSHIP', { salonId, adminUserId: adminMembership.user_id });
        }
      }
    }

    const accessToken = merchant?.square_access_token ?? null;

    if (!accessToken) {
      log('PROVIDER_NO_CREDENTIALS', { salonId, ownerUserId: salon.owner_user_id });
      throw new Error('No provider credentials configured for this salon');
    }

    // Resolve location_id dynamically from Square (Pro does the same)
    let locationId = '';

    if (!locationId) {
      // Dynamically fetch location from Square (same approach as Blueprint Pro)
      log('PROVIDER_FETCHING_LOCATION', { salonId });
      try {
        const squareBase = (process.env.SQUARE_ENV || 'production').toLowerCase() === 'sandbox'
          ? 'https://connect.squareupsandbox.com'
          : 'https://connect.squareup.com';
        const locRes = await fetch(`${squareBase}/v2/locations`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Square-Version': '2025-10-16',
          },
        });
        if (locRes.ok) {
          const locData = await locRes.json();
          const activeLoc = locData.locations?.find((l: any) => l.status === 'ACTIVE');
          if (activeLoc?.id) {
            locationId = activeLoc.id;
            log('PROVIDER_LOCATION_RESOLVED', { salonId, locationId });
          }
        }
      } catch (e: any) {
        log('PROVIDER_LOCATION_FETCH_FAILED', { salonId, error: e.message });
      }
    }

    if (!locationId) {
      log('PROVIDER_NO_LOCATION', { salonId });
      throw new Error('No provider location configured for this salon');
    }

    config = {
      provider_type: 'square',
      access_token: accessToken,
      location_id: locationId,
    };
  }

  // Instantiate the correct adapter based on provider_type
  switch (config.provider_type) {
    case 'square':
      return new SquareBookingAdapter(config.access_token, config.location_id);
    default:
      throw new Error(`Unsupported booking provider: ${config.provider_type}`);
  }
}
