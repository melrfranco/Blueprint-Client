
import { createClient } from '@supabase/supabase-js';
import { authenticateClient } from '../lib/auth-helpers';
import { resolveProvider } from '../lib/provider-factory';
import { log } from '../lib/logger';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  try {
    const { service_variation_id, team_member_id, start_at, plan_id } = req.body;

    if (!service_variation_id || !start_at) {
      return res.status(400).json({
        code: 'MISSING_FIELDS',
        message: 'Missing required fields: service_variation_id, start_at',
      });
    }

    // ── Safeguard 1: Booking time must be in the future ──
    const startTime = new Date(start_at);
    if (isNaN(startTime.getTime())) {
      return res.status(400).json({
        code: 'INVALID_START_AT',
        message: 'start_at must be a valid ISO 8601 datetime',
      });
    }

    if (startTime.getTime() <= Date.now()) {
      return res.status(400).json({
        code: 'PAST_BOOKING',
        message: 'Booking time must be in the future',
      });
    }

    // ── Safeguard 2: Authenticate client and verify booking_eligible ──
    // authenticateClient throws with status 403 if booking_eligible is false
    const client = await authenticateClient(
      req.headers['authorization'] as string | undefined
    );

    log('BOOKING_ATTEMPT', { userId: client.userId, salonId: client.salonId, serviceVariationId: service_variation_id, startAt: start_at });

    const supabase = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── Safeguard 3: Verify service exists and belongs to this salon ──
    const { data: salon } = await supabase
      .from('salons')
      .select('owner_user_id')
      .eq('id', client.salonId)
      .maybeSingle();

    if (!salon?.owner_user_id) {
      return res.status(404).json({ code: 'SALON_NOT_FOUND', message: 'Salon not found' });
    }

    // Service lookup: square_variation_id lives in metadata jsonb
    const { data: serviceRow } = await supabase
      .from('services')
      .select('id, metadata')
      .eq('source', 'square')
      .contains('metadata', {
        admin_user_id: salon.owner_user_id,
        square_variation_id: service_variation_id,
      })
      .maybeSingle();

    if (!serviceRow) {
      return res.status(404).json({
        code: 'SERVICE_NOT_FOUND',
        message: 'Service not found or does not belong to this salon',
      });
    }

    // ── Safeguard 4: If plan_id provided, verify it belongs to this client ──
    if (plan_id) {
      const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('id, client_user_id')
        .eq('id', plan_id)
        .maybeSingle();

      if (planError || !plan) {
        return res.status(404).json({ code: 'PLAN_NOT_FOUND', message: 'Plan not found' });
      }

      if (plan.client_user_id !== client.userId) {
        log('BOOKING_PLAN_MISMATCH', { userId: client.userId, planId: plan_id, planOwner: plan.client_user_id });
        return res.status(403).json({ code: 'PLAN_MISMATCH', message: 'Plan does not belong to you' });
      }
    }

    // ── Safeguard 5: Prevent double-booking of the same time slot ──
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id, provider_booking_id')
      .eq('client_user_id', client.userId)
      .eq('salon_id', client.salonId)
      .eq('service_variation_id', service_variation_id)
      .eq('start_at', start_at)
      .in('status', ['ACCEPTED', 'PENDING', 'ACCEPTED_BY_MERCHANT'])
      .maybeSingle();

    if (existingBooking) {
      log('BOOKING_DUPLICATE', { userId: client.userId, existingBookingId: existingBooking.id });
      return res.status(409).json({
        code: 'DUPLICATE_BOOKING',
        message: 'You already have a booking for this service at this time',
        booking_id: existingBooking.id,
      });
    }

    // ── Create booking with provider ──
    const provider = await resolveProvider(client.salonId);

    const result = await provider.createBooking({
      salon_id: client.salonId,
      service_variation_id,
      team_member_id,
      start_at,
      customer_id: client.providerCustomerId,
    });

    // ── Persist booking record ──
    const { data: booking, error: dbError } = await supabase
      .from('bookings')
      .insert({
        client_user_id: client.userId,
        salon_id: client.salonId,
        plan_id: plan_id || null,
        provider_booking_id: result.provider_booking_id,
        service_variation_id,
        team_member_id: team_member_id || null,
        status: result.status,
        start_at: result.start_at,
        end_at: result.end_at,
      })
      .select('id')
      .single();

    if (dbError) {
      log('BOOKING_PERSIST_FAILED', { providerBookingId: result.provider_booking_id, error: dbError.message });
      // Booking was created with provider but we failed to record it
      // Return provider result anyway so client isn't stuck
      return res.status(201).json({
        id: null,
        provider_booking_id: result.provider_booking_id,
        status: result.status,
        start_at: result.start_at,
        end_at: result.end_at,
        warning: 'Booking confirmed with provider but local record failed to save',
      });
    }

    return res.status(201).json({
      id: booking.id,
      provider_booking_id: result.provider_booking_id,
      status: result.status,
      start_at: result.start_at,
      end_at: result.end_at,
    });
  } catch (err: any) {
    const status = err.status || 500;
    const code = err.code || (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');
    log('BOOKING_FAILED', { status, code, message: err.message });
    return res.status(status).json({
      code,
      message: err.message || 'Failed to create booking',
    });
  }
}
