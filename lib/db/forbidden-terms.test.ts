import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const forbidden = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_DB_SCHEMA",
  "createAdminClient",
  "db: { schema",
  '.schema("spotdonalds")',
  ".schema('spotdonalds')",
];

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.endsWith(".test.ts")) continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) found.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name)) found.push(path);
  }
  return found;
}

describe("data access", () => {
  it("does not use the Supabase Data API or the secret key", () => {
    const files = [...sourceFiles("app"), ...sourceFiles("lib"), ...sourceFiles("components"), "proxy.ts"];
    const hits: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const term of forbidden) {
        if (text.includes(term)) hits.push(`${file}: ${term}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
