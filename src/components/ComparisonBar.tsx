import React, { useState, useMemo } from 'react';
import type { BookingRecord } from '../types';

type TabKey = 'duration' | 'cost';

interface ComparisonChartProps {
  upcoming: BookingRecord | undefined;
  past: BookingRecord[];
  maxPast?: number;
}

// Blueprint on-brand palette for stacked segments
const SEGMENT_COLORS = [
  '#0B3559', // deep navy
  '#5B9EC9', // sky blue
  '#2B7A9E', // teal
  '#8FB8D4', // light blue
  '#1A5276', // dark teal
  '#A9CCE3', // pale blue
  '#3A7CA5', // medium blue
  '#6BA3C0', // soft steel
];

interface Visit {
  label: string;
  dateKey: string;
  bookings: BookingRecord[];
  isUpcoming: boolean;
  total: number; // total value for current tab
}

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  upcoming,
  past,
  maxPast = 6,
}) => {
  const [tab, setTab] = useState<TabKey>('duration');

  // Collect all bookings for color assignment
  const allBookings = useMemo(() => [
    ...past.filter((b) => !b.status.startsWith('CANCELLED')),
    ...(upcoming ? [upcoming] : []),
  ], [past, upcoming]);

  // Assign each unique service name a consistent color
  const serviceNames = useMemo(() =>
    Array.from(new Set(allBookings.map((b) => b.service_name ?? 'Service'))),
    [allBookings]
  );
  const serviceColorMap = useMemo(() =>
    new Map(serviceNames.map((name, i) => [name, SEGMENT_COLORS[i % SEGMENT_COLORS.length]])),
    [serviceNames]
  );

  // Group past bookings by date key (YYYY-MM-DD)
  const visits: Visit[] = useMemo(() => {
    const pastFiltered = past
      .filter((b) => !b.status.startsWith('CANCELLED'))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    // Group by date
    const groups = new Map<string, BookingRecord[]>();
    for (const b of pastFiltered) {
      const key = dateKey(b.start_at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    }

    // Take most recent N visits
    const entries = Array.from(groups.entries()).slice(-maxPast);

    const result: Visit[] = entries.map(([key, bks]) => ({
      label: shortDate(bks[0].start_at),
      dateKey: key,
      bookings: bks,
      isUpcoming: false,
      total: 0, // computed below after tab
    }));

    // Add upcoming as last visit
    if (upcoming) {
      result.push({
        label: 'Next',
        dateKey: 'upcoming',
        bookings: [upcoming],
        isUpcoming: true,
        total: 0,
      });
    }

    return result;
  }, [past, upcoming, maxPast]);

  // Compute totals per visit for current tab
  const visitsWithTotals = useMemo(() =>
    visits.map((v) => ({
      ...v,
      total: v.bookings.reduce((sum, b) => {
        const val = tab === 'duration' ? (b.service_duration ?? 0) : (b.service_cost ?? 0);
        return sum + val;
      }, 0),
    })),
    [visits, tab]
  );

  // Max total across all visits for scale
  const maxTotal = Math.max(...visitsWithTotals.map((v) => v.total), 1);

  // Summary comparison
  const summary = useMemo(() => {
    const upcomingVisit = visitsWithTotals.find((v) => v.isUpcoming);
    const pastVisits = visitsWithTotals.filter((v) => !v.isUpcoming);
    if (!upcomingVisit || pastVisits.length === 0) return null;
    const avg = pastVisits.reduce((s, v) => s + v.total, 0) / pastVisits.length;
    if (avg === 0) return null;
    const ratio = upcomingVisit.total / avg;
    if (tab === 'duration') {
      if (ratio < 0.4) return 'Much shorter than your average visit';
      if (ratio < 0.65) return 'About half as long as your average visit';
      if (ratio < 0.85) return 'A bit shorter than your average visit';
      if (ratio <= 1.15) return 'About the same length as your average visit';
      if (ratio <= 1.5) return 'A bit longer than your average visit';
      if (ratio <= 2.0) return 'About twice as long as your average visit';
      return 'Much longer than your average visit';
    } else {
      if (ratio < 0.4) return 'Much less than your average visit';
      if (ratio < 0.65) return 'About half the cost of your average visit';
      if (ratio < 0.85) return 'A bit less than your average visit';
      if (ratio <= 1.15) return 'About the same cost as your average visit';
      if (ratio <= 1.5) return 'A bit more than your average visit';
      if (ratio <= 2.0) return 'About twice the cost of your average visit';
      return 'Much more than your average visit';
    }
  }, [visitsWithTotals, tab]);

  if (visitsWithTotals.length === 0) return null;

  return (
    <div className="w-full select-none">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-muted rounded-full">
        <button
          onClick={() => setTab('duration')}
          className={`flex-1 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
            tab === 'duration'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground'
          }`}
        >
          Time
        </button>
        <button
          onClick={() => setTab('cost')}
          className={`flex-1 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
            tab === 'cost'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground'
          }`}
        >
          Cost
        </button>
      </div>

      {/* Chart area */}
      <div className="flex items-end gap-2 h-48 px-1">
        {visitsWithTotals.map((visit, vi) => {
          const totalHeightPct = maxTotal > 0 ? (visit.total / maxTotal) * 100 : 0;
          return (
            <div key={vi} className="flex-1 flex flex-col items-center h-full justify-end min-w-0">
              {/* Total label above bar */}
              <span className={`text-[10px] font-bold mb-0.5 ${visit.isUpcoming ? 'text-primary' : 'text-muted-foreground'}`}>
                {tab === 'duration' ? formatDuration(visit.total) : formatCost(visit.total)}
              </span>

              {/* Stacked bar */}
              <div
                className="w-full max-w-[52px] relative group rounded-t-xl overflow-hidden transition-all duration-500"
                style={{
                  height: `${Math.max(totalHeightPct, 4)}%`,
                  opacity: visit.isUpcoming ? 1 : 0.55,
                  outline: visit.isUpcoming ? '2px solid var(--primary)' : '1px solid var(--border)',
                  outlineOffset: '-1px',
                }}
              >
                {visit.bookings.map((b, bi) => {
                  const val = tab === 'duration' ? (b.service_duration ?? 0) : (b.service_cost ?? 0);
                  const segPct = visit.total > 0 ? (val / visit.total) * 100 : 0;
                  const color = serviceColorMap.get(b.service_name ?? 'Service') ?? SEGMENT_COLORS[0];
                  return (
                    <div
                      key={bi}
                      className="w-full transition-all duration-300 relative"
                      style={{
                        height: `${segPct}%`,
                        backgroundColor: color,
                        borderTop: bi > 0 ? '1px solid rgba(255,255,255,0.25)' : undefined,
                      }}
                    >
                      {/* Segment label (visible if segment is tall enough) */}
                      {segPct > 18 && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-[8px] font-bold leading-none pointer-events-none drop-shadow-sm">
                          {b.service_name?.split(' — ')[0].split(' - ')[0].slice(0, 8)}
                        </span>
                      )}
                      {/* Segment tooltip */}
                      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-foreground/90 text-background text-[8px] font-semibold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        {b.service_name}: {tab === 'duration' ? formatDuration(val) : formatCost(val)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Visit label */}
              <span
                className={`text-[9px] font-semibold uppercase tracking-wide mt-1 text-center leading-tight truncate w-full ${
                  visit.isUpcoming ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {visit.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Y-axis hint */}
      <div className="flex justify-between mt-0.5 px-1">
        <span className="text-[9px] text-muted-foreground">0</span>
        <span className="text-[9px] text-muted-foreground">
          {tab === 'duration' ? formatDuration(maxTotal) : formatCost(maxTotal)}
        </span>
      </div>

      {/* Summary */}
      {summary && (
        <p className="bp-caption text-muted-foreground mt-3 text-center italic">{summary}</p>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 justify-center">
        {serviceNames.map((name) => (
          <div key={name} className="flex items-center gap-1.5">
            <div
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: serviceColorMap.get(name) }}
            />
            <span className="bp-caption text-muted-foreground">{name}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

function dateKey(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Visit';
  }
}

export function formatDuration(minutes: number | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export function formatCost(cents: number | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(0)}`;
}
