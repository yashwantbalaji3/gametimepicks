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
6. **Session close requires a watcher audit.** Zero owned watchers may remain: list background
   tasks, stop any whose target is terminal, and record each stop (target, terminal conclusion,
   stop method) in the final report.

## Why no deeper repository automation

The stale watchers were session/UI tasks, not repository processes. The repository's contribution
is the bounded helper + its lifecycle guards; the operating discipline above governs the session
layer, and inventing repo machinery to manage UI tasks would be scope theater. (Charter 163 §4.)
