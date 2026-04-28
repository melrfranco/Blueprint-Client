import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { BookingRecord, PlanAppointment } from '../types';

type TabKey = 'duration' | 'cost';

/** Enriched data passed back on bar click */
export interface ChartBarData {
  appointment: PlanAppointment;
  isPast: boolean;
  isBooked: boolean;
  isCompleted: boolean;
  /** For past: actual booking date. For future booked: scheduled date */
  actualDate?: string;
  /** The planned date from the plan */
  plannedDate?: string;
  /** Matching bookings for this bar */
  matchingBookings: BookingRecord[];
}

interface ComparisonChartProps {
  planAppointments: PlanAppointment[];
  pastBookings: BookingRecord[];
  /** All bookings (used to mark which upcoming bars are already booked) */
  allBookings?: BookingRecord[];
  /** Called when user clicks any bar with real data */
  onBarClick?: (data: ChartBarData) => void;
}

// Service chart colors matching Pro app CSS variables
const SVC_COLORS = [
  'var(--svc-color-1)',
  'var(--svc-color-2)',
  'var(--svc-color-3)',
  'var(--svc-color-4)',
  'var(--svc-color-5)',
  'var(--svc-color-6)',
  'var(--svc-color-7)',
  'var(--svc-color-8)',
  'var(--svc-color-9)',
  'var(--svc-color-10)',
];

