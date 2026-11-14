import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20261113123000_enrichment.sql", import.meta.url), "utf8");

describe("enrichment migration", () => {
  it("caches enrichment behind RLS with no browser grants", () => {
    expect(sql).toMatch(/create table if not exists spotdonalds\.track_enrichment/i);
    expect(sql).toMatch(/alter table spotdonalds\.track_enrichment enable row level security/i);
    expect(sql).toMatch(/revoke all on spotdonalds\.track_enrichment from public, anon, authenticated/i);
    expect(sql).not.toMatch(/create policy/i);
  });
});