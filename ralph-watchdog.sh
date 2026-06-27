#!/usr/bin/env bash
#
# ralph-watchdog.sh — Autonomous "ralph loop" runner + watchdog for Claude Code.
# Adapted for THIS project: portfolio3js (React 19 + Vite + react-three-fiber).
#
# What it does:
#   1. RALPH LOOP   — runs Claude headless against the same task over and over,
#                     each iteration with FRESH context, until the task is truly
#                     done (Claude signals completion by creating a DONE file).
#   2. WATCHDOG     — monitors live output; if Claude produces nothing for
#                     IDLE_TIMEOUT seconds (i.e. it's stuck/hung), it kills the
#                     whole process tree and restarts a fresh iteration.
#   3. AUTO-ANSWER  — runs fully unattended: permission prompts are bypassed,
#                     and Claude is instructed that whenever it would ask a
#                     question it must instead pick the FIRST / "(Recommended)"
#                     option and keep going. No human is ever waited on.
#   4. ACCOUNT      — when the ACTIVE Claude account hits its subscription usage
#      FAILOVER       cap, the loop ends that iteration cleanly, switches to the
#                     next configured account, exhausts that one too, and — when
#                     ALL accounts are capped — sleeps until the soonest one's
#                     usage resets, then resumes automatically. Define accounts
#                     (one long-lived `claude setup-token` per login) in
#                     .ralph/accounts.env — see scripts/ralph-accounts.example.env.
#                     With NO accounts file it runs on the ambient keychain login
#                     but STILL detects the cap and waits for the reset.
#   5. BUILD GUARD  — after each iteration, runs scripts/build-guard.sh check
#                     (npm run build + npm run lint). WARN-only, never fatal —
#                     a mid-flight iteration may legitimately leave a red tree.
#
# Usage:
#   ./ralph-watchdog.sh "your task description here"     # inline task
#   ./ralph-watchdog.sh                                  # reads ./PROMPT.md
#   ./ralph-watchdog.sh --help
#
# Run it from your project root. Override any setting via env vars (see CONFIG).
#
#   IDLE_TIMEOUT=600 MODEL=opus ./ralph-watchdog.sh
#
# Stop it any time with Ctrl-C — it cleans up the child process tree.
#
# ⚠️  This passes --dangerously-skip-permissions so Claude can act without
#     prompting. Only run it on a project/repo you trust and have committed.
#
set -o pipefail

# ----------------------------- CONFIG (env-overridable) ----------------------
PROMPT_FILE="${PROMPT_FILE:-PROMPT.md}"   # task file used when no inline arg
RALPH_DIR="${RALPH_DIR:-.ralph}"          # working dir for state/logs/sentinels
LOG_DIR="${LOG_DIR:-$RALPH_DIR/logs}"
DONE_FILE="${DONE_FILE:-$RALPH_DIR/DONE}" # Claude touches this when fully done
BLOCKED_FILE="${BLOCKED_FILE:-$RALPH_DIR/BLOCKED}" # Claude touches this when hard-blocked needing you
STATE_FILE="${STATE_FILE:-$RALPH_DIR/PROGRESS.md}"  # cross-iteration scratchpad
DONE_MD="${DONE_MD:-DONE.md}"             # marker file committed to the main branch when the loop stops
DONE_BRANCH="${DONE_BRANCH:-main}"        # the "master"/main branch to place DONE.md on (local, not pushed)
MAX_STUCK="${MAX_STUCK:-3}"               # consecutive stuck/idle iterations before stopping as BLOCKED (0=never)
IDLE_TIMEOUT="${IDLE_TIMEOUT:-300}"       # secs w/ no output => stuck => restart
HARD_TIMEOUT="${HARD_TIMEOUT:-0}"         # secs absolute per-iteration cap (0=off)
POLL_INTERVAL="${POLL_INTERVAL:-5}"       # how often the watchdog checks
MAX_ITERATIONS="${MAX_ITERATIONS:-0}"     # 0 = loop until DONE
MAX_TURNS="${MAX_TURNS:-0}"               # per-iteration Claude turn cap (0=off)
COOLDOWN="${COOLDOWN:-3}"                 # pause between iterations (secs)
MODEL="${MODEL:-claude-opus-4-8[1m]}"     # Opus 4.8 (1M context) by default; override e.g. MODEL=sonnet
CLAUDE_BIN="${CLAUDE_BIN:-}"             # override path to the claude binary
EXTRA_CLAUDE_ARGS="${EXTRA_CLAUDE_ARGS:-}" # extra args appended verbatim (split on spaces)
# --- owner controls / observability (kill-switch, pause, steer, cost) ---------
KILL_FILE="${KILL_FILE:-$RALPH_DIR/KILL.md}"       # owner drops this => STOP before next iteration (never auto-cleared)
PAUSE_FILE="${PAUSE_FILE:-$RALPH_DIR/PAUSE.md}"    # owner drops this => freeze new iterations until removed
STEER_FILE="${STEER_FILE:-$RALPH_DIR/STEER.md}"    # owner steering channel the agent reads first each iteration
PAUSE_POLL="${PAUSE_POLL:-30}"                     # secs between re-checks while paused
COST_LEDGER="${COST_LEDGER:-$RALPH_DIR/cost-ledger.tsv}"   # per-iteration cost/turns/wall ledger
COST_WARN_USD="${COST_WARN_USD:-0}"               # advisory: WARN if one iteration costs more than this (0=off)
ITER_START_MARKER="${ITER_START_MARKER:-$RALPH_DIR/.iter-start}" # mtime ref for evidence-freshness checks
# --- THIS project's guard (replaces all Traxy guards: asc-submit/build-pace/etc.)
BUILD_GUARD="${BUILD_GUARD:-scripts/build-guard.sh}" # post-iteration build+lint gate (WARN only here)

