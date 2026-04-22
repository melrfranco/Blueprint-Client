import React, { useState } from 'react';
import type { BookingRecord } from '../types';

type TabKey = 'duration' | 'cost';

interface ComparisonChartProps {
  /** The upcoming/next booking to highlight */
  upcoming: BookingRecord | undefined;
  /** Past bookings to compare against */
  past: BookingRecord[];
  /** Max number of past bars to show */
  maxPast?: number;
}

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  upcoming,
  past,
  maxPast = 5,
}) => {
  const [tab, setTab] = useState<TabKey>('duration');

  // Build chart data: past bookings (most recent first, capped) + upcoming
  const recentPast = past
    .filter((b) => !b.status.startsWith('CANCELLED'))
    .sort((a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime())
    .slice(0, maxPast);

  const bars: ChartBar[] = [
    ...recentPast.map((b) => ({
      label: shortName(b.service_name),
      value: tab === 'duration' ? (b.service_duration ?? 0) : (b.service_cost ?? 0),
      isUpcoming: false,
      date: b.start_at,
    })),
  ];

  // Add upcoming bar at the end if it has data
  if (upcoming) {
    const val = tab === 'duration' ? upcoming.service_duration : upcoming.service_cost;
    if (val != null) {
      bars.push({
        label: shortName(upcoming.service_name),
        value: val,
        isUpcoming: true,
        date: upcoming.start_at,
      });
    }
  }

  const maxVal = bars.length > 0 ? Math.max(...bars.map((b) => b.value), 1) : 1;

  // Comparison summary
  const summary = getSummary(upcoming, recentPast, tab);

  return (
    <div className="w-full">
      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setTab('duration')}
          className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
            tab === 'duration'
              ? 'bg-accent text-accent-foreground shadow-[0_2px_8px_rgba(11,53,89,0.15)]'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          Duration
        </button>
        <button
          onClick={() => setTab('cost')}
          className={`flex-1 py-2 rounded-full text-sm font-semibold transition-all ${
            tab === 'cost'
              ? 'bg-primary text-primary-foreground shadow-[0_2px_8px_rgba(11,53,89,0.15)]'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          Cost
        </button>
      </div>

      {/* Bar chart */}
      <div className="space-y-2">
        {bars.map((bar, i) => {
          const pct = (bar.value / maxVal) * 100;
          return (
            <div key={i} className="flex items-center gap-3">
              {/* Label */}
              <div className="w-20 flex-shrink-0 text-right">
                <span className={`bp-caption truncate block ${bar.isUpcoming ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                  {bar.label}
                </span>
              </div>
              {/* Bar */}
              <div className="flex-1 relative h-8 flex items-center">
                <div
                  className={`h-8 rounded-full transition-all duration-500 flex items-center justify-end pr-3 ${
                    bar.isUpcoming
                      ? tab === 'duration' ? 'bg-accent' : 'bg-primary'
                      : tab === 'duration' ? 'bg-accent/25' : 'bg-primary/25'
                  }`}
                  style={{ width: `${Math.max(pct, 8)}%` }}
                >
                  <span className={`bp-caption font-semibold whitespace-nowrap ${
                    bar.isUpcoming ? 'text-white' : tab === 'duration' ? 'text-accent' : 'text-primary'
                  }`}>
                    {tab === 'duration' ? formatDuration(bar.value) : formatCost(bar.value)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {summary && (
        <p className="bp-caption text-muted-foreground mt-3 text-center">{summary}</p>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-full ${tab === 'duration' ? 'bg-accent/25' : 'bg-primary/25'}`} />
          <span className="bp-caption text-muted-foreground">Past</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-full ${tab === 'duration' ? 'bg-accent' : 'bg-primary'}`} />
          <span className="bp-caption text-muted-foreground">Upcoming</span>
        </div>
      </div>
    </div>
  );
};

interface ChartBar {
  label: string;
  value: number;
  isUpcoming: boolean;
  date: string;
}

function shortName(name: string | undefined): string {
  if (!name) return 'Service';
  // Take first word or up to 10 chars
  const first = name.split(' — ')[0].split(' - ')[0];
  return first.length > 10 ? first.slice(0, 9) + '…' : first;
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
