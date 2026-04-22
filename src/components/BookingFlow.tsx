import React, { useState, useMemo } from 'react';
import { apiClient } from '../services/apiClient';
import type { TimeSlot } from '../services/apiClient';
import type { Service, PlanAppointment } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircleIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon } from './icons';

interface BookingFlowProps {
  service: Service;
  planId?: string;
  appointment?: PlanAppointment;
  onClose: () => void;
}

type BookingStep = 'select-date' | 'select-period' | 'select-slot' | 'confirm';
type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'all';

export const BookingFlow: React.FC<BookingFlowProps> = ({ service, planId, appointment, onClose }) => {
  const { bookingEligible } = useAuth();

  const [bookingStep, setBookingStep] = useState<BookingStep>('select-date');
  const [bookingDate, setBookingDate] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    if (appointment?.date) {
      const d = new Date(appointment.date);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });

  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);

  const [isFetchingSlots, setIsFetchingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const variationId = service.variation_id;

  // If not booking eligible, show blocked state
  if (!bookingEligible) {
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6 backdrop-blur-md">
        <div className="bg-card w-full max-w-sm bp-container-tall shadow-2xl relative overflow-hidden border-4 flex flex-col border-primary">
          <div className="text-primary-foreground p-6 bg-primary text-center">
            <h2 className="text-xl font-bold">Booking Unavailable</h2>
          </div>
          <div className="p-6 text-center">
            <p className="bp-body-sm text-muted-foreground mb-4">
              Booking is not yet available for your account. Your salon needs to complete their provider setup.
            </p>
            <button onClick={onClose} className="w-full py-4 bp-container-compact font-bold bg-muted text-foreground active:scale-95 transition-all">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!variationId) {
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6 backdrop-blur-md">
        <div className="bg-card w-full max-w-sm bp-container-tall shadow-2xl relative overflow-hidden border-4 flex flex-col border-primary">
          <div className="text-primary-foreground p-6 bg-primary text-center">
            <h2 className="text-xl font-bold">Service Not Bookable</h2>
          </div>
          <div className="p-6 text-center">
            <p className="bp-body-sm text-muted-foreground mb-4">
              This service does not have a booking reference yet. Please contact your salon.
            </p>
            <button onClick={onClose} className="w-full py-4 bp-container-compact font-bold bg-muted text-foreground active:scale-95 transition-all">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }


  const fetchSlotsForDate = async (dateStr: string) => {
    setIsFetchingSlots(true);
    setFetchError(null);
    try {
      const response = await apiClient.getAvailability({
        serviceVariationId: variationId!,
        date: dateStr,
      });
      setAvailableSlots(response.slots || []);
      if ((response.slots || []).length === 0) {
        setFetchError('No openings available on this date. Try another day.');
      } else {
        setBookingStep('select-period');
      }
    } catch (e: any) {
      setFetchError(e?.message || 'Failed to fetch time slots');
    } finally {
      setIsFetchingSlots(false);
    }
  };

  const executeBooking = async (slotTime: string) => {
    setIsBooking(true);
    setFetchError(null);
    try {
      await apiClient.createBooking({
        serviceVariationId: variationId,
        startAt: slotTime,
        planId,
      });
      setBookingSuccess(true);
    } catch (e: any) {
      setFetchError(e?.message || 'Booking failed. Please try again.');
    } finally {
      setIsBooking(false);
    }
  };

  // ── Calendar computations ──
  const month = calendarMonth.getMonth();
  const year = calendarMonth.getFullYear();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const calendarBlanks = Array(firstDayOfMonth).fill(null);
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // ── Time period filtering ──
  const availablePeriods = useMemo(() => {
    const periods = { morning: false, afternoon: false, evening: false };
    availableSlots.forEach(s => {
      const hour = new Date(s.start_at).getHours();
      if (hour < 12) periods.morning = true;
      else if (hour < 17) periods.afternoon = true;
      else periods.evening = true;
    });
    return periods;
  }, [availableSlots]);

  const filteredSlots = useMemo(() => {
    return availableSlots.filter(s => {
      const hour = new Date(s.start_at).getHours();
      if (timePeriod === 'morning') return hour < 12;
      if (timePeriod === 'afternoon') return hour >= 12 && hour < 17;
      if (timePeriod === 'evening') return hour >= 17;
      return true;
    });
  }, [availableSlots, timePeriod]);

  const groupedSlots = useMemo(() => {
    const groups: Record<string, TimeSlot[]> = {};
    filteredSlots.forEach(s => {
      const day = new Date(s.start_at).toDateString();
      if (!groups[day]) groups[day] = [];
      groups[day].push(s);
    });
    return groups;
  }, [filteredSlots]);

  const handleBack = () => {
    if (bookingStep === 'confirm') setBookingStep('select-slot');
    else if (bookingStep === 'select-slot') setBookingStep('select-period');
    else if (bookingStep === 'select-period') setBookingStep('select-date');
    else onClose();
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0);

  return (
    <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-6 backdrop-blur-md">
      <div className="bg-card w-full max-w-sm bp-container-tall shadow-2xl relative overflow-hidden border-4 flex flex-col max-h-[90vh] border-primary">

        {/* Header */}
        <div className="text-primary-foreground p-6 relative bg-primary">
          {bookingStep !== 'select-date' && !bookingSuccess && (
            <button onClick={handleBack} className="absolute left-4 top-6">
              <ChevronLeftIcon className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-xl font-bold text-center">Book Appointment</h2>
          <p className="bp-caption text-center uppercase tracking-widest mt-1 text-primary-foreground/80">
            {bookingStep === 'select-date' ? 'Select your appointment date' :
              bookingStep === 'select-period' ? 'What time of day do you prefer?' :
                bookingStep === 'select-slot' ? 'Choose your perfect opening' :
                  'Review & confirm your booking'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          {bookingSuccess ? (
            <div className="py-12 text-center">
              <CheckCircleIcon className="w-20 h-20 text-accent mx-auto mb-4" />
              <p className="text-3xl font-bold text-foreground">BOOKED!</p>
              <p className="text-lg font-bold mt-2 text-foreground">Your appointment is confirmed.</p>
              <button
                onClick={onClose}
                className="mt-6 px-8 py-3 font-bold bp-container-compact bg-primary text-primary-foreground active:scale-95 transition-all"
              >
                DONE
              </button>
            </div>
          ) : fetchError ? (
            <div className="p-6 bg-red-50 text-red-950 bp-container-list border-4 border-red-500 text-center">
              <p className="font-bold uppercase text-xs mb-3 text-red-700">Error</p>
              <p className="text-base font-bold leading-relaxed mb-6">{fetchError}</p>
              <button onClick={onClose} className="w-full py-4 bg-red-700 text-white bp-container-compact font-bold uppercase shadow-xl border-b-4 border-red-900">Close</button>
            </div>
          ) : (
            <>
              {/* ── Select Date (Calendar) ── */}
              {bookingStep === 'select-date' && (
                isFetchingSlots ? (
                  <div className="py-16 text-center">
                    <RefreshIcon className="w-16 h-16 text-accent animate-spin mx-auto mb-6" />
                    <p className="font-bold uppercase tracking-widest text-foreground">Finding Openings...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {appointment?.date && (
                      <div className="text-center p-3 bp-container-list border-2 mb-4 bg-muted border">
                        <p className="bp-caption uppercase tracking-widest text-muted-foreground">Recommended Date</p>
                        <p className="font-bold text-base text-foreground">
                          {new Date(appointment.date).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>
                      </div>
                    )}

                    <div className="bg-card p-3 bp-container-list border-2 border">
                      <div className="flex justify-between items-center mb-3 px-2">
                        <button onClick={() => setCalendarMonth(new Date(year, month - 1, 1))} className="p-2 rounded-full hover:opacity-70 text-muted-foreground">
                          <ChevronLeftIcon className="w-5 h-5" />
                        </button>
                        <h3 className="font-bold text-foreground">
                          {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h3>
                        <button onClick={() => setCalendarMonth(new Date(year, month + 1, 1))} className="p-2 rounded-full hover:opacity-70 text-muted-foreground">
                          <ChevronRightIcon className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-7 text-center text-xs font-bold mb-2 text-muted-foreground">
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {calendarBlanks.map((_, i) => <div key={`blank-${i}`}></div>)}
                        {calendarDays.map(day => {
                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const todayStr = new Date().toISOString().split('T')[0];
                          const isFuture = dateStr >= todayStr;
                          const isSelected = bookingDate === dateStr;

                          return (
                            <button
                              key={day}
                              disabled={!isFuture}
                              onClick={() => { setBookingDate(dateStr); setFetchError(null); }}
                              className={`p-2 rounded-full font-bold text-sm aspect-square transition-all ${
                                isSelected ? 'bg-primary text-primary-foreground scale-110 shadow-lg' :
                                  isFuture ? 'bg-card text-foreground hover:opacity-70' :
                                    'cursor-not-allowed opacity-50 bg-muted text-muted-foreground'
                              }`}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={() => bookingDate && fetchSlotsForDate(bookingDate)}
                      disabled={!bookingDate || isFetchingSlots}
                      className={`w-full font-bold py-5 bp-container-compact shadow-xl transition-all active:scale-95 border-b-8 border-black/20 disabled:opacity-40 ${
                        bookingDate ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isFetchingSlots ? 'Finding openings...' : 'Find Openings'}
                    </button>
                  </div>
                )
              )}

              {/* ── Select Time Period ── */}
              {bookingStep === 'select-period' && (
                <div className="space-y-4">
                  {availablePeriods.morning && (
                    <button onClick={() => { setTimePeriod('morning'); setBookingStep('select-slot'); }} className="w-full p-6 bg-primary/5 border-4 border bp-container-list text-left flex items-center space-x-4 active:scale-95 transition-all">
                      <div className="bg-primary text-primary-foreground p-3 bp-container-list text-xl">{'🌅'}</div>
                      <div>
                        <p className="text-xl font-bold leading-none text-foreground">Morning</p>
                        <p className="bp-caption uppercase tracking-widest text-muted-foreground mt-2">Before 12:00 PM</p>
                      </div>
                    </button>
                  )}
                  {availablePeriods.afternoon && (
                    <button onClick={() => { setTimePeriod('afternoon'); setBookingStep('select-slot'); }} className="w-full p-6 bg-accent/5 border-4 border bp-container-list text-left flex items-center space-x-4 active:scale-95 transition-all">
                      <div className="bg-accent text-accent-foreground p-3 bp-container-list text-xl">{'☀️'}</div>
                      <div>
                        <p className="text-xl font-bold leading-none text-foreground">Afternoon</p>
                        <p className="bp-caption uppercase tracking-widest text-muted-foreground mt-2">12:00 PM - 5:00 PM</p>
                      </div>
                    </button>
                  )}
                  {availablePeriods.evening && (
                    <button onClick={() => { setTimePeriod('evening'); setBookingStep('select-slot'); }} className="w-full p-6 bg-secondary/5 border-4 border bp-container-list text-left flex items-center space-x-4 active:scale-95 transition-all">
                      <div className="bg-secondary text-secondary-foreground p-3 bp-container-list text-xl">{'🌙'}</div>
                      <div>
                        <p className="text-xl font-bold leading-none text-foreground">Evening</p>
                        <p className="bp-caption uppercase tracking-widest text-muted-foreground mt-2">After 5:00 PM</p>
                      </div>
                    </button>
                  )}
                  {!availablePeriods.morning && !availablePeriods.afternoon && !availablePeriods.evening && (
                    <div className="text-center py-10 text-foreground">
                      <p className="font-bold text-lg leading-tight">No openings found<br />for this date.</p>
                      <button onClick={() => setBookingStep('select-date')} className="mt-4 text-accent font-bold underline">Try a different date</button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Select Time Slot ── */}
              {bookingStep === 'select-slot' && (
                <div className="space-y-6">
                  {Object.keys(groupedSlots).length > 0 ? Object.entries(groupedSlots).map(([day, slots]) => (
                    <div key={day}>
                      <h3 className="bp-caption uppercase mb-3 tracking-widest border-b-2 pb-2 text-muted-foreground border">{day}</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {(slots as TimeSlot[]).map((s, i) => (
                          <button key={i}
                            onClick={() => { setSelectedSlotTime(s.start_at); setBookingStep('confirm'); }}
                            disabled={isBooking}
                            className="p-4 border-4 bp-container-list text-center hover:border-accent active:scale-95 transition-all elevated-card border text-foreground"
                          >
                            <span className="font-bold text-base">{new Date(s.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )) : (
                    <div className="text-center py-10 text-foreground">
                      <p className="font-bold text-lg leading-tight">No {timePeriod !== 'all' ? timePeriod : ''} openings<br />found for this date.</p>
                      <button onClick={() => setBookingStep('select-period')} className="mt-4 text-accent font-bold underline">Change preference</button>
                    </div>
                  )}

                  {isFetchingSlots && (
                    <div className="text-center py-8">
                      <RefreshIcon className="w-12 h-12 text-accent animate-spin mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {/* ── Confirm Booking ── */}
              {bookingStep === 'confirm' && selectedSlotTime && (
                <div className="space-y-5">
                  <div className="p-5 bp-container-list border-2 bg-muted border">
                    <p className="bp-overline mb-3">Appointment Date & Time</p>
                    <p className="text-lg font-bold text-foreground">
                      {new Date(selectedSlotTime).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                    <p className="text-2xl bp-stat-value text-accent mt-1">
                      {new Date(selectedSlotTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="p-5 bp-container-list border-2 bg-muted border">
                    <p className="bp-overline mb-3">Service</p>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm text-foreground">{service.name}</p>
                        {service.duration > 0 && (
                          <p className="bp-caption text-muted-foreground">{service.duration} min</p>
                        )}
                      </div>
                      {service.cost > 0 && (
                        <p className="font-bold text-foreground">{formatCurrency(service.cost)}</p>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => selectedSlotTime && executeBooking(selectedSlotTime)}
                    disabled={isBooking}
                    className="w-full font-bold py-5 bp-container-compact shadow-xl flex items-center justify-center space-x-3 active:scale-95 transition-all border-b-8 border-black/20 disabled:opacity-50 bg-accent text-accent-foreground"
                  >
                    {isBooking ? (
                      <RefreshIcon className="w-6 h-6 animate-spin" />
                    ) : (
                      <CalendarIcon className="w-6 h-6" />
                    )}
                    <span>{isBooking ? 'BOOKING...' : 'CONFIRM BOOKING'}</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer cancel */}
        {!bookingSuccess && bookingStep !== 'confirm' && (
          <button onClick={onClose} className="w-full p-6 font-bold uppercase tracking-widest bp-caption border-t-4 hover:opacity-70 transition-colors text-muted-foreground border">
            Cancel Booking
          </button>
        )}
        {bookingStep === 'confirm' && !bookingSuccess && (
          <button onClick={onClose} className="w-full p-6 font-bold uppercase tracking-widest bp-caption border-t-4 hover:opacity-70 transition-colors text-muted-foreground border">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
