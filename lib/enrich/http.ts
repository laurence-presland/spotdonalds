import { log } from "@/lib/log";

const MAX_RETRIES = 2;
const ERROR_BODY_LIMIT = 300;

/** Fetch JSON, retrying on 429 and 5xx with Retry-After or exponential backoff. */
export async function fetchJson(
  url: string,
  headers: Record<string, string>,
  deps: { fetch: typeof fetch; sleep: (ms: number) => Promise<void> },
): Promise<unknown> {
  let attempt = 0;
  while (true) {
    const response = await deps.fetch(url, { headers });
    if (response.status === 429 || response.status === 503) {
      if (attempt >= MAX_RETRIES) {
        await logHttpError(url, response);
        throw new Error(`${response.status}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt;
      await deps.sleep(wait);
      attempt += 1;
      continue;
    }
    if (!response.ok) {
      if (response.status !== 404) {
        await logHttpError(url, response);
      }
      throw new Error(`${response.status}`);
    }
    return response.json();
  }
}

/** Log a non-404 HTTP error status and a short slice of the response body. */
async function logHttpError(url: string, response: Response): Promise<void> {
  let body = "";
  try {
    body = (await response.text()).slice(0, ERROR_BODY_LIMIT);
  } catch {
    body = "";
  }
  log("warn", "enrich.http", { status: response.status, body, url });
}
