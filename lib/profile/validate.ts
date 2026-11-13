import { profileModelSchema, type ProfileDraft } from "@/lib/profile/schema";
import { SIGNAL_REGISTRY, type SignalKey } from "@/lib/signals/registry";
import type { TagShare, TasteSignals } from "@/lib/signals/compute";

const NUMBER = /\d+(?:\.\d+)?%?/g;
const GAP_LANGUAGE = /coverage|missing data|unlabeled|sample size/i;
const LOW_COVERAGE = 0.5;

export type ValidationResult = { ok: true; profile: ProfileDraft } | { ok: false; issues: string[] };

export function validateProfile(value: unknown, signals: TasteSignals): ValidationResult {
  const parsed = profileModelSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
  }
  const profile = parsed.data;
  const issues: string[] = [];
  const publicText = [
    profile.persona_name,
    profile.tagline,
    ...profile.insights.map((insight) => insight.text),
    ...profile.traits.map((trait) => trait.explanation),
  ];
  for (const text of publicText) {
    if (GAP_LANGUAGE.test(text)) issues.push("Public copy mentions a gap the person should not see");
    for (const key of Object.keys(SIGNAL_REGISTRY) as SignalKey[]) {
      if (!SIGNAL_REGISTRY[key].mention && text.includes(key)) issues.push(`Quoted a hidden signal: ${key}`);
    }
  }
  const cited = [
    ...profile.insights.map((insight) => ({ text: insight.text, cites: insight.cites })),
    ...profile.traits.map((trait) => ({ text: trait.explanation, cites: trait.cites })),
  ];
  for (const item of cited) {
    for (const key of item.cites) {
      if (!SIGNAL_REGISTRY[key].mention) issues.push(`Cited a hidden signal: ${key}`);
      else if (signals[key] == null) issues.push(`Cited a signal that was not supplied: ${key}`);
    }
    for (const token of item.text.match(NUMBER) ?? []) {
      if (!numberIsAllowed(token, item.cites, signals)) issues.push(`Quoted number ${token} does not match a cited signal`);
    }
  }
  const tags = signals["coverage.tags"];
  const bpm = signals["coverage.bpm"];
  if ((typeof tags === "number" && tags < LOW_COVERAGE) || (typeof bpm === "number" && bpm < LOW_COVERAGE)) {
    if (profile.caveats.length === 0) issues.push("Low coverage needs an internal caveat");
  }
  return issues.length === 0 ? { ok: true, profile } : { ok: false, issues };
}

function numberIsAllowed(token: string, cites: SignalKey[], signals: TasteSignals): boolean {
  const allowed = citedNumbers(cites, signals);
  if (token.endsWith("%")) {
    const percent = Number(token.slice(0, -1));
    return allowed.some((value) => value >= 0 && value <= 1 && Math.round(value * 100) === Math.round(percent));
  }
  const numeric = Number(token);
  return allowed.some((value) => Math.abs(value - numeric) < 0.001);
}

function citedNumbers(cites: SignalKey[], signals: TasteSignals): number[] {
  const numbers: number[] = [];
  for (const key of cites) {
    const value = signals[key];
    if (typeof value === "number") numbers.push(round(value, SIGNAL_REGISTRY[key].decimals));
    if (Array.isArray(value)) {
      for (const item of value as TagShare[]) numbers.push(round(item.share, SIGNAL_REGISTRY[key].decimals));
    }
  }
  return numbers;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
