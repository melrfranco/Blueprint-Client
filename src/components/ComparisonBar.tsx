import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { BookingRecord, PlanAppointment } from '../types';

type TabKey = 'duration' | 'cost';

interface ComparisonChartProps {
  planAppointments: PlanAppointment[];
  pastBookings: BookingRecord[];
  /** Called when user clicks a bar for an upcoming (non-placeholder) appointment */
  onBarClick?: (appt: PlanAppointment) => void;
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
  onBarClick,
}) => {
  const [tab, setTab] = useState<TabKey>('duration');

  // Build recharts data: each object is a visit with service names as keys
  const { chartData, serviceNames, serviceColorMap } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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

    // Upcoming: plan appointments, pad to 10
    const futureAppts = planAppointments.slice(0, 10);
    while (futureAppts.length < 10) {
      futureAppts.push({
        id: `placeholder-${futureAppts.length}`,
        date: new Date(today.getTime() + (futureAppts.length + 1) * 30 * 86400000),
        services: [],
        notes: '',
      } as PlanAppointment);
    }

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

    // Past visits
    for (const [, bks] of pastEntries) {
      const row: any = {
        name: shortDate(bks[0].start_at),
        isPast: true,
        _raw: bks,
      };
      for (const b of bks) {
        const sname = b.service_name ?? 'Service';
        row[sname] = (row[sname] || 0) + (tab === 'duration' ? (b.service_duration ?? 0) : (b.service_cost ?? 0));
      }
      data.push(row);
    }

    // Upcoming visits
    for (const appt of futureAppts) {
      const row: any = {
        name: appt.date instanceof Date
          ? shortDate(appt.date.toISOString())
          : shortDate(String(appt.date)),
        isPast: false,
        _raw: appt,
        _appt: appt.services?.length > 0 ? appt : undefined,
      };
      for (const svc of appt.services ?? []) {
        const sname = svc.variation_name ? `${svc.name} — ${svc.variation_name}` : svc.name;
        row[sname] = (row[sname] || 0) + (tab === 'duration' ? (svc.duration ?? 0) : (svc.cost ?? 0));
      }
      data.push(row);
    }

    return { chartData: data, serviceNames: names, serviceColorMap: colorMap };
  }, [planAppointments, pastBookings, tab]);

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
              if (data?.activePayload?.[0]?.payload?._appt && onBarClick) {
                const appt = data.activePayload[0].payload._appt as PlanAppointment;
                // Only fire for real upcoming appointments (not placeholders)
                if (appt.services?.length > 0 && !data.activePayload[0].payload.isPast) {
                  onBarClick(appt);
                }
              }
            }}
            className="cursor-pointer"
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="name"
              tick={({ x, y, payload, index }: any) => {
                const item = chartData[index];
                return (
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor="end"
                    fontSize={9}
                    fontWeight={600}
                    fill={item?.isPast ? 'var(--muted-foreground)' : 'var(--foreground)'}
                    transform={`rotate(-45, ${x}, ${y + 10})`}
                  >
                    {item?.isPast ? `✓ ${payload.value}` : payload.value}
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
                return (
                  <div className="bg-primary text-primary-foreground p-4 bp-container-list shadow-xl min-w-[180px]">
                    <p className="bp-caption text-primary-foreground mb-2">{row?.name}</p>
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
