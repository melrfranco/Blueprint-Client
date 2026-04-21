
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/client/plans
 *
 * Returns the plan for the authenticated client user.
 * Uses the service role to bypass RLS.
 *
 * Linkage paths (tried in order):
 *   1. client_invitations.accepted_user_id = userId → plan_id
 *      (Direct: the invitation references the plan created for this client)
 *   2. client_provider_mappings.user_id = userId → provider_customer_id
 *      → clients.external_id = provider_customer_id → plans.client_id
 *      (Square customer ID links the Pro client record to this user)
 *   3. plans.client_user_id = userId (if migration was run)
 *
 * Returns only the most recently created plan (the one the stylist made).
 */
export default async function handler(req: any, res: any) {
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

  const supabaseAnon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !userData?.user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
  const userId = userData.user.id;

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);
  const planIds = new Set<string>();
  const clientIds = new Set<string>();

  // ── Path 1: Via accepted invitations ──
  const { data: invitations, error: invErr } = await supabaseAdmin
    .from('client_invitations')
    .select('id, plan_id, salon_id, status, accepted_user_id')
    .eq('accepted_user_id', userId);

  console.log('[plans] Path 1 — invitations for user:', userId, 'count:', invitations?.length || 0, 'error:', invErr?.message);
  if (invitations) {
    for (const inv of invitations) {
      console.log('[plans]   invitation:', inv.id, 'plan_id:', inv.plan_id, 'salon_id:', inv.salon_id, 'status:', inv.status);
      if (inv.plan_id) planIds.add(inv.plan_id);
    }
  }

  // ── Path 2: Via provider customer mapping → clients.external_id ──
  const { data: mappings, error: mapErr } = await supabaseAdmin
    .from('client_provider_mappings')
    .select('provider_customer_id, salon_id')
    .eq('user_id', userId);

  console.log('[plans] Path 2 — provider mappings:', mappings?.length || 0, 'error:', mapErr?.message);

  if (mappings && mappings.length > 0) {
    const providerIds = mappings.map((m: any) => m.provider_customer_id);
    console.log('[plans]   provider_customer_ids:', providerIds);
    const { data: clientRows, error: clientErr } = await supabaseAdmin
      .from('clients')
      .select('id, external_id, name')
      .in('external_id', providerIds);

    console.log('[plans]   clients found:', clientRows?.length || 0, 'error:', clientErr?.message);
    for (const c of clientRows || []) {
      console.log('[plans]     client:', c.id, 'external_id:', c.external_id, 'name:', c.name);
      clientIds.add(c.id);
    }
  }

  console.log('[plans] Resolved planIds:', Array.from(planIds), 'clientIds:', Array.from(clientIds));

  // ── Fetch plans by collected IDs ──
  let plans: any[] = [];
  const queryErrors: string[] = [];

  // By plan IDs from invitations
  if (planIds.size > 0) {
    const { data: invPlans, error: invPlansErr } = await supabaseAdmin
      .from('plans')
      .select('*')
      .in('id', Array.from(planIds))
      .order('created_at', { ascending: false });
    if (invPlansErr) {
      console.log('[plans] invPlans query error:', invPlansErr.message);
      queryErrors.push('invPlans: ' + invPlansErr.message);
    }
    if (invPlans) plans.push(...invPlans);
  }

  // By client IDs from provider mapping
  if (clientIds.size > 0) {
    const { data: clientPlans, error: clientPlansErr } = await supabaseAdmin
      .from('plans')
      .select('*')
      .in('client_id', Array.from(clientIds))
      .order('created_at', { ascending: false });
    if (clientPlansErr) {
      console.log('[plans] clientPlans query error:', clientPlansErr.message);
      queryErrors.push('clientPlans: ' + clientPlansErr.message);
    }
    if (clientPlans) {
      for (const p of clientPlans) {
        if (!planIds.has(p.id)) plans.push(p);
      }
    }
  }

  // ── Path 3: Direct client_user_id (if column exists) ──
  if (plans.length === 0) {
    const { data: directPlans, error: directErr } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('client_user_id', userId)
      .order('created_at', { ascending: false });
    if (directErr) {
      queryErrors.push('direct: ' + directErr.message);
    }
    if (!directErr && directPlans) {
      plans = directPlans;
    }
  }

  // Return only the most recent plan (the one the stylist made for this client)
  const latestPlan = plans.length > 0 ? plans[0] : null;

  return res.status(200).json({
    code: 'OK',
    plan: latestPlan,
    _debug: {
      userId,
      invitationsFound: invitations?.length || 0,
      planIdsFromInvitations: Array.from(planIds),
      mappingsFound: mappings?.length || 0,
      clientIdsFromMappings: Array.from(clientIds),
      plansFetched: plans.length,
      queryErrors,
    },
  });
}
