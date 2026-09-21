#!/bin/bash
# Runs inside F-Droid's build server image (started by scripts/fdroid-build.sh). It does what the
# "fdroid build" job of F-Droid's fdroiddata CI does for one recipe: lints it, then builds it with the
# same tools and the same scanner. The app comes from the commit checked out in /src.
set -ex
# shellcheck disable=SC1091
source /etc/profile.d/bsenv.sh

APP_ID=com.tfthushaar.metakai
VERSION_CODE="$(sed -n 's/.*"versionCode": *\([0-9]*\).*/\1/p' /src/app/app.json | head -1)"

apt-get update -q
apt-get install -y -q sudo openjdk-21-jdk-headless git curl
update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java || true

# F-Droid's own tool, and the configuration, source libraries and schemas of its fdroiddata repository.
rm -rf "$fdroidserver"
mkdir -p "$fdroidserver"
curl -sS https://gitlab.com/fdroid/fdroidserver/-/archive/master/fdroidserver-master.tar.gz | tar -xz --directory="$fdroidserver" --strip-components=1
rm -rf /tmp/fdroiddata
git clone -q --depth 1 --filter=blob:none --sparse https://gitlab.com/fdroid/fdroiddata.git /tmp/fdroiddata
git -C /tmp/fdroiddata sparse-checkout set config srclibs schemas tools
tar --exclude=.git -C /tmp/fdroiddata -cf - . | tar -C "$home_vagrant" -xf -
chmod 0600 "$home_vagrant/config.yml"
export gpghome=/tmp/foo keystore=/tmp/foo.jks keystorepass=foo keypass=foo serverwebroot=/tmp

# The app, cloned from the mounted repository at the commit that is checked out there, which the recipe builds.
git config --system --add safe.directory '*'
rm -rf "$home_vagrant/repo"
git clone -q /src "$home_vagrant/repo"
COMMIT="$(git -C /src rev-parse HEAD)"

mkdir -p "$home_vagrant/metadata" "$home_vagrant/build" "$home_vagrant/tmp" "$home_vagrant/unsigned" "$home_vagrant/.android" "$home_vagrant/.gradle" "$home_vagrant/.npm"
sed -e "s|^Repo: .*|Repo: $home_vagrant/repo|" -e "s|^\( *commit:\) .*|\1 $COMMIT|" "/src/fdroid/$APP_ID.yml" > "$home_vagrant/metadata/$APP_ID.yml"
if [ -n "${FDROID_ABIS:-}" ]; then
  sed -i "s|reactNativeArchitectures=[a-z0-9_,-]*|reactNativeArchitectures=$FDROID_ABIS|" "$home_vagrant/metadata/$APP_ID.yml"
fi
chown -R vagrant:vagrant "$home_vagrant"

sdkmanager "platform-tools" "build-tools;31.0.0" || true
sysctl fs.inotify.max_user_watches=524288 || true

export GRADLE_USER_HOME="$home_vagrant/.gradle"
fdroid="sudo --preserve-env --user vagrant env PATH=$fdroidserver:$PATH env PYTHONPATH=$fdroidserver:$fdroidserver/examples env PYTHONUNBUFFERED=true env TERM=$TERM env HOME=$home_vagrant fdroid"

cd "$home_vagrant"
# The recipe's Repo is a local path here, which lint rightly dislikes; that is the only warning to expect.
$fdroid lint --verbose "$APP_ID" || true
$fdroid rewritemeta "$APP_ID"
diff "/src/fdroid/$APP_ID.yml" "metadata/$APP_ID.yml" || echo "The recipe isn't in F-Droid's standard layout: copy the changes above, ignoring the repo and commit lines."
[ "${FDROID_STEP:-build}" = "lint" ] && exit 0

$fdroid fetchsrclibs --verbose "$APP_ID:$VERSION_CODE"
set +e
$fdroid build --verbose --test --refresh-scanner --on-server --no-tarball "$APP_ID:$VERSION_CODE"
status=$?
set -e
mkdir -p /out
cp -f tmp/*.apk /out/ 2>/dev/null || true
exit $status
