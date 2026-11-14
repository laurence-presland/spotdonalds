import { log } from "@/lib/log";

export async function performLogout(input: {
  origin: string;
  userId: string | null;
  signOut: () => Promise<void>;
}): Promise<{ redirectTo: string }> {
  await input.signOut();
  log("info", "auth.signed_out", { user_id: input.userId });
  return { redirectTo: `${input.origin}/` };
}
