import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("./20261113125000_orders.sql", import.meta.url), "utf8");

describe("orders migration", () => {
  it("keeps orders and the popularity cache in spotdonalds with RLS", () => {
    expect(sql).toMatch(/create table if not exists spotdonalds\.orders/i);
    expect(sql).toMatch(/create table if not exists spotdonalds\.genre_popularity/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/user_id = auth\.uid\(\)/i);
    expect(sql).not.toMatch(/\bpublic\.orders\b/i);
  });
});