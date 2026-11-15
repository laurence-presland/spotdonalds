import type { TasteSignals, TagShare } from "@/lib/signals/compute";
import { SIGNAL_REGISTRY, roundSignal, type SignalKey } from "@/lib/signals/registry";

/** Prompt token that stands in for a stored signal value. */
export function signalAnchor(key: SignalKey): string {
  if (key.startsWith("tags.") || key === "consistency.tag_drift") return "#genre-mix";
  if (key.startsWith("bpm.")) return "#bpm";
  return "#top-artists";
}

/** Format a stored signal for the prompt or the results screen. */
export function formatStoredSignal(key: SignalKey, signals: TasteSignals): string {
  const value = signals[key];
  if (value == null) return "";
  if (Array.isArray(value)) {
    return (value as TagShare[])
      .slice(0, 3)
      .map((item) => `${item.tag} ${Math.round(item.share * 100)}%`)
      .join(", ");
  }
  const rounded = roundSignal(value, SIGNAL_REGISTRY[key].decimals);
  if (SIGNAL_REGISTRY[key].unit === "0-1") return `${Math.round(rounded * 100)}%`;
  if (SIGNAL_REGISTRY[key].unit === "BPM") return `${rounded} BPM`;
  return String(rounded);
}
