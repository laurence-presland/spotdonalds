# SpotDonalds brand assets

> **Parody / non-commercial.** SpotDonalds is a fun take-home project (Spotify taste profile → a McDonald's-style order). It is a parody, is not affiliated with, endorsed by, or sponsored by McDonald's or Spotify, and is not for commercial use.

All SVGs are self-contained: the wordmark text is converted to outlines (no font dependency), and the icon "S" is hand-built from stroked paths.

## Colours

| Name | Hex | Use |
| --- | --- | --- |
| Yellow | `#FFC72C` | Wordmark and "S" on red |
| Red | `#DA291C` | Backgrounds, wordmark on white |
| White | `#FFFFFF` | Wordmark on dark / tagline |
| Green (accent) | `#1DB954` | Small nod to Spotify (duo wordmark, OG accent bar) |

## Typography

- **Wordmark font:** [Nunito](https://fonts.google.com/specimen/Nunito) (variable), instanced at `wght=1000` (Black), with slight negative tracking and HarfBuzz kerning, then converted to SVG paths. A free, rounded, chunky sans chosen to echo the feel of McDonald's lettering without using any proprietary typeface.
- **Licence:** SIL Open Font License 1.1, copyright 2014 The Nunito Project Authors. See [`fonts/OFL-Nunito.txt`](fonts/OFL-Nunito.txt). Only outlines are embedded in the SVGs; the font file itself is not redistributed here.
- The OG tagline ("Your Spotify taste, served as a drive-thru order.") is also Nunito Black, converted to paths.

## The "S"

Two thick, round-capped arches (a top arch with a straight left leg, a bottom arch with a straight right leg) joined by a flowing spine, in the spirit of the Golden Arches. Same stroke weight and rounded feel throughout. Terminals curl in slightly early so the counters stay open and the S reads at 16 px.

## Files

### `logo/` (wordmark and lockups)

| File | Description |
| --- | --- |
| `logo/wordmark-yellow-on-red.svg` | Yellow wordmark on a red background |
| `logo/wordmark-red.svg` | Red wordmark, transparent (for white/light backgrounds) |
| `logo/wordmark-white.svg` | White wordmark, transparent (for dark backgrounds) |
| `logo/wordmark-yellow.svg` | Yellow wordmark, transparent (for dark backgrounds) |
| `logo/wordmark-duo-green.svg` | "Spot" in Spotify green, "Donalds" in red, transparent (for white backgrounds) |
| `logo/lockup-yellow-on-red.svg` | Yellow "S" icon + wordmark on red |
| `logo/lockup-red.svg` | Red "S" icon + wordmark, transparent |

### `icon/` (the "S")

| File | Description |
| --- | --- |
| `icon/icon-app.svg` | Yellow S on a red rounded square (512 × 512) |
| `icon/icon-roundel.svg` | Yellow S on a red circle |
| `icon/icon-app-yellow.svg` | Red S on a yellow rounded square (inverse) |
| `icon/icon-s-yellow.svg` | Bare yellow S, transparent |
| `icon/icon-s-red.svg` | Bare red S, transparent |
| `icon/icon-s-white.svg` | Bare white S, transparent |

### `favicon/`

| File | Description |
| --- | --- |
| `favicon/favicon.svg` | Scalable favicon (yellow S on red rounded square, tuned for small sizes) |
| `favicon/favicon.ico` | 16, 32 and 48 px frames |
| `favicon/apple-touch-icon.png` | 180 × 180, full-bleed red (iOS rounds the corners) |
| `favicon/icon-192.png` | 192 × 192, full-bleed red with extra padding (safe for maskable use) |
| `favicon/icon-512.png` | 512 × 512, as above |

### `og/`

| File | Description |
| --- | --- |
| `og/og-image.png` | 1200 × 630 social card: roundel icon + wordmark + tagline on red |
| `og/og-image.svg` | Vector source of the OG card |

### `fonts/`

| File | Description |
| --- | --- |
| `fonts/OFL-Nunito.txt` | Nunito's SIL OFL 1.1 licence |

## Using them in Next.js

Copy what you need to `public/` (or `app/`): `favicon.ico`, `icon.svg` (from `favicon.svg`), `apple-icon.png` (from `apple-touch-icon.png`) and `opengraph-image.png` (from `og-image.png`) are picked up automatically by the App Router file conventions.
