/**
 * SquareBookingAdapter — implements BookingProvider for Square.
 *
 * All Square API calls happen here, server-side only.
 * The client never sees Square payloads, endpoints, or identifiers.
 *
 * Uses the salon owner's Square access token resolved from merchant_settings.
 */

import type {
  BookingProvider,
  TimeSlot,
  AvailabilityParams,
  RangeAvailabilityParams,
  CreateBookingParams,
  BookingProviderResult,
} from './booking-provider.js';
import { log } from './logger.js';

const SQUARE_VERSION = '2025-10-16';

function getSquareBase(): string {
  const env = (process.env.SQUARE_ENV || 'production').toLowerCase();
  return env === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
}

export class SquareBookingAdapter implements BookingProvider {
  private accessToken: string;
  private locationId: string;

  constructor(accessToken: string, locationId: string) {
    this.accessToken = accessToken;
    this.locationId = locationId;
  }

  async getAvailability(params: AvailabilityParams): Promise<TimeSlot[]> {
    const squareBase = getSquareBase();

    // Match Pro's exact request format
    const startAt = new Date(`${params.date}T00:00:00Z`).toISOString();
    const endAt = new Date(`${params.date}T23:59:59Z`).toISOString();

    const body: any = {
      query: {
        filter: {
          booking_id: '',
          location_id: this.locationId,
          start_at_range: {
            start_at: startAt,
            end_at: endAt,
          },
          segment_filters: [
            {
              service_variation_id: params.service_variation_id,
            },
          ],
        },
      },
    };

    log('SQUARE_AVAILABILITY_REQUEST', {
      locationId: this.locationId,
      startAt,
      endAt,
      serviceVariationId: params.service_variation_id,
    });

    const res = await fetch(`${squareBase}/v2/bookings/availability/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      log('SQUARE_AVAILABILITY_FAILED', { status: res.status, error: errText.substring(0, 500) });
      throw new Error(`Failed to fetch availability from provider (${res.status})`);
    }

    const data = await res.json();
    const availabilities = data.availabilities || [];

    log('SQUARE_AVAILABILITY_OK', { count: availabilities.length });

    return availabilities.map((a: any) => ({
      start_at: a.start_at,
      end_at: a.end_at || a.start_at,
      available: true,
      team_member_id: a.appointment_segments?.[0]?.team_member_id || undefined,
    }));
  }

  async getAvailabilityRange(params: RangeAvailabilityParams): Promise<TimeSlot[]> {
    const squareBase = getSquareBase();

    // Match Pro's exact format: full ISO timestamps + booking_id in filter
    const startAt = new Date(`${params.start_date}T00:00:00Z`).toISOString();
    const endAt = new Date(`${params.end_date}T23:59:59Z`).toISOString();

    const body: any = {
      query: {
        filter: {
          location_id: this.locationId,
          start_at_range: {
            start_at: startAt,
            end_at: endAt,
          },
          segment_filters: [
            {
              service_variation_id: params.service_variation_id,
            },
          ],
        },
      },
    };

    if (params.team_member_id) {
      body.query.filter.segment_filters[0].team_member_id = params.team_member_id;
    }

    log('SQUARE_AVAILABILITY_RANGE_REQUEST', {
      locationId: this.locationId,
      startAt,
      endAt,
      serviceVariationId: params.service_variation_id,
    });

    const res = await fetch(`${squareBase}/v2/bookings/availability/search`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errDetail = errText;
      try {
        const errJson = JSON.parse(errText);
        errDetail = JSON.stringify(errJson.errors || errJson);
      } catch {}
      log('SQUARE_AVAILABILITY_RANGE_FAILED', { status: res.status, error: errDetail });
      throw new Error(`Failed to fetch availability range from provider (${res.status})`);
    }

    const data = await res.json();
    const availabilities = data.availabilities || [];

    log('SQUARE_AVAILABILITY_RANGE_OK', { count: availabilities.length });

    return availabilities.map((a: any) => ({
      start_at: a.start_at,
      end_at: a.end_at || a.start_at,
      available: true,
      team_member_id: a.appointment_segments?.[0]?.team_member_id || undefined,
    }));
  }

  async createBooking(params: CreateBookingParams): Promise<BookingProviderResult> {
    const squareBase = getSquareBase();

    // First, fetch service_variation_version from catalog (Pro does this too)
    let serviceVariationVersion: number | undefined;
    try {
      const catRes = await fetch(
        `${squareBase}/v2/catalog/object/${encodeURIComponent(params.service_variation_id)}`,
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'Square-Version': SQUARE_VERSION,
          },
        }
      );
      if (catRes.ok) {
        const catData = await catRes.json();
        serviceVariationVersion = catData.object?.version;
      }
    } catch {
      // Non-fatal; proceed without version
    }

    const segment: any = {
      service_variation_id: params.service_variation_id,
      team_member_id: params.team_member_id || undefined,
    };
    if (serviceVariationVersion) {
      segment.service_variation_version = serviceVariationVersion;
    }

    const body: any = {
      booking: {
        location_id: this.locationId,
        start_at: params.start_at,
        customer_id: params.customer_id || undefined,
        appointment_segments: [segment],
      },
    };

    log('SQUARE_CREATE_BOOKING_REQUEST', {
      locationId: this.locationId,
      startAt: params.start_at,
      customerId: params.customer_id || 'NONE',
      teamMemberId: params.team_member_id || 'NONE',
      serviceVariationId: params.service_variation_id,
      serviceVariationVersion: serviceVariationVersion || 'NONE',
    });

    const res = await fetch(`${squareBase}/v2/bookings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_VERSION,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      let errDetail = 'Booking creation failed';
      try {
        const errJson = JSON.parse(errText);
        log('SQUARE_CREATE_BOOKING_FAILED', {
          status: res.status,
          errors: errJson.errors,
        });
        errDetail = errJson.errors?.[0]?.detail || errJson.errors?.[0]?.message || errDetail;
      } catch {
        log('SQUARE_CREATE_BOOKING_FAILED', { status: res.status, error: errText.substring(0, 500) });
      }
      throw new Error(errDetail);
    }

    const data = await res.json();
    const booking = data.booking;

    return {
      provider_booking_id: booking.id,
      status: booking.status || 'ACCEPTED',
      start_at: booking.start_at,
      end_at: booking.appointment_segments?.[0]?.end_at || booking.start_at,
    };
  }

  async cancelBooking(providerBookingId: string): Promise<void> {
    const squareBase = getSquareBase();

    const res = await fetch(`${squareBase}/v2/bookings/${encodeURIComponent(providerBookingId)}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Square-Version': SQUARE_VERSION,
      },
    });

    if (!res.ok) {
      const err = await res.json();
      log('SQUARE_CANCEL_BOOKING_FAILED', { status: res.status, providerBookingId, errors: err.errors?.map((e: any) => e.code) });
      throw new Error('Failed to cancel booking with provider');
    }
  }
}
