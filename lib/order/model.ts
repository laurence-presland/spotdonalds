import { gateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";
import { aiModel } from "@/lib/profile/model";
import { orderSchema, popularitySchema } from "@/lib/order/schema";

/** Ask the model to score genre popularity. */
export async function generatePopularity(input: { system: string; prompt: string }): Promise<{
  object: unknown;
  usage: { inputTokens?: number; outputTokens?: number };
}> {
  const result = await generateText({
    model: gateway(aiModel()),
    output: Output.object({ schema: popularitySchema }),
    system: input.system,
    prompt: input.prompt,
    temperature: 0,
    maxRetries: 0,
  });
  return { object: result.output, usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } };
}

/** Ask the model to build an order from the candidate menu. */
export async function generateOrder(input: {
  system: string;
  prompt: string;
  itemIds: string[];
  tagIds: string[];
}): Promise<{ object: unknown; usage: { inputTokens?: number; outputTokens?: number } }> {
  const result = await generateText({
    model: gateway(aiModel()),
    output: Output.object({ schema: orderSchema(input.itemIds, input.tagIds) }),
    system: input.system,
    prompt: input.prompt,
    temperature: 0.4,
    maxRetries: 0,
  });
  return { object: result.output, usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens } };
}
