import React, { useState } from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { useAuth } from '../contexts/AuthContext';
import { CalendarIcon, StarIcon, GiftIcon } from './icons';
import { BookingFlow } from './BookingFlow';
import type { Service } from '../types';

export const ClientDashboard: React.FC = () => {
  const { plans, bookings, services, loading } = useClientData();
  const { bookingEligible } = useAuth();
  const [bookingService, setBookingService] = useState<Service | null>(null);

  // If booking flow is active, show it instead of dashboard
  if (bookingService) {
    return (
      <BookingFlow
        service={bookingService}
        planId={plans[0]?.id}
        onClose={() => setBookingService(null)}
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

  return (
    <div className="bp-page">
      <h1 className="bp-page-title">Welcome Back</h1>
      <p className="bp-subtitle mb-6">Your Blueprint Dashboard</p>

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
            disabled={!bookingEligible || services.length === 0}
            onClick={() => {
              if (services.length > 0) {
                setBookingService(services[0]);
              }
            }}
          >
            Book Appointment
          </button>
          <button className="bp-button bp-button-secondary">
            View Services
          </button>
        </div>

        {/* Services List (bookable) */}
        {services.length > 0 && bookingEligible && (
          <div>
            <h3 className="bp-section-title mb-3">Available Services</h3>
            <div className="space-y-3">
              {services.map((service) => (
                <div key={service.id} className="bp-card bp-card-padding-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="bp-body-sm">
                        {service.name}
                        {service.variation_name ? ` — ${service.variation_name}` : ''}
                      </p>
                      {service.duration && (
                        <p className="bp-caption text-muted-foreground">{service.duration} min</p>
                      )}
                    </div>
                    {service.variation_id && (
                      <button
                        onClick={() => setBookingService(service)}
                        className="bp-button bp-button-primary bp-shape-pill text-xs px-3 py-1"
                      >
                        Book
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
