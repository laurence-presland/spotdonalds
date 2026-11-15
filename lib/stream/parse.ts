import { parseStreamEvent, type StreamEvent } from "@/lib/stream/events";

/** Pull complete stream events out of a buffered NDJSON chunk. */
export function parseNdjsonChunk(buffer: string, chunk: string): { events: StreamEvent[]; rest: string } {
  const text = buffer + chunk;
  const lines = text.split("\n");
  const rest = lines.pop() ?? "";
  const events: StreamEvent[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(parseStreamEvent(JSON.parse(trimmed)));
  }
  return { events, rest };
}
