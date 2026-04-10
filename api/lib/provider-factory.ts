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
 * See: /api/client/services.ts for the same temporary pattern.
 * ──────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import type { BookingProvider } from './booking-provider';
import { SquareBookingAdapter } from './square-booking-adapter';

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

  if (salonError || !salon?.owner_user_id) {
    throw new Error('Salon not found');
  }

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
    config = {
      provider_type: providerConfig.provider_type,
      access_token: providerConfig.access_token,
      location_id: providerConfig.location_id,
    };
  } else {
    // Fallback: resolve from merchant_settings (existing Square integration)
    const { data: merchant } = await supabase
      .from('merchant_settings')
      .select('square_access_token, settings')
      .eq('supabase_user_id', salon.owner_user_id)
      .maybeSingle();

    const accessToken =
      merchant?.square_access_token ??
      merchant?.settings?.square_access_token ??
      merchant?.settings?.oauth?.access_token ??
      null;

    if (!accessToken) {
      throw new Error('No provider credentials configured for this salon');
    }

    // Resolve location_id from settings or default
    const locationId =
      merchant?.settings?.square_location_id ??
      merchant?.settings?.oauth?.location_id ??
      '';

    if (!locationId) {
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
