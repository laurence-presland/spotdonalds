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

  async function startFresh() {
    setPending(true);
    await fetch("/api/analyse?fresh=1", { method: "POST" });
    router.refresh();
  }

  return (
    <main className="denied">
      <section className="denied-card">
        <p className="eyebrow">Analysis</p>
        <h1>The analysis stopped.</h1>
        <p role="alert">{message}</p>
        <div className="button-row">
          <button type="button" className="button" onClick={retry} disabled={pending}>
            {pending ? "Trying again" : "Try again"}
          </button>
          <button type="button" className="button" onClick={startFresh} disabled={pending}>
            Start fresh
          </button>
        </div>
      </section>
    </main>
  );
}
