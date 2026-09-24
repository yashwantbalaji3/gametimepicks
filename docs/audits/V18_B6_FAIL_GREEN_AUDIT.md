# v1.8 — B6: fail-green workflow audit

**Date:** 2026-09-23 · **Branch:** `v18-b6-failgreen` · **Base:** `4dbd40a3b`

Where can a real source, capture or settlement failure still produce a green job or exit 0?

## 1. Inventory

**205 soft-fail occurrences across 23 of 34 workflows** — `continue-on-error: true` ×56, `|| true` ×111,
`|| echo` ×38, `set +e` ×0.

That number is the reason this audit did not "fix" anything mechanically. Filtering to occurrences where
the swallowed command is a **capture / settle / grade / build** operation — not `git add`, `mkdir`, `grep`
or a push-retry — leaves **25**. Of those:

| class | n | examples |
|---|---|---|
| **Intentional, non-critical** | 9 | `git push` retry loops (`git rebase --abort \|\| true` then `exit 1`) · `BAD="$(… grep … \|\| true)"` where grep's exit 1 means "no match" · `git fetch --deepen \|\| true` |
| **Deliberate soft-fail with a stated policy** | 13 | the `nightly-settle` `::warning::` set — each names its own consequence (*"prior ledger retained, cards stay pending"*), and the health gate runs after them |
| **Suspicious, left alone** | 2 | `build-admin-status.mjs \|\| echo "admin status build skipped"` (×2 workflows) — a dashboard, not a truth owner |
| **Confirmed defect** | 1 | §3 |

**Scripts:** 412 scanned. Scripts that print a failure marker but never exit non-zero anywhere: **3**, and all
three are false positives — `analytics-activation-check.mjs` does `process.exit(main())` where `main`
returns the failure count, and `build-mr-dub-ledger.mjs` sets `process.exitCode = 3` on its refusal. Every
script carrying a `SOURCE_STALE` concept has a non-zero exit path. **The script layer is healthy.**

## 2. The `SOURCE_STALE` policy is deliberate, and partially repaired

`capture-nfl-results.mjs`, `capture-ufc-results.mjs` and `capture-nba-results.mjs` each split their failure
modes explicitly: a **4xx** *"will not fix itself by waiting, so it exits 1 (the workflow records the refusal
and goes red)"*, while **network / 5xx / malformed** payloads *"stay SOURCE_STALE, exit 0, last-known-good
stands"*. Their headers already record the incident that forced the split — ESPN dropped the range form on
2026-09-20 and *"this capture swallowed the 400 as SOURCE_STALE for a week — green, writing nothing"*.

**That policy is right and is not changed here.** One transient 5xx should not redden a settler.

**But nothing counts the transients.** A single stale night and seven consecutive stale nights are
indistinguishable to every one of these scripts, and the repair only hardened the 4xx branch. A persistent
5xx would still be green indefinitely. That is a real gap — ranked below — but fixing it means introducing
run-length state, which is more than this audit should build.

## 3. 🔴 CONFIRMED DEFECT — the watchdog probes a request the system never makes

`src/lib/ops/feed-health.mjs` exists precisely for this failure class. Its own header says a feed that goes
dark *"does not fail loudly — the capture writes an empty file and the model quietly runs on less."*

It fetched the **bare** endpoint:

```
https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
```

Every capture fetches the **month form**, through the shared `espn-scoreboard-window` plan:

```
…/football/nfl/scoreboard?dates=202609&limit=1000
```

Measured live on 2026-09-23:

| request | HTTP |
|---|---|
| bare (what the watchdog probed) | **200** |
| range `?dates=A-B` (what broke) | **400** |
| month `?dates=YYYYMM` (what captures use) | **200** |

**So from 2026-09-15 to 2026-09-22, while the EPL, NFL, UFC and NBA results captures wrote nothing, the
feed-health watchdog reported every feed healthy.** It was not wrong about what it measured; it measured
the wrong thing. A probe that issues a different request from the one it is watching cannot observe that
request fail — the "guard the property, not its proxy" class, in the one place built to catch it.

**Fix (narrow):** the four ESPN scoreboard probes now build their URL from `scoreboardMonthUrls` — the same
plan the captures use — so the watchdog and the captures cannot diverge again. Verified live: all four
answer 200 and pass their shape check under the new form, so this does not make the watchdog spuriously red.

**Tests:** a characterization test asserting each probe URL equals exactly what a capture would fetch for
that sport path, plus both halves of the discrimination (`?dates=\d{6}&limit=1000`, and *not* the bare
endpoint). A negative control pins that the exact string removed today fails both halves.
**Mutation probe:** reverting the NFL probe to the bare endpoint is **caught**; a behaviour-free comment is
correctly **not** caught.

## 4. Ranked backlog — not fixed here

| # | finding | why not now |
|---|---|---|
| 1 | **No run-length on `SOURCE_STALE`.** One stale night and seven are indistinguishable. A persistent 5xx stays green forever. | Needs durable per-feed state; a real design task, not an audit fix. The §3 fix closes the *detection* half. |
| 2 | **`::warning::` is invisible in practice.** 13 deliberate soft-fails in `nightly-settle` annotate and continue. The policy is sound, but nothing aggregates warnings, so a lane can degrade for days inside a green run. | Wants a warning-count surface on `/ops`, not a change to the policy. |
| 3 | **`feed-health` has no artifact-staleness check.** It probes feeds, never asks "when did this capture last write?" A feed can be healthy while a capture is broken for another reason. | Complements #1; same design. |
| 4 | **`build-admin-status.mjs \|\| echo` ×2.** A stale admin dashboard is invisible by construction. | Low value — a dashboard, not a truth owner. Listed for completeness. |
| 5 | **`cron-watchdog` defaults a failed `gh run list` to `0` runs today**, which reads as "nothing ran" — the alarming direction, so it fails safe. | Correct as written; recorded so a future reader does not "fix" it into failing open. |

## 5. What this audit deliberately did not do

No `continue-on-error` was removed, no `|| true` was mechanically rewritten, no shared fail-loud framework
was introduced — the repository did not need one; it needed one probe to ask the right question. No sports
data, settlement artifact, provider, env var or billing setting was touched.
