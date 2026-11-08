#!/bin/bash
# Plus Store - read-only iOS signing diagnostic for a trusted Mac.
# Usage: bash signing/mac-check.sh /path/to/OwnedApp.app [/path/to/Profile.mobileprovision]
# This script does NOT sign anything, export credentials, or upload files.
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: Run on macOS with Xcode command line tools installed." >&2; exit 2
fi
if [[ $# -lt 1 || $# -gt 2 || ! -d "$1" || "$1" != *.app ]]; then
  echo "Usage: bash signing/mac-check.sh /absolute/path/to/OwnedApp.app [/absolute/path/to/Profile.mobileprovision]" >&2; exit 2
fi
APP="$1"
echo "== Plus Store signing diagnostic (read-only) =="
echo "Step 1: macOS code signing identities found:"
security find-identity -v -p codesigning || true
echo "Step 2: bundle identifier:"
/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist"
echo "Step 3: inspect current code signature:"
codesign --display --verbose=2 "$APP" 2>&1 || true
echo "Step 4: verify current app signature:"
if codesign --verify --deep --strict --verbose=2 "$APP"; then
  echo "App signature verification passed (not proof of authorized distribution or iPhone install)."
else
  echo "App signature verification failed." >&2
  exit 3
fi
if [[ $# -eq 2 ]]; then
  PROFILE="$2"
  if [[ ! -f "$PROFILE" ]]; then echo "Profile not found." >&2; exit 2; fi
  TMPFILE="$(mktemp /tmp/plus-store-profile.XXXXXX)"
  trap 'rm -f "$TMPFILE"' EXIT
  echo "Step 5: decode provisioning profile on this Mac (no network upload):"
  security cms -D -i "$PROFILE" -o "$TMPFILE"
  echo "Profile name:"
  /usr/libexec/PlistBuddy -c 'Print :Name' "$TMPFILE"
  echo "Profile expiry:"
  /usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$TMPFILE"
  echo "Profile decoded. Confirm Apple trust, team, entitlements, devices and certificate separately."
fi
echo "RESULT: READ-ONLY DIAGNOSTIC ONLY; no new IPA was signed or installed."
