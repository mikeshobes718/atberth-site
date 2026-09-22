#!/bin/sh
set -e
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
mkdir -p src/assets

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=1200,630 --screenshot="$TMP/og.png" "file://$PWD/design/og.html" >/dev/null 2>&1
cp "$TMP/og.png" src/assets/og.png

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=512,512 --screenshot="$TMP/icon.png" \
  "file://$PWD/design/icon.html" >/dev/null 2>&1
sips -z 180 180 "$TMP/icon.png" --out src/assets/apple-touch-icon.png >/dev/null
sips -z 32 32 "$TMP/icon.png" --out src/assets/favicon-32.png >/dev/null

rm -rf "$TMP"
ls -la src/assets
