import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/client/plans
 *
 * Returns all plans for the authenticated client user.
 * Uses the service role to bypass RLS and resolves plans via
 * the `clients` table (client.supabase_user_id = auth.uid()),
 * which is how the Pro app links plans to users.
 *
 * This endpoint exists because:
 *   - The `plans` table may not have a `client_user_id` column
 *     (the migration to add it may not have been run).
 *   - The Pro app writes `client_id` (FK to `clients` table),
 *     not `client_user_id` (FK to `auth.users`).
 *   - RLS policy referencing a non-existent column causes 400 errors.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return res.status(500).json({ code: 'CONFIG_ERROR', message: 'Server configuration error' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing authorization header' });
  }
  const token = authHeader.slice(7);

  // Verify JWT
  const supabaseAnon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !userData?.user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
  const userId = userData.user.id;

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Strategy 1: Try client_user_id column (if it exists after migration)
  // Strategy 2: Fall back to resolving via clients.supabase_user_id → plans.client_id
  let plans: any[] = [];

  // Try direct client_user_id lookup first
  const { data: directPlans, error: directErr } = await supabaseAdmin
    .from('plans')
    .select('id, status, plan_data, created_at, salon_id, client_id, client_user_id')
    .eq('client_user_id', userId);

  if (!directErr && directPlans && directPlans.length > 0) {
    plans = directPlans;
  } else {
    // Column may not exist or no rows — resolve via clients table
    // Find the client row(s) for this auth user
    const { data: clientRows } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('supabase_user_id', userId);

    if (clientRows && clientRows.length > 0) {
      const clientIds = clientRows.map((c: any) => c.id);
      // Fetch all plans for these client_ids
      const { data: clientPlans, error: plansErr } = await supabaseAdmin
        .from('plans')
        .select('id, status, plan_data, created_at, salon_id, client_id, client_user_id')
        .in('client_id', clientIds);

      if (plansErr) {
        return res.status(500).json({ code: 'FETCH_FAILED', message: 'Failed to fetch plans' });
      }
      plans = clientPlans || [];
    }
  }

  return res.status(200).json({
    code: 'OK',
    plans,
  });
}
