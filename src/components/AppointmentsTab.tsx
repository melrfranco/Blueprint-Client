import React, { useMemo } from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { CalendarIcon } from './icons';
import type { BookingRecord } from '../types';

const ACTIVE_STATUSES = new Set(['ACCEPTED', 'PENDING', 'ACCEPTED_BY_MERCHANT']);

function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ACCEPTED':
    case 'ACCEPTED_BY_MERCHANT':
      return 'Confirmed';
    case 'PENDING':
      return 'Pending';
    case 'CANCELLED_BY_CUSTOMER':
    case 'CANCELLED_BY_SELLER':
      return 'Cancelled';
    case 'NO_SHOW':
      return 'No show';
    case 'DECLINED':
      return 'Declined';
    default:
      return status;
  }
}

const BookingCard: React.FC<{ booking: BookingRecord }> = ({ booking }) => {
  const isCancelled = booking.status.startsWith('CANCELLED') || booking.status === 'DECLINED';
  return (
    <div className="bp-card bp-card-padding-sm">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-accent/10 rounded-full flex-shrink-0">
          <CalendarIcon className="w-5 h-5 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="bp-body-sm font-semibold">{booking.service_name}</p>
          <p className="bp-caption text-muted-foreground mt-0.5">
            {formatDateLong(booking.start_at)} at {formatTime(booking.start_at)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`bp-caption uppercase tracking-widest px-2 py-0.5 rounded-full ${
                isCancelled
                  ? 'bg-destructive/10 text-destructive'
                  : booking.status === 'PENDING'
                    ? 'bg-secondary/20 text-secondary-foreground'
                    : 'bg-primary/10 text-primary'
              }`}
            >
              {statusLabel(booking.status)}
            </span>
            {booking.service_duration && (
              <span className="bp-caption text-muted-foreground">{booking.service_duration} min</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const AppointmentsTab: React.FC = () => {
  const { bookings, loading } = useClientData();

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const upcoming: BookingRecord[] = [];
    const past: BookingRecord[] = [];
    for (const b of bookings) {
      const t = new Date(b.start_at).getTime();
      if (t >= now && ACTIVE_STATUSES.has(b.status)) {
        upcoming.push(b);
      } else {
        past.push(b);
      }
    }
    upcoming.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    past.sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime());
    return { upcoming, past };
  }, [bookings]);

  if (loading) {
    return (
      <div className="bp-page">
        <div className="flex items-center justify-center h-full">
          <p className="bp-body-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bp-page">
      <h1 className="bp-page-title">Appointments</h1>
      <p className="bp-subtitle mb-6">Your upcoming and past appointments</p>

      <div className="space-y-6">
        <section>
          <h3 className="bp-section-title mb-3">Upcoming</h3>
          {upcoming.length === 0 ? (
            <div className="bp-card bp-card-padding-md">
              <p className="bp-body-sm text-muted-foreground text-center py-4">
                No upcoming appointments.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="bp-section-title mb-3">Past</h3>
          {past.length === 0 ? (
            <div className="bp-card bp-card-padding-md">
              <p className="bp-body-sm text-muted-foreground text-center py-4">
                No past appointments yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {past.map((b) => (
                <BookingCard key={b.id} booking={b} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