# --- usage-aware multi-account failover --------------------------------------
# When the ACTIVE Claude account hits its subscription usage cap, end the
# iteration cleanly, switch to the next account, exhaust that too, and — when
# ALL accounts are capped — sleep until the soonest one's usage resets, then
# resume automatically. Accounts are defined in $ACCOUNTS_FILE (gitignored);
# each is a long-lived OAuth token from `claude setup-token` (see
# scripts/ralph-accounts.example.env). With NO accounts file the loop runs on
# the ambient (keychain) login but STILL detects the cap and waits for reset.
ACCOUNTS_FILE="${ACCOUNTS_FILE:-$RALPH_DIR/accounts.env}"      # RALPH_ACCT_N_LABEL/_TOKEN/_CONFIG_DIR (+ RALPH_ACCT_COUNT)
ACCOUNT_STATE_FILE="${ACCOUNT_STATE_FILE:-$RALPH_DIR/account-state.tsv}" # persists per-account "exhausted-until" across restarts
LIMIT_BACKOFF_SECS="${LIMIT_BACKOFF_SECS:-18000}"             # fallback wait when a reset time can't be parsed (5h rolling window)
LIMIT_SLEEP_CAP_SECS="${LIMIT_SLEEP_CAP_SECS:-21600}"         # never sleep longer than this in one go before re-probing (6h)
USAGE_LIMIT_REQUIRE_NONZERO="${USAGE_LIMIT_REQUIRE_NONZERO:-0}" # 1 = also require a non-zero exit (the stderr-line match is already authoritative; keep 0 so a cap that exits 0 can't tight-loop)
NOTIFY_ON_SLEEP="${NOTIFY_ON_SLEEP:-0}"                       # 1 = iMessage the owner once when ALL accounts are capped (uses OWNER_PHONE)
OWNER_PHONE="${OWNER_PHONE:-}"
# Phrases (ERE, case-insensitive) that mean "this account's subscription usage is exhausted".
# Broad on purpose; the runtime-line scoping below keeps it from firing on the agent's own text.
USAGE_LIMIT_RE="${USAGE_LIMIT_RE:-(Claude AI usage limit reached|usage limit reached|hit your usage limit|hit your session limit|reached your (usage|session) limit|weekly limit reached|5-?hour limit reached|exceeded your usage|out of usage|usage limit·|limit reached\\|[0-9]{10})}"

# ----------------------------- usage -----------------------------------------
case "${1:-}" in
  -h|--help)
    sed -n '2,46p' "$0" | sed 's/^#\{0,1\} \{0,1\}//'
    exit 0 ;;
esac

# ----------------------------- paths -----------------------------------------
abspath() { case "$1" in /*) printf '%s' "$1" ;; *) printf '%s' "$PWD/$1" ;; esac; }
RALPH_DIR="$(abspath "$RALPH_DIR")"
LOG_DIR="$(abspath "$LOG_DIR")"
DONE_FILE="$(abspath "$DONE_FILE")"
BLOCKED_FILE="$(abspath "$BLOCKED_FILE")"
STATE_FILE="$(abspath "$STATE_FILE")"
KILL_FILE="$(abspath "$KILL_FILE")"
PAUSE_FILE="$(abspath "$PAUSE_FILE")"
STEER_FILE="$(abspath "$STEER_FILE")"
COST_LEDGER="$(abspath "$COST_LEDGER")"
ITER_START_MARKER="$(abspath "$ITER_START_MARKER")"
ACCOUNTS_FILE="$(abspath "$ACCOUNTS_FILE")"
ACCOUNT_STATE_FILE="$(abspath "$ACCOUNT_STATE_FILE")"
mkdir -p "$LOG_DIR"
[ -f "$RALPH_DIR/.gitignore" ] || printf '*\n!.gitignore\n!PROGRESS.md\n!STEER.md\n' > "$RALPH_DIR/.gitignore"
RUN_LOG="$LOG_DIR/run.log"

# ----------------------------- persistent secrets ----------------------------
# Auto-load secrets so the loop works unattended across brand-new shell sessions
# without exporting anything by hand. Both files are gitignored.
# `set -a` exports everything they define to Claude and its tool subprocesses.
set -a
[ -f "$PWD/.env.ralph" ]        && . "$PWD/.env.ralph"
[ -f "$RALPH_DIR/secrets.env" ] && . "$RALPH_DIR/secrets.env"
set +a
# Account tokens are sourced WITHOUT `set -a`: they stay shell-local to the
# watchdog and are never exported wholesale into Claude's subprocess env — only
# the single ACTIVE account's CLAUDE_CODE_OAUTH_TOKEN is exported per iteration.
[ -f "$ACCOUNTS_FILE" ] && . "$ACCOUNTS_FILE"

# ----------------------------- logging ---------------------------------------
ts() { date '+%H:%M:%S'; }
_log() {
  local color="$1"; shift; local t; t="$(ts)"
  [ -n "$RUN_LOG" ] && printf '[%s] %s\n' "$t" "$*" >> "$RUN_LOG" 2>/dev/null
  printf '%b[%s] %s\033[0m\n' "$color" "$t" "$*" >&2
}
info() { _log '\033[36m' "$*"; }
warn() { _log '\033[33m' "WARN: $*"; }
ok()   { _log '\033[32m' "$*"; }
err()  { _log '\033[31m' "ERROR: $*"; }

# ----------------------------- find the claude binary ------------------------
find_claude() {
  if [ -n "$CLAUDE_BIN" ]; then
    [ -x "$CLAUDE_BIN" ] && { printf '%s' "$CLAUDE_BIN"; return 0; }
    return 1
  fi
  local c; c="$(command -v claude 2>/dev/null)" && { printf '%s' "$c"; return 0; }
  # Newest bundled binary from a VS Code / Cursor extension install.
  local cand
  cand="$(ls -dt \
      "$HOME"/.vscode*/extensions/anthropic.claude-code-*/resources/native-binary/claude \
      "$HOME"/.cursor*/extensions/anthropic.claude-code-*/resources/native-binary/claude \
      2>/dev/null | head -1)"
  [ -n "$cand" ] && [ -x "$cand" ] && { printf '%s' "$cand"; return 0; }
  return 1
}

