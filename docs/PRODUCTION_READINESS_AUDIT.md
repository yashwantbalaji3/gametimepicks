# GameTimePicks — Production Readiness Audit (SRE view)

**Date:** 2026-06-27 · **Branch:** `automation-health-gate` · **Bar for P0:** *can this be trusted to run 72h unattended?*

Every finding is grounded in `file:line` and was verified against source. No code was changed producing this audit.

---

## What is already solid (do not regress)

- Money is gated **before and after** the roll by three checks — `verify-money-integrity` + `forensic-money-audit` + `health-check` (`roll_to_next_day.sh:53,59,119,129`).
- **Settle-first** semantics + **FT-only** official gating mean in-progress games never count as a loss, and the system refuses to fabricate (`settle_soccer_day.sh:14-16,65-67`).
- **Honest-skip** on missing credentials is real and proven (3-day credential-free sim, 3/3).
- Settlement is **idempotent** (skips settled steps, dedupes history) — re-running a day never double-applies money (`settle-daily-portfolio.mjs:108,174-176`).
- Push/void leg outcomes re-price parlays correctly (`leg-settlement.ts:7,44-48`).
- `credit_guard` is **fail-closed** — refuses rather than guesses on quota/probe failure (`credit_guard.py:153-160`).

---

## P0 — must fix before trusting unattended operation

### P0-1 · A single non-FT game freezes the entire lifecycle indefinitely
WC knockout games finish as `AET`/`PEN`; cancelled/postponed/abandoned games never reach `FT`. Settlement accepts **only `FT`** (`soccer-markets.ts:162`, `daily-portfolio-settle.ts:156`), so a Bank Builder lane on such a game **pends forever** — there is no void/timeout/override status that releases it (`settle-daily-portfolio.mjs:91`, `daily-portfolio-settle.ts:186` throws). That keeps `daily-portfolio.json` `status:"active"` for the prior day, so the settle-first guard HALTs at **step 3 of 11** every subsequent run (`roll_to_next_day.sh:65-80`) → no products, no deploy, public site frozen, **no automated recovery**. The only documented unblock is a human hand-crafting an `OFFICIAL=` bundle at 3 AM. *Knockout rounds make this near-certain during a World Cup.*

### P0-2 · Zero failure alerting + zero monitoring (no dead-man's-switch)
Grep across `.github`, `scripts`, `app/scripts` for `slack|webhook|pagerduty|notify|sentry|deadman|heartbeat` → **nothing**. If the cron silently doesn't fire (GitHub disables schedules on repo inactivity), or a run dies, **nobody is told** — it's just a red check no one is watching. Nothing probes the live site on a schedule, nothing detects "cron didn't run today" or "data is N days stale." The entire premise is unattended operation, but there is no signal when it stops. The conceptual "Notify" step does not exist — it is only a run-report JSON nobody reads (`write-run-report.mjs`).

### P0-3 · The roll's `git push` is not rebase-protected → silent loss of the day's work
`roll_to_next_day.sh:131-132`: `git commit` then `git push origin HEAD:main || die` with **no fetch/rebase/retry**. The run takes minutes (tests + `npm run build`), and legacy crons push to `main` throughout the day, so a concurrent push makes this a non-fast-forward → `die`. By then `--apply` has already mutated money/ladder on disk and generated the (paid) slate — all discarded with the runner; prod stays on the old deploy. `morning-projections.yml:257-271` already has the exact rebase-retry loop the roll lacks.

### P0-4 · No rollback, and the smoke window is too short → false-fail leaves `main` poisoned/unverified
The post-deploy smoke polls **4×45s ≈ 3 min** (`roll_to_next_day.sh:134-141`); a cold Vercel production build routinely exceeds that, so a **healthy** deploy gets reported as a failure. On any smoke failure the script just `die`s — **there is no `git revert`, no Vercel rollback, no known-good tag** (verified absent across all workflows + scripts). The bad/slow commit stays on `main` with no path back to the last-good deploy, and no way to distinguish "build was slow" from "data is bad." Recovery is entirely manual with no safety net.

### P0-5 · A missed/halted roll renders yesterday's slate as a *live* "active" wager — no staleness banner on flagship pages
"Today" is the latest *generated* slate, not the wall clock: `today = currentSlateDate() ?? currentEtDate()` (`today/page.tsx:80`, also `mr-dub`/`bank-builder` pages). When a roll is missed, `currentSlateDate()` returns **yesterday**, every page gates content on `=== today` (which is now yesterday), so yesterday's cards render as **"active · $X at risk · open exposure"** as if live (`daily-portfolio-section.tsx:96`, `daily-portfolio.ts:98`). The honest `TodayAwareSlateBanner` exists but is wired **only to the legacy `/board` page** — the four flagship pages have no user-visible staleness guard. During unattended operation this publishes misleading live-looking wagers on already-finished games.

