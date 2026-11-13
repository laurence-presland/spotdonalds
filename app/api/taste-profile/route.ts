import { getSessionUser } from "@/lib/auth/session";
import { generateProfile } from "@/lib/profile/model";
import { runTasteProfile } from "@/lib/profile/run";
import { supabaseProfileStore } from "@/lib/profile/store";
import { ndjsonResponse } from "@/lib/stream/ndjson";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return ndjsonResponse(async (emit) => {
    let emittedError = false;
    try {
      await runTasteProfile({
        userId: user.id,
        store: supabaseProfileStore(),
        complete: generateProfile,
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
