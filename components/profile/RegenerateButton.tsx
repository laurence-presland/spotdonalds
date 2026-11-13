"use client";

export function RegenerateButton() {
  return (
    <button
      type="button"
      className="button button-quiet"
      onClick={() => {
        void fetch("/api/taste-profile?force=1", { method: "POST" }).then(() => window.location.reload());
      }}
    >
      Regenerate
    </button>
  );
}
