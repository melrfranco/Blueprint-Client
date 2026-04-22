import React, { useMemo } from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { useAuth } from '../contexts/AuthContext';
import { CalendarIcon, StarIcon, GiftIcon } from './icons';

const ACTIVE_STATUSES = new Set(['ACCEPTED', 'PENDING', 'ACCEPTED_BY_MERCHANT']);

interface ClientDashboardProps {
  onNavigate: (tab: 'appointments' | 'plan') => void;
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
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

export const ClientDashboard: React.FC<ClientDashboardProps> = ({ onNavigate }) => {
  const { plans, bookings, loading } = useClientData();
  const { bookingEligible } = useAuth();

  const upcomingBookings = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((b) => ACTIVE_STATUSES.has(b.status) && new Date(b.start_at).getTime() >= now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  }, [bookings]);

  const nextBooking = upcomingBookings[0];
  const activePlan = plans.find((p) => p.status === 'active') || plans[0];

  const membershipLabel = useMemo(() => {
    if (!activePlan) return 'No active plan';
    switch (activePlan.membershipStatus) {
      case 'active':
        return 'Active Member';
      case 'offered':
        return 'Offer Pending';
      default:
        return 'Not a Member';
    }
  }, [activePlan]);

  const membershipDetail = useMemo(() => {
    if (!activePlan) return 'Your salon will send you a Blueprint plan soon.';
    switch (activePlan.membershipStatus) {
      case 'active':
        return 'Enjoy your membership perks and discounts.';
      case 'offered':
        return 'Your salon has invited you to join their membership. Tap to review.';
      default:
        return 'Ask your salon about membership benefits.';
    }
  }, [activePlan]);

  if (loading) {
    return (
      <div className="bp-page">
        <div className="flex items-center justify-center h-full">
          <p className="bp-body-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const clientName = activePlan?.client?.name?.split(' ')[0];

  return (
    <div className="bp-page">
      <h1 className="bp-page-title">
        {clientName ? `Welcome Back, ${clientName}` : 'Welcome Back'}
      </h1>
      <p className="bp-subtitle mb-6">Your Blueprint Dashboard</p>

      <div className="space-y-6">
        {/* Membership Status Card */}
        <button
          onClick={() => activePlan && onNavigate('plan')}
          disabled={!activePlan}
          className="bp-card bp-card-padding-md w-full text-left active:scale-[0.99] transition-all disabled:opacity-100"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <StarIcon className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="bp-section-title mb-1">{membershipLabel}</h3>
              <p className="bp-body-sm text-muted-foreground">{membershipDetail}</p>
            </div>
          </div>
        </button>

        {/* Next Appointment Card */}
        <button
          onClick={() => onNavigate('appointments')}
          className="bp-card bp-card-padding-md w-full text-left active:scale-[0.99] transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-accent/10 rounded-full">
              <CalendarIcon className="w-6 h-6 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="bp-section-title mb-1">
                {nextBooking ? 'Next Appointment' : 'No Upcoming Appointments'}
              </h3>
              {nextBooking ? (
                <>
                  <p className="bp-body-sm font-semibold truncate">{nextBooking.service_name}</p>
                  <p className="bp-caption text-muted-foreground mt-0.5">
                    {formatDateShort(nextBooking.start_at)} at {formatTime(nextBooking.start_at)}
                  </p>
                  {upcomingBookings.length > 1 && (
                    <p className="bp-caption text-muted-foreground mt-2">
                      +{upcomingBookings.length - 1} more upcoming
                    </p>
                  )}
                </>
              ) : (
                <p className="bp-body-sm text-muted-foreground">
                  Book a service to get started.
                </p>
              )}
            </div>
          </div>
        </button>

        {/* Your Blueprint Plan Card */}
        <button
          onClick={() => activePlan && onNavigate('plan')}
          disabled={!activePlan}
          className="bp-card bp-card-padding-md w-full text-left active:scale-[0.99] transition-all disabled:opacity-100"
        >
          <div className="flex items-start gap-4">
            <div className="p-3 bg-secondary/10 rounded-full">
              <GiftIcon className="w-6 h-6 text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="bp-section-title mb-1">Your Blueprint</h3>
              {activePlan ? (
                <>
                  <p className="bp-body-sm">
                    {activePlan.appointments.length} appointment
                    {activePlan.appointments.length !== 1 ? 's' : ''} planned
                  </p>
                  {activePlan.totalCost > 0 && (
                    <p className="bp-caption text-muted-foreground mt-0.5">
                      Total: ${activePlan.totalCost.toFixed(2)}
                    </p>
                  )}
                </>
              ) : (
                <p className="bp-body-sm text-muted-foreground">
                  No plan yet. Your salon will send you one.
                </p>
              )}
            </div>
          </div>
        </button>

        {/* Booking Not Eligible Warning */}
        {!bookingEligible && (
          <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-2xl">
            <p className="bp-overline mb-1">Booking Unavailable</p>
            <p className="bp-caption text-muted-foreground">
              Your salon has not completed provider setup yet. Booking will be available once they do.
            </p>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <button
            className="bp-button bp-button-primary"
            disabled={!bookingEligible}
            onClick={() => onNavigate('plan')}
          >
            Book Appointment
          </button>
          <button
            className="bp-button bp-button-secondary"
            onClick={() => onNavigate('plan')}
          >
            View My Plan
          </button>
        </div>
      </div>
    </div>
  );
};
