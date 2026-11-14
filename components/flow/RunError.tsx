"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunError({
  message,
  title = "The analysis stopped.",
  action = "analyse",
}: {
  message: string;
  title?: string;
  action?: "analyse" | "reload";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function retry() {
    setPending(true);
    try {
      if (action === "analyse") await fetch("/api/analyse?retry=1", { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function startFresh() {
    setPending(true);
    try {
      await fetch("/api/analyse?fresh=1", { method: "POST" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="denied">
      <section className="denied-card">
        <p className="eyebrow">Analysis</p>
        <h1>{title}</h1>
        <p role="alert">{message}</p>
        <div className="button-row">
          <button type="button" className="button" onClick={retry} disabled={pending}>
            {pending ? "Trying again" : "Try again"}
          </button>
          {action === "analyse" ? (
            <button type="button" className="button" onClick={startFresh} disabled={pending}>
              Start fresh
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
