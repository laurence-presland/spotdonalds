import { redirect } from "next/navigation";
import { DriveThrough } from "@/components/flow/DriveThrough";
import { ResultsScreen } from "@/components/flow/ResultsScreen";
import { screenForRun } from "@/lib/flow/screen";
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
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");
  const params = await searchParams;
  const run = await profileStore().latestRun(data.user.id);
  const screen = screenForRun(run, params.welcome === "1");
  if (screen === "results" && run) {
    const results = await loadResults(data.user.id);
    if (results) {
      return (
        <ResultsScreen
          profile={results.profile}
          order={results.order}
          menu={results.menu}
          aggregates={results.aggregates}
          orderFailed={run.status === "error"}
        />
      );
    }
  }
  return <DriveThrough welcome={screen === "welcome"} />;
}
