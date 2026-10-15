#!/usr/bin/env bash
# #221 research probe, macOS only. Loads two real canvases in iOS WebKit on a Simulator: Mobile Safari
# and a bare WKWebView app (Probe.swift), over http (with the desktop's CSP) and, for WKWebView, from file://.
# Expects c223/ and c207/ (checkouts of the two prototype branches) in $WORK. Results land in $WORK/out.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
WORK=${WORK:-$PWD}
OUT=$WORK/out; mkdir -p "$OUT"

UDID=$(xcrun simctl list devices available -j | jq -r '[.devices | to_entries[] | select(.key | test("iOS")) | .value[] | select(.name | startswith("iPhone"))][0].udid')
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl ui "$UDID" appearance light || true
xcrun simctl list runtimes | grep -i ios | tee "$OUT/runtime.txt"
xcrun simctl list devices booted | tee "$OUT/device.txt"

# Build the WKWebView probe app for the simulator.
APP=$WORK/Probe.app; rm -rf "$APP"; mkdir -p "$APP"
SDK=$(xcrun --sdk iphonesimulator --show-sdk-path)
xcrun -sdk iphonesimulator swiftc -sdk "$SDK" -target "$(uname -m)-apple-ios17.0-simulator" -o "$APP/Probe" "$HERE/Probe.swift"
cp "$HERE/Info.plist" "$APP/Info.plist"
codesign --force --sign - "$APP" || true
xcrun simctl install "$UDID" "$APP"

node "$HERE/serve.mjs" "$WORK" 8123 & SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
BASE=http://127.0.0.1:8123
ENTRY_c223=c223/prototypes/canvas/index.html; ENTRY_c207=c207/prototypes/canvas/index.html
ITEM_c223=S-A; ITEM_c207=A

DATA=$(xcrun simctl get_app_container "$UDID" dev.wayfinder.probe data)
for c in c223 c207; do
  # file:// mode: copy the checkout into the app's private Documents, like a cache written by expo-file-system.
  rm -rf "$DATA/Documents/$c"; cp -R "$WORK/$c" "$DATA/Documents/$c"
done

shot() { sleep "${2:-8}"; xcrun simctl io "$UDID" screenshot "$OUT/$1.png"; }

for c in c223 c207; do
  entry=ENTRY_$c; entry=${!entry}; item=ITEM_$c; item=${!item}
  for view in board present; do
    hash=""; [ "$view" = present ] && hash="#$item"
    # Mobile Safari, http.
    xcrun simctl openurl "$UDID" "$BASE/$entry$hash"
    shot "$c-safari-http-$view" 10
    xcrun simctl terminate "$UDID" com.apple.mobilesafari || true
    # WKWebView app, http and file.
    for mode in http file; do
      result="result-$c-$mode-$view.json"
      rm -f "$DATA/Documents/$result"
      if [ $mode = http ]; then url="$BASE/$entry$hash"; root=""; else url="file://$DATA/Documents/$entry$hash"; root="$DATA/Documents/$c"; fi
      xcrun simctl terminate "$UDID" dev.wayfinder.probe || true
      xcrun simctl launch "$UDID" dev.wayfinder.probe -mode $mode -url "$url" -root "$root" -out "$DATA/Documents/$result"
      shot "$c-wkwebview-$mode-$view" 9
      cp "$DATA/Documents/$result" "$OUT/" || echo "no result for $c $mode $view"
    done
  done
done
ls -la "$OUT"
for f in "$OUT"/*.json; do echo "== $f"; cat "$f"; echo; done
