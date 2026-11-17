import { generateOrder, generatePopularity } from "@/lib/order/model";
import { runOrder, runPopularity, type OrderCompletion } from "@/lib/order/run";
import { orderStore } from "@/lib/order/store";

const complete: OrderCompletion = (call) => {
  if (call.kind === "popularity") return generatePopularity(call);
  return generateOrder({
    system: call.system,
    prompt: call.prompt,
    itemIds: call.itemIds ?? [],
    tagIds: call.tagIds ?? [],
  });
};

/** Score popularity and build the menu order for this user. */
export async function generateUserOrder(userId: string): Promise<void> {
  const store = orderStore();
  await runPopularity({ userId, store, complete });
  await runOrder({ userId, store, complete });
}
