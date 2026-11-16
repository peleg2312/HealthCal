#!/usr/bin/env bash
# Builds an installable Android APK (64-bit ARM) on this machine, without Expo's cloud.
#
#   bash scripts/ops/build-android-apk.sh [commit]        (default: HEAD)
#
# The sources are checked out as a separate git worktree and the native android/ folder is
# generated there, so the working tree is never touched. The app is built against the backend
# named in eas.json (production). The APK is signed with the template's debug key: fine for
# installing by hand, and every build from this script installs over the previous one; a Play
# Store release needs its own key (eas build -p android --profile production).
#
# Needs: a JDK (17 or newer), Node, git, curl, unzip, about 10 GB of disk for the first build.
# The Android command-line tools are downloaded into $ANDROID_HOME (default ~/android-sdk) and
# the build downloads the platform, build tools and NDK it asks for.
#   WORK=<folder>   where the worktree and the result go (default: a folder under the temp dir)
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMMIT="${1:-HEAD}"
WORK="${WORK:-${TMPDIR:-/tmp}/healthcal-apk}"
SRC="$WORK/src"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
mkdir -p "$WORK"
step() { echo; echo "=== $(date -u +%H:%M:%S) $*"; }

step "sources at $COMMIT"
SHA="$(git -C "$REPO" rev-parse "$COMMIT")"
if [ -d "$SRC" ]; then git -C "$SRC" checkout -q --detach "$SHA"; else git -C "$REPO" worktree add -q --detach "$SRC" "$SHA"; fi
git -C "$SRC" log --oneline -1

step "npm ci"
cd "$SRC"
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then npm ci --no-audit --no-fund 2>&1 | tail -3; else echo "node_modules is current"; fi

step "Android command-line tools"
if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  ZIP=$(curl -s --max-time 60 https://dl.google.com/android/repository/repository2-3.xml | grep -o "commandlinetools-linux-[0-9]*_latest.zip" | sort -t- -k3 -n -u | tail -1)
  echo "downloading $ZIP"
  curl -sS --fail --max-time 600 -o "$WORK/cmdline-tools.zip" "https://dl.google.com/android/repository/$ZIP"
  rm -rf "$WORK/cmdline-unzip" && mkdir -p "$WORK/cmdline-unzip" && unzip -q "$WORK/cmdline-tools.zip" -d "$WORK/cmdline-unzip"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest" && mv "$WORK/cmdline-unzip/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
fi
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
set +o pipefail
yes | "$SDKM" --licenses > "$WORK/licenses.log" 2>&1
set -o pipefail
"$SDKM" "platform-tools" 2>&1 | tail -1

step "generate the native Android project"
export EXPO_NO_TELEMETRY=1
# The public backend address and key from eas.json; test hooks stay off in a build people install.
eval "$(node -e 'const e=require(process.argv[1]).build.production.env;for(const k of Object.keys(e))console.log(`export ${k}=${JSON.stringify(e[k])}`)' "$SRC/eas.json")"
unset EXPO_PUBLIC_E2E || true
if [ ! -d android ] || [ "$(cat "$WORK/prebuilt-at" 2>/dev/null)" != "$SHA" ]; then
  npx expo prebuild --platform android --no-install 2>&1 | tail -6
  echo "$SHA" > "$WORK/prebuilt-at"
else
  echo "android/ is already generated for this commit"
fi

step "gradle assembleRelease (arm64-v8a)"
cd android
export NODE_ENV=production
# A shared download proxy can answer "too many requests" when a build fetches many files at once.
# Gradle keeps what it has downloaded, so each attempt gets further: retry with a pause.
ok=0
for attempt in 1 2 3 4 5 6; do
  echo "--- attempt $attempt at $(date -u +%H:%M:%S)"
  set +e
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon --console=plain \
    -Dorg.gradle.internal.repository.max.tentatives=8 -Dorg.gradle.internal.repository.initial.backoff=2000 \
    > "$WORK/gradle-$attempt.log" 2>&1
  code=$?
  set -e
  grep -E "BUILD SUCCESSFUL|BUILD FAILED|What went wrong|Could not|status code|error:|FAILED$" "$WORK/gradle-$attempt.log" | head -12 || true
  if [ $code -eq 0 ]; then ok=1; break; fi
  if ! grep -q "status code 429\|status code 503\|Too Many Requests\|timed out\|Connection reset" "$WORK/gradle-$attempt.log"; then echo "not a download limit: see $WORK/gradle-$attempt.log"; break; fi
  sleep 45
done
[ $ok -eq 1 ] || { echo "BUILD NOT FINISHED"; exit 1; }

step "result"
mkdir -p "$WORK/out"
OUT="$WORK/out/HealthCal-$(git -C "$SRC" rev-parse --short HEAD).apk"
cp "$(ls -1 app/build/outputs/apk/release/*.apk | head -1)" "$OUT"
ls -la "$OUT"
