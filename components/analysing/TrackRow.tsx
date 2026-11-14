import { sourceLabel, type VisibleTrack } from "@/lib/catalogue/present";

const TILES = ["#c4552a", "#292929", "#2f6f4e", "#c44b7a", "#3d4f8a", "#8a5a2a"];

export function TrackRow({ track }: { track: VisibleTrack }) {
  const letter = track.name.trim().charAt(0).toUpperCase() || "?";
  const color = TILES[letter.charCodeAt(0) % TILES.length] ?? TILES[0];
  const label = sourceLabel(track.sources);

  return (
    <li className="track-row">
      {track.image ? (
        // Spotify album art is a remote URL. next/image would need every CDN host.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cover" src={track.image} alt="" width={56} height={56} />
      ) : (
        <span className="letter-tile" style={{ background: color }} aria-hidden="true">
          {letter}
        </span>
      )}
      <div className="track-copy">
        <p className="track-title">{track.name}</p>
        <p className="track-meta">{track.artists.join(", ")}</p>
      </div>
      <p className="track-album">{track.album}</p>
      <p className="track-source">{label}</p>
    </li>
  );
}
