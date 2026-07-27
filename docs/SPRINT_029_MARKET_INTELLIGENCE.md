# Sprint 029 — Model / Market Intelligence

Durable log for the sportsbook-intelligence sprint. Each phase records what shipped, what was
measured, and what is blocked — so a fresh session can continue from the repository rather than
from recollection.

Status labels: SHIPPED · PROVEN IN PRODUCTION · LOCALLY VALIDATED · BLOCKED · DEFERRED FOR DATA ·
DEFERRED FOR FOUNDER / LEGAL

---

## Baseline at session start

| | |
|---|---|
| HEAD | `06af7ed6` (== `origin/main`, no bot drift) |
| Suite | 2944 total · 2940 pass · 0 fail · 4 skip |
| TypeScript | clean |
| Protected money (`mr-dub/portfolio.json`) | `affe6b21071f2b3be96bb2774eb347c3` |
| Bank Builder locks | `cb80473f88f3cb5f67208fa568925295` |

Suite command (the only one that works — tests import `.ts` directly and need the loader):

```bash
cd app && npx tsx --test $(find src -name '*.test.mjs')
```

`npm test` does not exist, and plain `node --test` fails every file with
`ERR_UNKNOWN_FILE_EXTENSION`. Note that piping to `grep` masks the runner's exit code, so read the
`# fail` line rather than `$?`.

---

## STRUCTURAL EVIDENCE CHANGE — pitcher team resolution is no longer blocked

The prior handoff recorded player-prop team resolution at **136 / 1,251 rows (10.9%)** and marked
pitcher rows **DEFERRED FOR DATA**, on the stated grounds that "there is currently no
probable-pitcher artifact/source available in the demonstrated current data path."

Measured against the repository, that is not the case. `mlb/boards/<date>.json` carries two team
evidence sources the earlier measurement did not use:

1. `games[].awayProbablePitcherId/Name` + `homeProbablePitcherId/Name` — MLB StatsAPI probable
   pitchers, attributed to a specific side. 23 slots on the 2026-07-27 slate.
2. `leans[].playerTeamAbbr` — populated on **509 / 557** leans, including 19 `pitcher_strikeouts`
   rows.

Provenance was traced to `pipeline/mlb/generate_mlb_board.py:405-450` before being trusted, and it
is mixed:

- **Pitchers** resolve from probable-pitcher assignment. Side-specific and definitive.
- **Batters** resolve from MLB StatsAPI *roster membership* across the teams playing that day, via
  `setdefault` — "first roster wins". That is real evidence, not a matchup-string guess, but the
  tie-break is silent, so a player appearing on two of the day's rosters could be misattributed.

Because of that tie-break, the census applies a **participant cross-check**: a resolved team must be
one of the two teams in that row's own game, or the row stays UNRESOLVED. On the measured slate
**509 / 509 attributions passed** — zero mismatches.

Result: participant-verified team coverage is **1,054 / 1,251 sportsbook rows (84.3%)**, up from
10.9%, and `pitcher_strikeouts` now produces real comparison rows. This is not a weakened identity
rule — it is a better evidence source plus a cross-check the earlier path did not have.

**Superseded:** "pitcher team resolution DEFERRED FOR DATA". Batting orders still exclude pitchers;
probable pitchers cover them.

---

## Phase 0 — Reconcile · SHIPPED

Repository, remote, lineage (`369b6ea0`, `6ee58c28`, `9b6ad334`, `06af7ed6`), hashes and suite all
verified before any file was touched. `vp/` has uncommitted changes and is Cowork-owned — left
alone.

Tool-trust: the test runner was proved in both directions (a known-positive assertion passing and a
deliberate known-negative failing) before any result from it was believed.

---

## Phase 1 — Model / Market Pairing Registry · SHIPPED · LOCALLY VALIDATED

`app/src/lib/markets/pairing.ts` — one canonical selector, `getMarketIntelligenceMode()`, returning
`FULL_COMPARISON | MODEL_ONLY | SPORTSBOOK_ONLY | UNAVAILABLE` plus the named gates that removed
capability. Pages must not re-derive these states.

`UNAVAILABLE` is the default and every gate can only remove capability, so a row missing an input
degrades instead of over-claiming.

