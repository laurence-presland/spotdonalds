import { describe, expect, it } from "vitest";
import {
  recentlyPlayedPayload,
  spotifyTrack,
  topArtistsPayload,
  topTracksPayload,
} from "@/lib/spotify/fixtures";
import { normaliseRecentPlays, normaliseTopArtists, normaliseTopTracks, normaliseTrack } from "@/lib/spotify/normalise";

describe("normalise", () => {
  it("keeps ISRC, album art, artists and release date from a Spotify track", () => {
    const track = normaliseTrack(spotifyTrack);
    expect(track).toMatchObject({
      spotify_id: "track-1",
      isrc: "AUXYZ2400001",
      name: "Yellow Arches",
      album_name: "Drive Through",
      album_image_url: "https://i.scdn.co/image/large",
      release_date: "2024-05-01",
      duration_ms: 210000,
      explicit: false,
      external_url: "https://open.spotify.com/track/track-1",
    });
    expect(track?.artists).toEqual([{ spotify_id: "artist-1", name: "Ada", position: 0 }]);
  });

  it("stores a missing ISRC as null and drops items that are not tracks", () => {
    const plays = normaliseRecentPlays(recentlyPlayedPayload);
    expect(plays).toHaveLength(3);
    expect(plays[2]?.track.isrc).toBeNull();
    expect(plays.map((play) => play.played_at)).toEqual([
      "2026-11-01T08:00:00.000Z",
      "2026-11-02T08:00:00.000Z",
      "2026-11-04T08:00:00.000Z",
    ]);
  });

  it("ranks top tracks and artists per window and keeps unreliable artist genres", () => {
    const tracks = normaliseTopTracks(topTracksPayload, "short_term");
    expect(tracks.map((row) => row.rank)).toEqual([1, 2]);
    expect(tracks[0]?.time_range).toBe("short_term");
    const artists = normaliseTopArtists(topArtistsPayload, "long_term");
    expect(artists[0]?.artist).toMatchObject({
      spotify_id: "artist-1",
      genres: ["indie pop", "australian"],
      popularity: 72,
    });
    expect(artists[0]?.rank).toBe(1);
  });
});
