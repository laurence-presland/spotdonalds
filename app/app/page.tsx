import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProtectedHome() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/");

  return (
    <main className="signed-in">
      <h1>You&apos;re in.</h1>
      <p>The drive-through opens once your listening is in.</p>
      <form action="/auth/logout" method="post">
        <button className="button" type="submit">
          Log out
        </button>
      </form>
    </main>
  );
}
