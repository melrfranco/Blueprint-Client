/**
 * Client services endpoint — returns services for a given salon.
 *
 * TEMPORARY ASSUMPTION — SERVICE RESOLUTION VIA owner_user_id
 * ──────────────────────────────────────────────────────────────
 * The services table is currently scoped by supabase_user_id (the admin
 * who synced them from Square). This endpoint resolves salon_id →
 * owner_user_id → queries services by that user ID.
 *
 * This is a TEMPORARY shortcut. The services table should eventually be
 * scoped by salon_id directly, or by a provider-scoped key, so that:
 *   - No owner_user_id resolution step is needed
 *   - Services survive ownership changes
 *   - The query model is salon-scoped, not user-scoped
 *
 * Do NOT extend this owner_user_id pattern to new code.
 * See: /api/lib/provider-factory.ts for the same temporary pattern.
 * ──────────────────────────────────────────────────────────────
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ message: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { salon_id } = req.query;

  if (!salon_id || typeof salon_id !== 'string') {
    return res.status(400).json({ message: 'Missing salon_id' });
  }

  // TEMPORARY: Resolve salon → owner (admin) user_id
  // See module-level docstring for why this is temporary.
  const { data: salon, error: salonError } = await supabase
    .from('salons')
    .select('owner_user_id')
    .eq('id', salon_id)
    .maybeSingle();

  if (salonError || !salon?.owner_user_id) {
    return res.status(404).json({ message: 'Salon not found' });
  }

  // TEMPORARY: Fetch services using the resolved admin user ID
  // Future: query by salon_id directly once services table is salon-scoped
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('*')
    .eq('supabase_user_id', salon.owner_user_id);

  if (servicesError) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to load services' });
  }

  // Map provider-specific field names to provider-agnostic names
  // The client never sees square_variation_id or square_item_id
  const sanitized = (services || []).map((s: any) => ({
    ...s,
    variation_id: s.square_variation_id || null,
    item_id: s.square_item_id || null,
    square_variation_id: undefined,
    square_item_id: undefined,
  }));

  return res.status(200).json(sanitized);
}
