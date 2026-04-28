import React from 'react';
import type { ChartBarData } from './ComparisonBar';
import type { Service, PlanAppointment } from '../types';
import { CalendarIcon, CheckCircleIcon, ClockIcon, XIcon } from './icons';

interface AppointmentDetailModalProps {
  data: ChartBarData;
  bookingEligible: boolean;
  onBook: (service: Service, appt: PlanAppointment, planId: string) => void;
  onReschedule: (service: Service, appt: PlanAppointment, planId: string) => void;
  onClose: () => void;
  planId: string;
}

export const AppointmentDetailModal: React.FC<AppointmentDetailModalProps> = ({
  data,
  bookingEligible,
  onBook,
  onReschedule,
  onClose,
  planId,
}) => {
  const { appointment, isPast, isBooked, isCompleted, plannedDate, actualDate, matchingBookings } = data;
  const services = appointment.services ?? [];

  const primaryService = services[0];
  const bookable: Service | null = primaryService
    ? {
        id: primaryService.id,
        name: primaryService.name,
        variation_name: primaryService.variation_name,
        category: primaryService.category || 'Square Import',
        cost: primaryService.cost,
        duration: primaryService.duration,
        variation_id: primaryService.variation_id || primaryService.id,
        item_id: primaryService.item_id,
      }
    : null;

  const statusLabel = isCompleted ? 'Completed' : isBooked ? 'Booked' : 'Planned';
  const statusColor = isCompleted
    ? 'bg-muted text-muted-foreground'
    : isBooked
      ? 'bg-primary/10 text-primary'
      : 'bg-secondary/10 text-secondary';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isCompleted ? 'bg-muted' : isBooked ? 'bg-primary/10' : 'bg-secondary/10'}`}>
              {isCompleted ? (
                <CheckCircleIcon className="w-5 h-5 text-muted-foreground" />
              ) : (
                <CalendarIcon className={`w-5 h-5 ${isBooked ? 'text-primary' : 'text-secondary'}`} />
              )}
            </div>
            <div>
              <h3 className="bp-card-title">Appointment Details</h3>
              <span className={`bp-caption uppercase tracking-widest px-2 py-0.5 rounded-full ${statusColor}`}>
                {statusLabel}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
            <XIcon className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Date comparison */}
          <div className="space-y-2">
            {plannedDate && (
              <div className="flex items-center gap-3">
                <ClockIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div>
                  <p className="bp-overline">Planned</p>
                  <p className="bp-body-sm font-semibold">{plannedDate}</p>
                </div>
              </div>
            )}
            {actualDate && (
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-4 h-4 text-primary flex-shrink-0" />
                <div>
                  <p className="bp-overline">{isCompleted ? 'Completed' : 'Scheduled'}</p>
                  <p className="bp-body-sm font-semibold">{actualDate}</p>
                </div>
              </div>
            )}
          </div>

          {/* Services list */}
          {services.length > 0 && (
            <div>
              <p className="bp-overline mb-2">Services</p>
              <div className="space-y-2">
                {services.map((svc, i) => (
                  <div key={svc.id || i} className="flex items-center justify-between p-3 bg-muted/50 rounded-2xl">
                    <div>
                      <p className="bp-body-sm font-semibold">
                        {svc.name}
                        {svc.variation_name ? ` — ${svc.variation_name}` : ''}
                      </p>
                      {svc.duration && (
                        <p className="bp-caption text-muted-foreground">{svc.duration} min</p>
                      )}
                    </div>
                    {svc.cost != null && svc.cost > 0 && (
                      <p className="bp-body-sm font-bold">${(svc.cost / 100).toFixed(0)}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Booking info from matching bookings */}
          {matchingBookings.length > 0 && (
            <div>
              <p className="bp-overline mb-2">{isCompleted ? 'Booking Record' : 'Booking Confirmation'}</p>
              {matchingBookings.map((b) => (
                <div key={b.id} className="p-3 bg-muted/50 rounded-2xl space-y-1">
                  <p className="bp-body-sm font-semibold">{b.service_name ?? 'Service'}</p>
                  <p className="bp-caption text-muted-foreground">
                    {new Date(b.start_at).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </p>
                  <span className={`bp-caption uppercase tracking-widest px-2 py-0.5 rounded-full ${
                    b.status === 'PENDING' ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'
                  }`}>
                    {b.status === 'PENDING' ? 'Pending' : 'Confirmed'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Notes */}
          {appointment.notes && (
            <div>
              <p className="bp-overline mb-1">Notes</p>
              <p className="bp-body-sm text-muted-foreground italic">{appointment.notes}</p>
            </div>
          )}
        </div>

        {/* Footer — action button */}
        {!isPast && bookable && (
          <div className="p-5 border-t border-border">
            {isBooked ? (
              <button
                onClick={() => onReschedule(bookable, appointment, planId)}
                disabled={!bookingEligible}
                className="bp-button w-full rounded-full py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60 font-bold"
              >
                Reschedule Appointment
              </button>
            ) : (
              <button
                onClick={() => onBook(bookable, appointment, planId)}
                disabled={!bookingEligible}
                className="bp-button bp-button-primary w-full rounded-full py-3 font-bold disabled:opacity-60"
              >
                Book This Appointment
              </button>
            )}
            {!bookingEligible && (
              <p className="bp-caption text-muted-foreground text-center mt-2">Booking unavailable yet</p>
            )}
          </div>
        )}

        {/* Past appointment — no action, just close */}
        {isPast && (
          <div className="p-5 border-t border-border">
            <button
              onClick={onClose}
              className="bp-button w-full rounded-full py-3 bg-muted text-muted-foreground hover:bg-muted/80 font-bold"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
