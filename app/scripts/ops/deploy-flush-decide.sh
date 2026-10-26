#!/usr/bin/env bash
# DEPLOY-FLUSH DECISION — should .github/workflows/deploy-flush.yml push an empty `[deploy]` commit to main?
#
#   DEPLOYED_SHA=<sha the live site was built from> bash app/scripts/ops/deploy-flush-decide.sh
#
# Run from anywhere inside a checkout of main (HEAD = the main tip). Prints a human log, then ONE line
#   flush=true|false reason=<word>
# and, when GITHUB_OUTPUT is set, writes `flush=` and `reason=` there. Always exits 0 unless misused: the
# answer is in the output, never in the exit code, so a bug here cannot turn into a red cron every 30 minutes.
#
# The decision is NOT re-implemented here. It runs the real Vercel ignore step (app/scripts/vercel-ignore-build.sh)
# with VERCEL_GIT_PREVIOUS_SHA = the deployed SHA and reads the `GTP_GATE verdict= tier= trigger_epoch=` line it
# prints. So the code / critical / coalescible path lists exist in ONE place, and "would Vercel build main right
# now?" is answered by the same code Vercel runs.
#
# Flush when the gate says BUILD and:
#   tier=coalesce-expired                    non-critical data has waited past the window and no push came to carry it
#   tier=code|critical|marker, trigger ≥ FLUSH_MIN_AGE_SECONDS (600) old
#                                            those build on their own push; still undeployed 10 min later means that
#                                            build was skipped, canceled or failed
# Never flush (fail-safe — the flush is a freshness backstop; the next run retries in 30 minutes) when:
#   the deployed SHA is malformed, missing from the clone, or not an ancestor of main; the gate prints no parseable
#   GTP_GATE line; the gate itself could not decide (git-error, clock-error, window-malformed); or an earlier flush
#   commit is still undeployed and younger than FLUSH_REPEAT_SECONDS (7200) — a flush whose build failed must not
#   become a failing 45-minute build every 30 minutes.
# The in-progress check (a Vercel status still `pending` on a newer commit) needs the GitHub API and lives in the
# workflow, after this script says flush=true.
set -u

say() { echo "[deploy-flush] $*"; }
answer() {
    say "flush=$1 reason=$2"
    echo "flush=$1 reason=$2"
    if [ -n "${GITHUB_OUTPUT:-}" ]; then
        { echo "flush=$1"; echo "reason=$2"; } >> "$GITHUB_OUTPUT"
    fi
    exit 0
}

DEPLOYED="${DEPLOYED_SHA:-}"
MIN_AGE="${FLUSH_MIN_AGE_SECONDS:-600}"
REPEAT="${FLUSH_REPEAT_SECONDS:-7200}"
NOW="${GTP_NOW_EPOCH:-$(date +%s 2>/dev/null)}"

case "$DEPLOYED" in
    *[!0-9a-f]*|'') answer false deployed-sha-malformed ;;
esac
[ "${#DEPLOYED}" -eq 40 ] || answer false deployed-sha-malformed
case "$MIN_AGE$REPEAT$NOW" in *[!0-9]*|'') answer false config-malformed ;; esac

TOP="$(git rev-parse --show-toplevel 2>/dev/null)" || answer false not-a-checkout
HEAD_SHA="$(git rev-parse HEAD 2>/dev/null)" || answer false not-a-checkout
if ! git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null; then
    say "::warning::deployed SHA $DEPLOYED is not in this clone (deepen the fetch) — not flushing"
    answer false deployed-sha-missing
fi
if [ "$DEPLOYED" = "$HEAD_SHA" ]; then answer false up-to-date; fi
if ! git merge-base --is-ancestor "$DEPLOYED" HEAD 2>/dev/null; then
    say "::warning::deployed SHA $DEPLOYED is not an ancestor of main $HEAD_SHA — not flushing"
    answer false deployed-sha-not-ancestor
fi

# An earlier flush that has not been deployed yet: give its build time to land (or to be looked at) before repeating.
if ! _flushes="$(git log --format='%ct %s' "$DEPLOYED..HEAD" 2>/dev/null)"; then answer false git-error; fi
_last_flush="$(printf '%s\n' "$_flushes" | grep -E '^[0-9]+ auto: deploy flush' | head -1 | cut -d' ' -f1)"
if [ -n "$_last_flush" ] && [ $(( NOW - _last_flush )) -lt "$REPEAT" ]; then
    say "an earlier flush commit ($(( NOW - _last_flush ))s old) is still undeployed — not repeating it before ${REPEAT}s"
    answer false flush-outstanding
fi

_out="$(cd "$TOP/app" 2>/dev/null && VERCEL_GIT_PREVIOUS_SHA="$DEPLOYED" VERCEL_PROJECT_PRODUCTION_URL="" VERCEL_FORCE_BUILD="" GTP_NOW_EPOCH="$NOW" bash "$TOP/app/scripts/vercel-ignore-build.sh" 2>&1)"
_rc=$?
printf '%s\n' "$_out" | sed 's/^/[deploy-flush]   gate: /'
if [ "$_rc" -eq 0 ]; then answer false nothing-due; fi
if [ "$_rc" -ne 1 ]; then answer false gate-error; fi

_line="$(printf '%s\n' "$_out" | grep -E 'GTP_GATE verdict=build tier=[a-z-]+ trigger_epoch=' | tail -1)"
[ -n "$_line" ] || answer false gate-unparsed
_tier="$(printf '%s\n' "$_line" | sed -E 's/.* tier=([a-z-]+) .*/\1/')"
_trigger="$(printf '%s\n' "$_line" | sed -E 's/.* trigger_epoch=([0-9]*).*/\1/')"

case "$_tier" in
    coalesce-expired) answer true coalesce-expired ;;
    code|critical|marker)
        [ -n "$_trigger" ] || answer false gate-unparsed
        _age=$(( NOW - _trigger ))
        if [ "$_age" -ge "$MIN_AGE" ]; then
            say "a $_tier change has been undeployed for ${_age}s (≥ ${MIN_AGE}s) — its own build was skipped, canceled or failed"
            answer true "${_tier}-undeployed"
        fi
        say "a $_tier change is ${_age}s old — its own build should be under way"
        answer false "${_tier}-recent" ;;
    *) answer false "gate-${_tier}" ;;
esac
