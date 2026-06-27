#!/usr/bin/env bash
#
# build-guard.sh — the post-iteration / preflight hard gate for the ralph loop.
#
# This is THIS project's guard (it replaces Traxy's asc-submit/build-pace/etc.).
# It verifies the tree is GREEN: the Vite production build compiles AND ESLint
# passes. The agent runs `scripts/build-guard.sh check` as its own hard gate
# each iteration; the watchdog also runs it post-iteration (WARN-only there).
#
# Usage:
#   scripts/build-guard.sh check   # run `npm run build` AND `npm run lint`
#   scripts/build-guard.sh --help
#
# Exit codes:
#   0  both build and lint passed (tree is GREEN)
#   1  build failed
#   2  lint failed
#   3  both failed
#   64 unknown subcommand / usage error
#
# Notes:
#   - Deps are assumed already installed by the main loop (it owns npm; it uses
#     --legacy-peer-deps because React 19 vs react-spring). This guard NEVER
#     runs `npm install` and NEVER pushes.
#   - Output is intentionally concise: on failure we print only the tail of the
#     offending tool's log so the agent can see what broke without noise.
#
set -o pipefail

# Resolve the project root from this script's location, so it works regardless
# of the caller's CWD (BSD/macOS-safe; no realpath dependency).
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"

usage() {
  sed -n '3,26p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
}

# Run an npm script, capture its output, and on failure echo the tail.
# $1 = npm script name, $2 = human label
run_step() {
  local script="$1" label="$2" out rc
  printf '▶ %s (npm run %s)…\n' "$label" "$script" >&2
  out="$(cd "$PROJECT_ROOT" && npm run "$script" 2>&1)"; rc=$?
  if [ "$rc" -ne 0 ]; then
    printf '✗ %s FAILED (exit %s). Last 25 lines:\n' "$label" "$rc" >&2
    printf '%s\n' "$out" | tail -n 25 >&2
    return 1
  fi
  printf '✓ %s passed.\n' "$label" >&2
  return 0
}

cmd_check() {
  local build_rc=0 lint_rc=0

  if ! command -v npm >/dev/null 2>&1; then
    printf 'ERROR: npm not found on PATH — cannot run the build guard.\n' >&2
    return 64
  fi

  run_step build "Vite production build" || build_rc=1
  run_step lint  "ESLint"                || lint_rc=1

  if [ "$build_rc" -eq 0 ] && [ "$lint_rc" -eq 0 ]; then
    printf '✅ build-guard GREEN: build + lint both passed.\n' >&2
    return 0
  fi

  # Distinct exit codes so callers can tell which leg failed.
  if [ "$build_rc" -ne 0 ] && [ "$lint_rc" -ne 0 ]; then
    printf '❌ build-guard RED: build AND lint failed.\n' >&2
    return 3
  elif [ "$build_rc" -ne 0 ]; then
    printf '❌ build-guard RED: build failed (lint passed).\n' >&2
    return 1
  else
    printf '❌ build-guard RED: lint failed (build passed).\n' >&2
    return 2
  fi
}

case "${1:-}" in
  check)        shift; cmd_check "$@" ;;
  -h|--help|'') usage; [ -z "${1:-}" ] && exit 64 || exit 0 ;;
  *)            printf 'unknown subcommand: %s\n\n' "$1" >&2; usage; exit 64 ;;
esac
