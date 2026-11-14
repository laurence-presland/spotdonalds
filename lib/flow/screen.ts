export type AppScreen = "welcome" | "analysing" | "results" | "error" | "insufficient";

export function screenForRun(
  run: { stage: string; status: string; outcome?: string | null } | null,
  welcomeRequested: boolean,
): AppScreen {
  if (run?.outcome === "insufficient_data") return "insufficient";
  if (run?.status === "error") return "error";
  if (run?.stage === "done") return "results";
  if (!run && welcomeRequested) return "welcome";
  return "analysing";
}

export function welcomePlan(reducedMotion: boolean): { dots: number; fadeMs: number; holdMs: number } {
  if (reducedMotion) return { dots: 3, fadeMs: 0, holdMs: 3000 };
  return { dots: 0, fadeMs: 400, holdMs: 3000 };
}
