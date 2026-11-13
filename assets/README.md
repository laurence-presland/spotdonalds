# SpotDonalds brand assets

> **Parody / non-commercial.** SpotDonalds is a fun take-home project (Spotify taste profile → a McDonald's-style order). It is a parody, is not affiliated with, endorsed by, or sponsored by McDonald's or Spotify, and is not for commercial use.

All SVGs are self-contained: the wordmark text and the icon "S" are converted to outlines (no font dependency).

## Colours

| Name | Hex | Use |
| --- | --- | --- |
| Yellow | `#FFC72C` | Wordmark and "S" on red or dark |
| Red | `#DA291C` | Backgrounds, wordmark on white |
| Charcoal | `#292929` | Favicon / app icon background |
| White | `#FFFFFF` | Wordmark on dark / tagline |

## Typography

- **Wordmark font:** [Nunito](https://fonts.google.com/specimen/Nunito) (variable), instanced at `wght=1000` (Black), with slight negative tracking and HarfBuzz kerning, then converted to SVG paths. A free, rounded, chunky sans chosen to echo the feel of McDonald's lettering without using any proprietary typeface.
- **Licence:** SIL Open Font License 1.1, copyright 2014 The Nunito Project Authors. See [`fonts/OFL-Nunito.txt`](fonts/OFL-Nunito.txt). Only outlines are embedded in the SVGs; the font file itself is not redistributed here.
- The OG tagline ("Your Spotify taste, served as a drive-thru order.") is also Nunito Black, converted to paths.

## The "S"

The icon "S" is the same Nunito Black "S" glyph used in the wordmark, converted to outlines and centred on its bounding box, so the icon and wordmark always match.

## Files

### `logo/` (wordmark and lockups)

| File | Description |
| --- | --- |
| `logo/wordmark-yellow-on-red.svg` | Yellow wordmark on a red background |
| `logo/wordmark-red.svg` | Red wordmark, transparent (for white/light backgrounds) |
| `logo/wordmark-white.svg` | White wordmark, transparent (for dark backgrounds) |
| `logo/wordmark-yellow.svg` | Yellow wordmark, transparent (for dark backgrounds) |
| `logo/lockup-yellow-on-red.svg` | Yellow "S" icon + wordmark on red |
| `logo/lockup-red.svg` | Red "S" icon + wordmark, transparent |

### `icon/` (the "S")

| File | Description |
| --- | --- |
| `icon/icon-app.svg` | Yellow S on a red rounded square (512 × 512) |
| `icon/icon-roundel.svg` | Yellow S on a red circle |
| `icon/icon-app-yellow.svg` | Red S on a yellow rounded square (inverse) |
| `icon/icon-app-dark.svg` | Yellow S on a charcoal rounded square |
| `icon/icon-s-yellow.svg` | Bare yellow S, transparent |
| `icon/icon-s-red.svg` | Bare red S, transparent |
| `icon/icon-s-white.svg` | Bare white S, transparent |

### `favicon/`

| File | Description |
| --- | --- |
| `favicon/favicon.svg` | Scalable favicon: yellow S on a charcoal rounded square |
| `favicon/favicon.ico` | 16, 32 and 48 px frames (same design) |
| `favicon/apple-touch-icon.png` | 180 × 180, full-bleed charcoal (iOS rounds the corners) |
| `favicon/icon-192.png` | 192 × 192, full-bleed charcoal with extra padding (safe for maskable use) |
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
