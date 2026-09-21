#!/usr/bin/env bash
# Builds Metakai the way F-Droid does, in F-Droid's own build server image, from the commit you have checked out.
# Run it before submitting to F-Droid and whenever the recipe (fdroid/com.tfthushaar.metakai.yml) or the way the app
# is built changes. F-Droid's own pipeline runs the same steps, so a pass here is a very good sign.
#   bash scripts/fdroid-build.sh         lint the recipe, then build; the unsigned APK lands in dist/fdroid/
#   bash scripts/fdroid-build.sh lint    lint the recipe only
#   METAKAI_FDROID_ABIS=arm64-v8a bash scripts/fdroid-build.sh    a faster build for one architecture
# Needs Docker and about 8 GB of memory for it. The first run downloads the Android SDK, NDK and Gradle into Docker
# volumes and takes an hour or more; later runs reuse them. Commit first: only committed changes are built.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE=registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie
# Docker volumes that keep the downloaded Android SDK, NDK, Gradle and npm packages between runs.
CACHE="${METAKAI_FDROID_CACHE:-metakai-fdroid}"

if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no -- . ':!docs/app' ':!docs/404.html')" ]; then
  echo "There are uncommitted changes, and they won't be in this build. Commit them first." >&2
  exit 1
fi

mkdir -p "$ROOT/dist/fdroid"
# Like F-Droid's own runners, use a few CPUs: the C++ compilers each take a good deal of memory, and one per core adds up.
CPUS="${METAKAI_FDROID_CPUS:-4}"
AVAILABLE="$(docker info --format '{{.NCPU}}' 2>/dev/null || echo "$CPUS")"
[ "$AVAILABLE" -lt "$CPUS" ] && CPUS="$AVAILABLE"
# Git Bash on Windows would otherwise rewrite the container paths below.
export MSYS_NO_PATHCONV=1
docker run --rm --cpuset-cpus="0-$((CPUS - 1))" --memory="${METAKAI_FDROID_MEMORY:-6500m}" \
  -e "FDROID_STEP=${1:-build}" -e "FDROID_ABIS=${METAKAI_FDROID_ABIS:-}" \
  -v "$ROOT:/src:ro" -v "$ROOT/dist/fdroid:/out" \
  -v "$CACHE-gradle:/home/vagrant/.gradle" -v "$CACHE-npm:/home/vagrant/.npm" -v "$CACHE-sdk:/opt/android-sdk" \
  --entrypoint /bin/bash "$IMAGE" /src/scripts/fdroid-build-container.sh
echo "Done. The unsigned APK, if any, is in dist/fdroid/."
