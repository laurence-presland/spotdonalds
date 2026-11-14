import { z } from "zod";
import { SIGNAL_KEYS, TRAIT_NAMES } from "@/lib/signals/registry";

export const signalKeySchema = z.enum(SIGNAL_KEYS);
export const traitNameSchema = z.enum(TRAIT_NAMES);

export const profileModelSchema = z
  .object({
    persona_name: z.string().min(1),
    tagline: z.string().min(1),
    insights: z
      .array(
        z.object({
          text: z.string().min(1),
          cites: z.array(signalKeySchema).min(1),
        }),
      )
      .min(2)
      .max(3),
    traits: z
      .array(
        z.object({
          name: traitNameSchema,
          explanation: z.string().min(1),
          cites: z.array(signalKeySchema).min(1),
        }),
      )
      .length(4),
    caveats: z.array(z.string()),
  })
  .superRefine((profile, context) => {
    const names = profile.traits.map((trait) => trait.name);
    if (new Set(names).size !== TRAIT_NAMES.length) {
      context.addIssue({ code: "custom", message: "traits must be the four fixed names", path: ["traits"] });
    }
  });

export type ProfileDraft = z.infer<typeof profileModelSchema>;
