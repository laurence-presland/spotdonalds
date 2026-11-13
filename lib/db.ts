import postgres from "postgres";
import { requireEnv } from "@/lib/env";

const globalForDb = globalThis as unknown as { spotdonaldsSql?: postgres.Sql };

export function sql(): postgres.Sql {
  if (!globalForDb.spotdonaldsSql) {
    const url = requireEnv("DATABASE_URL");
    globalForDb.spotdonaldsSql = postgres(url, {
      prepare: false,
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      fetch_types: false,
      ssl: sslMode(url),
      // The transaction pooler does not support channel binding.
      channel_binding: "disable",
      onnotice: false,
    });
  }
  return globalForDb.spotdonaldsSql;
}

function sslMode(url: string): "require" | "disable" {
  try {
    const mode = new URL(url).searchParams.get("sslmode");
    if (mode === "disable") return "disable";
  } catch {
    // A malformed URL fails when the client connects. Default to TLS.
  }
  return "require";
}

export function safeDbMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown";
  return message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted]");
}
