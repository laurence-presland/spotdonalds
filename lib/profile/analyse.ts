import { generateProfile } from "@/lib/profile/model";
import { runTasteProfile } from "@/lib/profile/run";
import { profileStore } from "@/lib/profile/store";

/** Build the taste profile from stored listening. */
export async function analyseTaste(userId: string): Promise<void> {
  await runTasteProfile({ userId, store: profileStore(), complete: generateProfile });
}
