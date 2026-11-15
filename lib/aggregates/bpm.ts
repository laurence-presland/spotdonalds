import { mean, median } from "es-toolkit";

export const BPM_BINS = [
  { label: "Under 80", min: 0, max: 80 },
  { label: "80–100", min: 80, max: 100 },
  { label: "100–120", min: 100, max: 120 },
  { label: "120–140", min: 120, max: 140 },
  { label: "140–160", min: 140, max: 160 },
  { label: "160+", min: 160, max: Number.POSITIVE_INFINITY },
] as const;

export type BpmStats = {
  count: number;
  mean: number | null;
  median: number | null;
  stdev: number | null;
  min: number | null;
  max: number | null;
  bins: { label: string; min: number; max: number; count: number }[];
};

/** Mean, median, spread, and histogram buckets for a list of tempos. */
export function bpmStats(values: (number | null | undefined)[]): BpmStats {
  const tempos = values.filter((value): value is number => typeof value === "number" && value > 0);
  const bins = BPM_BINS.map((bin) => ({
    ...bin,
    count: tempos.filter((tempo) => tempo >= bin.min && tempo < bin.max).length,
  }));
  if (tempos.length === 0) {
    return { count: 0, mean: null, median: null, stdev: null, min: null, max: null, bins };
  }
  const sorted = [...tempos].sort((a, b) => a - b);
  const average = mean(sorted);
  const variance = sorted.reduce((sum, tempo) => sum + (tempo - average) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    mean: average,
    median: median(sorted),
    stdev: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    bins,
  };
}
