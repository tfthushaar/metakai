#!/usr/bin/env bash
# Builds the Metakai web app into docs/app, which GitHub Pages serves at
# https://tfthushaar.github.io/metakai/app/. Commit and push docs/app to publish.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/docs/app"

cd "$ROOT/app"
# .env.local holds local test settings that must never reach a published build.
if [ -e .env.local ]; then
  echo "app/.env.local exists and would be bundled into the web app. Move it out first." >&2
  exit 1
fi

rm -rf "$OUT"
npx expo export --platform web --output-dir "$OUT"
node "$ROOT/scripts/web-sw.mjs" "$OUT" /metakai/app
# GitHub Pages answers unknown paths with the site's 404.html. Make it the app, so reloading on any
# screen (/metakai/app/you) opens that screen; other missing pages go to the website.
sed 's#<head>#<head><script>if (!location.pathname.startsWith("/metakai/app/")) location.replace("/metakai/");</script>#'   "$OUT/index.html" > "$ROOT/docs/404.html"
echo "Built docs/app"
