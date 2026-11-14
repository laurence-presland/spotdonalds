import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("./20261113120000_baseline.sql", import.meta.url),
  "utf8",
);

describe("baseline migration", () => {
  it("creates the spotdonalds schema and enables RLS on healthcheck", () => {
    expect(sql).toMatch(/create schema if not exists spotdonalds/i);
    expect(sql).not.toMatch(/create table if not exists public\./i);
    expect(sql).toMatch(/alter table spotdonalds\.healthcheck enable row level security/i);
    expect(sql).toMatch(/revoke all on spotdonalds\.healthcheck from public, anon, authenticated/i);
  });
});
