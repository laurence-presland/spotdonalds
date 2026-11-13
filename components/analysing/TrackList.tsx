import { windowName, type AnalysingState } from "@/lib/analysing/reduce";
import type { Term } from "@/lib/stream/events";
import { TrackRow } from "@/components/analysing/TrackRow";

export type ListTab = "recent" | "top-tracks" | "top-artists";

export function TrackList({
  state,
  tab,
  window,
}: {
  state: AnalysingState;
  tab: ListTab;
  window: Term | "all";
}) {
  if (tab === "top-artists") {
    const artists = state.artists.filter((artist) => window === "all" || artist.time_range === window);
    if (artists.length === 0) return <p className="empty-list">Nothing in this tab yet.</p>;
    return (
      <ul className="track-list">
        {artists.map((artist) => (
          <li key={`${artist.id}:${artist.time_range}`} className="track-row">
            <span className="letter-tile" aria-hidden="true">
              {artist.name.charAt(0).toUpperCase()}
            </span>
            <div className="track-copy">
              <p className="track-title">{artist.name}</p>
              <p className="track-meta">Artist</p>
            </div>
            <p className="track-album" />
            <p className="track-source">
              Top · {windowName(artist.time_range)} · #{artist.rank}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  const tracks = state.tracks.filter((track) => {
    if (tab === "recent") return track.sources.some((source) => source.kind === "recent");
    return track.sources.some(
      (source) => source.kind === "top-track" && (window === "all" || source.time_range === window),
    );
  });
  if (tracks.length === 0) return <p className="empty-list">Nothing in this tab yet.</p>;
  return (
    <ul className="track-list">
      {tracks.map((track) => (
        <TrackRow key={track.id} track={track} />
      ))}
    </ul>
  );
}
