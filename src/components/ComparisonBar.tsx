import React, { useState, useMemo } from 'react';
import type { BookingRecord, PlanAppointment } from '../types';

type TabKey = 'duration' | 'cost';

// A single segment within a stacked bar
interface Segment {
  name: string;
  value: number; // duration (min) or cost (cents) depending on tab
}

// A single visit (one stacked bar)
interface Visit {
  label: string;
  segments: Segment[];
  isUpcoming: boolean;
}

interface ComparisonChartProps {
  /** Planned appointments from the Blueprint (up to 10) */
  planAppointments: PlanAppointment[];
  /** Past actual bookings for comparison (last 3 visits) */
  pastBookings: BookingRecord[];
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

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  planAppointments,
  pastBookings,
}) => {
  const [tab, setTab] = useState<TabKey>('duration');

  // --- Build visits ---

  // Past visits: group bookings by date, take last 3
  const pastVisits: Visit[] = useMemo(() => {
    const filtered = pastBookings
      .filter((b) => !b.status.startsWith('CANCELLED'))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const groups = new Map<string, BookingRecord[]>();
    for (const b of filtered) {
      const key = dateKey(b.start_at);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    }

    return Array.from(groups.entries())
      .slice(-3)
      .map(([, bks]) => ({
        label: shortDate(bks[0].start_at),
        segments: bks.map((b) => ({
          name: b.service_name ?? 'Service',
          value: 0, // filled per-tab below
        })),
        isUpcoming: false,
      }));
  }, [pastBookings]);

  // Upcoming visits: from plan appointments (max 10)
  const upcomingVisits: Visit[] = useMemo(() =>
    planAppointments.slice(0, 10).map((appt) => ({
      label: appt.date instanceof Date
        ? shortDate(appt.date.toISOString())
        : shortDate(String(appt.date)),
      segments: (appt.services ?? []).map((svc) => ({
        name: svc.variation_name ? `${svc.name} — ${svc.variation_name}` : svc.name,
        value: 0,
      })),
      isUpcoming: true,
    })),
    [planAppointments]
  );

  // --- Fill segment values based on active tab ---
  const visitsFilled: (Visit & { total: number })[] = useMemo(() => {
    if (tab === 'duration') {
      // Past: use service_duration from bookings
      const pastFilled = pastVisits.map((v, vi) => {
        const filtered = pastBookings
          .filter((b) => !b.status.startsWith('CANCELLED'))
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        const groups = new Map<string, BookingRecord[]>();
        for (const b of filtered) {
          const key = dateKey(b.start_at);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(b);
        }
        const entries = Array.from(groups.entries()).slice(-3);
        const bks = entries[vi]?.[1] ?? [];
        const segments = bks.map((b) => ({
          name: b.service_name ?? 'Service',
          value: b.service_duration ?? 0,
        }));
        return { ...v, segments, total: segments.reduce((s, seg) => s + seg.value, 0) };
      });

      // Upcoming: use duration from plan services
      const upcomingFilled = upcomingVisits.map((v, vi) => {
        const appt = planAppointments[vi];
        const segments = (appt.services ?? []).map((svc) => ({
          name: svc.variation_name ? `${svc.name} — ${svc.variation_name}` : svc.name,
          value: svc.duration ?? 0,
        }));
        return { ...v, segments, total: segments.reduce((s, seg) => s + seg.value, 0) };
      });

      return [...pastFilled, ...upcomingFilled];
    } else {
      // Cost tab
      const pastFilled = pastVisits.map((v, vi) => {
        const filtered = pastBookings
          .filter((b) => !b.status.startsWith('CANCELLED'))
          .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
        const groups = new Map<string, BookingRecord[]>();
        for (const b of filtered) {
          const key = dateKey(b.start_at);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(b);
        }
        const entries = Array.from(groups.entries()).slice(-3);
        const bks = entries[vi]?.[1] ?? [];
        const segments = bks.map((b) => ({
          name: b.service_name ?? 'Service',
          value: b.service_cost ?? 0,
        }));
        return { ...v, segments, total: segments.reduce((s, seg) => s + seg.value, 0) };
      });

      const upcomingFilled = upcomingVisits.map((v, vi) => {
        const appt = planAppointments[vi];
        const segments = (appt.services ?? []).map((svc) => ({
          name: svc.variation_name ? `${svc.name} — ${svc.variation_name}` : svc.name,
          value: svc.cost ?? 0,
        }));
        return { ...v, segments, total: segments.reduce((s, seg) => s + seg.value, 0) };
      });

      return [...pastFilled, ...upcomingFilled];
    }
  }, [pastVisits, upcomingVisits, pastBookings, planAppointments, tab]);

  // --- Color map: consistent per service name ---
  const allServiceNames = useMemo(() => {
    const names = new Set<string>();
    for (const v of visitsFilled) {
      for (const seg of v.segments) {
        names.add(seg.name);
      }
    }
    return Array.from(names);
  }, [visitsFilled]);

  const serviceColorMap = useMemo(() =>
    new Map(allServiceNames.map((name, i) => [name, SEGMENT_COLORS[i % SEGMENT_COLORS.length]])),
    [allServiceNames]
  );

  // Max total for Y scale
  const maxTotal = Math.max(...visitsFilled.map((v) => v.total), 1);

  // Summary: compare average upcoming vs average past
  const summary = useMemo(() => {
    const pastV = visitsFilled.filter((v) => !v.isUpcoming);
    const upcomingV = visitsFilled.filter((v) => v.isUpcoming);
    if (pastV.length === 0 || upcomingV.length === 0) return null;
    const avgPast = pastV.reduce((s, v) => s + v.total, 0) / pastV.length;
    const avgUpcoming = upcomingV.reduce((s, v) => s + v.total, 0) / upcomingV.length;
    if (avgPast === 0) return null;
    const ratio = avgUpcoming / avgPast;
    if (tab === 'duration') {
      if (ratio < 0.4) return 'Your plan visits are much shorter than your past visits';
      if (ratio < 0.65) return 'Your plan visits are about half as long as your past visits';
      if (ratio < 0.85) return 'Your plan visits are a bit shorter than your past visits';
      if (ratio <= 1.15) return 'Your plan visits are about the same length as your past visits';
      if (ratio <= 1.5) return 'Your plan visits are a bit longer than your past visits';
      if (ratio <= 2.0) return 'Your plan visits are about twice as long as your past visits';
      return 'Your plan visits are much longer than your past visits';
    } else {
      if (ratio < 0.4) return 'Your plan visits cost much less than your past visits';
      if (ratio < 0.65) return 'Your plan visits cost about half as much as your past visits';
      if (ratio < 0.85) return 'Your plan visits cost a bit less than your past visits';
      if (ratio <= 1.15) return 'Your plan visits cost about the same as your past visits';
      if (ratio <= 1.5) return 'Your plan visits cost a bit more than your past visits';
      if (ratio <= 2.0) return 'Your plan visits cost about twice as much as your past visits';
      return 'Your plan visits cost much more than your past visits';
    }
  }, [visitsFilled, tab]);

  if (visitsFilled.length === 0) return null;

  // Divider index: where past ends and upcoming begins
  const dividerIndex = pastVisits.length;

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
      <div className="flex items-end gap-1.5 h-48 px-1 overflow-x-auto">
        {visitsFilled.map((visit, vi) => {
          const totalHeightPct = maxTotal > 0 ? (visit.total / maxTotal) * 100 : 0;
          const isDivider = vi === dividerIndex && dividerIndex > 0;
          return (
            <React.Fragment key={vi}>
              {/* Divider line between past and upcoming */}
              {isDivider && (
                <div className="flex-shrink-0 w-px self-stretch bg-border mx-0.5" />
              )}
              <div className="flex-shrink-0 flex flex-col items-center h-full justify-end" style={{ width: `${100 / Math.max(visitsFilled.length, 1)}%`, minWidth: '32px', maxWidth: '56px' }}>
                {/* Total label above bar */}
                <span className={`text-[9px] font-bold mb-0.5 whitespace-nowrap ${visit.isUpcoming ? 'text-primary' : 'text-muted-foreground'}`}>
                  {tab === 'duration' ? formatDuration(visit.total) : formatCost(visit.total)}
                </span>

                {/* Stacked bar */}
                <div
                  className="w-full relative group rounded-t-xl overflow-hidden transition-all duration-500"
                  style={{
                    height: `${Math.max(totalHeightPct, 4)}%`,
                    opacity: visit.isUpcoming ? 1 : 0.5,
                    outline: visit.isUpcoming ? '2px solid var(--primary)' : '1px solid var(--border)',
                    outlineOffset: '-1px',
                  }}
                >
                  {visit.segments.map((seg, si) => {
                    const segPct = visit.total > 0 ? (seg.value / visit.total) * 100 : 0;
                    const color = serviceColorMap.get(seg.name) ?? SEGMENT_COLORS[0];
                    return (
                      <div
                        key={si}
                        className="w-full transition-all duration-300 relative"
                        style={{
                          height: `${segPct}%`,
                          backgroundColor: color,
                          borderTop: si > 0 ? '1px solid rgba(255,255,255,0.3)' : undefined,
                        }}
                      >
                        {/* Segment label if tall enough */}
                        {segPct > 20 && (
                          <span className="absolute inset-0 flex items-center justify-center text-white text-[7px] font-bold leading-none pointer-events-none drop-shadow-sm">
                            {seg.name.split(' — ')[0].slice(0, 7)}
                          </span>
                        )}
                        {/* Tooltip */}
                        <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 whitespace-nowrap bg-foreground/90 text-background text-[8px] font-semibold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                          {seg.name}: {tab === 'duration' ? formatDuration(seg.value) : formatCost(seg.value)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Visit label */}
                <span
                  className={`text-[8px] font-semibold uppercase tracking-wide mt-1 text-center leading-tight truncate w-full ${
                    visit.isUpcoming ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {visit.label}
                </span>
              </div>
            </React.Fragment>
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
        {allServiceNames.map((name) => (
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
