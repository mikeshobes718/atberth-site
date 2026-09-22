#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
SRC="${BERTH_CLI_SRC:-$HOME/Documents/berth-cli/berth}"
mkdir -p src/cli
cp "$SRC" src/cli/berth
chmod 755 src/cli/berth
echo "Copied $SRC to src/cli/berth ($(wc -c < src/cli/berth | tr -d ' ') bytes)"
