export type AppScreen = "welcome" | "analysing" | "results";

export function screenForRun(
  run: { stage: string; status: string } | null,
  welcomeRequested: boolean,
): AppScreen {
  if (run?.stage === "done") return "results";
  if (run && run.status === "error" && (run.stage === "profile" || run.stage === "order")) return "results";
  if (!run && welcomeRequested) return "welcome";
  return "analysing";
}

export function welcomePlan(reducedMotion: boolean): { dots: number; fadeMs: number; holdMs: number } {
  if (reducedMotion) return { dots: 3, fadeMs: 0, holdMs: 3000 };
  return { dots: 0, fadeMs: 400, holdMs: 3000 };
}
