import { z } from "zod";

export const pipelineStageSchema = z.enum(["ingest", "enrich", "profile", "order", "done"]);
export const endpointStageSchema = z.enum(["ingest", "enrich", "profile", "order"]);
export const termSchema = z.enum(["short_term", "medium_term", "long_term"]);

export const streamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    stage: pipelineStageSchema,
  }),
  z.object({
    type: z.literal("track"),
    id: z.string(),
    name: z.string(),
    artists: z.array(z.string()),
    album: z.string().nullable(),
    image: z.string().nullable(),
    source: z.enum(["recent", "top"]),
    time_range: termSchema.optional(),
    rank: z.number().int().optional(),
    played_at: z.string().optional(),
  }),
  z.object({
    type: z.literal("artist"),
    id: z.string(),
    name: z.string(),
    source: z.literal("top"),
    time_range: termSchema,
    rank: z.number().int(),
  }),
  z.object({
    type: z.literal("progress"),
    done: z.number().int(),
    total: z.number().int(),
    endpoint: z.string(),
  }),
  z.object({
    type: z.literal("done"),
    stage: endpointStageSchema,
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("enrich_start"),
    total: z.number().int(),
  }),
  z.object({
    type: z.literal("enrich_result"),
    id: z.string(),
    name: z.string(),
    artists: z.array(z.string()),
    album: z.string().nullable(),
    image: z.string().nullable(),
    failures: z.array(z.string()),
  }),
]);

export type StreamEvent = z.infer<typeof streamEventSchema>;
export type PipelineStage = z.infer<typeof pipelineStageSchema>;
export type Term = z.infer<typeof termSchema>;

export const TERMS: Term[] = ["short_term", "medium_term", "long_term"];

export function parseStreamEvent(value: unknown): StreamEvent {
  return streamEventSchema.parse(value);
}
