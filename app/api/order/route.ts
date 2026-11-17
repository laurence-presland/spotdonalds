import { requireSession } from "@/lib/auth/session";
import { generateOrder, generatePopularity } from "@/lib/order/model";
import { runOrder, type OrderCompletion } from "@/lib/order/run";
import { orderStore } from "@/lib/order/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const complete: OrderCompletion = async (input) => {
  if (input.kind === "popularity") return generatePopularity(input);
  return generateOrder({
    system: input.system,
    prompt: input.prompt,
    itemIds: input.itemIds ?? [],
    tagIds: input.tagIds ?? [],
  });
};

export async function POST(request: Request) {
  const user = await requireSession();
  if (user instanceof Response) return user;
  const force = new URL(request.url).searchParams.get("force") === "1";
  try {
    const order = await runOrder({ userId: user.id, store: orderStore(), complete, force });
    return Response.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The order didn't generate.";
    return Response.json({ error: message }, { status: 500 });
  }
}
