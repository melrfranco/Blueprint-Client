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
} from './booking-provider';
import { log } from './logger';

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

    // Square Booking API: Search availability
    // https://developer.squareup.com/reference/square/booking-api/search-availability
    const body: any = {
      query: {
        filter: {
          start_at_range: {
            start_at: `${params.date}T00:00:00Z`,
            end_at: `${params.date}T23:59:59Z`,
          },
          location_id: this.locationId,
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
      const err = await res.json();
      log('SQUARE_AVAILABILITY_FAILED', { status: res.status, errors: err.errors?.map((e: any) => e.code) });
      throw new Error('Failed to fetch availability from provider');
    }

    const data = await res.json();
    const availabilities = data.availabilities || [];

    return availabilities
      .filter((a: any) => a.status === 'AVAILABLE')
      .map((a: any) => ({
        start_at: a.start_at,
        end_at: a.end_at || a.start_at, // Square may not always return end_at
        available: true,
      }));
  }

  async getAvailabilityRange(params: RangeAvailabilityParams): Promise<TimeSlot[]> {
    const squareBase = getSquareBase();

    const body: any = {
      query: {
        filter: {
          start_at_range: {
            start_at: `${params.start_date}T00:00:00Z`,
            end_at: `${params.end_date}T23:59:59Z`,
          },
          location_id: this.locationId,
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
      const err = await res.json();
      log('SQUARE_AVAILABILITY_RANGE_FAILED', { status: res.status, errors: err.errors?.map((e: any) => e.code) });
      throw new Error('Failed to fetch availability range from provider');
    }

    const data = await res.json();
    const availabilities = data.availabilities || [];

    return availabilities
      .filter((a: any) => a.status === 'AVAILABLE')
      .map((a: any) => ({
        start_at: a.start_at,
        end_at: a.end_at || a.start_at,
        available: true,
      }));
  }

  async createBooking(params: CreateBookingParams): Promise<BookingProviderResult> {
    const squareBase = getSquareBase();

    // Square Booking API: Create booking
    // https://developer.squareup.com/reference/square/booking-api/create-booking
    const body: any = {
      booking: {
        location_id: this.locationId,
        start_at: params.start_at,
        customer_id: params.customer_id, // resolved server-side from client_provider_mappings
        appointment_segments: [
          {
            service_variation_id: params.service_variation_id,
          },
        ],
      },
    };

    if (params.team_member_id) {
      body.booking.appointment_segments[0].team_member_id = params.team_member_id;
    }

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
      const err = await res.json();
      log('SQUARE_CREATE_BOOKING_FAILED', { status: res.status, errors: err.errors?.map((e: any) => e.code) });
      const message = err.errors?.[0]?.detail || err.errors?.[0]?.message || 'Booking creation failed';
      throw new Error(message);
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
