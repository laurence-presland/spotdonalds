import { buildPrompt } from "@/lib/prompts/build";
import { validateProfile } from "@/lib/profile/validate";
import { computeSignals, presentSignals, scoreTraits, type ListeningInput, type TasteSignals } from "@/lib/signals/compute";
import type { ProfileDraft } from "@/lib/profile/schema";
import type { TraitName } from "@/lib/signals/registry";
import { log as writeLog } from "@/lib/log";
import type { StreamEvent } from "@/lib/stream/events";
import type { RunRecord } from "@/lib/ingest/types";

export type StoredTrait = {
  name: TraitName;
  explanation: string;
  cites: ProfileDraft["traits"][number]["cites"];
  score: number;
};

export type StoredProfile = {
  run_id: string;
  user_id: string;
  persona_name: string;
  tagline: string;
  insights: ProfileDraft["insights"];
  traits: StoredTrait[];
  caveats: string[];
  signals: TasteSignals;
  prompt_version: string;
  prompt_hash: string;
};

export type ProfileStore = {
  latestRun(userId: string): Promise<RunRecord | null>;
  saveRun(run: RunRecord): Promise<void>;
  getProfile(userId: string, runId: string): Promise<StoredProfile | null>;
  saveProfile(profile: StoredProfile): Promise<void>;
  deleteProfile(userId: string, runId: string): Promise<void>;
  loadListening(userId: string): Promise<ListeningInput>;
};

export type ProfileCompletion = (input: { system: string; prompt: string }) => Promise<{
  object: unknown;
  usage?: { inputTokens?: number; outputTokens?: number };
}>;

const ATTEMPTS = 3;

export async function runTasteProfile(input: {
  userId: string;
  store: ProfileStore;
  complete: ProfileCompletion;
  emit: (event: StreamEvent) => void;
  log?: typeof writeLog;
  force?: boolean;
}): Promise<StoredProfile> {
  const record = writeLogOr(input.log);
  const run = await input.store.latestRun(input.userId);
  if (!run) {
    input.emit({ type: "error", code: "no_run", message: "Ingest listening before building a taste profile." });
    throw new Error("no_run");
  }
  const existing = await input.store.getProfile(input.userId, run.id);
  input.emit({ type: "stage", stage: "profile" });
  if (existing && !input.force) {
    input.emit({ type: "done", stage: "profile" });
    return existing;
  }
  if (existing) await input.store.deleteProfile(input.userId, run.id);

  run.stage = "profile";
  run.status = "running";
  run.error = null;
  await input.store.saveRun(run);

  const listening = await input.store.loadListening(input.userId);
  const signals = computeSignals(listening);
  const prompt = buildPrompt("profile.v1");
  const user = JSON.stringify({ signals: presentSignals(signals), traits: scoreTraits(signals) });
  let errors: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const started = Date.now();
    let object: unknown = null;
    let usage: { inputTokens?: number; outputTokens?: number } = {};
    try {
      const result = await input.complete({
        system: prompt.text,
        prompt: errors.length === 0 ? user : `${user}\n\nFix these and try again:\n${errors.join("\n")}`,
      });
      object = result.object;
      usage = result.usage ?? {};
    } catch (error) {
      errors = [error instanceof Error ? error.message : "The model call failed"];
      record("warn", "taste_profile.model", {
        user_id: input.userId,
        attempt,
        retry_count: attempt - 1,
        latency_ms: Date.now() - started,
        input_tokens: usage.inputTokens ?? null,
        output_tokens: usage.outputTokens ?? null,
        ok: false,
      });
      continue;
    }
    const checked = validateProfile(object, signals);
    record("info", "taste_profile.model", {
      user_id: input.userId,
      attempt,
      retry_count: attempt - 1,
      latency_ms: Date.now() - started,
      input_tokens: usage.inputTokens ?? null,
      output_tokens: usage.outputTokens ?? null,
      ok: checked.ok,
    });
    if (!checked.ok) {
      errors = checked.issues;
      continue;
    }
    const scores = new Map(scoreTraits(signals).map((trait) => [trait.name, trait.score]));
    const stored: StoredProfile = {
      run_id: run.id,
      user_id: input.userId,
      persona_name: checked.profile.persona_name,
      tagline: checked.profile.tagline,
      insights: checked.profile.insights,
      traits: checked.profile.traits.map((trait) => ({ ...trait, score: scores.get(trait.name) ?? 0 })),
      caveats: checked.profile.caveats,
      signals,
      prompt_version: prompt.version,
      prompt_hash: prompt.hash,
    };
    await input.store.saveProfile(stored);
    run.status = "complete";
    run.stage = "profile";
    run.finished_at = new Date().toISOString();
    await input.store.saveRun(run);
    input.emit({ type: "done", stage: "profile" });
    return stored;
  }

  run.status = "error";
  run.error = errors.join("; ");
  await input.store.saveRun(run);
  input.emit({ type: "error", code: "profile_invalid", message: "The taste profile didn't pass checking." });
  throw new Error(run.error);
}

function writeLogOr(logger: typeof writeLog | undefined): typeof writeLog {
  return logger ?? writeLog;
}
