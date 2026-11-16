#!/usr/bin/env bash
# Prints the entitlements of a simulator build of HealthCal and fails when HealthKit is not among
# them (without it Apple Health answers "not entitled" and the sync screen says so).
#
#   scripts/ci/check-ios-entitlements.sh <path to HealthCal.app>
#
# A simulator build carries its entitlements in two places, and Xcode's choice between them has
# changed over the years: the ad-hoc code signature ("Sign to Run Locally"), and a __TEXT,__entitlements
# section in the executable, which is what the simulator reads ("simulated entitlements"). Both are
# printed; HealthKit in either one passes. macOS only (codesign, PlistBuddy, segedit).
set -uo pipefail

APP="${1:?path to the .app}"
KEY="com.apple.developer.healthkit"
[ -d "$APP" ] || { echo "::error::no app at $APP"; exit 1; }

EXE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Info.plist")
BUNDLE=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")
echo "app: $APP"
echo "bundle id: $BUNDLE, executable: $EXE, architectures: $(lipo -archs "$APP/$EXE" 2> /dev/null || echo unknown)"

TMP="${RUNNER_TEMP:-/tmp}/entitlements-check"
rm -rf "$TMP" && mkdir -p "$TMP"

echo "--- codesign -d --entitlements - (the signature)"
codesign -d --entitlements - "$APP" > "$TMP/signature.txt" 2>&1 || true
cat "$TMP/signature.txt"

echo "--- codesign -dv (who signed it)"
codesign -dv "$APP" 2>&1 | grep -E "^(Identifier|Format|Signature|TeamIdentifier|Authority)" || true

echo "--- __TEXT,__entitlements in the executable (what the simulator reads)"
if xcrun segedit "$APP/$EXE" -extract __TEXT __entitlements "$TMP/section.plist" > /dev/null 2>&1 && [ -s "$TMP/section.plist" ]; then
  cat "$TMP/section.plist"
  echo
else
  echo "(no such section, or segedit could not read it)"
  : > "$TMP/section.plist"
fi

found=""
grep -q "$KEY" "$TMP/signature.txt" && found="the code signature"
if grep -q "$KEY" "$TMP/section.plist"; then
  found="${found:+$found and }the __entitlements section"
elif [ -z "$found" ] && grep -a -q "<key>$KEY</key>" "$APP/$EXE"; then
  # The section's plist text, found in the binary itself when segedit could not extract it.
  found="the executable (as plist text)"
fi

if [ -n "$found" ]; then
  echo "HealthKit entitlement present in $found"
  exit 0
fi
echo "::error::$KEY is missing from the build's entitlements: Apple Health will answer 'not entitled'. See the printout above and ios/*/*.entitlements from prebuild."
exit 1
