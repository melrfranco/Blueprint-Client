import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { log } from '../lib/logger.js';

/**
 * POST /api/client/link-plans
 *
 * Self-heal endpoint. Given an authenticated client user:
 *   1. Looks up every invitation they accepted (client_invitations.accepted_user_id = user.id).
 *   2. For each invitation's plan, resolves plan.client_id (internal clients table id).
 *   3. Links every plan with that client_id to this user (sets client_user_id + salon_id)
 *      UNLESS the plan is already claimed by a different user.
 *   4. Returns the resulting plans (via service role, bypassing RLS) plus counts.
 *
 * Idempotent and safe to call repeatedly. Never steals plans from other users.
 *
 * Recovery scenarios handled:
 *   - Users activated before the multi-plan link fix (only 1 plan linked).
 *   - Plans missing salon_id from earlier activations.
 *   - Any case where the activation succeeded but the client's session can't
 *     see the plan via RLS (e.g., uid mismatch from legacy data).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
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
    log('LINK_PLANS_AUTH_INVALID', { error: authError?.message });
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
  const userId = userData.user.id;

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // 1. Find all accepted invitations for this user
  const { data: invitations, error: inviteErr } = await supabaseAdmin
    .from('client_invitations')
    .select('id, plan_id, salon_id')
    .eq('accepted_user_id', userId);

  if (inviteErr) {
    log('LINK_PLANS_INVITE_LOOKUP_FAILED', { userId, error: inviteErr.message });
    return res.status(500).json({ code: 'LOOKUP_FAILED', message: 'Failed to look up invitations' });
  }

  let plansLinked = 0;
  const linkedPlanIds = new Set<string>();

  for (const inv of invitations || []) {
    if (!inv.plan_id) continue;

    // Get the plan's client_id
    const { data: invPlan } = await supabaseAdmin
      .from('plans')
      .select('id, client_id')
      .eq('id', inv.plan_id)
      .maybeSingle();

    if (!invPlan) continue;

    // Link all plans for this client_id that aren't claimed by another user
    if (invPlan.client_id) {
      const { data: linked, error: linkErr } = await supabaseAdmin
        .from('plans')
        .update({ client_user_id: userId, salon_id: inv.salon_id })
        .eq('client_id', invPlan.client_id)
        .or(`client_user_id.is.null,client_user_id.eq.${userId}`)
        .select('id');
      if (linkErr) {
        log('LINK_PLANS_UPDATE_FAILED', { userId, clientId: invPlan.client_id, error: linkErr.message });
      } else if (linked) {
        for (const p of linked) {
          if (!linkedPlanIds.has(p.id)) {
            linkedPlanIds.add(p.id);
            plansLinked += 1;
          }
        }
      }
    } else {
      // Fallback: link only the referenced plan
      const { data: linked, error: linkErr } = await supabaseAdmin
        .from('plans')
        .update({ client_user_id: userId, salon_id: inv.salon_id })
        .eq('id', inv.plan_id)
        .or(`client_user_id.is.null,client_user_id.eq.${userId}`)
        .select('id');
      if (linkErr) {
        log('LINK_PLANS_UPDATE_FAILED', { userId, planId: inv.plan_id, error: linkErr.message });
      } else if (linked) {
        for (const p of linked) {
          if (!linkedPlanIds.has(p.id)) {
            linkedPlanIds.add(p.id);
            plansLinked += 1;
          }
        }
      }
    }
  }

  // 2. Return all plans now linked to this user, via service role (bypasses RLS)
  // This is the source of truth the client app falls back to if RLS-gated SELECTs
  // return empty.
  const { data: plans, error: plansErr } = await supabaseAdmin
    .from('plans')
    .select('id, status, plan_data, created_at, salon_id, client_id, client_user_id')
    .eq('client_user_id', userId);

  if (plansErr) {
    log('LINK_PLANS_FETCH_FAILED', { userId, error: plansErr.message });
    return res.status(500).json({ code: 'FETCH_FAILED', message: 'Failed to fetch plans after linking' });
  }

  log('LINK_PLANS_SUCCESS', {
    userId,
    invitationsConsidered: invitations?.length || 0,
    plansLinked,
    plansOwned: plans?.length || 0,
  });

  return res.status(200).json({
    code: 'OK',
    plans_linked: plansLinked,
    plans_owned: plans?.length || 0,
    plans: plans || [],
  });
}
