"use client";

import { useEffect, useState } from "react";
import { welcomePlan } from "@/lib/flow/screen";

// Full-screen "Please drive through..." page. By default it holds for a few
// seconds after sign-in and then calls onDone. With hold, it stays up with
// cycling dots until the parent removes it.
export function Welcome({ onDone, hold = false }: { onDone?: () => void; hold?: boolean }) {
  const [dots, setDots] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const plan = welcomePlan(reduced);
    if (hold) {
      if (reduced) {
        const timer = window.setTimeout(() => setDots(plan.dots), 0);
        return () => window.clearTimeout(timer);
      }
      const interval = window.setInterval(() => setDots((value) => (value + 1) % 4), 750);
      return () => window.clearInterval(interval);
    }
    const done = () => onDone?.();
    const timers = reduced
      ? [window.setTimeout(() => setDots(plan.dots), 0), window.setTimeout(done, plan.holdMs)]
      : [
          window.setTimeout(() => setDots(1), 750),
          window.setTimeout(() => setDots(2), 1500),
          window.setTimeout(() => setDots(3), 2250),
          window.setTimeout(() => setFading(true), plan.holdMs),
          window.setTimeout(done, plan.holdMs + plan.fadeMs),
        ];
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [onDone, hold]);

  return (
    <div className={fading ? "welcome welcome-out" : "welcome"} role={hold ? "status" : undefined}>
      <p>Please drive through{".".repeat(dots)}</p>
    </div>
  );
}
