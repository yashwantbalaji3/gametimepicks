# Gate-Watcher Operating Rules (Program 163 · Release A)

## The incident this encodes

Program 162 left four background watchers running 4+ hours after every quality-gate run was
terminal. Each polled `gh run list --limit 1` (the **newest** run) filtered by its own commit SHA.
The moment a newer push superseded that run, the newest run stopped carrying the SHA forever — the
predicate became permanently unfulfillable, and the loop could never exit. The stated harness
timeout is not enforced on backgrounded loops, so nothing else stopped them either.

All four were mapped to their terminal targets (every one `cancelled`, with the stack proven green
by covering descendant runs), stopped individually through the registered task-stop control — never
a broad name/glob kill — and a process scan confirmed zero orphan pollers afterward.

## The rules (session-level, binding on any future watcher)

1. **Watch a RUN ID, not a SHA-filtered listing.** Resolve SHA → run id once, then poll by id.
   `scripts/ops/watch-gate.sh <run-id|sha> [deadline-secs] [interval-secs]` is the one helper;
   its poll loop structurally cannot consult the newest-run list (guard-tested).
2. **One watcher per target.** The helper refuses a duplicate while a live watcher holds the
   target's lock (stale locks self-clear). Session-level: before arming a watcher, confirm none
   exists for the same run.
3. **Supersession stops the old watcher.** Pushing a new commit cancels the previous gate run;
   whoever pushes must stop the watcher on the superseded run (or use the helper, which exits 3 =
   SUPERSEDED on its own) and watch the new tip instead. Cancellation of a superseded run is
   expected, never a failure signal — the covering tip's conclusion is the stack's truth.
4. **A hard deadline always exits.** Default 1800s. An API hiccup or missing conclusion is
   UNKNOWN_RETRYABLE *inside* the bound — never success, never failure, never a reason to spawn a
   second watcher.
5. **Exit codes are the receipt.** 0 success · 2 failure/other-terminal · 3 superseded ·
   4 deadline · 5 duplicate · 6 target-not-found. The one-line stdout carries run id, conclusion,
   and elapsed seconds.
6. **Right after a push, the run may not exist yet.** The helper exits 6 (TARGET_NOT_FOUND)
   honestly in that gap — wait a few seconds and re-arm, or pass the run id once `gh run list`
   shows it. Observed live at P163 close.
7. **Session close requires a watcher audit.** Zero owned watchers may remain: list background
   tasks, stop any whose target is terminal, and record each stop (target, terminal conclusion,
   stop method) in the final report.

## Local jobs (Program 235 · Release B)

The rules above govern REMOTE CI runs. Program 234 leaked a watcher anyway — not by breaking them,
but by being outside them. It was waiting on a local `npm run gate`, for which no helper existed, so
it hand-rolled:

```
until grep -q "GATE_EXIT=" /tmp/gate2.log; do sleep 20; done
```

Three failures in one line. The marker was echoed to the command's own stdout and never reached that
file, so the predicate was unfulfillable. The job had already finished, so nothing was being waited
for. And the harness's foreground timeout stopped applying the moment the loop was backgrounded, so
it ran unbounded for two hours before being stopped by hand.

**`scripts/ops/run-job.sh <name> [--deadline SECS] [--cwd DIR] [--sha SHA] -- <command...>` is the
one helper for a local job.** Same exit vocabulary as the gate watcher: `0` SUCCESS · `2` FAILURE ·
`3` CANCELLED · `4` TIMEOUT · `7` UNKNOWN · `64` usage.

8. **A job's completion is a RECEIPT it writes, not a string in its log.** The wrapper is the only
   thing that can know the command's real exit code, so it is the only thing that may declare the
   job finished. It writes `${TMPDIR}/gtp-jobs/<name>.json` atomically, last. A truncated log cannot
   hide a terminal status and a log containing "success" cannot invent one — guard-tested both ways.
9. **The deadline lives inside the wrapper.** `timeout(1)` kills the command, so backgrounding the
   wrapper cannot defeat the bound. Where no `timeout` binary exists the receipt says
   `deadlineEnforced: false` rather than pretending.
10. **A lost child is UNKNOWN, never SUCCESS.** A null exit code means the result could not be
    collected. Defaulting it to zero is how a job that never ran reports as passing.
11. **A stale receipt is cleared before the run starts**, so a previous result can never be read as
    this one's.
12. **A malformed receipt is not a finished job.** An unparseable status ends no wait.

The pure decision layer is `src/lib/ops/job-status.mjs`: `classifyJob`, `readReceipt` and
`shouldKeepWaiting` take injected facts and an injected clock, so every state — including both
timeouts — is proven in microseconds rather than by living through a deadline.

## Why no deeper repository automation

The stale watchers were session/UI tasks, not repository processes. The repository's contribution
is the bounded helper + its lifecycle guards; the operating discipline above governs the session
layer, and inventing repo machinery to manage UI tasks would be scope theater. (Charter 163 §4.)