# ----------------------------- process-tree kill (macOS-safe) ----------------
collect_descendants() {           # echoes pid + all descendant pids
  local pid="$1" child
  printf '%s\n' "$pid"
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    collect_descendants "$child"
  done
}
kill_tree() {
  local root="$1"; [ -n "$root" ] || return 0
  local pids p n=0
  pids="$(collect_descendants "$root" 2>/dev/null)"
  for p in $pids; do kill -TERM "$p" 2>/dev/null; done
  while [ "$n" -lt 12 ]; do                 # up to ~6s for graceful exit
    kill -0 "$root" 2>/dev/null || break
    sleep 0.5; n=$((n + 1))
  done
  for p in $pids; do kill -KILL "$p" 2>/dev/null; done
}

# ----------------------------- cleanup on signal -----------------------------
CURRENT_PID=""; VIEWER_PID=""
cleanup() {
  trap - INT TERM
  echo
  warn "interrupted — shutting down"
  [ -n "$VIEWER_PID" ]  && kill_tree "$VIEWER_PID"
  [ -n "$CURRENT_PID" ] && kill_tree "$CURRENT_PID"
  exit 130
}
trap cleanup INT TERM

# ----------------------------- the autonomy / completion contract ------------
AUTONOMY_PROMPT="You are running UNATTENDED inside an automated restart-and-retry loop (a 'ralph loop'). No human is available at any point.

RULES:
1. NEVER wait for input and NEVER block on a question. If you are about to use AskUserQuestion, ask the user to confirm, or ask the user to choose between options, DO NOT. Instead automatically choose the FIRST option offered — or the option explicitly labeled '(Recommended)' if one exists — briefly note the choice you made, and continue. You already have full permission for every action.
2. Resolve all ambiguity by making the most reasonable assumption and proceeding. Keep working until you genuinely cannot make further progress this turn.
3. You begin EACH iteration with completely fresh context and memory. FIRST, in this order: (a) read the owner steering channel '$STEER_FILE' if it exists — short owner nudges that re-rank PROMPT.md PRIORITY ONLY (they NEVER weaken a hard gate and are NEVER license to create the DONE/BLOCKED sentinels); acknowledge any new/changed entry in your progress write. (b) read the progress file '$STATE_FILE' to learn what is done and what remains. PRECEDENCE when sources disagree (highest wins): hard gates (build-guard exit codes) > PROMPT.md text > '$STEER_FILE' nudges > '$STATE_FILE' notes. At the END of every turn, REWRITE '$STATE_FILE' using this FIXED top-to-bottom template so the next cold agent converges in its first two minutes:
   '## GUARDS & GATES' — one status line for the build-guard (npm run build + npm run lint) with its CURRENT state/exit;
   '## IMMUTABLE ENV FACTS' — explicitly labelled 'do not re-derive' (tooling versions, deploy base path, dep notes, creds locations);
   '## THIS ITERATION' — what you completed + any steer you acknowledged;
   '## NEXT ITERATION FOCUS' — a short numbered list; the TOP item is the single highest-value next action, each line phrased as one acceptance criterion;
   '## GOTCHAS' — traps for the next agent.
4. COMPLETION CONTRACT: Work the task to completion across as many iterations as it takes. ONLY when EVERY part of the task is fully implemented AND verified (build/lint pass, behavior confirmed) — as your very last action — run exactly:  touch '$DONE_FILE'  . If ANY work remains, you MUST NOT create that file.
5. ULTRACODE — MAXIMUM EFFORT: operate in ultracode mode. For every substantive task (feature builds, bug-sweeps, perf/observability, theme work, dependency refreshes) you MUST author and run a multi-agent Workflow — parallel finders/readers, adversarial verification, then synthesis — instead of working solo when that yields a better result. Reserve solo work for trivial mechanical edits and quick checks. Token cost is NOT a constraint; optimize for the most exhaustive, correct result. Only if the Workflow tool were ever unavailable do you fall back to a single agent — without blocking.
6. PROJECT GUARDRAILS (NON-NEGOTIABLE): Never commit copyrighted material — no real song files, no copyrighted character models/art/audio/logos/screenshots, no third-party iframes that violate ToS. Build ORIGINAL, transformative/parody mechanics only. Anything licensable must load at runtime from documented asset SLOTS under public/arcade/... with a graceful fallback (primitive mesh / silence) so the build is green with NO assets present. Keep 'npm run build' AND 'npm run lint' green. Commit coherent local progress but NEVER push. Do NOT edit package.json, package-lock.json, vite.config.js, src/App.jsx, src/main.jsx, src/components/Navbar.jsx, or the root .gitignore unless the task explicitly requires it.
7. HARD-BLOCK STOP: Keep resolving ordinary ambiguity yourself (rule 1) — never stop for anything you can decide, install, or route around. BUT if you reach a point where EVERY remaining piece of work is genuinely blocked on something ONLY the human can provide (a missing/invalid credential or permission you cannot self-grant, an external dependency that does not yet exist, or a decision with no safe default that blocks all further progress), then as your FINAL action write a clear '$RALPH_DIR/BLOCKED.md' (exactly what you need, why, and what you already tried), run exactly:  touch '$BLOCKED_FILE'  , and stop. Do NOT create '$BLOCKED_FILE' if there is ANY other productive work you could do instead. Never create both '$DONE_FILE' and '$BLOCKED_FILE'."

