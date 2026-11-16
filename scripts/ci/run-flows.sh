#!/usr/bin/env bash
# Runs Maestro flows one after another on one simulator or emulator and keeps the evidence of each,
# for .github/workflows/phone-test.yml (and for a run on your desk).
#
#   scripts/ci/run-flows.sh <ios|android> <device id> <results dir> <flow name>...
#
# A flow name is a file in .maestro/ without .yml. For each flow, <results dir>/<flow>/ gets:
#   *.png              the flow's own takeScreenshot pictures (Maestro writes them to the folder it runs in)
#   console.txt        what Maestro printed
#   report.xml         Maestro's JUnit report
#   debug/             Maestro's debug output (commands-*.json with each step's status, maestro.log)
#   result.txt         passed or failed
# and, when the flow failed, what was on screen at that moment:
#   failure-hierarchy.json   `maestro hierarchy`, the elements and their ids and words
#   zz-failure-screen.png    a screenshot taken by the simulator or emulator itself
# <results dir>/order.txt lists the flows in the order they ran.
#
# Every flow runs even when an earlier one failed (a later one's pictures still say something).
# The exit code is 1 when any flow failed. Written for bash 3.2 (macOS) as well as bash 5.
set -uo pipefail

if [ $# -lt 4 ]; then
  echo "usage: $0 <ios|android> <device id> <results dir> <flow name>..." >&2
  exit 2
fi
PLATFORM="$1"
DEVICE="$2"
OUT="$3"
shift 3

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"

if ! command -v maestro > /dev/null; then
  echo "maestro is not on PATH" >&2
  exit 2
fi

screen_now() {
  # The device's own screenshot, independent of Maestro (which may be what broke).
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl io "$DEVICE" screenshot "$1" > /dev/null 2>&1 || true
  else
    adb -s "$DEVICE" exec-out screencap -p > "$1" 2> /dev/null || true
  fi
  [ -s "$1" ] || rm -f "$1"
}

failed=0
for name in "$@"; do
  flow="$ROOT/.maestro/$name.yml"
  dir="$OUT/$name"
  rm -rf "$dir"
  mkdir -p "$dir/debug"
  echo "$name" >> "$OUT/order.txt"

  if [ ! -f "$flow" ]; then
    echo "::error::no flow file .maestro/$name.yml"
    echo failed > "$dir/result.txt"
    echo "flow file .maestro/$name.yml not found" > "$dir/failure.txt"
    failed=1
    continue
  fi

  echo "::group::$PLATFORM: $name"
  started=$(date +%s)
  (
    cd "$dir" &&
      maestro --device="$DEVICE" test \
        --no-ansi \
        --format=JUNIT --output="$dir/report.xml" \
        --test-output-dir="$dir" \
        --debug-output="$dir/debug" --flatten-debug-output \
        "$flow"
  ) 2>&1 | tee "$dir/console.txt"
  code=${PIPESTATUS[0]}
  echo "::endgroup::"
  took=$(($(date +%s) - started))

  if [ "$code" -eq 0 ]; then
    echo passed > "$dir/result.txt"
    echo "$PLATFORM: $name passed in ${took}s"
  else
    echo failed > "$dir/result.txt"
    failed=1
    echo "::warning::$PLATFORM: $name failed (exit $code) after ${took}s; saving the screen and its hierarchy"
    screen_now "$dir/zz-failure-screen.png"
    # At most 2 minutes: a broken driver must not hang the step (macOS has no GNU timeout; perl's alarm
    # survives the exec).
    perl -e 'alarm shift; exec @ARGV' 120 maestro --device="$DEVICE" hierarchy \
      > "$dir/failure-hierarchy.json" 2> "$dir/failure-hierarchy.err" || true
    [ -s "$dir/failure-hierarchy.err" ] || rm -f "$dir/failure-hierarchy.err"
  fi
done

exit $failed
