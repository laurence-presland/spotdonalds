import { safeDbMessage, sql } from "@/lib/db";
import { log } from "@/lib/log";

/** Check that the database health row is reachable. */
export async function checkHealth(): Promise<{ ok: true } | { ok: false; status: number }> {
  try {
    const rows = await sql()<{ ok: boolean }[]>`
      select ok from spotdonalds.healthcheck where id = ${1}
    `;
    if (rows[0]?.ok !== true) {
      log("error", "health.failed", { message: "row missing" });
      return { ok: false, status: 503 };
    }
    return { ok: true };
  } catch (error) {
    log("error", "health.failed", { message: safeDbMessage(error) });
    return { ok: false, status: 503 };
  }
}
