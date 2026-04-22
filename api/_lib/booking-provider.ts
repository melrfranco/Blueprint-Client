/**
 * BookingProvider interface — provider-agnostic contract for booking operations.
 *
 * All provider-specific logic lives behind this interface.
 * Blueprint-Client never knows which provider is being used;
 * it only calls /api/bookings/* endpoints which delegate to the resolved adapter.
 */

export interface TimeSlot {
  start_at: string;   // ISO 8601
  end_at: string;     // ISO 8601
  available: boolean;
}

export interface AvailabilityParams {
  salon_id: string;
  service_variation_id: string;
  team_member_id?: string;
  date: string;       // YYYY-MM-DD
}

export interface RangeAvailabilityParams {
  salon_id: string;
  service_variation_id: string;
  team_member_id?: string;
  start_date: string;  // YYYY-MM-DD
  end_date: string;    // YYYY-MM-DD
}

export interface CreateBookingParams {
  salon_id: string;
  service_variation_id: string;
  team_member_id?: string;
  start_at: string;   // ISO 8601
  customer_id: string; // provider-side customer ID (resolved server-side only)
}

export interface BookingProviderResult {
  provider_booking_id: string;
  status: string;
  start_at: string;
  end_at: string;
}

export interface BookingProvider {
  /** Fetch available time slots for a service on a given date */
  getAvailability(params: AvailabilityParams): Promise<TimeSlot[]>;

  /** Fetch available time slots across a date range in a single call */
  getAvailabilityRange(params: RangeAvailabilityParams): Promise<TimeSlot[]>;

  /** Create a booking with the provider */
  createBooking(params: CreateBookingParams): Promise<BookingProviderResult>;

  /** Cancel a booking with the provider */
  cancelBooking(providerBookingId: string): Promise<void>;
}