**Domain fix.** `PlayerMarketFamily` was defined purely from the sportsbook vocabulary, which made
`batter_hits_runs_rbis` — a family GameTimePicks models and the book does not price —
unrepresentable, and therefore made `MODEL_ONLY` structurally unreachable rather than merely empty.
Added `BATTER_HITS_RUNS_RBIS` (model-side only, no provider key) and split
`MODEL_KEY_BY_PLAYER_FAMILY` from `PROVIDER_KEY_BY_PLAYER_FAMILY`. Both maps are now `Partial`,
which immediately caught a real `possibly undefined` defect in the family lookup.

### Measured distribution — slate 2026-07-27 (real artifacts, not fixtures)

`node app/scripts/measure-pairing-coverage.mjs` (read-only, no network, no credits)

**Player props — 1,530 rows** (1,251 sportsbook + 279 model-side-only)

| Mode | Rows | Share |
|---|---:|---:|
| FULL_COMPARISON | 230 | 15.0% |
| MODEL_ONLY | 279 | 18.2% |
| SPORTSBOOK_ONLY | 1,021 | 66.7% |
| UNAVAILABLE | 0 | 0.0% |

Gates: `NO_MODEL_FAMILY` 801 · `NO_SPORTSBOOK_MARKET` 279 · `MODEL_ARTIFACT_MISSING` 220.

| Provider family | Rows | FULL | BOOK-only |
|---|---:|---:|---:|
| batter_home_runs | 425 | 0 | 425 |
| batter_total_bases | 234 | 73 | 161 |
| batter_hits | 196 | 143 | 53 |
| batter_rbis | 173 | 0 | 173 |
| batter_runs_scored | 160 | 0 | 160 |
| pitcher_outs | 23 | 0 | 23 |
| pitcher_earned_runs | 20 | 0 | 20 |
| pitcher_strikeouts | 20 | 14 | 6 |

Model-side families the book does not price: `batter_hits_runs_rbis` 197 · `batter_hits` 54 ·
`batter_total_bases` 23 · `pitcher_strikeouts` 5.

**Game markets — 36 rows** (12 games × moneyline/run-line/total): 35 FULL_COMPARISON (97.2%),
1 SPORTSBOOK_ONLY.

### Why rows fall out

The family-level overlap ceiling (3 of 8 provider families) is the dominant constraint, not a
defect: 801 rows are families GameTimePicks does not model, and showing them as market context is
the honest treatment. A further 220 rows are overlapping families where the board published no
projection for that exact player/line — `insufficient_data`, not a pipeline failure. Team
resolution, previously the binding constraint at 10.9%, no longer gates any row on this slate.

**15.0% is the real publishable comparison rate.** The old 35% family-overlap figure was only a
ceiling.

### The one refused game market

CLE @ CIN: the book posted a run line of **-1.5** while the simulation published cover probabilities
at lines `[1.5, 2.5]`. Matching those would require assuming a sign convention for whose side the
number describes. The pairing layer refuses (`THRESHOLD_UNSUPPORTED`) rather than fabricate a cover
probability. Phase 2 will add an explicit, tested sign normalization instead of an assumption.

### Tests — 33, all passing

All 11 required negative cases are covered, including: sportsbook-only family → SPORTSBOOK_ONLY;
model-only family → MODEL_ONLY; unresolved team → never FULL_COMPARISON; ambiguous identity → fails
the whole row closed; stale artifact → downgrade; missing model artifact → not FULL_COMPARISON;
unsupported sport → fails closed to market context; American odds `0` and null lines rejected; and
no mode asserting a validated advantage while `modelBeatsMarket` is false for every family.

### Adversarial mutations — both verified applied, then caught

| Mutation | Applied? | Guard |
|---|---|---|
| Remove the team-identity gate | verified (gate text absent, `if (false)` present) | 1 failure |
| Bypass the freshness gate | verified (same check) | 3 failures |

Both restored; file confirmed byte-identical to pre-mutation; suite green after each.

---

## Open items

- **Run-line sign convention** — Phase 2. Refused, not guessed, until explicitly modeled and tested.
- **Batter roster tie-break** — `setdefault` in the board generator resolves same-name collisions
  silently. The participant cross-check catches the cross-game case; a same-game collision would
  still resolve to the first roster hit. No occurrence on the measured slate.
- **No sportsbook snapshot history** — artifact-level freshness only. No opening line, no movement,
  no steam, no 24h change, and no such UI until real prospectively-retained snapshots exist.
