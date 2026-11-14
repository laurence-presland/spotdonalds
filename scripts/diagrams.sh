#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

chrome="${CHROME_PATH:-}"
if [[ -z "$chrome" ]]; then
  for candidate in /usr/local/bin/google-chrome /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser; do
    if [[ -x "$candidate" ]]; then
      chrome="$candidate"
      break
    fi
  done
fi

args=()
config=""
if [[ -n "$chrome" ]]; then
  config="$(mktemp)"
  printf '{"executablePath":"%s","args":["--no-sandbox","--disable-dev-shm-usage"]}\n' "$chrome" >"$config"
  args+=(-p "$config")
fi

cleanup() {
  if [[ -n "$config" ]]; then
    rm -f "$config"
  fi
}
trap cleanup EXIT

for name in spotify-login ingestion-workflow frontend-calls; do
  mmdc "${args[@]}" -i "docs/architecture/${name}.mmd" -o "docs/architecture/${name}.svg" -b white
  mmdc "${args[@]}" -i "docs/architecture/${name}.mmd" -o "docs/architecture/${name}.png" -b white
done
