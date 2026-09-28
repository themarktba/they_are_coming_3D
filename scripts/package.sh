#!/usr/bin/env bash
# Build a self-contained server release: release/tac3d-<version>.tar.gz
# Contents: the built game (dist/index.html), the co-op server, and its only
# runtime dependency (ws). Run with: node server/index.js
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=${1:-$(node -p "require('./package.json').version")}
npm run build
rm -rf release && mkdir -p release/tac3d/server release/tac3d/dist release/tac3d/node_modules
cp server/index.js release/tac3d/server/
cp dist/index.html release/tac3d/dist/
cp -R node_modules/ws release/tac3d/node_modules/
printf '{ "name": "tac3d-server", "version": "%s", "type": "module", "private": true }\n' "$VERSION" > release/tac3d/package.json
# macOS bsdtar would embed extended attributes that GNU tar on the droplet warns about
MACFLAGS=(); tar --version 2>/dev/null | grep -q bsdtar && MACFLAGS=(--no-mac-metadata --no-xattrs)
COPYFILE_DISABLE=1 tar "${MACFLAGS[@]}" -C release -czf "release/tac3d-$VERSION.tar.gz" tac3d
rm -rf release/tac3d
( cd release && (sha256sum "tac3d-$VERSION.tar.gz" 2>/dev/null || shasum -a 256 "tac3d-$VERSION.tar.gz") )
