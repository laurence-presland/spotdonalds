"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunError({ message }: { message: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    await fetch("/api/analyse?retry=1", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="denied">
      <section className="denied-card">
        <p className="eyebrow">Analysis</p>
        <h1>The analysis stopped.</h1>
        <p role="alert">{message}</p>
        <button type="button" className="button" onClick={retry} disabled={pending}>
          {pending ? "Trying again" : "Try again"}
        </button>
      </section>
    </main>
  );
}
