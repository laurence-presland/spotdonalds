import { quotedNumberIssues } from "@/lib/profile/numbers";
import { profileModelSchema, type ProfileDraft } from "@/lib/profile/schema";
import { SIGNAL_REGISTRY, type SignalKey } from "@/lib/signals/registry";
import type { TasteSignals } from "@/lib/signals/compute";

const GAP_LANGUAGE = /coverage|missing data|unlabeled|sample size/i;
const LOW_COVERAGE = 0.5;

export type ValidationResult = { ok: true; profile: ProfileDraft } | { ok: false; issues: string[] };

/** Check that a model profile cites real signals and quotes their numbers honestly. */
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
    issues.push(...quotedNumberIssues(item.text, item.cites, signals));
  }
  const tags = signals["coverage.tags"];
  const bpm = signals["coverage.bpm"];
  if ((typeof tags === "number" && tags < LOW_COVERAGE) || (typeof bpm === "number" && bpm < LOW_COVERAGE)) {
    if (profile.caveats.length === 0) issues.push("Low coverage needs an internal caveat");
  }
  return issues.length === 0 ? { ok: true, profile } : { ok: false, issues };
}
