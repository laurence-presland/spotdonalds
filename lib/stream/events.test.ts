import { describe, expect, it } from "vitest";
import { parseStreamEvent } from "@/lib/stream/events";

describe("stream events", () => {
  it("accepts a pipeline stage and keeps endpoint done distinct from stage done", () => {
    expect(parseStreamEvent({ type: "stage", stage: "done" }).type).toBe("stage");
    expect(parseStreamEvent({ type: "done", stage: "ingest" })).toEqual({
      type: "done",
      stage: "ingest",
    });
  });

  it("rejects an unknown event", () => {
    expect(() => parseStreamEvent({ type: "mystery" })).toThrow();
  });
});
