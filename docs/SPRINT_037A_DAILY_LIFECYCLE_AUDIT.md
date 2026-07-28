# Sprint 037A — Daily Lifecycle Audit

**Date:** 2026-07-28 (audit run 09:28–09:35 ET) · **Branch:** `june30-reset` · **Baseline:** `3e7b563a`

> **The question:** *If I wake up every morning, can I trust that GameTimePicks generated today's slate
> correctly, settled yesterday honestly, and knows whether it is improving?*
>
> **The answer:** Yes to settling honestly. Yes to knowing whether it is improving. **Qualified yes** to
> generating today's slate — the pipeline works, but until this sprint nothing could *tell* you that
> without reading the filesystem yourself.

---

## Phase 0 — reconciliation

Drift was archive-only (362 files, zero non-archive). Rebased clean.

| Check | Result |
|---|---|
| Suite | 3143 → **3148** tests, 3144 pass, **0 fail**, 4 skip |
| typecheck / build | clean / clean |
| Money · BB lock | `affe6b21…` · `cb80473f…` unchanged |
| `vp/` | zero files in any commit |

**`npm test` did not exist.** The sprint asked for it; npm errored with `Missing script: "test"`. Added
and verified — see Phase 7.

---

## Phase 1 — July 27 settlement audit

### What was generated

| Artifact | Count |
|---|---|
| Board lean rows | 557 (**509 non-Pass predictions**, 48 Pass) |
| Distinct games | 12 |
| Game-level predictions | 12 |
| Team markets | 12 games · moneyline, run line, total · **DraftKings only** |
| Player props (provider) | 1,251 rows |

Prediction mix: `batter_hits` 197 · `batter_hits_runs_rbis` 197 · `batter_total_bases` 96 ·
`pitcher_strikeouts` 19. By category: A 206 · B 86 · C 217.

### What settled

**505 settlement rows for 509 predictions.** 213 W · 228 L · 64 Void → **441 decisive, hit .4830**.

| Market | n | W | L | Hit |
|---|---|---|---|---|
| batter_hits | 168 | 94 | 74 | **.5595** |
| batter_hits_runs_rbis | 168 | 81 | 87 | .4821 |
| pitcher_strikeouts | 17 | 7 | 10 | .4118 |
| batter_total_bases | 88 | 31 | 57 | **.3523** |

| Category | n | Hit |
|---|---|---|
| A (High) | 179 | **.4469** |
| B (Medium) | 76 | .5000 |
| C (Low) | 186 | **.5108** |

### Scoring

| | n | Brier | Log loss | Mean predicted | Actual |
|---|---|---|---|---|---|
| Model | 441 | 0.2564 | 0.7086 | **.5902** | .4830 |
| Market | 441 | **0.2375** | **0.6674** | .5396 | .4830 |

Calibration by predicted-probability bucket — **every bucket over-predicts, and the gap widens with
confidence**:

| Bucket | n | Predicted | Actual | Gap |
|---|---|---|---|---|
| 0.3–0.4 | 21 | .3674 | .3333 | −0.034 |
| 0.4–0.5 | 64 | .4528 | .3594 | −0.093 |
| 0.5–0.6 | 144 | .5501 | .4583 | −0.092 |
| 0.6–0.7 | 142 | .6503 | .5493 | −0.101 |
| 0.7–0.8 | 63 | .7342 | .5556 | −0.179 |
| 0.8–0.9 | 7 | .8242 | .5714 | **−0.253** |

### ⚠️ 4 predictions vanished without a record

Sam Huff (×2), Chase Burns, Slade Cecconi — all `Under`, all High/Medium — have **no settlement row at
all**, not even a Void. The 64 Voids *are* recorded, so this is not the void path. The denominator
silently shrank by 0.8%.

Small in size, familiar in shape: work that disappears without leaving a trace. The ledger should carry
an explicit ungraded row with a reason (scratched, DNP, no box-score entry) rather than omitting it.
**P1.**

---

## Phase 2 — the daily pipeline

| Stage | Workflow | Cron (ET) | Produces | On failure |
|---|---|---|---|---|
| Settlement | `nightly-settle` | 01:30, 03:30 | settled leans, ledgers, audit | health-check gates the commit |
| Static clock | `daily-rebuild` | 05:20 | (deploy ping) | **DORMANT** — no secret |
| Research capture | `mlb-pregame-capture` | 07:00, 11:00, 13:00, 15:00, 17:00, 18:30, 19:00, 21:00 | snapshots, freezes, market captures | step-level tolerant; job can now fail |
| **Board** | `morning-projections` | **09:30** | `mlb/schedule`, `mlb/boards` | **blocking** — everything downstream skips |
| Slate | `mlb-daily-production` | 10:15 (+ `workflow_run`) | team-markets, props, sims, predictions | fail-closed on missing board |

Settlement chain: final scores → StatsAPI box scores → prop grading → `settled_leans.jsonl` →
`lifetime_summary` → `/results`. **Official box scores only; no paid API.**

---

## Phase 3 — automation reliability

Sprint 035 removed job-level `continue-on-error` from the two main workflows, made the forbidden-path
abort `exit 1`, made push failure retry-then-fail, and wired failure alerting into four workflows.

