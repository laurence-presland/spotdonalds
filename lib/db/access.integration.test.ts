import { afterAll, describe, expect, it } from "vitest";
import { assertWorker, claimWorker, loadLatestRun } from "@/lib/analysis-run";
import { claimAnalysis, startFreshAnalysis } from "@/lib/analyse/claim";
import { tokenStore } from "@/lib/auth/token-store";
import { sql } from "@/lib/db";
import { checkHealth } from "@/lib/health";
import { ingestStore } from "@/lib/ingest/store";

if (process.env.REQUIRE_DATABASE === "1" && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const userA = "00000000-0000-0000-0000-000000000001";
const userB = "00000000-0000-0000-0000-000000000099";

describe.skipIf(!process.env.DATABASE_URL)("postgres access", () => {
  afterAll(async () => {
    await sql().end({ timeout: 5 });
  });

  it("reads the healthcheck row", async () => {
    await expect(checkHealth()).resolves.toEqual({ ok: true });
  });

  it("keeps tokens and runs to the user id in the query", async () => {
    const tokens = tokenStore();
    await tokens.save({
      user_id: userA,
      access_token: "token-a",
      refresh_token: "refresh-a",
      expires_at: "2026-11-13T12:00:00.000Z",
      scope: "user-read-email",
    });
    await expect(tokens.get(userA)).resolves.toMatchObject({ access_token: "token-a", user_id: userA });
    await expect(tokens.get(userB)).resolves.toBeNull();

    const run = await ingestStore().resumeOrCreate(userA, "2026-11-13T00:00:00.000Z");
    expect(run.user_id).toBe(userA);
    await expect(loadLatestRun(userB)).resolves.toBeNull();
  });

  it("keeps a single open run when two starts race", async () => {
    await sql()`delete from spotdonalds.orders where user_id = ${userA}`;
    await sql()`delete from spotdonalds.taste_profiles where user_id = ${userA}`;
    await sql()`delete from spotdonalds.analysis_runs where user_id = ${userA}`;
    const [first, second] = await Promise.all([
      claimAnalysis(userA, false),
      claimAnalysis(userA, false),
    ]);
    expect(first?.id).toBe(second?.id);
    const open = await sql()<{ id: string }[]>`
      select id from spotdonalds.analysis_runs where user_id = ${userA} and open
    `;
    expect(open).toHaveLength(1);
    const again = await claimAnalysis(userA, false);
    expect(again?.id).toBe(first?.id);
  });

  it("claims a run once until its heartbeat is stale, and start fresh closes it", async () => {
    await sql()`delete from spotdonalds.orders where user_id = ${userA}`;
    await sql()`delete from spotdonalds.taste_profiles where user_id = ${userA}`;
    await sql()`delete from spotdonalds.analysis_runs where user_id = ${userA}`;
    const run = await claimAnalysis(userA, false);
    expect(run).not.toBeNull();
    const runId = run?.id ?? "";
    expect(await claimWorker(runId, userA)).toBe(true);
    expect(await claimWorker(runId, userA)).toBe(false);
    expect(await assertWorker(runId, userA, "workflow-a")).toBe(true);
    expect(await assertWorker(runId, userA, "workflow-b")).toBe(false);
    await sql()`
      update spotdonalds.analysis_runs
      set heartbeat_at = now() - interval '5 minutes'
      where id = ${runId}
    `;
    expect(await assertWorker(runId, userA, "workflow-b")).toBe(true);
    await sql()`update spotdonalds.analysis_runs set stage = 'popularity' where id = ${runId}`;
    const fresh = await startFreshAnalysis(userA, "2026-11-13T01:00:00.000Z");
    expect(fresh.id).not.toBe(runId);
    const open = await sql()<{ id: string }[]>`
      select id from spotdonalds.analysis_runs where user_id = ${userA} and open
    `;
    expect(open).toEqual([{ id: fresh.id }]);
    const closed = await sql()<{ status: string; open: boolean }[]>`
      select status, open from spotdonalds.analysis_runs where id = ${runId}
    `;
    expect(closed[0]).toMatchObject({ status: "error", open: false });
  });
});