# ----------------------------- stream-json -> friendly live view -------------
VIEW_FILTER='
fromjson? as $j
| if $j == null then empty
  elif $j.type == "assistant" then
      ( $j.message.content[]?
        | if   .type=="text" and ((.text//"")|length>0) then "  " + (.text|gsub("\n";"\n  "))
          elif .type=="tool_use" then
                "  ⚙ " + .name + " "
                + ((.input|tojson) as $in | if ($in|length)>140 then ($in[0:137]+"...") else $in end)
          else empty end )
  elif $j.type == "result" then
      "  ── turn end: " + ($j.subtype // "?")
      + (if $j.is_error then " [ERROR]" else "" end)
      + " · turns=" + (($j.num_turns // 0)|tostring)
      + (if $j.total_cost_usd then " · $" + (($j.total_cost_usd*10000|round)/10000|tostring) else "" end)
  else empty end
'

# ----------------------------- one iteration ---------------------------------
feed_prompt() {
  if [ -n "$INLINE_PROMPT" ]; then printf '%s\n' "$INLINE_PROMPT"
  else cat "$PROMPT_FILE"; fi
}

ITER_REASON="exit"
run_iteration() {
  local log="$1"; : > "$log"; ITER_REASON="exit"

  # live, human-readable view of the raw JSON log
  ( tail -n0 -F "$log" 2>/dev/null | jq -Rr "$VIEW_FILTER" 2>/dev/null ) &
  VIEWER_PID=$!

  # launch Claude: task on stdin, fresh context, fully autonomous
  feed_prompt | "$CLAUDE" "${CLAUDE_ARGS[@]}" >> "$log" 2>&1 &
  CURRENT_PID=$!

  local start now mtime idle elapsed rc=0
  start="$(date +%s)"
  while kill -0 "$CURRENT_PID" 2>/dev/null; do
    sleep "$POLL_INTERVAL"
    now="$(date +%s)"
    mtime="$(stat -f %m "$log" 2>/dev/null || printf '%s' "$now")"
    idle=$(( now - mtime )); elapsed=$(( now - start ))
    if [ "$IDLE_TIMEOUT" -gt 0 ] && [ "$idle" -ge "$IDLE_TIMEOUT" ]; then
      ITER_REASON="stuck-idle"; kill_tree "$CURRENT_PID"; rc=124; break
    fi
    if [ "$HARD_TIMEOUT" -gt 0 ] && [ "$elapsed" -ge "$HARD_TIMEOUT" ]; then
      ITER_REASON="stuck-hardtimeout"; kill_tree "$CURRENT_PID"; rc=125; break
    fi
  done
  wait "$CURRENT_PID" 2>/dev/null; local wrc=$?
  [ "$rc" -eq 0 ] && rc="$wrc"
  CURRENT_PID=""

  [ -n "$VIEWER_PID" ] && kill_tree "$VIEWER_PID"; VIEWER_PID=""
  return "$rc"
}

# ----------------------------- preflight -------------------------------------
CLAUDE="$(find_claude)" || { err "could not find the 'claude' binary. Set CLAUDE_BIN=/path/to/claude."; exit 1; }

INLINE_PROMPT=""
if [ "$#" -gt 0 ]; then
  INLINE_PROMPT="$*"
elif [ ! -f "$PROMPT_FILE" ]; then
  cat > "$PROMPT_FILE" <<'TEMPLATE'
# Task

Describe the task you want Claude to complete autonomously. Be concrete about
what "done" means and how it can be verified (commands to run, checks to pass).

The watchdog runs this on a loop until everything here is finished.
TEMPLATE
  warn "no task given and '$PROMPT_FILE' didn't exist — created a template."
  warn "Edit '$PROMPT_FILE' to describe your task, then re-run this script."
  exit 1
fi

# Assemble Claude args.
CLAUDE_ARGS=(
  -p
  --output-format stream-json
  --verbose
  --dangerously-skip-permissions
  --append-system-prompt "$AUTONOMY_PROMPT"
)
[ -n "$MODEL" ]        && CLAUDE_ARGS+=( --model "$MODEL" )
[ "$MAX_TURNS" -gt 0 ] && CLAUDE_ARGS+=( --max-turns "$MAX_TURNS" )
if [ -n "$EXTRA_CLAUDE_ARGS" ]; then
  # shellcheck disable=SC2206
  read -r -a _extra <<< "$EXTRA_CLAUDE_ARGS"
  CLAUDE_ARGS+=( "${_extra[@]}" )
fi

rm -f "$DONE_FILE" "$BLOCKED_FILE"   # clear any stale completion/blocked sentinels from a prior run
# KILL is deliberately NOT cleared here (unlike DONE/BLOCKED): if the owner left a
# KILL sentinel, a restart must NOT silently resume past it. Refuse to start.
if [ -f "$KILL_FILE" ]; then
  err "KILL sentinel present at $KILL_FILE — refusing to start. Remove it to run the loop."
  exit 4
fi

# ----------------------------- banner ----------------------------------------
"$CLAUDE" --version >/dev/null 2>&1 && CLAUDE_VER="$("$CLAUDE" --version 2>/dev/null)"
info "ralph-watchdog starting"
info "  claude        : $CLAUDE ${CLAUDE_VER:+($CLAUDE_VER)}"
info "  project root  : $PWD"
info "  task source   : $([ -n "$INLINE_PROMPT" ] && echo 'inline argument' || echo "$PROMPT_FILE")"
info "  model         : ${MODEL:-<default>}"
info "  idle timeout  : ${IDLE_TIMEOUT}s   hard timeout: $([ "$HARD_TIMEOUT" -gt 0 ] && echo "${HARD_TIMEOUT}s" || echo off)"
info "  max iters     : $([ "$MAX_ITERATIONS" -gt 0 ] && echo "$MAX_ITERATIONS" || echo 'until done')   max turns/iter: $([ "$MAX_TURNS" -gt 0 ] && echo "$MAX_TURNS" || echo unlimited)"
info "  done sentinel : $DONE_FILE"
info "  progress file : $STATE_FILE"
info "  build guard   : $BUILD_GUARD (npm run build + npm run lint)"
info "  logs          : $LOG_DIR"
warn "running with --dangerously-skip-permissions (fully autonomous). Ctrl-C to stop."
info "  controls      : stop = Ctrl-C or create $KILL_FILE   ·   pause = create $PAUSE_FILE   ·   steer = $STEER_FILE"
info "  cost ledger   : $COST_LEDGER  (per-iteration cost/turns/wall)"

# ----------------------------- DONE.md on the main branch --------------------
# When the loop STOPS (complete or hard-blocked), drop a DONE.md marker onto the
# local "$DONE_BRANCH" (default main) via a throwaway git worktree, so the
# current branch + working tree are never disturbed. Never pushes — the loop's
# never-push rule stands; this marker is a local signal for you.
place_done_md_on_main() {
  local state="$1" detail="$2"
  local stamp; stamp="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  local cur; cur="$(git -C "$PWD" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  local tmp wt target; tmp="$(mktemp -d)"; wt="$tmp/ralph-done"; target="$wt"

  if ! git -C "$PWD" worktree add -f "$wt" "$DONE_BRANCH" >/dev/null 2>&1; then
    warn "could not check out '$DONE_BRANCH' in a worktree — writing $DONE_MD on the current branch instead."
    target="$PWD"
  fi

  {
    printf '# portfolio3js ralph loop — %s\n\n' "$state"
    printf -- '- when: %s\n' "$stamp"
    printf -- '- status: **%s**\n' "$state"
    printf -- '- work branch: `%s`\n' "$cur"
    printf -- '- full detail: `.ralph/PROGRESS.md` and `.ralph/logs/`\n\n'
    if [ "$state" = "BLOCKED" ]; then
      printf 'The loop STOPPED because it needs your input/output to continue.\n\n## What it needs\n\n'
      if [ -n "$detail" ] && [ -f "$detail" ]; then cat "$detail"; else printf '(see `.ralph/BLOCKED.md`)\n'; fi
    elif [ "$state" = "STOPPED" ]; then
      printf 'The loop was STOPPED by an owner KILL sentinel (`.ralph/KILL.md`).\n\nIt halted cleanly BEFORE an iteration, so nothing was left mid-flight by the watchdog. Delete `.ralph/KILL.md` to allow the loop to run again.\n'
    else
      printf 'All task gates passed — the loop completed successfully.\n'
    fi
  } > "$target/$DONE_MD"

  if [ "$target" != "$PWD" ]; then
    git -C "$target" add "$DONE_MD" >/dev/null 2>&1
    if git -C "$target" commit -m "chore(ralph): loop ${state} — ${DONE_MD} marker on ${DONE_BRANCH}" >/dev/null 2>&1; then
      ok "Placed ${DONE_MD} (${state}) on '${DONE_BRANCH}' — local commit, NOT pushed."
    else
      warn "wrote ${DONE_MD} on '${DONE_BRANCH}' but could not commit it (git identity?). File: $target/$DONE_MD"
    fi
    git -C "$PWD" worktree remove --force "$wt" >/dev/null 2>&1 || true
  else
    git -C "$PWD" add "$DONE_MD" >/dev/null 2>&1
    git -C "$PWD" commit -m "chore(ralph): loop ${state} — ${DONE_MD} marker" >/dev/null 2>&1 \
      && ok "Committed ${DONE_MD} (${state}) on the current branch ('${cur}')." \
      || warn "wrote ${DONE_MD} but could not commit it."
  fi
  rm -rf "$tmp" 2>/dev/null || true
}

# ----------------------------- per-iteration cost ledger ---------------------
# Persist + trend what each iteration actually costs, so spend on this long-running,
# --dangerously-skip-permissions loop is visible. Passive: never caps or interrupts.
record_iteration_metrics() {
  local iter="$1" log="$2" reason="$3" dt="$4"
  local row cost turns
  row="$(jq -r 'select(.type=="result")|[(.total_cost_usd//0),(.num_turns//0)]|@tsv' "$log" 2>/dev/null | tail -1)"
  cost="$(printf '%s' "$row" | cut -f1)"; turns="$(printf '%s' "$row" | cut -f2)"
  [ -n "$cost" ]  || cost=0
  [ -n "$turns" ] || turns=0
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$iter" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$cost" "$turns" "$dt" "$reason" >> "$COST_LEDGER"
  local summary
  summary="$(awk -F'\t' -v warn="${COST_WARN_USD:-0}" '
    {tot+=$3; last=$3; c[NR]=$3}
    END{
      ra=0; k=0; for(i=NR;i>0 && k<10;i--){ra+=c[i];k++}
      if(k>0) ra=ra/k;
      s=sprintf("💰 iter cost $%.4f · session total $%.4f over %d iters · rolling avg(<=10) $%.4f", last, tot, NR, ra);
      if(warn+0>0 && last+0>warn+0) s=s sprintf("  !! OVER COST_WARN_USD=$%.2f", warn);
      print s;
    }' "$COST_LEDGER" 2>/dev/null)"
  [ -n "$summary" ] && info "$summary"
}

# ----------------------------- account failover engine -----------------------
# Parallel indexed arrays (bash 3.2 — no associative arrays). 1-based to match
# the RALPH_ACCT_N_* naming in $ACCOUNTS_FILE.
ACCT_LABELS=(); ACCT_TOKENS=(); ACCT_CONFIGDIRS=(); ACCT_BUSY_UNTIL=()
ACCT_COUNT=0; ACTIVE=0; SLEEP_NOTIFIED=0

now_epoch() { date +%s; }
human_eta() {                       # seconds -> "Hh Mm"
  local s="${1:-0}" h m; [ "$s" -lt 0 ] && s=0
  h=$(( s / 3600 )); m=$(( (s % 3600) / 60 ))
  printf '%dh %02dm' "$h" "$m"
}

load_accounts() {                   # build ACCT_* arrays from RALPH_ACCT_N_* vars
  local n want lbl tok cfg
  want="${RALPH_ACCT_COUNT:-0}"
  case "$want" in ''|*[!0-9]*) want=0 ;; esac   # non-numeric → 0
  ACCT_COUNT=0
  n=1
  while [ "$n" -le "$want" ]; do    # while-counter, not `seq 1 N` (BSD `seq 1 0` counts DOWN)
    eval "lbl=\"\${RALPH_ACCT_${n}_LABEL:-}\""
    eval "tok=\"\${RALPH_ACCT_${n}_TOKEN:-}\""
    eval "cfg=\"\${RALPH_ACCT_${n}_CONFIG_DIR:-}\""
    n=$(( n + 1 ))                  # advance BEFORE the continue-guard so the while loop always progresses
    [ -n "$tok" ] || continue       # an account with no token is unusable — skip it
    ACCT_COUNT=$(( ACCT_COUNT + 1 ))
    ACCT_LABELS[$ACCT_COUNT]="${lbl:-account-$ACCT_COUNT}"
    ACCT_TOKENS[$ACCT_COUNT]="$tok"
    ACCT_CONFIGDIRS[$ACCT_COUNT]="$cfg"
    ACCT_BUSY_UNTIL[$ACCT_COUNT]=0
  done
  ACTIVE=$([ "$ACCT_COUNT" -ge 1 ] && echo 1 || echo 0)
}

load_account_state() {              # restore per-account exhausted-until (matched by LABEL)
  [ "$ACCT_COUNT" -ge 1 ] || return 0
  [ -f "$ACCOUNT_STATE_FILE" ] || return 0
  local lbl until i now; now="$(now_epoch)"
  while IFS=$'\t' read -r lbl until _rest; do
    [ -n "$lbl" ] || continue
    for i in $(seq 1 "$ACCT_COUNT"); do
      if [ "${ACCT_LABELS[$i]}" = "$lbl" ]; then
        case "$until" in ''|*[!0-9]*) until=0 ;; esac
        [ "$until" -gt "$now" ] && ACCT_BUSY_UNTIL[$i]="$until"
      fi
    done
  done < "$ACCOUNT_STATE_FILE"
}

save_account_state() {
  [ "$ACCT_COUNT" -ge 1 ] || return 0
  local i; : > "$ACCOUNT_STATE_FILE"
  for i in $(seq 1 "$ACCT_COUNT"); do
    printf '%s\t%s\t%s\n' "${ACCT_LABELS[$i]}" "${ACCT_BUSY_UNTIL[$i]:-0}" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >> "$ACCOUNT_STATE_FILE"
  done
}

soonest_reset_epoch() {             # min exhausted-until across all accounts
  local i best=0 v
  for i in $(seq 1 "$ACCT_COUNT"); do
    v="${ACCT_BUSY_UNTIL[$i]:-0}"
    if [ "$best" -eq 0 ] || { [ "$v" -gt 0 ] && [ "$v" -lt "$best" ]; }; then best="$v"; fi
  done
  printf '%s' "$best"
}

# Convert a human reset time ("3:45pm", "9am") to the next-occurrence epoch (BSD/macOS date).
reset_human_to_epoch() {
  local t today tgt now
  t="$(printf '%s' "$1" | tr 'A-Z' 'a-z' | tr -d ' ')"   # "3:45pm"
  case "$t" in *:*) ;; *) t="$(printf '%s' "$t" | sed -E 's/([ap]m)/:00\1/')";; esac
  today="$(date '+%Y-%m-%d')"
  tgt="$(date -j -f '%Y-%m-%d %I:%M%p' "$today $(printf '%s' "$t" | tr 'a-z' 'A-Z')" '+%s' 2>/dev/null)" || return 1
  [ -n "$tgt" ] || return 1
  now="$(now_epoch)"; [ "$tgt" -le "$now" ] && tgt=$(( tgt + 86400 ))   # already past today -> tomorrow
  printf '%s' "$tgt"
}

# The cap message is printed by the RUNTIME to stderr (plain text). In the merged
# iteration log those are the lines that are NOT stream-json objects (json lines
# start with '{'). The AGENT's own text — which can legitimately discuss "usage
# limits" — lives INSIDE {"type":"assistant",...} json lines, so excluding
# '{'-prefixed lines removes that whole false-positive class. We also scan the
# final stream-json `result` envelope's subtype/result (never assistant content).
_runtime_lines() {                  # echoes the runtime/stderr + result-envelope text from the log tail
  local log="$1"
  tail -n 400 "$log" 2>/dev/null | grep -v '^[[:space:]]*{'
  if command -v jq >/dev/null 2>&1; then
    tail -n 400 "$log" 2>/dev/null | grep '^[[:space:]]*{' \
      | jq -r 'select(.type=="result") | ((.subtype//"")+" "+((.is_error//false)|tostring)+" "+(.result//""))' 2>/dev/null
  fi
}

parse_reset_epoch_from_log() {      # best-effort reset epoch from the iteration log (runtime lines only)
  local log="$1" lines epoch ts now floor
  now="$(now_epoch)"; floor=$(( now + 300 ))   # never return a reset in the past / too-soon (avoids a tight re-loop)
  lines="$(_runtime_lines "$log")"; epoch=""
  # 1) explicit unix epoch, e.g. "...limit reached|1719345600"
  epoch="$(printf '%s\n' "$lines" | grep -oE 'limit reached\|[0-9]{10,}' | grep -oE '[0-9]{10,}' | tail -1)"
  # 2) human local time, e.g. "resets 3:45pm" / "resets at 9am"
  if [ -z "$epoch" ]; then
    ts="$(printf '%s\n' "$lines" | grep -oiE 'resets?( at)? [0-9]{1,2}(:[0-9]{2})? ?(am|pm)' | tail -1 \
          | grep -oiE '[0-9]{1,2}(:[0-9]{2})? ?(am|pm)')"
    [ -n "$ts" ] && epoch="$(reset_human_to_epoch "$ts" 2>/dev/null)"
  fi
  # 3) fallback: the 5-hour rolling window
  case "$epoch" in ''|*[!0-9]*) epoch=$(( now + LIMIT_BACKOFF_SECS )) ;; esac
  [ "$epoch" -lt "$floor" ] && epoch="$floor"
  printf '%s' "$epoch"
}

detect_usage_limit_in_log() {       # 0 = this iteration ended on a subscription usage cap
  local log="$1" rc="$2"
  [ -f "$log" ] || return 1
  # Optional corroboration only (default OFF): the stderr-line match below is authoritative,
  # and requiring non-zero would MISS a cap that exits 0 (→ a COOLDOWN-fast busy-retry loop).
  if [ "${USAGE_LIMIT_REQUIRE_NONZERO}" = "1" ] && [ "${rc:-0}" -eq 0 ]; then return 1; fi
  _runtime_lines "$log" | grep -qiE "$USAGE_LIMIT_RE"
}

notify_owner_sleep() {              # optional, one-shot iMessage when ALL accounts are capped
  [ "$NOTIFY_ON_SLEEP" = "1" ] || return 0
  [ -n "$OWNER_PHONE" ] || return 0
  [ "$SLEEP_NOTIFIED" = "1" ] && return 0
  SLEEP_NOTIFIED=1
  osascript -e 'tell application "Messages"
    set svc to 1st service whose service type = iMessage
    send "PORTFOLIO3JS RALPH: all Claude accounts hit their usage cap — loop sleeping until the soonest one resets ('"$1"'), then resuming automatically." to participant "'"$OWNER_PHONE"'" of svc
  end tell' >/dev/null 2>&1 || true
}

sleep_until() {                     # interruptible wait (honors KILL/PAUSE); caps each nap to re-probe
  local target="$1" reason="$2" now left chunk
  now="$(now_epoch)"; [ "$target" -le "$now" ] && return 0
  [ $(( target - now )) -gt "$LIMIT_SLEEP_CAP_SECS" ] && target=$(( now + LIMIT_SLEEP_CAP_SECS ))
  warn "⏳ $reason — sleeping until $(date -r "$target" '+%Y-%m-%d %H:%M:%S') (~$(human_eta $(( target - now )))). Loop resumes automatically when usage resets."
  notify_owner_sleep "$(date -r "$target" '+%H:%M')"
  local last_log=0
  while :; do
    if [ -f "$KILL_FILE" ]; then warn "⛑  KILL during usage-wait — stopping."; place_done_md_on_main "STOPPED" "$KILL_FILE"; exit 4; fi
    # Honor PAUSE during a usage-wait too: hold open (don't end the wait or start an
    # iteration) until the owner removes PAUSE.md — mirrors the main-loop pause gate.
    if [ -f "$PAUSE_FILE" ]; then warn "⏸  PAUSE during usage-wait — holding (delete $PAUSE_FILE to resume)."; sleep "$PAUSE_POLL"; continue; fi
    now="$(now_epoch)"; left=$(( target - now )); [ "$left" -le 0 ] && break
    if [ $(( now - last_log )) -ge 600 ]; then info "   …still waiting on usage reset (~$(human_eta "$left") left)."; last_log="$now"; fi
    chunk=60; [ "$left" -lt "$chunk" ] && chunk="$left"
    sleep "$chunk"
  done
  ok "⏰ usage window reset reached — resuming the loop."
  SLEEP_NOTIFIED=0
}

# Pick an available account into $ACTIVE. We deliberately KEEP the current
# account until it is capped (to "exhaust one before switching"); this is only
# called when ACTIVE is unset or capped. If every account is capped, sleep
# until the soonest reset, then re-probe.
ensure_active_account() {
  [ "$ACCT_COUNT" -ge 1 ] || { ACTIVE=0; return 0; }   # ambient (keychain) login
  while :; do
    local now i picked=0; now="$(now_epoch)"
    if [ "${ACTIVE:-0}" -ge 1 ] && [ "${ACCT_BUSY_UNTIL[$ACTIVE]:-0}" -le "$now" ]; then return 0; fi
    for i in $(seq 1 "$ACCT_COUNT"); do
      if [ "${ACCT_BUSY_UNTIL[$i]:-0}" -le "$now" ]; then picked="$i"; break; fi
    done
    if [ "$picked" -ge 1 ]; then
      [ "$picked" != "${ACTIVE:-0}" ] && info "🔀 switching active account → ${ACCT_LABELS[$picked]} (#$picked/$ACCT_COUNT)."
      ACTIVE="$picked"; return 0
    fi
    sleep_until "$(soonest_reset_epoch)" "all $ACCT_COUNT accounts at their usage cap"
    # loop re-evaluates: BUSY_UNTIL values that have passed now count as available
  done
}

apply_active_account_env() {        # export the ACTIVE account's credentials for this iteration
  if [ "$ACCT_COUNT" -ge 1 ] && [ "${ACTIVE:-0}" -ge 1 ]; then
    export CLAUDE_CODE_OAUTH_TOKEN="${ACCT_TOKENS[$ACTIVE]}"
    if [ -n "${ACCT_CONFIGDIRS[$ACTIVE]}" ]; then export CLAUDE_CONFIG_DIR="${ACCT_CONFIGDIRS[$ACTIVE]}"; else unset CLAUDE_CONFIG_DIR; fi
  else
    unset CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CONFIG_DIR   # fall back to the true ambient (keychain + default config) login
  fi
}

active_account_label() {
  if [ "$ACCT_COUNT" -ge 1 ] && [ "${ACTIVE:-0}" -ge 1 ]; then printf '%s' "${ACCT_LABELS[$ACTIVE]}"; else printf 'ambient login'; fi
}

load_accounts
load_account_state
if [ "$ACCT_COUNT" -ge 1 ]; then
  info "  accounts      : $ACCT_COUNT configured for usage failover ($(
        for i in $(seq 1 "$ACCT_COUNT"); do printf '%s ' "${ACCT_LABELS[$i]}"; done))"
