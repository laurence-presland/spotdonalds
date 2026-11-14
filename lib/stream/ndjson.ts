import { parseStreamEvent, type StreamEvent } from "@/lib/stream/events";

export function ndjsonResponse(
  run: (emit: (event: StreamEvent) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        const parsed = parseStreamEvent(event);
        controller.enqueue(encoder.encode(`${JSON.stringify(parsed)}\n`));
      };
      try {
        await run(emit);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Something went wrong";
        emit({ type: "error", code: "internal", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
