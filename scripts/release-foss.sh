#!/usr/bin/env bash
# Builds the free-software APK (no Google Play services, Firebase or ML Kit) into dist/, signed with the upload key.
# The APK is built by F-Droid's own recipe in F-Droid's own build server image (scripts/fdroid-build.sh), so it is
# the same bytes F-Droid builds: F-Droid can check its rebuild against the APK published here and hand out this
# one, signed by us, instead of signing its own. Commit first: only committed changes are built.
# Needs Docker, the Android SDK build tools (for apksigner) and the upload key in ~/.metakai-signing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGNING="${METAKAI_SIGNING_DIR:-$HOME/.metakai-signing}"

# shellcheck disable=SC1091
. "$SIGNING/credentials.txt"
export METAKAI_KEYSTORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
export METAKAI_KEY_PASSWORD="$ANDROID_KEY_PASSWORD"
if [ -z "${ANDROID_HOME:-}" ]; then
  if [ -n "${LOCALAPPDATA:-}" ]; then export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"; else export ANDROID_HOME="$HOME/Library/Android/sdk"; fi
fi
TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
APKSIGNER="$TOOLS/apksigner"
[ -f "$APKSIGNER" ] || APKSIGNER="$TOOLS/apksigner.bat"

VERSION="$(node -p "require('$ROOT/app/app.json').expo.version")"

rm -rf "$ROOT/dist/fdroid"
bash "$ROOT/scripts/fdroid-build.sh"
UNSIGNED="$(ls "$ROOT"/dist/fdroid/*.apk | head -1)"

node "$ROOT/scripts/check-foss-apk.mjs" "$UNSIGNED"
mkdir -p "$ROOT/dist"
OUT="$ROOT/dist/metakai-$VERSION-foss.apk"
"$APKSIGNER" sign --ks "$SIGNING/metakai-release.jks" --ks-key-alias "$ANDROID_KEY_ALIAS" --v4-signing-enabled false --alignment-preserved true \
  --ks-pass env:METAKAI_KEYSTORE_PASSWORD --key-pass env:METAKAI_KEY_PASSWORD --out "$OUT" "$UNSIGNED"
"$APKSIGNER" verify --print-certs "$OUT" | head -3
echo "Built $OUT"
