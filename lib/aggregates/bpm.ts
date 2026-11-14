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
  const mean = sorted.reduce((sum, tempo) => sum + tempo, 0) / sorted.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const variance = sorted.reduce((sum, tempo) => sum + (tempo - mean) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    mean,
    median,
    stdev: Math.sqrt(variance),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    bins,
  };
}
