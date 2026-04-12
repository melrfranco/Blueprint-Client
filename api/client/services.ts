/**
 * Client services endpoint — returns services for a given salon.
 *
 * SERVICE RESOLUTION VIA metadata->admin_user_id
 * ──────────────────────────────────────────────
 * The services table has no supabase_user_id column. Square-specific
 * identifiers (variation_id, item_id) are stored in the metadata jsonb
 * column. Services are scoped by metadata->>'admin_user_id' matching
 * the salon's owner_user_id.
 *
 * FUTURE: Add a salon_id column to services so this join isn't needed.
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

  // Resolve salon → owner_user_id
  const { data: salon, error: salonError } = await supabase
    .from('salons')
    .select('owner_user_id')
    .eq('id', salon_id)
    .maybeSingle();

  if (salonError || !salon?.owner_user_id) {
    return res.status(404).json({ message: 'Salon not found' });
  }

  // Fetch services where metadata->>'admin_user_id' matches the salon owner
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('*')
    .eq('source', 'square')
    .contains('metadata', { admin_user_id: salon.owner_user_id });

  if (servicesError) {
    return res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Failed to load services' });
  }

  // Map metadata fields to provider-agnostic names for the client
  const sanitized = (services || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    cost: s.cost,
    duration: s.duration,
    category: s.category,
    source: s.source,
    variation_id: s.metadata?.square_variation_id || null,
    item_id: s.metadata?.square_item_id || null,
    variation_name: s.metadata?.variation_name || null,
  }));

  return res.status(200).json(sanitized);
}
