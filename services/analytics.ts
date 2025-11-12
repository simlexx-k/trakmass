import type { MassEntry } from '@/types/mass';

type TrendDirection = 'up' | 'down' | 'flat';

export type TrendResult = {
  slope: number;
  perWeek: number;
  direction: TrendDirection;
  label: string;
};

export type VolatilityResult = {
  volatility: number;
  label: string;
};

export type InsightSummary = {
  title: string;
  body: string;
};

const toDate = (entry: MassEntry) => new Date(entry.loggedAt).getTime();

export const computeTrend = (entries: MassEntry[], lookback = 20): TrendResult => {
  if (entries.length < 2) {
    return { slope: 0, perWeek: 0, direction: 'flat', label: 'No trend' };
  }
  const subset = entries.slice(0, Math.min(entries.length, lookback));
  const xs = subset.map((entry) => toDate(entry));
  const ys = subset.map((entry) => entry.mass);
  const xMean = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const yMean = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const numerator = xs.reduce((sum, x, idx) => sum + (x - xMean) * (ys[idx] - yMean), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  const slope = denominator === 0 ? 0 : numerator / denominator;
  const perWeek = slope * (1000 * 60 * 60 * 24 * 7);
  const direction: TrendDirection =
    Math.abs(perWeek) < 0.05 ? 'flat' : perWeek > 0 ? 'up' : 'down';
  const label =
    direction === 'flat'
      ? 'Stable'
      : direction === 'up'
        ? `Gaining ${perWeek.toFixed(2)} kg/week`
        : `Losing ${Math.abs(perWeek).toFixed(2)} kg/week`;
  return { slope, perWeek, direction, label };
};

export const computeVolatility = (entries: MassEntry[]): VolatilityResult => {
  if (entries.length < 2) {
    return { volatility: 0, label: 'Not enough data' };
  }
  const avg = entries.reduce((sum, entry) => sum + entry.mass, 0) / entries.length;
  const variance =
    entries.reduce((sum, entry) => sum + (entry.mass - avg) ** 2, 0) / entries.length;
  const volatility = Math.sqrt(variance);
  const label = volatility < 0.3 ? 'Consistent' : volatility < 0.7 ? 'Wobbly' : 'Volatile';
  return { volatility, label };
};

export const detectOutliers = (entries: MassEntry[], sigmaThreshold = 2) => {
  const { volatility } = computeVolatility(entries);
  if (entries.length < 3 || volatility === 0) return [];
  const avg = entries.reduce((sum, entry) => sum + entry.mass, 0) / entries.length;
  return entries
    .filter((entry) => Math.abs(entry.mass - avg) / volatility >= sigmaThreshold)
    .map((entry) => ({
      id: entry.id,
      label: `${entry.mass} kg on ${new Date(entry.loggedAt).toLocaleDateString()}`,
    }));
};

export const buildInsightSummaries = (
  entries: MassEntry[],
  goalMass?: number | null,
): InsightSummary[] => {
  const trend = computeTrend(entries);
  const volatility = computeVolatility(entries);
  const outliers = detectOutliers(entries);

  const summaries: InsightSummary[] = [];

  if (trend.direction !== 'flat') {
    summaries.push({
      title: 'Momentum',
      body: trend.label,
    });
  } else {
    summaries.push({
      title: 'Momentum',
      body: 'Readings are stable this week.',
    });
  }

  summaries.push({
    title: 'Consistency',
    body: `${volatility.label} — σ ≈ ${volatility.volatility.toFixed(2)} kg`,
  });

  if (outliers.length > 0) {
    summaries.push({
      title: 'Notes',
      body: `Detected ${outliers.length} outlier${outliers.length > 1 ? 's' : ''}: ${outliers
        .map((item) => item.label)
        .join(', ')}.`,
    });
  }

  if (goalMass && entries.length) {
    const latest = entries[0].mass;
    const remaining = goalMass - latest;
    if (Math.abs(remaining) > 0.1 && trend.perWeek !== 0) {
      const weeks = remaining / trend.perWeek;
      const eta = Math.abs(weeks) > 1000 ? 'no change' : `${Math.abs(weeks).toFixed(1)} weeks`;
      summaries.push({
        title: 'Projection',
        body: `Estimated ${eta} to reach ${goalMass} kg.`,
      });
    }
  }

  return summaries;
};
