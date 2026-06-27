#!/usr/bin/env bash
#
# ralph-preflight-hook.sh — Claude Code SessionStart hook for the ralph loop.
#
# Prints a FAST, OFFLINE orientation banner at the start of every Claude session
# so a cold agent converges in seconds: git HEAD/branch/date, which .ralph
# sentinels exist, whether STEER.md is present (read it FIRST), and the
# "NEXT ITERATION FOCUS" section from .ralph/PROGRESS.md.
#
# Wired in via .claude/settings.json -> hooks.SessionStart[].hooks[] (type
# "command"). It NEVER runs npm / git fetch / anything network-bound — it must
# be instant. It ALWAYS exits 0 so it can never block a session from starting.
#
# Output goes to stdout; Claude Code surfaces SessionStart hook stdout as
# additional context for the session.
#
set -o pipefail

# Resolve the project root from this script's location (BSD/macOS-safe).
SCRIPT_DIR="$(cd "$(dirname "$0")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
RALPH_DIR="$PROJECT_ROOT/.ralph"

cd "$PROJECT_ROOT" 2>/dev/null || exit 0

echo "================ RALPH PREFLIGHT (portfolio3js) ================"
echo "date    : $(date '+%Y-%m-%d %H:%M:%S %Z')"

# --- git HEAD + branch (local only; no fetch) --------------------------------
if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  head="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
  subject="$(git log -1 --pretty=%s 2>/dev/null || echo '')"
  dirty="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  echo "branch  : $branch"
  echo "HEAD    : $head — $subject"
  echo "tree    : ${dirty} uncommitted path(s)"
else
  echo "git     : (not a git repo or git unavailable)"
fi

# --- .ralph sentinels --------------------------------------------------------
present=""
for s in KILL.md PAUSE.md DONE BLOCKED; do
  [ -e "$RALPH_DIR/$s" ] && present="$present $s"
done
if [ -n "$present" ]; then
  echo "SENTINELS:$present  <-- IMPORTANT: a stop/pause/done/blocked sentinel is present."
else
  echo "sentinels: none (KILL/PAUSE/DONE/BLOCKED all clear)"
fi

# --- owner steering channel: read FIRST --------------------------------------
if [ -f "$RALPH_DIR/STEER.md" ]; then
  echo "---------------- STEER.md (owner nudges — READ FIRST) ----------------"
  # Trim to a sane length so the banner stays fast/small.
  sed -n '1,40p' "$RALPH_DIR/STEER.md"
else
  echo "steer   : no .ralph/STEER.md (no active owner nudges)"
fi

# --- NEXT ITERATION FOCUS from PROGRESS.md -----------------------------------
PROG="$RALPH_DIR/PROGRESS.md"
if [ -f "$PROG" ]; then
  echo "---------------- NEXT ITERATION FOCUS (from PROGRESS.md) -------------"
  # Print from the '## NEXT ITERATION FOCUS' heading up to (but not including)
  # the next '## ' heading. awk is offline + instant.
  awk '
    /^##[[:space:]]+NEXT ITERATION FOCUS/ { grab=1; next }
    grab && /^##[[:space:]]/             { grab=0 }
    grab                                 { print }
  ' "$PROG" | sed '/^[[:space:]]*$/d'
else
  echo "progress: no .ralph/PROGRESS.md yet (first run — seed it this iteration)."
fi

echo "==============================================================="
exit 0
