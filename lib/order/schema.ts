import { z } from "zod";
import { loadOrderRules } from "@/lib/order/budget";
import { SIGNAL_KEYS } from "@/lib/signals/registry";

export const popularitySchema = z
  .object({
    popularity_tier: z.enum(["niche", "mid", "mainstream"]),
    reason: z.string().min(1),
  })
  .strict();

const CITE_KEYS = [...SIGNAL_KEYS, "genre.popularity_tier"] as [string, ...string[]];

export function orderSchema(itemIds: string[], tagIds: string[]) {
  const itemId = z.enum(itemIds as [string, ...string[]]);
  const tagId = z.enum(tagIds as [string, ...string[]]);
  const cite = z.enum(CITE_KEYS);
  const sacred = new Set(loadOrderRules().rules.map((rule) => rule.id));
  return z
    .object({
      items: z
        .array(
          z.object({
            item_id: itemId,
            quantity: z.number().int().min(1).max(3),
            justification: z.string().min(1),
            tag_ids: z.array(tagId).min(1),
            rule_ids: z.array(z.string()).min(1),
            cites: z.array(cite).min(1),
          }),
        )
        .min(1),
      invented_rules: z
        .array(
          z.object({
            id: z.string().regex(/^x-[a-z0-9-]+$/),
            description: z.string().min(1),
            basis: z.array(z.enum(SIGNAL_KEYS)),
          }),
        )
        .max(3),
      summary: z.string().min(1),
      confidence_note: z.string(),
      how_we_decided: z.object({
        text: z.string().min(1),
        rule_ids: z.array(z.string()).min(1),
        cites: z.array(cite).min(1),
      }),
    })
    .superRefine((order, context) => {
      const invented = new Set(order.invented_rules.map((rule) => rule.id));
      const known = new Set([...sacred, ...invented]);
      const used = [...order.items.flatMap((item) => item.rule_ids), ...order.how_we_decided.rule_ids];
      for (const id of used) {
        if (!known.has(id)) {
          context.addIssue({ code: "custom", message: `Unknown rule id: ${id}`, path: ["rule_ids"] });
        }
      }
    });
}

export type OrderDraft = z.infer<ReturnType<typeof orderSchema>>;
export type PopularityDraft = z.infer<typeof popularitySchema>;
