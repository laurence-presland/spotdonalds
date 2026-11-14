export const spotifyTrack = {
  id: "track-1",
  name: "Yellow Arches",
  duration_ms: 210000,
  explicit: false,
  external_ids: { isrc: "AUXYZ2400001" },
  external_urls: { spotify: "https://open.spotify.com/track/track-1" },
  album: {
    name: "Drive Through",
    release_date: "2024-05-01",
    images: [
      { url: "https://i.scdn.co/image/small", width: 64, height: 64 },
      { url: "https://i.scdn.co/image/large", width: 640, height: 640 },
    ],
  },
  artists: [
    {
      id: "artist-1",
      name: "Ada",
      external_urls: { spotify: "https://open.spotify.com/artist/artist-1" },
    },
  ],
};

export const spotifyTrackWithoutIsrc = {
  ...spotifyTrack,
  id: "track-2",
  name: "No Code",
  external_ids: {},
  artists: [{ id: "artist-2", name: "Bea" }],
};

export const recentlyPlayedPayload = {
  items: [
    { track: spotifyTrack, played_at: "2026-11-01T08:00:00.000Z" },
    { track: spotifyTrack, played_at: "2026-11-02T08:00:00.000Z" },
    { played_at: "2026-11-03T08:00:00.000Z" },
    { track: spotifyTrackWithoutIsrc, played_at: "2026-11-04T08:00:00.000Z" },
  ],
};

export const topTracksPayload = { items: [spotifyTrack, spotifyTrackWithoutIsrc] };

export const topArtistsPayload = {
  items: [
    {
      id: "artist-1",
      name: "Ada",
      genres: ["indie pop", "australian"],
      popularity: 72,
      external_urls: { spotify: "https://open.spotify.com/artist/artist-1" },
    },
  ],
};
