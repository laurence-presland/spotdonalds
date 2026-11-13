import { redirect } from "next/navigation";
import { NotAllowlisted } from "@/components/NotAllowlisted";
import { DriveThrough } from "@/components/flow/DriveThrough";
import { ResultsScreen } from "@/components/flow/ResultsScreen";
import { RunError } from "@/components/flow/RunError";
import { analysisErrorCopy } from "@/lib/analyse/progress";
import { safeDbMessage } from "@/lib/db";
import { screenForRun } from "@/lib/flow/screen";
import { log } from "@/lib/log";
import { loadResults } from "@/lib/results/load";
import { profileStore } from "@/lib/profile/store";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const session = await Promise.race([
    supabase.auth.getUser().then((result) => ({ user: result.data.user, timedOut: false as const })),
    new Promise<{ user: null; timedOut: true }>((resolve) => setTimeout(() => resolve({ user: null, timedOut: true }), 8000)),
  ]);
  if (session.timedOut) return <RunError message="The page didn't load. Try again." />;
  if (!session.user) redirect("/");
  const user = session.user;
  const params = await searchParams;
  const loaded = await loadScreen(user.id, params.welcome === "1");
  if (loaded.kind === "failed") return <RunError message="The page didn't load. Try again." />;
  if (loaded.kind === "denied") return <NotAllowlisted />;
  if (loaded.kind === "error") return <RunError message={loaded.message} />;
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
  return <DriveThrough welcome={loaded.kind === "welcome"} />;
}

async function loadScreen(userId: string, welcome: boolean) {
  try {
    const run = await profileStore().latestRun(userId);
    const screen = screenForRun(run, welcome);
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
