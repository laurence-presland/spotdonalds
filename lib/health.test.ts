import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from }),
}));

import { checkHealth } from "@/lib/health";

function queryResult(result: { data: unknown; error: { message: string } | null }) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

beforeEach(() => {
  from.mockReset();
});

describe("checkHealth", () => {
  it("returns ok when the healthcheck row is true", async () => {
    from.mockReturnValue(queryResult({ data: { ok: true }, error: null }));
    await expect(checkHealth()).resolves.toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith("healthcheck");
  });

  it("returns a non-200 status when the query fails", async () => {
    from.mockReturnValue(queryResult({ data: null, error: { message: "down" } }));
    await expect(checkHealth()).resolves.toEqual({ ok: false, status: 503 });
  });

  it("returns a non-200 status when the client throws", async () => {
    from.mockImplementation(() => {
      throw new Error("missing env");
    });
    await expect(checkHealth()).resolves.toEqual({ ok: false, status: 503 });
  });
});
