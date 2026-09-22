#!/bin/sh
set -eu
dest="${HOME}/.local/bin/berth"
mkdir -p "${HOME}/.local/bin"
curl -fsSL "https://raw.githubusercontent.com/mikeshobes718/berth-cli/main/berth" -o "${dest}.tmp"
chmod 755 "${dest}.tmp"
mv "${dest}.tmp" "${dest}"
echo "Installed ${dest}"
case ":${PATH}:" in
  *":${HOME}/.local/bin:"*) ;;
  *) echo "Add this to your shell config: export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac
