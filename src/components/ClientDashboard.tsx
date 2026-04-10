import React from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { CalendarIcon, StarIcon, GiftIcon } from './icons';

export const ClientDashboard: React.FC = () => {
  const { plans, bookings, loading } = useClientData();

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
      <h1 className="bp-page-title">Welcome Back</h1>
      <p className="bp-subtitle mb-6">Your Blueprint Dashboard</p>

      {/* Placeholder for future implementation */}
      <div className="space-y-6">
        {/* Membership Status Card */}
        <div className="bp-card bp-card-padding-md">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-full">
              <StarIcon className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="bp-section-title mb-1">Membership</h3>
              <p className="bp-body-sm text-muted-foreground">
                Your membership status and benefits will appear here
              </p>
            </div>
          </div>
        </div>

        {/* Upcoming Appointments Card */}
        <div className="bp-card bp-card-padding-md">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-accent/10 rounded-full">
              <CalendarIcon className="w-6 h-6 text-accent" />
            </div>
            <div className="flex-1">
              <h3 className="bp-section-title mb-1">Upcoming Appointments</h3>
              <p className="bp-body-sm text-muted-foreground">
                {bookings.length === 0 
                  ? 'No upcoming appointments scheduled'
                  : `You have ${bookings.length} upcoming appointment${bookings.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Your Plan Card */}
        <div className="bp-card bp-card-padding-md">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-secondary/10 rounded-full">
              <GiftIcon className="w-6 h-6 text-secondary" />
            </div>
            <div className="flex-1">
              <h3 className="bp-section-title mb-1">Your Blueprint</h3>
              <p className="bp-body-sm text-muted-foreground">
                {plans.length === 0 
                  ? 'No active plan found'
                  : `View your ${plans.length} plan${plans.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <button className="bp-button bp-button-primary">
            Book Appointment
          </button>
          <button className="bp-button bp-button-secondary">
            View Services
          </button>
        </div>
      </div>
    </div>
  );
};
