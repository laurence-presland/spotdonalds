"use client";

import { useState } from "react";

export function RegenerateOrderButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="button receipt-regenerate"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void fetch("/api/order?force=1", { method: "POST" }).then(() => window.location.reload());
      }}
    >
      {pending ? "Regenerating" : "Regenerate order"}
    </button>
  );
}
