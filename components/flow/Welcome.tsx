"use client";

import { useEffect, useState } from "react";
import { welcomePlan } from "@/lib/flow/screen";

export function Welcome({ onDone }: { onDone: () => void }) {
  const [dots, setDots] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const plan = welcomePlan(reduced);
    const timers = reduced
      ? [window.setTimeout(() => setDots(plan.dots), 0), window.setTimeout(onDone, plan.holdMs)]
      : [
          window.setTimeout(() => setDots(1), 750),
          window.setTimeout(() => setDots(2), 1500),
          window.setTimeout(() => setDots(3), 2250),
          window.setTimeout(() => setFading(true), plan.holdMs),
          window.setTimeout(onDone, plan.holdMs + plan.fadeMs),
        ];
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [onDone]);

  return (
    <div className={fading ? "welcome welcome-out" : "welcome"}>
      <p>Please drive through{".".repeat(dots)}</p>
    </div>
  );
}
