import { gateway } from "@ai-sdk/gateway";
import { generateText, Output } from "ai";
import { profileModelSchema } from "@/lib/profile/schema";

export const DEFAULT_AI_MODEL = "google/gemini-2.5-flash";

export function aiModel(): string {
  return process.env.AI_MODEL || DEFAULT_AI_MODEL;
}

export async function generateProfile(input: { system: string; prompt: string }): Promise<{
  object: unknown;
  usage: { inputTokens?: number; outputTokens?: number };
}> {
  const result = await generateText({
    model: gateway(aiModel()),
    output: Output.object({ schema: profileModelSchema }),
    system: input.system,
    prompt: input.prompt,
    temperature: 0.2,
    maxRetries: 0,
  });
  return {
    object: result.output,
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}
