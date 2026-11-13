import type { VisibleStage } from "@/lib/analysing/reduce";

const STAGES: { id: VisibleStage; label: string }[] = [
  { id: "reading", label: "Reading your history" },
  { id: "taste", label: "Analysing your taste" },
  { id: "order", label: "Assembling your order" },
];

export function IngestionProgress({
  stage,
  count,
  progressDone,
  progressTotal,
}: {
  stage: VisibleStage;
  count: number;
  progressDone: number;
  progressTotal: number;
}) {
  const index = STAGES.findIndex((item) => item.id === stage);
  const readingFraction = progressTotal > 0 ? Math.min(1, progressDone / progressTotal) : 0.15;
  const fraction = stage === "reading" ? readingFraction / 3 : stage === "taste" ? 2 / 3 : 1;
  const label = count === 1 ? "1 track" : `${count} tracks`;

  return (
    <section className="progress" aria-labelledby="analysis-progress-label">
      <ol className="stages">
        {STAGES.map((item, itemIndex) => (
          <li key={item.id} aria-current={item.id === stage ? "step" : undefined} data-state={stateOf(itemIndex, index)}>
            {item.label}
          </li>
        ))}
      </ol>
      <p id="analysis-progress-label" className="track-count" aria-live="polite">
        {label}
      </p>
      <div className="progress-track" aria-hidden="true">
        <span className="progress-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
    </section>
  );
}

function stateOf(itemIndex: number, current: number): "done" | "current" | "upcoming" {
  if (itemIndex < current) return "done";
  if (itemIndex === current) return "current";
  return "upcoming";
}
