const MAX_RETRIES = 2;

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
        throw new Error(`${response.status}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt;
      await deps.sleep(wait);
      attempt += 1;
      continue;
    }
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  }
}