else
  info "  accounts      : none in $ACCOUNTS_FILE — running on the ambient keychain login (cap still detected, loop waits for reset)."
fi

# ----------------------------- main loop -------------------------------------
iter=0; stuck_streak=0; cap_iters=0
while :; do
  iter=$(( iter + 1 ))
  # Cap-retry iterations (account exhausted, no work done) must NOT consume the budget.
  if [ "$MAX_ITERATIONS" -gt 0 ] && [ $(( iter - cap_iters )) -gt "$MAX_ITERATIONS" ]; then
    err "reached MAX_ITERATIONS=$MAX_ITERATIONS productive iterations without completion."
    exit 2
  fi

  # ── owner kill-switch / pause — checked BEFORE launching another iteration.
  #    KILL stops the loop; PAUSE freezes new iterations until removed.
  #    KILL is never auto-cleared (see preflight).
  if [ -f "$KILL_FILE" ]; then
    warn "⛑  KILL sentinel present ($KILL_FILE) — stopping before iteration $iter. Remove it to allow runs."
    place_done_md_on_main "STOPPED" "$KILL_FILE"
    exit 4
  fi
  while [ -f "$PAUSE_FILE" ]; do
    warn "⏸  PAUSE sentinel present ($PAUSE_FILE) — holding before iteration $iter. Re-check in ${PAUSE_POLL}s (delete to resume; create KILL.md to stop)."
    sleep "$PAUSE_POLL"
    if [ -f "$KILL_FILE" ]; then
      warn "⛑  KILL appeared during PAUSE — stopping."
      place_done_md_on_main "STOPPED" "$KILL_FILE"
      exit 4
    fi
  done

  log_file="$LOG_DIR/iter-$(printf '%03d' "$iter").jsonl"
  info "──────── iteration $iter ──────── (log: $log_file)"

  # Pick an account with usage left (keeps the current one until it's capped;
  # if EVERY account is capped this blocks until the soonest reset), then export
  # that account's credentials for this iteration.
  ensure_active_account
  apply_active_account_env
  [ "$ACCT_COUNT" -ge 1 ] && info "  ▸ active account: $(active_account_label) (#${ACTIVE}/${ACCT_COUNT})"

  : > "$ITER_START_MARKER"            # mtime ref for any evidence-freshness check
  iter_t0="$(date +%s)"
  run_iteration "$log_file"; rc=$?
  iter_dt=$(( $(date +%s) - iter_t0 ))

  case "$ITER_REASON" in
    stuck-idle)
      stuck_streak=$(( stuck_streak + 1 ))
      warn "iteration $iter STUCK — no output for ${IDLE_TIMEOUT}s (streak ${stuck_streak}/${MAX_STUCK}). Killed & restarting." ;;
    stuck-hardtimeout)
      stuck_streak=$(( stuck_streak + 1 ))
      warn "iteration $iter hit HARD_TIMEOUT=${HARD_TIMEOUT}s (streak ${stuck_streak}/${MAX_STUCK}). Killed & restarting." ;;
    *)
      stuck_streak=0
      info "iteration $iter finished (exit $rc)." ;;
  esac

  # Persist + trend this iteration's cost (passive — never caps work).
  record_iteration_metrics "$iter" "$log_file" "$ITER_REASON" "$iter_dt"

  # Post-iteration build/lint guard — WARN only, never fatal. A mid-flight
  # iteration may legitimately leave the tree red; the next cold agent (and the
  # build-guard's own exit code as a hard gate inside the agent) sorts it out.
  if [ -f "$PWD/$BUILD_GUARD" ]; then
    bg_out="$(bash "$PWD/$BUILD_GUARD" check 2>&1)"; bg_rc=$?
    printf '%s\n' "$bg_out" >> "$RUN_LOG" 2>/dev/null
    if [ "$bg_rc" -ne 0 ]; then
      warn "build-guard reported a RED tree (build/lint failing, non-fatal here): last lines —"
      printf '%s\n' "$bg_out" | tail -n 8 >&2
    else
      ok "build-guard: tree is GREEN (npm run build + npm run lint passed)."
    fi
  fi

  if [ -f "$DONE_FILE" ]; then
    ok "✅ Completion sentinel found — all tasks complete after $iter iteration(s)."
    ok "   Progress notes: $STATE_FILE"
    place_done_md_on_main "COMPLETE" ""
    exit 0
  fi

  if [ -f "$BLOCKED_FILE" ]; then
    warn "⛔ Blocked sentinel found — the loop needs your input. Stopping after $iter iteration(s)."
    warn "   Details: $RALPH_DIR/BLOCKED.md  (and $STATE_FILE)"
    place_done_md_on_main "BLOCKED" "$RALPH_DIR/BLOCKED.md"
    exit 3
  fi

  # ── usage cap? "end the loop when usage is out, only restart when it's back."
  #    DONE/BLOCKED above take precedence. Here: mark THIS account exhausted (so
  #    next pass switches to the other account), and — when ALL accounts are
  #    capped — wait for the soonest reset. Not a stuck/cooldown event, so we
  #    re-enter the loop immediately via `continue`.
  if [ "$ITER_REASON" = "exit" ] && detect_usage_limit_in_log "$log_file" "$rc"; then
    cap_iters=$(( cap_iters + 1 ))   # this iteration did no productive work — don't count it toward MAX_ITERATIONS
    reset_epoch="$(parse_reset_epoch_from_log "$log_file")"
    if [ "$ACCT_COUNT" -ge 1 ]; then
      ACCT_BUSY_UNTIL[$ACTIVE]="$reset_epoch"; save_account_state
      warn "🚧 usage cap reached on '$(active_account_label)' — exhausted until $(date -r "$reset_epoch" '+%Y-%m-%d %H:%M:%S'). Will switch to the next account (or wait if all are capped)."
    else
      warn "🚧 usage cap reached on the ambient login — waiting for reset at $(date -r "$reset_epoch" '+%Y-%m-%d %H:%M:%S')."
      sleep_until "$reset_epoch" "the only (ambient) account is at its usage cap"
    fi
    continue
  fi

  if [ "$MAX_STUCK" -gt 0 ] && [ "$stuck_streak" -ge "$MAX_STUCK" ]; then
    warn "⛔ ${stuck_streak} consecutive stuck iterations — the loop appears hung (possibly waiting on you). Stopping."
    printf 'The watchdog stopped the loop after %s consecutive no-output/stuck iterations.\nIt may have been waiting on input only you can provide. See .ralph/logs/ and .ralph/PROGRESS.md.\n' "$stuck_streak" > "$RALPH_DIR/BLOCKED.md"
    place_done_md_on_main "BLOCKED" "$RALPH_DIR/BLOCKED.md"
    exit 3
  fi

  info "not done yet — next iteration in ${COOLDOWN}s (Ctrl-C to stop)."
  sleep "$COOLDOWN"
done
