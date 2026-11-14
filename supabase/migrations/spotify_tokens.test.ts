import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20261113121000_spotify_tokens.sql", import.meta.url), "utf8");

describe("spotify token migration", () => {
  it("enables RLS and grants nothing to the publishable-key roles", () => {
    expect(sql).toMatch(/create table if not exists spotdonalds\.spotify_tokens/i);
    expect(sql).toMatch(/alter table spotdonalds\.spotify_tokens enable row level security/i);
    expect(sql).toMatch(/revoke all on spotdonalds\.spotify_tokens from public, anon, authenticated/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).not.toMatch(/grant .+ to anon/i);
    expect(sql).not.toMatch(/grant .+ to authenticated/i);
  });
});
