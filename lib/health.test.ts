import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();

vi.mock("@/lib/db", () => ({
  sql: () => query,
  safeDbMessage: (error: unknown) => (error instanceof Error ? error.message : "unknown"),
}));

import { checkHealth } from "@/lib/health";

beforeEach(() => {
  query.mockReset();
});

describe("checkHealth", () => {
  it("returns ok when the healthcheck row is true", async () => {
    query.mockResolvedValue([{ ok: true }]);
    await expect(checkHealth()).resolves.toEqual({ ok: true });
    expect(query).toHaveBeenCalledOnce();
  });

  it("returns a non-200 status when the row is missing", async () => {
    query.mockResolvedValue([]);
    await expect(checkHealth()).resolves.toEqual({ ok: false, status: 503 });
  });

  it("returns a non-200 status when the query throws", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    await expect(checkHealth()).resolves.toEqual({ ok: false, status: 503 });
  });
});
