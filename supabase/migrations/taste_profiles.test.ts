import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20261113124000_taste_profiles.sql", import.meta.url), "utf8");

describe("taste profile migration", () => {
  it("keeps profiles in the spotdonalds schema with RLS", () => {
    expect(sql).toMatch(/create table if not exists spotdonalds\.taste_profiles/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/user_id = auth\.uid\(\)/i);
    expect(sql).not.toMatch(/\bpublic\.taste_profiles\b/i);
  });
});