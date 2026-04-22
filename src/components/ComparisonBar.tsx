import React from 'react';

interface ComparisonBarProps {
  /** Current value (e.g. 45 min or $85) */
  value: number;
  /** Reference value to compare against (e.g. max from past appointments) */
  maxValue: number;
  /** Display label for the value, e.g. "45 min" or "$85" */
  displayValue: string;
  /** Optional label like "Duration" or "Cost" */
  label: string;
  /** Color theme: "primary" | "accent" | "secondary" */
  color?: 'primary' | 'accent' | 'secondary';
  /** Optional: show a comparison summary like "Half as long" */
  comparisonText?: string | null;
}

const colorMap = {
  primary: {
    bar: 'bg-primary',
    track: 'bg-primary/10',
    text: 'text-primary',
    ghostBar: 'bg-primary/20',
  },
  accent: {
    bar: 'bg-accent',
    track: 'bg-accent/10',
    text: 'text-accent',
    ghostBar: 'bg-accent/20',
  },
  secondary: {
    bar: 'bg-secondary',
    track: 'bg-secondary/10',
    text: 'text-secondary',
    ghostBar: 'bg-secondary/20',
  },
};

export const ComparisonBar: React.FC<ComparisonBarProps> = ({
  value,
  maxValue,
  displayValue,
  label,
  color = 'primary',
  comparisonText,
}) => {
  const colors = colorMap[color];
  // Percentage of the max (capped at 100%)
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <div className="w-full">
      {/* Label row */}
      <div className="flex items-center justify-between mb-1">
        <span className="bp-caption uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className={`bp-body-sm font-semibold ${colors.text}`}>{displayValue}</span>
      </div>

      {/* Bar track */}
      <div className={`relative h-3 rounded-full ${colors.track} overflow-hidden`}>
        {/* Ghost bar showing the max/reference (if different from current) */}
        {maxValue > value && maxValue > 0 && (
          <div
            className={`absolute inset-y-0 left-0 rounded-full ${colors.ghostBar}`}
            style={{ width: `${Math.min((maxValue / maxValue) * 100, 100)}%` }}
          />
        )}
        {/* Current value bar */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${colors.bar} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Comparison text */}
      {comparisonText && (
        <p className="bp-caption text-muted-foreground mt-1">{comparisonText}</p>
      )}
    </div>
  );
};

/**
 * Generate a human-readable comparison text.
 * E.g. "Half as long as your last visit", "3× longer than average", etc.
 */
export function getDurationComparison(
  currentDuration: number,
  referenceDuration: number | undefined,
): string | null {
  if (!referenceDuration || referenceDuration === 0) return null;
  const ratio = currentDuration / referenceDuration;

  if (ratio < 0.4) return 'Much shorter than your last visit';
  if (ratio < 0.65) return 'About half as long as your last visit';
  if (ratio < 0.85) return 'A bit shorter than your last visit';
  if (ratio <= 1.15) return 'About the same as your last visit';
  if (ratio <= 1.5) return 'A bit longer than your last visit';
  if (ratio <= 2.0) return 'About twice as long as your last visit';
  return 'Much longer than your last visit';
}

export function getCostComparison(
  currentCost: number,
  referenceCost: number | undefined,
): string | null {
  if (!referenceCost || referenceCost === 0) return null;
  const ratio = currentCost / referenceCost;

  if (ratio < 0.4) return 'Much less than your last visit';
  if (ratio < 0.65) return 'About half the cost of your last visit';
  if (ratio < 0.85) return 'A bit less than your last visit';
  if (ratio <= 1.15) return 'About the same as your last visit';
  if (ratio <= 1.5) return 'A bit more than your last visit';
  if (ratio <= 2.0) return 'About twice the cost of your last visit';
  return 'Much more than your last visit';
}

/**
 * Format duration in minutes to a human-readable string.
 */
export function formatDuration(minutes: number | undefined): string {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Format cost in cents to a display string.
 */
export function formatCost(cents: number | undefined): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(0)}`;
}
