export function shouldStartOnSignIn(run: { status: string } | null): boolean {
  if (!run) return true;
  return run.status !== "running" && run.status !== "complete";
}

export async function startOnSignIn(
  userId: string,
  deps: {
    loadLatest: (userId: string) => Promise<{ id: string; status: string } | null>;
    closeOpen: (userId: string) => Promise<void>;
    insert: (userId: string) => Promise<{ id: string }>;
    start: (userId: string, runId: string) => Promise<void>;
  },
): Promise<"started" | "skipped"> {
  const latest = await deps.loadLatest(userId);
  if (!shouldStartOnSignIn(latest)) return "skipped";
  if (latest) await deps.closeOpen(userId);
  const run = await deps.insert(userId);
  await deps.start(userId, run.id);
  return "started";
}
