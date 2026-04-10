import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { log } from '../lib/logger';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ message: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ── GET: Validate activation token ──
  if (req.method === 'GET') {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ code: 'MISSING_TOKEN', message: 'Missing activation token' });
    }

    // Hash the incoming token to compare against the stored SHA-256 hash
    const hashedToken = createHash('sha256').update(token).digest('hex');

    const { data: invitation, error } = await supabase
      .from('client_invitations')
      .select('invite_name, invite_email, status, activation_expires_at, salon_id, provider_customer_id')
      .eq('activation_token', hashedToken)
      .maybeSingle();

    if (error || !invitation) {
      log('ACTIVATE_TOKEN_INVALID', { tokenPrefix: token.substring(0, 8) });
      return res.status(404).json({ code: 'INVALID_TOKEN', message: 'Invalid activation link' });
    }

    if (invitation.status !== 'pending') {
      return res.status(410).json({ code: 'INVITATION_USED', message: 'This invitation has already been used or revoked' });
    }

    const now = new Date().toISOString();
    if (invitation.activation_expires_at && invitation.activation_expires_at < now) {
      return res.status(410).json({ code: 'TOKEN_EXPIRED', message: 'This activation link has expired' });
    }

    // Get salon name
    const { data: salon } = await supabase
      .from('salons')
      .select('name')
      .eq('id', invitation.salon_id)
      .maybeSingle();

    // Check provider mapping readiness
    // Blueprint-Pro must set provider_customer_id on the invitation before sending it.
    // If missing, the client account will be active but NOT booking-eligible.
    const hasProviderMapping = !!invitation.provider_customer_id;

    return res.status(200).json({
      invite_name: invitation.invite_name,
      invite_email: invitation.invite_email,
      salon_name: salon?.name || 'Your Salon',
      token_valid: true,
      booking_eligible: hasProviderMapping,
    });
  }

  // ── POST: Complete activation ──
  if (req.method === 'POST') {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      return res.status(400).json({ code: 'MISSING_FIELDS', message: 'Missing required fields' });
    }

    if (password.length < 8) {
      return res.status(400).json({ code: 'WEAK_PASSWORD', message: 'Password must be at least 8 characters' });
    }

    // 1. Validate token — hash incoming token to compare against stored SHA-256 hash
    const hashedToken = createHash('sha256').update(token).digest('hex');

    const { data: invitation, error: invError } = await supabase
      .from('client_invitations')
      .select('*')
      .eq('activation_token', hashedToken)
      .eq('status', 'pending')
      .maybeSingle();

    if (invError || !invitation) {
      log('ACTIVATE_POST_TOKEN_INVALID', { email });
      return res.status(404).json({ code: 'INVALID_TOKEN', message: 'Invalid or expired activation link' });
    }

    const now = new Date().toISOString();
    if (invitation.activation_expires_at && invitation.activation_expires_at < now) {
      return res.status(410).json({ code: 'TOKEN_EXPIRED', message: 'This activation link has expired' });
    }

    // 2. Create Supabase auth user with role=client
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'client',
      },
    });

    if (authError || !authData.user) {
      log('ACTIVATE_AUTH_CREATE_FAILED', { email, error: authError?.message });
      return res.status(500).json({ code: 'AUTH_CREATE_FAILED', message: authError?.message || 'Failed to create account' });
    }

    const userId = authData.user.id;

    // 3. Create salon membership
    const { error: membershipError } = await supabase
      .from('salon_memberships')
      .insert({
        user_id: userId,
        salon_id: invitation.salon_id,
        role: 'client',
        status: 'active',
        joined_at: now,
        client_identity: {
          display_name: invitation.invite_name,
          phone: invitation.invite_phone || null,
          email,
        },
      });

    if (membershipError) {
      log('ACTIVATE_MEMBERSHIP_FAILED', { userId, error: membershipError.message });
      // Attempt cleanup
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ code: 'MEMBERSHIP_FAILED', message: 'Failed to set up salon membership' });
    }

    // 4. Link plan to user
    await supabase
      .from('plans')
      .update({ client_user_id: userId })
      .eq('id', invitation.plan_id)
      .is('client_user_id', null);

    // 5. Provider mapping — REQUIRED for booking eligibility
    // Blueprint-Pro must set provider_customer_id on the invitation before sending it.
    // If missing, the account is created as active but NOT booking-eligible.
    // This is an explicit, non-silent state — the client and UI must know.
    let bookingEligible = false;

    if (invitation.provider_customer_id) {
      const { error: mappingError } = await supabase
        .from('client_provider_mappings')
        .insert({
          user_id: userId,
          salon_id: invitation.salon_id,
          provider_type: 'square',
          provider_customer_id: invitation.provider_customer_id,
          synced_at: now,
        });

      if (mappingError) {
        log('ACTIVATE_PROVIDER_MAPPING_FAILED', { userId, error: mappingError.message });
        // Account is created but provider mapping failed — not booking-eligible
        // Do NOT fail the entire activation — the account is still usable for non-booking features
      } else {
        bookingEligible = true;
      }
    }

    // 6. Mark invitation as accepted
    await supabase
      .from('client_invitations')
      .update({
        status: 'accepted',
        accepted_user_id: userId,
        accepted_at: now,
      })
      .eq('id', invitation.id);

    log('ACTIVATE_SUCCESS', { userId, salonId: invitation.salon_id, bookingEligible });

    return res.status(200).json({
      code: 'ACTIVATION_COMPLETE',
      success: true,
      booking_eligible: bookingEligible,
      message: bookingEligible
        ? 'Account activated successfully. You can now book appointments.'
        : 'Account activated, but booking is not yet available. Your salon needs to complete setup on their end.',
    });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
