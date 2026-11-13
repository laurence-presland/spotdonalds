import postgres from "postgres";
import { requireEnv } from "@/lib/env";

const globalForDb = globalThis as unknown as { spotdonaldsSql?: postgres.Sql };

export function sql(): postgres.Sql {
  if (!globalForDb.spotdonaldsSql) {
    const url = requireEnv("DATABASE_URL");
    globalForDb.spotdonaldsSql = postgres(url, {
      prepare: false,
      // Fluid Compute shares this singleton across requests. One connection
      // lets a long analysis pin the render of /app behind it.
      max: 3,
      idle_timeout: 5,
      max_lifetime: 60,
      connect_timeout: 10,
      fetch_types: false,
      ssl: sslMode(url),
      // The transaction pooler does not support channel binding.
      channel_binding: "disable",
      onnotice: false,
      connection: {
        application_name: "spotdonalds",
        statement_timeout: 8000,
        lock_timeout: 3000,
        idle_in_transaction_session_timeout: 8000,
      },
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
