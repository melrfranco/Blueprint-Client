import React, { useMemo, useState } from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../services/apiClient';
import { BookingFlow } from './BookingFlow';
import { CalendarIcon, StarIcon, GiftIcon, CheckCircleIcon } from './icons';
import { ComparisonChart } from './ComparisonBar';
import type { Service, PlanAppointment } from '../types';

function formatDateLong(date: Date): string {
  try {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return String(date);
  }
}

export const PlanView: React.FC = () => {
  const { plans, bookings, loading, refresh } = useClientData();
  const { bookingEligible } = useAuth();
  const [bookingService, setBookingService] = useState<Service | null>(null);
  const [bookingAppointment, setBookingAppointment] = useState<PlanAppointment | undefined>(undefined);
  const [planIdForBooking, setPlanIdForBooking] = useState<string | undefined>(undefined);
  const [acceptingMembership, setAcceptingMembership] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const activePlan = useMemo(
    () => plans.find((p) => p.status === 'active') || plans[0],
    [plans],
  );

  // Map completed/upcoming bookings by service_variation_id for lookup
  const bookedVariationIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (b.plan_id === activePlan?.id && !b.status.startsWith('CANCELLED')) {
        s.add(b.service_variation_id);
      }
    }
    return s;
  }, [bookings, activePlan?.id]);

  // Past bookings for comparison chart
  const pastBookings = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => new Date(b.start_at).getTime() < now && !b.status.startsWith('CANCELLED'));
  }, [bookings]);

  const handleAcceptMembership = async () => {
    if (!activePlan) return;
    setAcceptingMembership(true);
    setAcceptError(null);
    try {
      await apiClient.acceptMembership(activePlan.id);
      await refresh();
    } catch (err) {
      setAcceptError(err instanceof Error ? err.message : 'Failed to accept membership');
    } finally {
      setAcceptingMembership(false);
    }
  };

  if (bookingService) {
    return (
      <BookingFlow
        service={bookingService}
        planId={planIdForBooking}
        appointment={bookingAppointment}
        onClose={() => {
          setBookingService(null);
          setBookingAppointment(undefined);
          setPlanIdForBooking(undefined);
          refresh();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="bp-page">
        <div className="flex items-center justify-center h-full">
          <p className="bp-body-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!activePlan) {
    return (
      <div className="bp-page">
        <h1 className="bp-page-title">Your Blueprint</h1>
        <p className="bp-subtitle mb-6">Your personalized salon plan</p>
        <div className="bp-card bp-card-padding-md">
          <p className="bp-body-sm text-muted-foreground text-center py-8">
            You don't have a Blueprint plan yet. Your salon will send you one.
          </p>
        </div>
      </div>
    );
  }

  const membershipIsOffered = activePlan.membershipStatus === 'offered';
  const membershipIsActive = activePlan.membershipStatus === 'active';

  return (
    <div className="bp-page">
      <h1 className="bp-page-title">Your Blueprint</h1>
      <p className="bp-subtitle mb-6">Your personalized salon plan</p>

      <div className="space-y-6">
        {/* Plan header / summary */}
        <div className="bp-card bp-card-padding-md">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-secondary/10 rounded-full">
              <GiftIcon className="w-6 h-6 text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="bp-section-title mb-1">Plan Summary</h3>
              <p className="bp-body-sm">
                {activePlan.appointments.length} appointment
                {activePlan.appointments.length !== 1 ? 's' : ''} this year
              </p>
              {activePlan.totalCost > 0 && (
                <div className="flex items-center gap-4 mt-1">
                  <div>
                    <p className="bp-overline">Per Visit</p>
                    <p className="bp-stat-value text-lg">
                      ${(activePlan.totalCost / Math.max(activePlan.appointments.length, 1)).toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="bp-overline">Monthly</p>
                    <p className="bp-stat-value text-lg">
                      ${(activePlan.totalCost / 12).toFixed(0)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Membership status — compact banner */}
        {membershipIsActive && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 rounded-full">
            <CheckCircleIcon className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="bp-body-sm font-semibold text-primary">Active Member</span>
          </div>
        )}
        {membershipIsOffered && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-secondary/10 rounded-full">
            <StarIcon className="w-5 h-5 text-secondary flex-shrink-0" />
            <span className="bp-body-sm font-semibold text-secondary flex-1">Membership offer pending</span>
            <div className="flex items-center gap-2">
              {acceptError && (
                <span className="bp-caption text-destructive">{acceptError}</span>
              )}
              <button
                onClick={handleAcceptMembership}
                disabled={acceptingMembership}
                className="bp-button bp-button-primary rounded-full text-xs px-3 py-1 disabled:opacity-60"
              >
                {acceptingMembership ? '...' : 'Accept'}
              </button>
              <button
                onClick={() => {/* TODO: decline/postpone */}}
                className="bp-caption text-secondary hover:text-foreground transition-colors underline"
              >
                Later
              </button>
            </div>
          </div>
        )}

        {/* Comparison chart: plan appointments vs past visits */}
        {activePlan.appointments.length > 0 && (
          <div className="bp-card bp-card-padding-md">
            <h3 className="bp-section-title mb-3">Your Plan at a Glance</h3>
            <ComparisonChart
              planAppointments={activePlan.appointments}
              pastBookings={pastBookings}
            />
          </div>
        )}

        {/* Appointments in plan */}
        <section>
          <h3 className="bp-section-title mb-3">Planned Appointments</h3>
          {activePlan.appointments.length === 0 ? (
            <div className="bp-card bp-card-padding-md">
              <p className="bp-body-sm text-muted-foreground text-center py-4">
                No appointments in this plan yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activePlan.appointments
                .filter((appt) => {
                  const d = appt.date instanceof Date ? appt.date : new Date(appt.date);
                  return d.getTime() >= Date.now();
                })
                .map((appt: PlanAppointment, idx) => {
                const primaryService = appt.services?.[0];
                // Build a Service object directly from plan data — no catalog needed
                // In plan data, service.id IS the Square variation ID
                const planVariationId = primaryService?.variation_id || primaryService?.id;
                const bookable: Service | null = primaryService ? {
                  id: primaryService.id,
                  name: primaryService.name,
                  variation_name: primaryService.variation_name,
                  category: primaryService.category || 'Square Import',
                  cost: primaryService.cost,
                  duration: primaryService.duration,
                  variation_id: planVariationId,
                  item_id: primaryService.item_id,
                } : null;
                const variationId = planVariationId;
                const alreadyBooked = variationId ? bookedVariationIds.has(variationId) : false;

                return (
                  <div key={appt.id || idx} className="bp-card bp-card-padding-sm">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-accent/10 rounded-full flex-shrink-0">
                        <CalendarIcon className="w-5 h-5 text-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="bp-caption text-muted-foreground uppercase tracking-widest">
                          Appointment {idx + 1}
                        </p>
                        <p className="bp-body-sm font-semibold mt-0.5">
                          {formatDateLong(appt.date)}
                        </p>
                        {appt.services?.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {appt.services.map((svc, sIdx) => (
                              <li
                                key={svc.id || sIdx}
                                className="bp-caption text-muted-foreground"
                              >
                                • {svc.name}
                                {svc.variation_name ? ` — ${svc.variation_name}` : ''}
                                {svc.duration ? ` (${svc.duration} min)` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                        {appt.notes && (
                          <p className="bp-caption text-muted-foreground italic mt-2">
                            {appt.notes}
                          </p>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          {alreadyBooked ? (
                            <span className="bp-caption uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                              Booked
                            </span>
                          ) : bookable && bookingEligible ? (
                            <button
                              onClick={() => {
                                setBookingService(bookable);
                                setBookingAppointment(appt);
                                setPlanIdForBooking(activePlan.id);
                              }}
                              className="bp-button bp-button-primary rounded-full text-xs px-3 py-1"
                            >
                              Book This
                            </button>
                          ) : (
                            <span className="bp-caption text-muted-foreground">
                              {!bookingEligible ? 'Booking unavailable yet' : 'Service not bookable'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
