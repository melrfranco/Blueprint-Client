import React, { useState } from 'react';
import type { BookingRecord } from '../types';

type TabKey = 'duration' | 'cost';

interface ComparisonChartProps {
  upcoming: BookingRecord | undefined;
  past: BookingRecord[];
  maxPast?: number;
}

// Blueprint palette — distinct, on-brand colors for each service slot
const SERVICE_COLORS = [
  '#0B3559', // deep navy (primary)
  '#5B9EC9', // sky blue (accent)
  '#2B7A9E', // teal blue
  '#8FB8D4', // light blue
  '#1A5276', // dark teal
  '#A9CCE3', // pale blue
];

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  upcoming,
  past,
  maxPast = 5,
}) => {
  const [tab, setTab] = useState<TabKey>('duration');

  // Collect all unique service names across all bookings to assign colors consistently
  const allBookings = [
    ...past.filter((b) => !b.status.startsWith('CANCELLED')),
    ...(upcoming ? [upcoming] : []),
  ];

  const serviceNames = Array.from(new Set(allBookings.map((b) => b.service_name ?? 'Service')));
  const serviceColorMap = new Map(serviceNames.map((name, i) => [name, SERVICE_COLORS[i % SERVICE_COLORS.length]]));

  // Build visit groups: past (oldest→newest) + upcoming at the end
  const recentPast = past
    .filter((b) => !b.status.startsWith('CANCELLED'))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    .slice(-maxPast);

  interface Visit {
    label: string;
    bookings: BookingRecord[];
    isUpcoming: boolean;
  }

  // Group by date (each past booking is its own visit for now)
  const visits: Visit[] = [
    ...recentPast.map((b, i) => ({
      label: shortDate(b.start_at, i, recentPast.length),
      bookings: [b],
      isUpcoming: false,
    })),
    ...(upcoming ? [{ label: 'Next', bookings: [upcoming], isUpcoming: true }] : []),
  ];

  // Max value across all bars for scale
  const allVals = allBookings.map((b) =>
    tab === 'duration' ? (b.service_duration ?? 0) : (b.service_cost ?? 0)
  );
  const maxVal = Math.max(...allVals, 1);

  // Comparison summary
  const summary = getSummary(upcoming, recentPast, tab);

  if (visits.length === 0) return null;

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
          Duration
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
      <div className="flex items-end gap-3 h-36 px-1">
        {visits.map((visit, vi) => (
          <div key={vi} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
            {/* Bars for each service in this visit */}
            <div className="flex items-end gap-0.5 w-full justify-center h-full">
              {visit.bookings.map((b, bi) => {
                const val = tab === 'duration' ? (b.service_duration ?? 0) : (b.service_cost ?? 0);
                const heightPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                const color = serviceColorMap.get(b.service_name ?? 'Service') ?? SERVICE_COLORS[0];
                const opacity = visit.isUpcoming ? '1' : '0.55';
                return (
                  <div
                    key={bi}
                    className="flex-1 rounded-t-lg transition-all duration-500 relative group"
                    style={{
                      height: `${Math.max(heightPct, 4)}%`,
                      backgroundColor: color,
                      opacity,
                      maxWidth: '28px',
                    }}
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap bg-foreground text-background text-[9px] font-semibold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                      {tab === 'duration' ? formatDuration(val) : formatCost(val)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Visit label */}
            <span
              className={`text-[9px] font-semibold uppercase tracking-wide mt-1 text-center leading-tight ${
                visit.isUpcoming ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {visit.label}
            </span>
          </div>
        ))}
      </div>

      {/* Y-axis hint */}
      <div className="flex justify-between mt-1 px-1">
        <span className="text-[9px] text-muted-foreground">0</span>
        <span className="text-[9px] text-muted-foreground">
          {tab === 'duration' ? formatDuration(maxVal) : formatCost(maxVal)}
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

function shortDate(iso: string, index: number, total: number): string {
  try {
    const d = new Date(iso);
    // Show month/day for the last few; for older ones just show index
    if (total <= 5 || index >= total - 4) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return `Visit ${index + 1}`;
  } catch {
    return `Visit ${index + 1}`;
  }
}

function getSummary(
  upcoming: BookingRecord | undefined,
  past: BookingRecord[],
  tab: TabKey,
): string | null {
  if (!upcoming || past.length === 0) return null;
  const currentVal = tab === 'duration' ? upcoming.service_duration : upcoming.service_cost;
  if (currentVal == null) return null;
  const pastVals = past
    .map((b) => (tab === 'duration' ? b.service_duration : b.service_cost))
    .filter((v): v is number => v != null);
  if (pastVals.length === 0) return null;
  const avg = pastVals.reduce((a, b) => a + b, 0) / pastVals.length;
  const ratio = currentVal / avg;
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
}

export function formatDuration(minutes: number | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatCost(cents: number | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(0)}`;
}
