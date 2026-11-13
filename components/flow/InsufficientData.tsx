"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function InsufficientData({ count }: { count: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const tracks = count === 1 ? "1 track" : `${count} tracks`;

  async function later() {
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
        <p className="eyebrow">Listening history</p>
        <h1>Not enough listening data yet</h1>
        <p role="status">We found {tracks}. A menu needs at least 50 distinct tracks. Try again once Spotify has a bit more history.</p>
        <button type="button" className="button" onClick={() => void later()} disabled={pending}>
          {pending ? "Starting" : "Try again later"}
        </button>
      </section>
    </main>
  );
}
