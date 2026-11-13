import { getSessionUser } from "@/lib/auth/session";
import { generateOrder, generatePopularity } from "@/lib/order/model";
import { runOrder, type OrderCompletion } from "@/lib/order/run";
import { orderStore } from "@/lib/order/store";
import { ndjsonResponse } from "@/lib/stream/ndjson";

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
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const force = new URL(request.url).searchParams.get("force") === "1";
  return ndjsonResponse(async (emit) => {
    let emittedError = false;
    try {
      await runOrder({
        userId: user.id,
        store: orderStore(),
        complete,
        force,
        emit: (event) => {
          if (event.type === "error") emittedError = true;
          emit(event);
        },
      });
    } catch (error) {
      if (emittedError) return;
      throw error;
    }
  });
}
