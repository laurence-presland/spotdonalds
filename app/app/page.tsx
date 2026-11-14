import { redirect } from "next/navigation";
import { DriveThrough } from "@/components/flow/DriveThrough";
import { RunError } from "@/components/flow/RunError";
import { AuthUnavailable, getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedHome({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  let user: { id: string } | null;
  try {
    user = await getSessionUser();
  } catch (error) {
    if (error instanceof AuthUnavailable) {
      return <RunError title="The page didn't load." message="Spotify sign-in didn't respond. Try again." action="reload" />;
    }
    throw error;
  }
  if (!user) redirect("/");
  const params = await searchParams;
  return <DriveThrough welcome={params.welcome === "1"} />;
}
