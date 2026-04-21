
import { createClient } from '@supabase/supabase-js';
import { log } from '../lib/logger.js';

/**
 * POST /api/client/accept-membership
 * Body: { plan_id: string }
 *
 * Flips a plan's membershipStatus from 'offered' → 'active' for the
 * authenticated client. Requires a valid Supabase JWT. Only accepts the
 * request if plan.client_user_id matches the verified user.id.
 */
export default async function handler(req: any, res: any) {
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

  // Verify JWT via GoTrue (anon client)
  const supabaseAnon = createClient(supabaseUrl, anonKey);
  const { data: userData, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !userData?.user) {
    log('ACCEPT_MEMBERSHIP_AUTH_INVALID', { error: authError?.message });
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
  const userId = userData.user.id;

  const { plan_id } = req.body || {};
  if (!plan_id || typeof plan_id !== 'string') {
    return res.status(400).json({ code: 'MISSING_PLAN_ID', message: 'plan_id is required' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Fetch plan and verify ownership
  const { data: plan, error: planError } = await supabaseAdmin
    .from('plans')
    .select('id, client_user_id, plan_data')
    .eq('id', plan_id)
    .maybeSingle();

  if (planError || !plan) {
    log('ACCEPT_MEMBERSHIP_PLAN_NOT_FOUND', { userId, planId: plan_id });
    return res.status(404).json({ code: 'PLAN_NOT_FOUND', message: 'Plan not found' });
  }

  if (plan.client_user_id !== userId) {
    log('ACCEPT_MEMBERSHIP_OWNERSHIP_MISMATCH', { userId, planId: plan_id });
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Plan does not belong to you' });
  }

  const currentBlob = (plan.plan_data as any) || {};
  const currentStatus = currentBlob.membershipStatus;

  if (currentStatus === 'active') {
    return res.status(200).json({
      code: 'ALREADY_ACTIVE',
      message: 'Membership is already active',
      plan_data: currentBlob,
    });
  }

  if (currentStatus !== 'offered') {
    return res.status(409).json({
      code: 'NO_PENDING_OFFER',
      message: 'No membership offer to accept on this plan',
    });
  }

  const nowIso = new Date().toISOString();
  const updatedBlob = {
    ...currentBlob,
    membershipStatus: 'active',
    membershipAcceptedAt: nowIso,
    updatedAt: nowIso,
  };

  const { error: updateError } = await supabaseAdmin
    .from('plans')
    .update({ plan_data: updatedBlob })
    .eq('id', plan_id);

  if (updateError) {
    log('ACCEPT_MEMBERSHIP_UPDATE_FAILED', { userId, planId: plan_id, error: updateError.message });
    return res.status(500).json({ code: 'UPDATE_FAILED', message: 'Failed to accept membership' });
  }

  log('ACCEPT_MEMBERSHIP_SUCCESS', { userId, planId: plan_id });
  return res.status(200).json({
    code: 'MEMBERSHIP_ACTIVE',
    message: 'Membership activated',
    plan_data: updatedBlob,
  });
}
