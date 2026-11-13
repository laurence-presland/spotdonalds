import { afterAll, describe, expect, it } from "vitest";
import { loadLatestRun } from "@/lib/analysis-run";
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
});
