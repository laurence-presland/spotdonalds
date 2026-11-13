import { redirect } from "next/navigation";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { DriveThrough } from "@/components/flow/DriveThrough";
import { InsufficientData } from "@/components/flow/InsufficientData";
import { ResultsScreen } from "@/components/flow/ResultsScreen";
import { RunError } from "@/components/flow/RunError";
import { analysisErrorCopy } from "@/lib/analyse/progress";
import { reviveOrClose } from "@/lib/analyse/reconcile";
import { AuthUnavailable, getSessionUser } from "@/lib/auth/session";
import { safeDbMessage } from "@/lib/db";
import { screenForRun } from "@/lib/flow/screen";
import { log } from "@/lib/log";
import { loadResults } from "@/lib/results/load";
import { profileStore } from "@/lib/profile/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  let user: { id: string } | null;
  try {
    user = await getSessionUser();
  } catch (error) {
    if (error instanceof AuthUnavailable) {
      return <RunError title="The page didn't load." message="Spotify sign-in didn't respond. Try again." action="reload" />;
    }
    throw error;
  }
  if (!user) redirect("/");
  const params = await searchParams;
  const loaded = await loadScreen(user.id, params.welcome === "1");
  if (loaded.kind === "failed") {
    return <RunError title="The page didn't load." message="The listening data didn't load. Try again." action="reload" />;
  }
  if (loaded.kind === "denied") return <NotAllowlisted />;
  if (loaded.kind === "error") return <RunError message={loaded.message} />;
  if (loaded.kind === "insufficient") return <InsufficientData count={loaded.count} />;
  if (loaded.kind === "results") {
    return (
      <ResultsScreen
        profile={loaded.results.profile}
        order={loaded.results.order}
        menu={loaded.results.menu}
        aggregates={loaded.results.aggregates}
        orderFailed={false}
      />
    );
  }
  const showWelcome = params.welcome === "1" && (loaded.kind === "welcome" || loaded.kind === "analysing");
  return <DriveThrough welcome={showWelcome} />;
}

async function loadScreen(userId: string, welcome: boolean) {
  try {
    const run = await reviveOrClose(await profileStore().latestRun(userId));
    const screen = screenForRun(run, welcome);
    if (screen === "insufficient") return { kind: "insufficient" as const, count: run?.checkpoint.track_count ?? 0 };
    if (screen === "error") {
      if (run?.error === "not_allowlisted") return { kind: "denied" as const };
      return { kind: "error" as const, message: analysisErrorCopy(run?.error) };
    }
    if (screen === "results" && run) {
      const results = await loadResults(userId);
      if (results) return { kind: "results" as const, results };
    }
    return { kind: screen === "welcome" ? "welcome" as const : "analysing" as const };
  } catch (error) {
    log("error", "app.load", { message: safeDbMessage(error) });
    return { kind: "failed" as const };
  }
}
