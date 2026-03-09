#!/usr/bin/env bash
set -euo pipefail
pid="${1:-}"
if [[ -z "$pid" ]]; then
  pid=$(pgrep -f './build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold' | head -n 1 || true)
fi
if [[ -z "$pid" ]]; then
  echo "no manifold pid found" >&2
  exit 1
fi
stamp=$(date +%Y%m%d-%H%M%S)
out="/tmp/manifold-gdb-${pid}-${stamp}.log"
echo "capturing gdb backtrace for pid $pid -> $out" >&2
gdb -q -batch -p "$pid" \
  -ex 'set pagination off' \
  -ex 'info threads' \
  -ex 'thread apply all bt' \
  > "$out" 2>&1 || true
echo "$out"
