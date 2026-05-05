import React, { useMemo, useState } from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { useAuth } from '../contexts/AuthContext';
import { BookingFlow } from './BookingFlow';
import { CalendarIcon, GiftIcon } from './icons';
import { ComparisonChart } from './ComparisonBar';
import type { ChartBarData } from './ComparisonBar';
import { AppointmentDetailModal } from './AppointmentDetailModal';
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
  const [selectedBar, setSelectedBar] = useState<ChartBarData | null>(null);

  const activePlan = useMemo(
    () => plans.find((p) => p.status === 'active') || plans[0],
    [plans],
  );

  // Map bookings by variation_id, service name, AND plan_id for robust matching
  const bookedVariationIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.status.startsWith('CANCELLED')) {
        if (b.service_variation_id) s.add(b.service_variation_id);
      }
    }
    return s;
  }, [bookings]);

  // Also track booked service names for fuzzy matching
  const bookedServiceNames = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.status.startsWith('CANCELLED') && b.service_name) {
        s.add(b.service_name.toLowerCase());
      }
    }
    return s;
  }, [bookings]);

  // Track which plan appointment indices are booked (by plan_id + date proximity)
  const bookedPlanAppointmentIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of bookings) {
      if (!b.status.startsWith('CANCELLED') && b.plan_id === activePlan?.id) {
        // Match by plan_id — any active booking for this plan counts
        const bookingDate = new Date(b.start_at);
        for (const appt of activePlan?.appointments || []) {
          const apptDate = appt.date instanceof Date ? appt.date : new Date(appt.date);
          // Within 7 days of planned date = match
          if (Math.abs(bookingDate.getTime() - apptDate.getTime()) <= 7 * 86400000) {
            s.add(appt.id);
          }
        }
      }
    }
    return s;
  }, [bookings, activePlan]);

  // Past bookings for comparison chart
  const pastBookings = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => new Date(b.start_at).getTime() < now && !b.status.startsWith('CANCELLED'));
  }, [bookings]);

  // Future bookings (for showing booked appointments in the list)
  const futureBookings = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => !b.status.startsWith('CANCELLED') && new Date(b.start_at).getTime() >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [bookings]);

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
                    <p className="bp-overline">Avg Per Visit</p>
                    <p className="bp-stat-value text-lg">
                      ${(activePlan.totalCost / Math.max(activePlan.appointments.length, 1)).toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="bp-overline">Avg Monthly</p>
                    <p className="bp-stat-value text-lg">
                      ${(activePlan.totalCost / 12).toFixed(0)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Comparison chart */}
        {activePlan.appointments.length > 0 && (
          <div className="bp-card-padding-md">
            <h3 className="bp-section-title mb-3">Your Plan at a Glance</h3>
            <ComparisonChart
              planAppointments={activePlan.appointments}
              pastBookings={pastBookings}
              allBookings={bookings}
              onBarClick={(data: ChartBarData) => {
                setSelectedBar(data);
              }}
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
                const svcName = primaryService?.variation_name
                  ? `${primaryService.name} — ${primaryService.variation_name}`
                  : primaryService?.name;
                const alreadyBooked = bookedPlanAppointmentIds.has(appt.id)
                  || (variationId ? bookedVariationIds.has(variationId) : false)
                  || (svcName ? bookedServiceNames.has(svcName.toLowerCase()) : false);

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
                            <>
                              <span className="bp-caption uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                                Booked
                              </span>
                              {bookingEligible && (
                                <button
                                  onClick={() => {
                                    if (bookable) {
                                      setBookingService(bookable);
                                      setBookingAppointment(appt);
                                      setPlanIdForBooking(activePlan.id);
                                    }
                                  }}
                                  className="bp-button rounded-full text-xs px-3 py-1 bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                >
                                  Reschedule
                                </button>
                              )}
                            </>
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

        {/* Booked upcoming appointments */}
        {futureBookings.length > 0 && (
          <section>
            <h3 className="bp-section-title mb-3">Upcoming Booked</h3>
            <div className="space-y-3">
              {futureBookings.map((b) => (
                <div key={b.id} className="bp-card bp-card-padding-sm">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary/10 rounded-full flex-shrink-0">
                      <CalendarIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="bp-body-sm font-semibold">{b.service_name ?? 'Service'}</p>
                      <p className="bp-caption text-muted-foreground mt-0.5">
                        {formatDateLong(new Date(b.start_at))}
                      </p>
                      <div className="mt-2">
                        <span className="bp-caption uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {b.status === 'PENDING' ? 'Pending' : 'Confirmed'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Appointment detail modal from chart bar click */}
      {selectedBar && activePlan && (
        <AppointmentDetailModal
          data={selectedBar}
          bookingEligible={bookingEligible}
          planId={activePlan.id}
          onBook={(service, appt, planId) => {
            setSelectedBar(null);
            setBookingService(service);
            setBookingAppointment(appt);
            setPlanIdForBooking(planId);
          }}
          onReschedule={(service, appt, planId) => {
            setSelectedBar(null);
            setBookingService(service);
            setBookingAppointment(appt);
            setPlanIdForBooking(planId);
          }}
          onClose={() => setSelectedBar(null)}
        />
      )}
    </div>
  );
};
