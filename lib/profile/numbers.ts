import { round } from "es-toolkit";
import { SIGNAL_REGISTRY, type SignalKey } from "@/lib/signals/registry";
import type { TagShare, TasteSignals } from "@/lib/signals/compute";

const NUMBER = /\d+(?:\.\d+)?%?/g;

// A small integer is a count or an ordinal ("3 artists", "top 5"). A statistic is a
// percent, a decimal, a tempo, or a number large enough to be a measurement.
const SMALL_COUNT = 13;

/** Find quoted numbers in the profile that do not match a cited signal. */
export function quotedNumberIssues(text: string, cites: string[], signals: TasteSignals): string[] {
  const issues: string[] = [];
  for (const match of text.matchAll(NUMBER)) {
    const token = match[0];
    if (!claimsStatistic(text, token, match.index ?? 0)) continue;
    if (!matchesCited(token, cites, signals)) issues.push(`Quoted number ${token} does not match a cited signal`);
  }
  return issues;
}

/** True when a number in the text is a statistic, not a small count or ordinal. */
function claimsStatistic(text: string, token: string, index: number): boolean {
  if (token.endsWith("%") || token.includes(".")) return true;
  const after = text.slice(index + token.length, index + token.length + 16);
  if (/^\s*(bpm|beats)\b/i.test(after)) return true;
  const value = Number(token);
  return Number.isFinite(value) && value >= SMALL_COUNT;
}

/** True when the quoted number matches one of the cited signal values. */
function matchesCited(token: string, cites: string[], signals: TasteSignals): boolean {
  const allowed = citedNumbers(cites, signals);
  if (token.endsWith("%")) {
    const percent = Number(token.slice(0, -1));
    return allowed.some((value) => value >= 0 && value <= 1 && Math.round(value * 100) === Math.round(percent));
  }
  const numeric = Number(token);
  return allowed.some((value) => Math.abs(value - numeric) < 0.001);
}

/** Collect the numeric values of the cited signals. */
function citedNumbers(cites: string[], signals: TasteSignals): number[] {
  const numbers: number[] = [];
  for (const key of cites) {
    if (!(key in SIGNAL_REGISTRY)) continue;
    const signalKey = key as SignalKey;
    const value = signals[signalKey];
    if (typeof value === "number") numbers.push(round(value, SIGNAL_REGISTRY[signalKey].decimals));
    if (Array.isArray(value)) {
      for (const item of value as TagShare[]) numbers.push(round(item.share, SIGNAL_REGISTRY[signalKey].decimals));
    }
  }
  return numbers;
}