---

## P1 — should fix before launch

### P1-1 · Forensic gate reconciles a **frozen hardcoded date** (`2026-06-26`)
`forensic-money-audit.mjs:57,79,103` call `buildMasterLedger`/`computeOpenExposure` with literal `"2026-06-26"`. The gate validates a fixed historical day, not "today" — so cross-product exposure drift on the live date is never caught by this gate.

### P1-2 · Gates don't validate product artifacts, "active-lane-has-legs", or today-dating
The three gates validate only the Mr. Dub money quartet. They do **not** check `daily-portfolio.json` internal consistency, that a lane marked `active` actually has legs, that the four product artifacts are *today's*, or product internal consistency. Product artifacts are only checked to **parse** (`health-check.mjs:107-115`); absence is a warning. A fully stale-but-parseable artifact set, or an `active` lane with zero legs, passes all three gates.

### P1-3 · A hard failure writes **no run report**, and the lifecycle uploads no logs
The run report is written at the *end* (`roll_to_next_day.sh:147`), but `set -e`+`die` exits before reaching it — so the report exists only on **success**, exactly when it isn't needed. There's no git SHA, no which-stage-failed, no error text/stderr (`apiSkips` is inferred from product presence, not exit codes). Per-stage logs go to `/tmp/roll_*.log` which `daily-lifecycle.yml` does **not** upload — so GitHub Actions console is the only failure record.

### P1-4 · No transient-API retry/backoff in the roll → one blip cascades into a halt
Odds/projections/specials/MLB fetches all use `|| warn` (`roll_to_next_day.sh:85-86,103,108-109`) — a transient 429/5xx/timeout is downgraded to a warning and the roll **deploys a partial slate**. `settle_soccer_day.sh:55` does a single fetch attempt → NO-OP on failure → the prior day silently doesn't settle → the *next* roll HALTs (P0-1). No retry loop or backoff anywhere.

### P1-5 · Cross-workflow `main` collisions + thin DST guard
Concurrency groups are per-workflow and disjoint, so `auto-refresh` (every 2h), `daily-refresh` (13:00), and `morning-projections` (13:30) can be mid-push while `daily-lifecycle` pushes — there is no global "writes-to-main" mutex. The 08:30-after-07:30 spacing only orders *start* times; under EST the lifecycle (03:30 ET) starts ~1h after nightly-settle's repair pass (02:30 ET) and the *durations* can still overlap. Combined with P0-3 any overlap kills the roll.

### P1-6 · Month-end date rollover bug drops late games
`fetch_official_soccer.py:67`: `next_date = f"{...}-{dd+1:02d}"` with no month/year carry → settling the 30th/31st produces an invalid date (e.g. `2026-06-31`). Any post-midnight-UTC ET kickoff on a month boundary is dropped from the bundle → never reaches FT → pends → feeds the P0-1 halt.

### P1-7 · Approved-card lock has no TTL → can re-pin/re-activate a stale card
`bank-builder-locks.json` is gated only by `lock.date === date` with no expiry (`accounting.ts:186`). Combined with P0-5 (where `date` resolves to yesterday), a stale lock can re-pin and even **force-activate** yesterday's card (`accounting.ts:235-244`). Release is manual or per-leg-unavailability only; no time-based release.

### P1-8 · Partial product generation deploys silently and can render stale-as-live
If e.g. Homer Nukes fails but the others succeed, the roll still deploys (only BB activation + the gates `die`). The site then shows 3 fresh products + 1 serving yesterday's artifact, which — per P0-5 — renders as current. The run report records `homerNukes:false` but nobody is alerted (P0-2); the smoke checks pages + money drift, not per-product freshness.

### P1-9 · Legacy NBA crons push to `main` without the money/health gate
`auto-refresh` + `daily-refresh` commit NBA-trend data to `main` (triggering Vercel deploys) without running the money/health gates. They don't touch money files, but they are an ungated publish path and a Vercel-rebuild source during an unattended weekend. (Note: `nightly-settle` + `morning-projections` *do* run the gate, added in Phase 7.)

### P1-10 · No recovery runbook / known-good tag
`docs/` has operational runbooks but none covers corruption/rollback/restore (grep for `recover|rollback|restore|corrupt|known-good|snapshot` → only an unrelated line). If a bad `portfolio.json` ever reaches `main`, there is no documented restore path and no known-good git tag/snapshot.

### P1-11 · The `OFFICIAL=` bundle escape hatch is unvalidated (fabrication risk)
The documented way out of the P0-1 halt is `OFFICIAL=/tmp/bundle.json` (`settle_soccer_day.sh:52-53`), copied in verbatim with **no validation against the live API** and treated as official truth that moves paper money. It's exactly the path a frustrated 3 AM operator is pushed toward.

