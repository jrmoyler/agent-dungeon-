#!/usr/bin/env bash
# Rebuild atlas/*.webp from art/source/*.png  (needs: python3, pillow, numpy, scipy)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$HERE/../.."
mkdir -p "$ROOT/build/clean"
for n in 90 91 92 93 94 95 96 97; do python3 "$HERE/clean.py" "$ROOT/art/source/10000111$n.png" "$ROOT/build/clean/c$n.png"; done
python3 "$HERE/build_assets.py"
python3 "$HERE/pack.py"
