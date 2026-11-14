export function reconnectDelay(attempt: number): number {
  return Math.min(8_000, 400 * 2 ** attempt);
}