**Still open:** `OPS_WEBHOOK_URL`, `VERCEL_DEPLOY_HOOK_URL` and the analytics vars are all unset, so
alerting is armed but silent, the static clock never advances on a no-change day, and no user behaviour
is measured. `daily-lifecycle` still burns a run at 04:30 ET producing nothing without
`ENABLE_AUTONOMOUS_DEPLOY`.

---

## Phase 4 — July 28 readiness

Verified at 09:28 ET against MLB StatsAPI (free, authoritative): **16 games scheduled**, including a
**CLE @ CIN doubleheader** — the known doubleheader-identity hazard, worth watching when today's board
lands.

At 09:28 ET **zero July 28 artifacts existed.** My first reading was that the pipeline had failed. It
had not: `morning-projections` fires at **09:30 ET**, so the slate was two minutes from being due. The
correct verdict is *not yet generated*, not *broken*.

What **had** run: `nightly-settle` (06:07 ET, settled July 27) and `mlb-pregame-capture`, which produced
**16 freezes matching the 16 scheduled games** — 32 snapshots, 4 market captures.

No stale July 27 leakage: the site frames the slate as "Latest slate", never "Live today".

---

## Phase 5 — website readiness

Built export inspected directly. `/`, `/today` and `/markets` all render the July 27 slate under
**"Latest slate"** framing with the client badge re-deriving the real ET clock. No page claims stale
data is current. e2e 39 passed / 0 failed.

---

## Phase 6 — July 27 model review

**What held up:** settlement ran on time and graded from official box scores; `batter_hits` was the one
market above water (.5595 on n=168); the void path worked (64 recorded).

**What did not:** the model lost to the market on both Brier and log loss; it over-predicted in *every*
probability bucket, worsening with confidence; `batter_total_bases` hit .3523 on n=88; and the
Category A < B < C inversion reproduced on a single day (.4469 / .5000 / .5108).

**Calibration observation.** Mean predicted .5902 against .4830 actual is a **10.7pp overconfidence
gap** on one slate — directionally identical to the 21,633-row lifetime finding.

**Lessons — with the sample-size caveat stated plainly.** One day is n=441 on four markets; nothing here
justifies a model change on its own. It is *consistent with* the lifetime evidence, which is the useful
part. Per the operating rules, no model change is recommended.

---

## Phase 7 — daily operating dashboard

**Shipped** (`7a46e145`): `admin/status.json` now carries a `todayReadiness` block answering the
founder's question directly, kept separate from `workflowHealth`.

```
etDate 2026-07-28 · etTime 09:31 · signal YELLOW
"0/6 produced; the rest are not due yet"
  schedule      pending   due 09:30 ET  via morning-projections
  board         pending   due 09:30 ET  via morning-projections
  teamMarkets   pending   due 10:15 ET  via mlb-daily-production
  playerProps   pending   due 10:15 ET  via mlb-daily-production
  simulations   pending   due 10:15 ET  via mlb-daily-production
  predictions   pending   due 10:15 ET  via mlb-daily-production
```

Schedule-aware on purpose: `pending` is a real third state, and GREEN requires every stage.

**A false positive I caught before trusting it.** The first draft credited `mlb/schedule` to
`mlb-pregame-capture` (07:00 ET) and reported it **LATE** at 09:30. git history and the workflows' own
`git add` lines show `morning-projections` writes it. A wrong due-time makes this block worse than
nothing — it manufactures alarms. `today-readiness.test.mjs` now parses the stage table and asserts
every stage names a workflow that actually stages that path *and* that its due time matches a real
cron; reintroducing the error reproduces the exact misattribution failure.

---

## Phase 8 — recommendation

### Operational maturity: **6.5 / 10**

Settlement and grading are genuinely strong (official-source, idempotent, self-healing, gated).
Generation is automated and fail-closed. What is weak is **observability of the day itself** — now
partly addressed — and **everything downstream of a decision the founder has not made**.

### Risks

**P0**
1. **Nothing in this sprint (or the last three) is live.** 14 commits sit on `june30-reset`; cron only
   runs the default branch. Concretely demonstrated today: this sprint's `capturedAt` change is absent
   from today's manifests because CI ran `main`.
2. **Market payloads are still being discarded.** Two more captures today (1,056 + 978 rows) written and
   gitignored. Every day of delay is unrecoverable history.

**P1**
3. 4 predictions per slate silently vanish rather than recording an ungraded reason.
4. No alerting: `OPS_WEBHOOK_URL` unset, so a real failure is still invisible until someone looks.
5. Single-book team markets — "the market" means DraftKings.

**P2**
6. Deploy hook dormant; analytics dark; `daily-lifecycle` burning a daily run for nothing.

### Recommended next sprint

**Merge to `main` and watch one full automated cycle end to end.** Every other item is speculative until
the automation is actually running this code. Then set the three secrets, then decide market retention.

---

## Final answer

| Question | Verdict |
|---|---|
| Generated today's slate correctly? | **Qualified yes.** Capture ran, 16/16 games frozen, board due 09:30. Until this sprint nothing could report that without reading the filesystem. |
| Settled yesterday honestly? | **Yes.** 505 rows from official box scores, voids recorded, money untouched — with 4 predictions that vanished instead of being recorded as ungraded. |
| Knows whether it is improving? | **Yes, and it says so against interest.** Brier .2564 vs market .2375, overconfident in every bucket, and the site publishes it. |
