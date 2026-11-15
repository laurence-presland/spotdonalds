export type LogLevel = "debug" | "info" | "warn" | "error";

const REDACTED_KEYS = new Set([
  "access_token",
  "refresh_token",
  "provider_token",
  "provider_refresh_token",
  "authorization",
  "email",
  "token",
  "secret",
  "api_key",
  "apikey",
  "database_url",
  "password",
  "lease_token",
]);

/** Strip tokens, secrets, and emails from a log payload. */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else {
      out[key] = redact(inner);
    }
  }
  return out;
}

/** Write a single JSON log line, with secrets redacted. */
export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}
