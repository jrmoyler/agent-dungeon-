#!/usr/bin/env bash
# Rebuild every runtime atlas.
#   ./tools/art/make_art.sh <folder with the extracted AI_Dungeon_Batch_04..09 zips>
# The first step re-extracts the original 14 agents from art/source (needs pillow numpy scipy).
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p build/clean
for i in 0 1 2 3 4 5 6 7; do n=$((90 + i)); python3 tools/art/clean.py art/source/10000111$n.png build/clean/c$n.png 2>/dev/null || true; done
python3 tools/art/build_assets.py && python3 tools/art/pack.py
python3 -I tools/art/pack_batches.py "${1:?path to extracted batch zips}"
python3 -I tools/art/animate_legacy.py
python3 -I tools/art/finalize.py
