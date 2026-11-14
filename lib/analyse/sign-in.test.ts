import { describe, expect, it } from "vitest";
import { shouldStartOnSignIn, startOnSignIn } from "@/lib/analyse/sign-in";

function deps(status: string | null) {
  const started: string[] = [];
  const closed: string[] = [];
  return {
    started,
    closed,
    async loadLatest() {
      return status ? { id: "run-old", status } : null;
    },
    async closeOpen(userId: string) {
      closed.push(userId);
    },
    async insert(userId: string) {
      return { id: `${userId}-new` };
    },
    async start(userId: string, runId: string) {
      started.push(`${userId}:${runId}`);
    },
  };
}

describe("sign-in start", () => {
  it("starts when there is no run", async () => {
    expect(shouldStartOnSignIn(null)).toBe(true);
    const harness = deps(null);
    await expect(startOnSignIn("user-1", harness)).resolves.toBe("started");
    expect(harness.closed).toEqual([]);
    expect(harness.started).toEqual(["user-1:user-1-new"]);
  });

  it("does not start when a run is running or complete", async () => {
    expect(shouldStartOnSignIn({ status: "running" })).toBe(false);
    expect(shouldStartOnSignIn({ status: "complete" })).toBe(false);
    const running = deps("running");
    await expect(startOnSignIn("user-1", running)).resolves.toBe("skipped");
    expect(running.started).toEqual([]);
    const complete = deps("complete");
    await expect(startOnSignIn("user-1", complete)).resolves.toBe("skipped");
    expect(complete.started).toEqual([]);
  });

  it("starts a new workflow when the latest run is an error", async () => {
    expect(shouldStartOnSignIn({ status: "error" })).toBe(true);
    const harness = deps("error");
    await expect(startOnSignIn("user-1", harness)).resolves.toBe("started");
    expect(harness.closed).toEqual(["user-1"]);
    expect(harness.started).toEqual(["user-1:user-1-new"]);
  });
});
