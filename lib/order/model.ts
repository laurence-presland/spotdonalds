import { gateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { aiModel } from "@/lib/profile/model";
import { orderSchema, popularitySchema } from "@/lib/order/schema";

export async function generatePopularity(input: { system: string; prompt: string }): Promise<{
  object: unknown;
  usage: { inputTokens?: number; outputTokens?: number };
}> {
  const result = await generateObject({
    model: gateway(aiModel()),
    schema: popularitySchema,
    system: input.system,
    prompt: input.prompt,
    temperature: 0,
    maxRetries: 0,
  });
  return { object: result.object, usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } };
}

export async function generateOrder(input: {
  system: string;
  prompt: string;
  itemIds: string[];
  tagIds: string[];
}): Promise<{ object: unknown; usage: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateObject({
    model: gateway(aiModel()),
    schema: orderSchema(input.itemIds, input.tagIds),
    system: input.system,
    prompt: input.prompt,
    temperature: 0.4,
    maxRetries: 0,
  });
  return { object: result.object, usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } };
}
