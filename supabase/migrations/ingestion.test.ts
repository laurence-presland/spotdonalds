import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20261113122000_ingestion.sql", import.meta.url), "utf8");

describe("ingestion migration", () => {
  it("enables RLS and limits user tables to the caller's rows", () => {
    for (const table of ["artists", "tracks", "track_artists", "plays", "top_items", "analysis_runs"]) {
      expect(sql).toMatch(new RegExp(`alter table spotdonalds\\.${table} enable row level security`, "i"));
    }
    expect(sql).toMatch(/user_id = auth\.uid\(\)/);
    expect(sql).not.toMatch(/create table if not exists public\./i);
    expect(sql).toMatch(/primary key \(user_id, track_id, played_at\)/i);
    expect(sql).toMatch(/primary key \(user_id, kind, time_range, spotify_id\)/i);
    expect(sql).not.toMatch(/\bwindow\b/);
  });
});