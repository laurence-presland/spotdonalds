import type { BpmStats } from "@/lib/aggregates/bpm";
import type { WindowArtist } from "@/lib/aggregates/artists";
import type { Coverage } from "@/lib/aggregates/coverage";
import type { TagMix } from "@/lib/aggregates/tags";
import type { Term } from "@/lib/stream/events";

export type PanelStatus = "loading" | "ready" | "empty" | "error";

const WINDOWS: { id: Term; label: string }[] = [
  { id: "short_term", label: "4 weeks" },
  { id: "medium_term", label: "6 months" },
  { id: "long_term", label: "1 year" },
];

function panelMessage(status: PanelStatus): Exclude<PanelStatus, "ready"> {
  if (status === "loading" || status === "error") return status;
  return "empty";
}

function PanelMessage({ status }: { status: Exclude<PanelStatus, "ready"> }) {
  if (status === "loading") return <p className="panel-message">Loading this section.</p>;
  if (status === "error") return <p className="panel-message">This section did not load.</p>;
  return <p className="panel-message">Nothing to show yet.</p>;
}

export function GenreMixChart({ mix, status }: { mix: TagMix | null; status: PanelStatus }) {
  const empty = status === "ready" && (!mix || mix.buckets.length === 0);
  return (
    <section id="genre-mix" className="panel" aria-labelledby="genre-mix-title">
      <h2 id="genre-mix-title">Tag mix</h2>
      {status !== "ready" || empty ? (
        <PanelMessage status={panelMessage(status)} />
      ) : (
        <ul className="mix-list">
          {mix!.buckets.map((bucket) => (
            <li key={bucket.name}>
              <span className="mix-name">{bucket.name}</span>
              <span className="mix-share">{Math.round(bucket.share * 100)}%</span>
              <span className="mix-bar" aria-hidden="true">
                <span style={{ width: `${Math.round(bucket.share * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BpmHistogram({ stats, status }: { stats: BpmStats | null; status: PanelStatus }) {
  const empty = status === "ready" && (!stats || stats.count === 0);
  const peak = Math.max(1, ...(stats?.bins.map((bin) => bin.count) ?? [1]));
  return (
    <section id="bpm" className="panel" aria-labelledby="bpm-title">
      <h2 id="bpm-title">Tempo</h2>
      {status !== "ready" || empty ? (
        <PanelMessage status={panelMessage(status)} />
      ) : (
        <>
          <p className="bpm-mean">
            Mean {Math.round(stats!.mean ?? 0)} BPM
            {stats!.median != null ? ` · middle ${Math.round(stats!.median)}` : ""}
          </p>
          <svg className="bpm-chart" viewBox="0 0 320 120" role="img" aria-label={chartLabel(stats!)}>
            {stats!.bins.map((bin, index) => {
              const height = (bin.count / peak) * 88;
              return (
                <rect
                  key={bin.label}
                  x={16 + index * 50}
                  y={100 - height}
                  width={36}
                  height={height}
                  fill="#da291c"
                  rx={4}
                />
              );
            })}
            {stats!.mean != null ? <line x1={meanX(stats!.mean)} x2={meanX(stats!.mean)} y1={8} y2={108} stroke="#292929" strokeWidth={2} /> : null}
          </svg>
          <table className="bpm-table">
            <caption className="sr-only">Tempo ranges</caption>
            <thead>
              <tr>
                <th scope="col">Range</th>
                <th scope="col">Tracks</th>
              </tr>
            </thead>
            <tbody>
              {stats!.bins.map((bin) => (
                <tr key={bin.label}>
                  <td>{bin.label}</td>
                  <td>{bin.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export function TopArtistsByWindow({
  artists,
  status,
}: {
  artists: Record<Term, WindowArtist[]> | null;
  status: PanelStatus;
}) {
  const empty = status === "ready" && (!artists || WINDOWS.every((window) => artists[window.id].length === 0));
  return (
    <section id="top-artists" className="panel" aria-labelledby="top-artists-title">
      <h2 id="top-artists-title">Top artists</h2>
      {status !== "ready" || empty ? (
        <PanelMessage status={panelMessage(status)} />
      ) : (
        <div className="artist-windows">
          {WINDOWS.map((window) => (
            <div key={window.id}>
              <h3>{window.label}</h3>
              {artists![window.id].length === 0 ? (
                <p className="panel-message">Nothing to show yet.</p>
              ) : (
                <ol>
                  {artists![window.id].map((artist) => (
                    <li key={artist.id}>
                      {artist.rank}. {artist.name}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// Computed for internal use. Results does not mount this.
export function CoverageSummary({ coverage }: { coverage: Coverage }) {
  return (
    <section id="coverage" className="panel" aria-label="Enrichment coverage">
      <h2>Coverage</h2>
      <p>
        Tags {Math.round(coverage.shares.tags * 100)}%, tempo {Math.round(coverage.shares.bpm * 100)}%.
      </p>
    </section>
  );
}

function chartLabel(stats: BpmStats): string {
  const parts = stats.bins.map((bin) => `${bin.label}: ${bin.count}`);
  return `Tempo histogram. Mean ${Math.round(stats.mean ?? 0)} BPM. ${parts.join(", ")}.`;
}

function meanX(mean: number): number {
  const start = 0;
  const end = 200;
  const clamped = Math.min(end, Math.max(start, mean));
  return 16 + ((clamped - start) / (end - start)) * 284;
}