export const ComparisonChart: React.FC<ComparisonChartProps> = ({
  planAppointments,
  pastBookings,
  allBookings = [],
  onBarClick,
}) => {
  const [tab, setTab] = useState<TabKey>('duration');

  // Build recharts data: each object is a visit with service names as keys
  const { chartData, serviceNames, serviceColorMap } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    console.log('[ComparisonChart] Input data:', {
      planAppointments: planAppointments.length,
      pastBookings: pastBookings.length,
      allBookings: allBookings.length,
      samplePastBooking: pastBookings[0] ? {
        id: pastBookings[0].id,
        service_variation_id: pastBookings[0].service_variation_id,
        service_name: pastBookings[0].service_name,
        service_duration: pastBookings[0].service_duration,
        service_cost: pastBookings[0].service_cost,
        start_at: pastBookings[0].start_at,
        status: pastBookings[0].status,
      } : 'NONE',
      samplePlanAppt: planAppointments[0] ? {
        id: planAppointments[0].id,
        date: planAppointments[0].date,
        services: planAppointments[0].services?.map(s => ({
          id: s.id,
          name: s.name,
          variation_id: s.variation_id,
          variation_name: s.variation_name,
        })),
      } : 'NONE',
      sampleAllBooking: allBookings[0] ? {
        id: allBookings[0].id,
        service_variation_id: allBookings[0].service_variation_id,
        service_name: allBookings[0].service_name,
        start_at: allBookings[0].start_at,
        status: allBookings[0].status,
      } : 'NONE',
    });

    // Past: group bookings by date, take last 3
    const filtered = pastBookings
      .filter((b) => !b.status.startsWith('CANCELLED'))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const groups = new Map<string, BookingRecord[]>();
    for (const b of filtered) {
      const key = new Date(b.start_at).toISOString().slice(0, 10);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(b);
    }

    const pastEntries = Array.from(groups.entries()).slice(-3);

    // Upcoming: future plan appointments only, then pad to 10
    const futureAppts = planAppointments
      .filter((a) => {
        const d = a.date instanceof Date ? a.date : new Date(a.date);
        return d.getTime() >= today.getTime();
      })
      .slice(0, 10);
    while (futureAppts.length < 10) {
      futureAppts.push({
        id: `placeholder-${futureAppts.length}`,
        date: new Date(today.getTime() + (futureAppts.length + 1) * 30 * 86400000),
        services: [],
        notes: '',
      } as PlanAppointment);
    }

    // Build lookup maps from all bookings
    const bookedVarIds = new Set<string>();
    const bookedNames = new Set<string>();
    const bookingByVarId = new Map<string, BookingRecord>();
    const bookingByName = new Map<string, BookingRecord>();
    const nonCancelledBookings = allBookings.filter((b) => !b.status.startsWith('CANCELLED'));
    for (const b of allBookings) {
      if (!b.status.startsWith('CANCELLED')) {
        if (b.service_variation_id) {
          bookedVarIds.add(b.service_variation_id);
          bookingByVarId.set(b.service_variation_id, b);
        }
        if (b.service_name) {
          const key = b.service_name.toLowerCase();
          bookedNames.add(key);
          bookingByName.set(key, b);
        }
      }
    }

    // Find past plan appointments for "planned vs completed" comparison
    const pastPlanAppts = planAppointments.filter((a) => {
      const d = a.date instanceof Date ? a.date : new Date(a.date);
      return d.getTime() < today.getTime();
    });

    const sameDay = (d1: Date, d2: Date) => d1.toISOString().slice(0, 10) === d2.toISOString().slice(0, 10);

    // Collect all service names for color mapping
    const nameSet = new Set<string>();
    for (const [, bks] of pastEntries) {
      for (const b of bks) nameSet.add(b.service_name ?? 'Service');
    }
    for (const appt of planAppointments) {
      for (const svc of appt.services ?? []) {
        nameSet.add(svc.variation_name ? `${svc.name} — ${svc.variation_name}` : svc.name);
      }
    }
    const names = Array.from(nameSet);
    const colorMap = new Map(names.map((n, i) => [n, SVC_COLORS[i % SVC_COLORS.length]]));

    // Build data rows
    const data: any[] = [];

    // Past visits — completed appointments
    for (const [dateKey, bks] of pastEntries) {
      const matchingPlanAppt = pastPlanAppts.find((a) => {
        const ad = a.date instanceof Date ? a.date : new Date(a.date);
        return ad.toISOString().slice(0, 10) === dateKey;
      });

      const fallbackPastAppt: PlanAppointment = {
        id: matchingPlanAppt?.id || `past-${dateKey}`,
        date: matchingPlanAppt?.date || new Date(bks[0].start_at),
        services: (matchingPlanAppt?.services?.length
          ? matchingPlanAppt.services
          : bks.map((b, i) => ({
              id: `${b.id}-${i}`,
              name: b.service_name || 'Service',
              category: 'Completed Service',
              cost: b.service_cost || 0,
              duration: b.service_duration || 0,
              variation_id: b.service_variation_id,
            }))) as any,
        notes: matchingPlanAppt?.notes || '',
      };

      const row: any = {
        name: shortDate(bks[0].start_at),
        isPast: true,
        isBooked: false,
        isCompleted: true,
        plannedDate: matchingPlanAppt
          ? (matchingPlanAppt.date instanceof Date ? matchingPlanAppt.date : new Date(matchingPlanAppt.date)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : undefined,
        actualDate: shortDate(bks[0].start_at),
        _raw: bks,
        _appt: fallbackPastAppt,
        _bookings: bks,
      };
      for (const b of bks) {
        const sname = b.service_name ?? 'Service';
        row[sname] = (row[sname] || 0) + (tab === 'duration' ? (b.service_duration ?? 0) : (b.service_cost ?? 0));
      }
      data.push(row);
    }

    // Upcoming visits
    for (const appt of futureAppts) {
      const matchingBookings: BookingRecord[] = [];
      const apptDate = appt.date instanceof Date ? appt.date : new Date(appt.date);
      const isBooked = (appt.services ?? []).some((svc) => {
        const vid = svc.variation_id || svc.id;
        if (vid && bookedVarIds.has(vid)) {
          const exact = bookingByVarId.get(vid);
          if (exact && !matchingBookings.includes(exact)) {
            matchingBookings.push(exact);
            return true;
          }
        }
        const sname = svc.variation_name ? `${svc.name} — ${svc.variation_name}` : svc.name;
        if (sname && bookedNames.has(sname.toLowerCase())) {
          const byName = bookingByName.get(sname.toLowerCase());
          if (byName && !matchingBookings.includes(byName)) {
            matchingBookings.push(byName);
            return true;
          }
        }
        const nearByDate = nonCancelledBookings.find((b) => {
          const bd = new Date(b.start_at);
          const withinWindow = Math.abs(bd.getTime() - apptDate.getTime()) <= 1000 * 60 * 60 * 24 * 14;
          return withinWindow && sameDay(bd, apptDate);
        });
        if (nearByDate && !matchingBookings.includes(nearByDate)) {
          matchingBookings.push(nearByDate);
          return true;
        }
        return false;
      });

      const row: any = {
        name: appt.date instanceof Date
          ? shortDate(appt.date.toISOString())
          : shortDate(String(appt.date)),
        isPast: false,
        isBooked,
        isCompleted: false,
        plannedDate: appt.date instanceof Date
          ? appt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          : new Date(appt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        actualDate: isBooked && matchingBookings[0]
          ? shortDate(matchingBookings[0].start_at)
          : undefined,
        _raw: appt,
        _appt: appt.services?.length > 0 ? appt : undefined,
        _bookings: matchingBookings,
      };
      for (const svc of appt.services ?? []) {
        const sname = svc.variation_name ? `${svc.name} — ${svc.variation_name}` : svc.name;
        row[sname] = (row[sname] || 0) + (tab === 'duration' ? (svc.duration ?? 0) : (svc.cost ?? 0));
      }
      data.push(row);
    }

    console.log('[ComparisonChart] Built data:', {
      totalRows: data.length,
      pastRows: data.filter((d: any) => d.isPast).length,
      futureRows: data.filter((d: any) => !d.isPast).length,
      bookedRows: data.filter((d: any) => d.isBooked).length,
      completedRows: data.filter((d: any) => d.isCompleted).length,
      serviceNames: names,
      sampleRow: data[0],
    });

    return { chartData: data, serviceNames: names, serviceColorMap: colorMap };
  }, [planAppointments, pastBookings, allBookings, tab]);

  // Summary
  const summary = useMemo(() => {
    const pastRows = chartData.filter((d: any) => d.isPast);
    const futureRows = chartData.filter((d: any) => !d.isPast);
    if (pastRows.length === 0 || futureRows.length === 0) return null;

    const sumPast = pastRows.reduce((s: number, r: any) => {
      let t = 0;
      for (const n of serviceNames) t += (r[n] || 0);
      return s + t;
    }, 0);
    const sumFuture = futureRows.reduce((s: number, r: any) => {
      let t = 0;
      for (const n of serviceNames) t += (r[n] || 0);
      return s + t;
    }, 0);

    const avgPast = sumPast / pastRows.length;
    const avgFuture = sumFuture / futureRows.length;
    if (avgPast === 0) return null;
    const ratio = avgFuture / avgPast;

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
  }, [chartData, serviceNames, tab]);

  if (chartData.length === 0) return null;

  const yFormatter = tab === 'duration'
    ? (v: number) => formatDuration(v)
    : (v: number) => formatCost(v);

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

      {/* Chart */}
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 40 }}
            onClick={(data: any) => {
              if (!onBarClick || !data?.activePayload?.[0]?.payload) return;
              const row = data.activePayload[0].payload;
              // Build ChartBarData from the row
              const appt = row._appt as PlanAppointment | undefined;
              const bookings = (row._bookings || []) as BookingRecord[];
              // For past bars without a matching plan appointment, create a synthetic one from bookings
              const effectiveAppt: PlanAppointment = appt ?? {
                id: `past-${row.name}`,
                date: new Date(row.name),
                services: [],
                notes: '',
              };
              if (effectiveAppt.services.length === 0 && !row.isPast) return; // skip empty placeholders
              onBarClick({
                appointment: effectiveAppt,
                isPast: !!row.isPast,
                isBooked: !!row.isBooked,
                isCompleted: !!row.isCompleted,
                plannedDate: row.plannedDate,
                actualDate: row.actualDate,
                matchingBookings: bookings,
              });
            }}
            className="cursor-pointer"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="name"
              tick={({ x, y, payload, index }: any) => {
                const item = chartData[index];
                let label = payload.value;
                let fill = 'var(--foreground)';
                if (item?.isCompleted) {
                  label = `✓ ${payload.value}`;
                  fill = 'var(--muted-foreground)';
                } else if (item?.isBooked) {
                  label = `✓ ${payload.value}`;
                  fill = 'var(--primary)';
                }
                return (
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={600}
                    fill={fill}
                    transform={`rotate(-45, ${x}, ${y + 10})`}
                  >
                    {label}
                  </text>
                );
              }}
              axisLine={{ stroke: 'var(--border)', strokeWidth: 2 }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tickFormatter={yFormatter}
              tick={{ fontSize: 10, fontWeight: 600, fill: 'var(--muted-foreground)' }}
              axisLine={{ stroke: 'var(--border)', strokeWidth: 2 }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)' }}
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload;
                const statusLabel = row?.isCompleted ? 'Completed' : row?.isBooked ? 'Booked' : null;
                const dateVerb = row?.isCompleted ? 'Completed' : row?.isBooked ? 'Scheduled' : null;
                return (
                  <div className="bg-primary text-primary-foreground p-4 bp-container-list shadow-xl min-w-[200px]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="bp-caption text-primary-foreground">{row?.name}</p>
                      {statusLabel && (
                        <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-primary-foreground/20 text-primary-foreground">
                          {statusLabel}
                        </span>
                      )}
                    </div>
                    {row?.plannedDate && dateVerb && (
                      <div className="mb-2 pb-2 border-b border-primary-foreground/20">
                        <p className="text-[10px] text-primary-foreground/70">Planned: {row.plannedDate}</p>
                        {row.actualDate && (
                          <p className="text-[10px] text-primary-foreground/70">{dateVerb}: {row.actualDate}</p>
                        )}
                      </div>
                    )}
                    {payload.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-4 mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                          <span className="text-xs font-semibold">{p.name}</span>
                        </div>
                        <span className="text-xs font-bold">{yFormatter(p.value)}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {serviceNames.map((name) => (
              <Bar
                key={name}
                dataKey={name}
                stackId="a"
                fill={serviceColorMap.get(name) || '#cbd5e1'}
                radius={[0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 justify-center">
        {serviceNames.map((name) => (
          <div key={name} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: serviceColorMap.get(name) }}
            />
            <span className="bp-caption text-muted-foreground">{name}</span>
          </div>
        ))}
      </div>

      {/* Status indicators */}
      <div className="mt-3 flex items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-muted-foreground">✓</span>
          <span className="bp-caption text-muted-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-primary">✓</span>
          <span className="bp-caption text-muted-foreground">Booked</span>
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <p className="bp-caption text-muted-foreground mt-3 text-center italic">{summary}</p>
      )}
    </div>
  );
};

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