---

## P2 — nice improvements

- **P2-1 · `git add -A` in the deploy commit** (`roll_to_next_day.sh:130`) stages any non-ignored stray file rather than an `app/public/data` allowlist (every legacy workflow uses a scoped allowlist). `.gitignore` covers the dangerous cases (`.env`, `node_modules`, `*.log`, `/tmp`), so low risk — but broader than needed.
- **P2-2 · `daily-lifecycle` dispatch defaults `apply=true`** (`daily-lifecycle.yml:64`) — an accidental manual "Run workflow" click mutates money. Consider defaulting to dry-run.
- **P2-3 · `credit_guard` not pre-called by the roll's own ODDS fetch** (`roll_to_next_day.sh:85`) — relies on each downstream tool's internal cap/floor rather than a central pre-flight balance check.
- **P2-4 · Duplicate match emission** (`fetch_official_soccer.py:101-116` emits each game under both numeric id and "Home vs Away") — no cross-leg correlation check; low risk given current card construction.
- **P2-5 · `T08:00:00Z` lock/now anchor is 08:00 UTC (04:00 EDT), not 8 AM ET** — internally consistent but misleading if anyone reasons about it as Eastern.

---

## The critical failure chain (one sentence)

A cancelled or extra-time/penalty WC knockout game on a Bank Builder lane (**P0-1**) → lane pends forever → settle-first guard HALTs the lifecycle every day → no products, no deploy → the flagship pages keep rendering the frozen prior slate as a live "active" wager (**P0-5**) → and because there is no alerting or monitoring (**P0-2**), nobody finds out until a user does.

**Recommended fix order:** P0-1 (void/override path for non-final games) → P0-2 (alert + heartbeat) → P0-3/P0-4 (rebase-retry push, longer smoke + a rollback/revert path) → P0-5 (staleness banner / wall-clock gate) → the P1 set.

---

## Resolution status — 2026-06-27

**Fixed + committed (branch `automation-health-gate`):**
- **P0-2** — ops-notify + check-heartbeat (dead-man's-switch) built + wired into roll + settle; failure-trap emits a heartbeat/report even on a hard die. ✓
- **P0-3** — roll push is fetch+rebase+retry (3×). ✓
- **P0-4** — smoke window extended to ~8 min (cold-build tolerant). ✓
- **The settle-first guard bug** (found during the June-26 settlement; was halting the autonomous roll after every settlement) — now keys off the ladder's settled `slateDate`, not stale daily-portfolio status. Proven across 3 scenarios. ✓
- **P0-5 (detection half)** — health-check now flags a not-today slate (missed roll) + an active lane with zero legs + daily activeBankroll drift. The deploy gate catches staleness; the UI banner remains the open half. ✓ (detection)
- **P1-1** — forensic gate derives the audit date from the live slate (was hardcoded `2026-06-26`). ✓
- **P1-2** — gate now validates daily-portfolio integrity (active-lane-has-legs, slate freshness, bankroll drift). ✓
- **P1-3** — failure run-report via EXIT trap. ✓
- **P1-6** — month-end date rollover fixed (real `datetime` math). ✓
- **P1-10** — recovery runbook (`docs/RECOVERY_RUNBOOK.md`) + `known-good-*` git tags. ✓
- **P2-1** — scoped `git add app/public/data` (not `-A`). ✓

**Open — needs owner-involved, money-rules-sensitive work (NOT safe to automate unattended):**
- **P0-1 (settlement of non-FT games)** — knockout games finish `AET`/`PEN`; cancelled games never reach `FT`. Naively accepting `AET`/`PEN` is UNSAFE because `fetch_official_soccer.py:96` emits `fx.get("goals")` = the **extra-time-inclusive** score, while match-result/totals/BTTS settle on the **90-minute regulation** score (`score.fulltime`). A correct fix must (1) emit `score.fulltime` for AET/PEN, (2) confirm the per-market settlement rule (90′ vs incl-ET), and (3) be tested against real AET fixtures. Cancelled/abandoned games need a `void` mapping (return stake, re-price the parlay). The silent-freeze risk is now mitigated (a refused settlement emits a failure heartbeat), so this no longer freezes *invisibly* — but it still requires a human to settle a knockout/cancelled game until the rules are encoded.
- **P0-5 (UI half)** — a user-visible "stale slate" banner on the flagship pages (the gate-level detection is done; the UI banner is deferred under the UI-frozen rule).
- **P1-5 / P1-9** — cross-workflow main-push contention is mitigated by rebase-retry but lacks a global mutex; legacy NBA crons (`auto-refresh`, `daily-refresh`) still push to main ungated.
- **P1-7 / P1-8 / P1-11** — lock TTL, partial-generation surfacing, OFFICIAL-bundle validation.
- **P2-2/3/4/5** — minor.
