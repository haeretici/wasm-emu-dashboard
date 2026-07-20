#!/bin/bash
rm js/nes/core.* js/snes/core.* js/md/genesis.*

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ -f "$HOME/emsdk/emsdk_env.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/emsdk/emsdk_env.sh"
fi

# Prefer the default cache next to emsdk (same filesystem root as system lib sources).
# A workspace cache under /media/... with emsdk under /home/... breaks libGL rebuilds
# because emcc emits relative paths that resolve to the wrong place.
# Only fall back to $ROOT/tmp/emcache when the home/emsdk cache is not writable.
# Explicit EM_CACHE in the environment always wins.
if [ -z "${EM_CACHE:-}" ]; then
  DEFAULT_CACHE="${EMSDK:-$HOME/emsdk}/upstream/emscripten/cache"
  if mkdir -p "$DEFAULT_CACHE" 2>/dev/null && [ -w "$DEFAULT_CACHE" ]; then
    export EM_CACHE="$DEFAULT_CACHE"
  else
    export EM_CACHE="$ROOT/tmp/emcache"
    mkdir -p "$EM_CACHE"
  fi
else
  mkdir -p "$EM_CACHE"
fi

# Keep previous cores until each target rebuild succeeds.
rebuild_nes() {
  emcc src/nes/agnes.c -o js/nes/core.js \
    -O3 \
    -flto \
    -s WASM=1 \
    -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'HEAPU8', 'HEAP32', 'HEAPF32', 'addFunction']" \
    -s ALLOW_TABLE_GROWTH=1 \
    -s MODULARIZE=1 \
    -s EXPORT_NAME="createNesModule" \
    -s INITIAL_MEMORY=16777216 \
    -s MAXIMUM_MEMORY=33554432 \
    -s ALLOW_MEMORY_GROWTH=1 \
    --no-entry
}

rebuild_snes() {
  emcc src/snes9x/source/*.c -o js/snes/core.js \
    -O3 \
    -flto \
    -s WASM=1 \
    -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap', 'HEAP8', 'HEAPU8', 'HEAPF32', 'HEAP32']" \
    -s MODULARIZE=1 \
    -s INITIAL_MEMORY=33554432 \
    -s MAXIMUM_MEMORY=134217728 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s EXPORT_NAME="createSnesModule" \
    --no-entry
}

rebuild_md() {
  (cd src/md/sdl && make -f Makefile.wasm)
  mv -f src/md/sdl/genesis.js js/md/
  mv -f src/md/sdl/genesis.wasm js/md/
}

echo "Building NES..."
rebuild_nes
echo "Building SNES..."
rebuild_snes
echo "Building MD..."
rebuild_md
echo "All cores built."
