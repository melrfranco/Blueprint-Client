import React, { useMemo, useState } from 'react';
import { useClientData } from '../contexts/ClientDataContext';
import { useAuth } from '../contexts/AuthContext';
import { BookingFlow } from './BookingFlow';
import type { Service } from '../types';

export const ServicesTab: React.FC = () => {
  const { services, plans, loading } = useClientData();
  const { bookingEligible } = useAuth();
  const [bookingService, setBookingService] = useState<Service | null>(null);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Service[]>();
    for (const s of services) {
      const cat = s.category || 'Other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(s);
    }
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [services]);

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
      <h1 className="bp-page-title">Services</h1>
      <p className="bp-subtitle mb-6">Browse and book services</p>

      {!bookingEligible && (
        <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-2xl mb-4">
          <p className="bp-overline mb-1">Booking Unavailable</p>
          <p className="bp-caption text-muted-foreground">
            Your salon has not completed provider setup yet. You can browse services, but booking is not yet available.
          </p>
        </div>
      )}

      {services.length === 0 ? (
        <div className="bp-card bp-card-padding-md">
          <p className="bp-body-sm text-muted-foreground text-center py-8">
            No services available yet. Ask your salon to sync their Square catalog.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <h3 className="bp-section-title mb-3">{category}</h3>
              <div className="space-y-3">
                {items.map((service) => {
                  const canBook = bookingEligible && !!service.variation_id;
                  return (
                    <div key={service.id} className="bp-card bp-card-padding-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="bp-body-sm font-semibold truncate">
                            {service.name}
                            {service.variation_name ? ` — ${service.variation_name}` : ''}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {service.duration > 0 && (
                              <span className="bp-caption text-muted-foreground">
                                {service.duration} min
                              </span>
                            )}
                            {service.cost > 0 && (
                              <span className="bp-caption text-muted-foreground">
                                ${service.cost.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => canBook && setBookingService(service)}
                          disabled={!canBook}
                          className="bp-button bp-button-primary bp-shape-pill text-xs px-3 py-1 flex-shrink-0 disabled:opacity-50"
                        >
                          Book
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
