import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../services/apiClient';
import type { TimeSlot, AvailabilityResponse } from '../services/apiClient';
import type { Service } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useClientData } from '../contexts/ClientDataContext';
import { CheckCircleIcon } from './icons';

interface BookingFlowProps {
  service: Service;
  planId?: string;
  onClose: () => void;
}

type BookingStep = 'select-date' | 'select-time' | 'confirm' | 'submitting' | 'success' | 'error';

export const BookingFlow: React.FC<BookingFlowProps> = ({ service, planId, onClose }) => {
  const { bookingEligible } = useAuth();
  const [step, setStep] = useState<BookingStep>('select-date');
  const [selectedDate, setSelectedDate] = useState('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If not booking eligible, show blocked state
  if (!bookingEligible) {
    return (
      <div className="bp-page">
        <div className="bp-card bp-card-padding-md">
          <h2 className="bp-card-title mb-4">Booking Unavailable</h2>
          <p className="bp-body-sm text-muted-foreground mb-4">
            Booking is not yet available for your account. Your salon needs to complete their provider setup before you can book appointments.
          </p>
          <p className="bp-caption text-muted-foreground mb-6">
            Please contact your salon for more information.
          </p>
          <button onClick={onClose} className="bp-button bp-button-secondary w-full">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const variationId = service.variation_id;
  if (!variationId) {
    return (
      <div className="bp-page">
        <div className="bp-card bp-card-padding-md">
          <h2 className="bp-card-title mb-4">Service Not Bookable</h2>
          <p className="bp-body-sm text-muted-foreground mb-6">
            This service does not have a booking reference yet. Please contact your salon.
          </p>
          <button onClick={onClose} className="bp-button bp-button-secondary w-full">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const fetchAvailability = useCallback(async () => {
    if (!selectedDate || !variationId) return;

    setLoading(true);
    setError('');

    try {
      const response: AvailabilityResponse = await apiClient.getAvailability({
        serviceVariationId: variationId,
        date: selectedDate,
      });
      setSlots(response.slots || []);
      setStep('select-time');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load availability');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, variationId]);

  const handleDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate) {
      setError('Please select a date');
      return;
    }
    fetchAvailability();
  };

  const handleConfirm = async () => {
    if (!selectedSlot) return;

    setStep('submitting');
    setError('');

    try {
      await apiClient.createBooking({
        serviceVariationId: variationId!,
        startAt: selectedSlot.start_at,
        planId,
      });
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
      setStep('error');
    }
  };

  // ── Success ──
  if (step === 'success') {
    return (
      <div className="bp-page">
        <div className="bp-card bp-card-padding-md text-center">
          <div className="flex justify-center mb-4">
            <CheckCircleIcon className="w-16 h-16 text-primary" />
          </div>
          <h2 className="bp-card-title mb-2">Booking Confirmed</h2>
          <p className="bp-body-sm text-muted-foreground mb-2">
            {service.name}
            {service.variation_name ? ` — ${service.variation_name}` : ''}
          </p>
          <p className="bp-caption text-muted-foreground mb-6">
            {selectedSlot && formatSlotTime(selectedSlot.start_at)}
          </p>
          <button onClick={onClose} className="bp-button bp-button-primary w-full">
            Done
          </button>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (step === 'error') {
    return (
      <div className="bp-page">
        <div className="bp-card bp-card-padding-md">
          <h2 className="bp-card-title mb-4">Booking Failed</h2>
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl mb-4">
              <p className="bp-caption text-destructive">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep('select-date')} className="bp-button bp-button-secondary flex-1">
              Try Again
            </button>
            <button onClick={onClose} className="bp-button bp-button-ghost flex-1">
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirm ──
  if (step === 'confirm') {
    return (
      <div className="bp-page">
        <div className="bp-card bp-card-padding-md">
          <h2 className="bp-card-title mb-4">Confirm Booking</h2>

          <div className="bp-card bp-card-padding-sm mb-4 bg-muted/50">
            <p className="bp-overline mb-1">Service</p>
            <p className="bp-body-sm">
              {service.name}
              {service.variation_name ? ` — ${service.variation_name}` : ''}
            </p>
            {service.duration && (
              <p className="bp-caption text-muted-foreground mt-1">{service.duration} min</p>
            )}
          </div>

          <div className="bp-card bp-card-padding-sm mb-4 bg-muted/50">
            <p className="bp-overline mb-1">Date & Time</p>
            <p className="bp-body-sm">{selectedSlot && formatSlotTime(selectedSlot.start_at)}</p>
          </div>

          <div className="flex gap-3">
            <button onClick={handleConfirm} className="bp-button bp-button-primary flex-1" disabled={step === 'submitting'}>
              Confirm Booking
            </button>
            <button onClick={() => setStep('select-time')} className="bp-button bp-button-ghost flex-1">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Select Time ──
  if (step === 'select-time') {
    return (
      <div className="bp-page">
        <div className="bp-card bp-card-padding-md">
          <h2 className="bp-card-title mb-2">Select Time</h2>
          <p className="bp-caption text-muted-foreground mb-4">
            {service.name} — {formatDate(selectedDate)}
          </p>

          {slots.length === 0 ? (
            <p className="bp-body-sm text-muted-foreground text-center py-8">
              No available times for this date. Try a different date.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-6">
              {slots.map((slot) => (
                <button
                  key={slot.start_at}
                  onClick={() => setSelectedSlot(slot)}
                  className={`bp-button ${
                    selectedSlot?.start_at === slot.start_at
                      ? 'bp-button-primary'
                      : 'bp-button-secondary'
                  }`}
                >
                  {formatTime(slot.start_at)}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('confirm')}
              className="bp-button bp-button-primary flex-1"
              disabled={!selectedSlot}
            >
              Continue
            </button>
            <button onClick={() => setStep('select-date')} className="bp-button bp-button-ghost flex-1">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Select Date (default) ──
  return (
    <div className="bp-page">
      <div className="bp-card bp-card-padding-md">
        <h2 className="bp-card-title mb-2">Book Appointment</h2>
        <p className="bp-caption text-muted-foreground mb-4">
          {service.name}
          {service.variation_name ? ` — ${service.variation_name}` : ''}
          {service.duration ? ` · ${service.duration} min` : ''}
        </p>

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl mb-4">
            <p className="bp-caption text-destructive">{error}</p>
          </div>
        )}

        <form onSubmit={handleDateSubmit}>
          <div className="mb-4">
            <label className="bp-label block mb-2">Select Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bp-field w-full"
              min={getToday()}
              required
              disabled={loading}
            />
          </div>

          <div className="flex gap-3">
            <button type="submit" className="bp-button bp-button-primary flex-1" disabled={loading || !selectedDate}>
              {loading ? 'Loading...' : 'Check Availability'}
            </button>
            <button type="button" onClick={onClose} className="bp-button bp-button-ghost flex-1">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Helpers ──

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatTime(isoStr: string): string {
  try {
    const date = new Date(isoStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}

function formatSlotTime(isoStr: string): string {
  try {
    const date = new Date(isoStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }) + ' at ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoStr;
  }
}
