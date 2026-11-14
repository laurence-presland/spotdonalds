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
  complete = false,
}: {
  stage: VisibleStage;
  count: number;
  progressDone: number;
  progressTotal: number;
  complete?: boolean;
}) {
  const index = STAGES.findIndex((item) => item.id === stage);
  const readingFraction = progressTotal > 0 ? Math.min(1, progressDone / progressTotal) : 0.15;
  const fraction = complete ? 1 : stage === "reading" ? readingFraction / 3 : stage === "taste" ? 2 / 3 : 1;
  const label = complete
    ? count === 1
      ? "1 track ingested"
      : `${count} tracks ingested`
    : count === 1
      ? "1 track"
      : `${count} tracks`;

  return (
    <section className="progress" aria-labelledby="analysis-progress-label">
      <ol className="stages">
        {STAGES.map((item, itemIndex) => {
          const current = !complete && item.id === stage;
          return (
            <li
              key={item.id}
              aria-current={current ? "step" : undefined}
              aria-busy={current ? true : undefined}
              data-state={complete ? "done" : stateOf(itemIndex, index)}
            >
              {item.label}
              {current ? <span className="step-spinner" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
      <p id="analysis-progress-label" className="track-count" aria-live="polite">
        {label}
      </p>
      {complete ? <p className="run-finished">This run is finished.</p> : null}
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
