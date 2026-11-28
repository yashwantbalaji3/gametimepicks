# NBA player-points market integration plan (2026-10-21)

**Status: PLAN ONLY.** This PR makes no paid call, changes no flag, adds no decision card, adds no workflow and
publishes nothing.

Founder direction (2026-10-20): *"prioritize points first … a robust NBA player-points market integration plan,
including verified sportsbook source authorization, event/player identity matching, timestamped prices,
settlement eligibility, price-aware EV and shadow evaluation. This is authorization to prioritize engineering and
approval preparation, not to publish unvalidated NBA picks or activate NBA betting products."*

**Scope: one market, `player_points`** (The Odds API key, `basketball_nba`), regular season only. Rebounds,
assists, 3PM and the combinations come later, each under its own authorization.

**How this relates to other work:**

- It builds on the drafts on `origin/claude/nba-top-boards-v2` (`docs/nba/NBA_MARKETS_GAP_REPORT_2026-10-21.md`, `boardRowEvaluation`) and `origin/claude/nba-product-legs-gated` (`docs/nba/NBA_PRODUCT_INTEGRATION_PLAN_2026-10-21.md`, `nbaLegFromEvaluation`).
- Where those already specify something, this plan cites them rather than restating it.
- Line references are to `origin/main` @ `fb19745ed2` unless a branch is named.

---

## 1. Authorization: a points-only decision and receipt

### 1a. Why the existing card cannot carry it

`decision-nba-markets-authorization` (`app/src/lib/launch/founder-decisions.mjs:33-44`) offers
`AUTHORIZE:h2h:<ceiling-credits>` and `DEFER`. The h2h token stays exactly as it is. A points token is a new
template beside it, not an edit to it.

### 1b. Proposed template

```
AUTHORIZE:props-points:<ceiling-credits>:<expiry-YYYY-MM-DD>
```

Example: `AUTHORIZE:props-points:800:2026-11-20`. Both values are founder-chosen numbers, not keys (the card's `neverShare` rule).
The authorization ends at whichever comes first: the ceiling or the end of the expiry date in ET.

**Why this is text and not code in this PR.** Adding the card is not a small change:

- `reconcileDecisionsWithQueue` enforces a one-to-one law between cards and closure-packet founder-queue items. A new card needs a new `nba:<stage>` queue item in `closure-packets.mjs`.
- `founder-decisions.test.mjs:31` pins `FOUNDER_DECISIONS.length === 5`.
- The dry-run validator has a known prefix hazard. `founder-decision-dryrun.mjs:55-57` compares only `t.split(":")[0]`, so *any* `AUTHORIZE:…` token prints VALID SHAPE against the h2h card today (gap report A1).

Those three changes belong in one reviewed engineering PR (step E1, §8). The validator fix comes **first**, so that
the new template cannot be "validated" by the old card.

### 1c. Proposed receipt `docs/receipts/ODDS_AUTHORIZATION_NBA_POINTS.md` (UFC/EPL/NFL pattern)

It is written only after the founder answers, with the answer quoted verbatim. The operative table must read:

| Term | Value |
|---|---|
| Scope | NBA only (`basketball_nba`), regular season (seasonType 2). Every other sport key is out of scope |
| Cumulative ceiling | **`<ceiling-credits>` credits** (circuit breaker) |
| Markets added | `player_points` only. h2h, spreads, totals, every other `player_*` key and `player_points_alternate` are OUT OF SCOPE |
| Bookmakers | the eligible-operator allowlist (PR 1130, `eligible-operators@1`), at most 10 keys = 1 region-equivalent. No `regions` parameter |
| Endpoint | per-event `/v4/sports/basketball_nba/events/{id}/odds`, pre-start events only. The free `/events` listing for the join. The historical endpoints are OUT OF SCOPE |
| Cadence | the three pre-tip slots of §2. Never after tip |
| Expiry | the ceiling, or `<expiry>` 23:59 ET, whichever comes first |
| Discipline | own cumulative ledger (`data/internal/research/odds/nba/authorization-ledger.json`); failed charged calls count; do not retry blindly; stop before any call whose worst case would breach the ceiling; an absent market or a 422 is `NO_MARKET` evidence, not a retry target; redact and self-scan every artifact |

### 1d. Parser work the receipt needs (`app/src/lib/sports/odds/p171-authorization.mjs`)

Without this work the receipt would not be a control:

1. `AUTHORIZED_SPORTS.nba = { sportKey: "basketball_nba", scopeRe: /NBA[- ]only/i }` and `LEDGER_RELPATH.nba`. Another sport's receipt must still refuse, in both directions (existing tests show the pattern).
2. **Dated expiry.** `expiryTerm` knows only `CEILING_ONLY`, `PROGRAM_SCOPED` and `UNKNOWN`. A row reading "the ceiling or 2026-11-20 …" matches `/ceiling/` and is classified `CEILING_ONLY`. **The date would go unread**, which is the same half-read-term defect the NFL receipt documents (`ODDS_AUTHORIZATION_NFL_2026.md`, "A term this file states and the code does not enforce"). Add a `DATED` kind that refuses after the date, and a test that the date half is enforced.
3. **Market enforcement.** `authorizedPropMarkets()` already reads a `Markets added` row (`:164-168`). The NBA capture must assert that its requested markets equal `["player_points"]` **and** are a subset of `authorizedPropMarkets(receipt)`, and it must refuse otherwise. `MARKET_SCOPE.nba` (`market-scope.mjs:23`) gains `player_points` only behind that receipt check, never by default.

### 1e. Credit estimate (player_points only)

**The provider's costing**, from the-odds-api.com/liveapi/guides/v4, read 2026-10-20:

- event odds: "cost = [number of unique markets returned] x [number of regions specified]"
- bookmakers: "Every group of 10 bookmakers is the equivalent of 1 region."
- "Responses with empty data do not count towards the usage quota."
- the `/events` listing "does not count against the usage quota"

The repo's own docstring agrees (`pipeline/providers/odds_api_provider.py:7-12`).

**Per call:** 1 market (`player_points`) × 1 region-equivalent (9 allowlisted keys ≤ 10) = **1 credit per event per capture**. The cost is 0 if no book returns the market.

**Events per slate**, from `app/public/data/nba/schedule/capture-2026-10-20T1416.json`, regular season, by ET night:

- 2026-10-21 → 2026-11-20: **232 games on 30 nights**, mean **7.7 per night**, max **15**.
- The capture's whole window (to 2026-12-28): 457 games on 62 nights, mean 7.4.

**Captures per slate:** 3 per event (slots S1, S2, S3 in §2).

| Quantity | Arithmetic | Credits |
|---|---|---|
| One event, one capture | 1 market × 1 region-eq. | 1 |
| One event, full day | 1 × 3 captures | 3 |
| Mean slate | 7.7 events × 3 | ≈ 23 |
| Largest slate | 15 × 3 | 45 |
| **Pilot window 2026-10-21 → 2026-11-20** | 232 events × 3 | **696** |
| Full regular season (1,230 games − 3 played 2026-10-20) | 1,227 × 3 | 3,681 |

**Ceiling options for the founder.** These are arithmetic, not recommendations of a constant.

- **Pilot:** `AUTHORIZE:props-points:800:2026-11-20`. 696 projected, about 15 % headroom for rescheduled games. At 3 credits per game it cannot fund more than 266 games.
- **Season:** a ceiling near 3,700 with an April expiry.

For scale:

- The 2026-06-10 probe reported 19,329 credits remaining (`docs/audits/nba-oddsapi-market-coverage-2026-06-10-latest.md`).
- The NFL receipt recorded 16,044 on 2026-09-10.
- The founder said monthly use is "not even using 30-40% of the credit limit" (`ODDS_AUTHORIZATION_NFL_2026.md`).

The shared MLB remaining-balance floor (`ODDS_API_MIN_CREDITS_REMAINING`) still protects the rest of the account.

**What this estimate excludes, because it is not authorized:**

- other markets (each would multiply the per-call cost);
- `player_points_alternate`;
- the historical odds endpoints;
- any capture after tip;
- the legacy `pipeline/` provider. It defaults to 7 markets × 6 events = 42 credits per run, and its "18 credits per run" comment is stale (gap report A4).

The legacy path and the manual paid `nba-market-probe.yml` are **not** funded by this receipt and must stay dry-run or de-scheduled (`daily-refresh.yml` forces `ODDS_DRY_RUN`; `auto-refresh.yml` gates on `vars.NBA_LEGACY_REFRESH`).

---

## 2. Capture schedule, storage, data class and leak scanning

### 2a. Slots (pre-tip only, aligned to the forecast freeze)

NBA forecasts are write-once, per game, and pre-tip (`app/src/lib/sports/nba/forecast-receipt.mjs`). The
`nba-forecast-window.yml` hourly tick writes a game the first time it tips within 8 h, so each game has its own
freeze instant (`inputAsOf`).

| Slot | When | Role |
|---|---|---|
| **S1 — freeze** | the first capture tick **after** that game's forecast receipt exists, and before tip | the price the shadow **evaluates** against the frozen forecast (one evaluation row per player per event) |
| **S2** | tip − 90 min | movement record only |
| **S3 — close proxy** | tip − 35 min, so it lands before `LEG_BOUNDS.activationCutoffMs` (30 min, `eligible-leg/contract.mjs:81`) | the **de-vigged close** for CLV and the market comparison. Labelled `CLOSE_PROXY`; the true close is not observable without post-lock capture, which is forbidden |

Hard rules:

- A capture refuses any event whose scheduled tip **or** provider `commence_time` is at or before the capture instant.
- A price with `last_update` after tip is quarantined (`PRICE_AFTER_LOCK`).
- The slot offsets (90 and 35 min) are proposals for founder approval alongside the receipt. They are not new methodology constants (§7 fixes the bar, not the cadence).

### 2b. Storage

- **Path:** `data/internal/research/odds/nba/points/<slateDateEt>/<providerEventId>.<slot>.<YYYYMMDDTHHMM>.json`. Write-once: a later capture is a new file, never an overwrite.
- **Contents:** normalised rows only, per `snapshot-contract.mjs` `normalizeOddsEvent`, with a `requestId`, `creditsUsed`, `sourceRows`, the quarantine list, the response hash (`acquisition-cache.mjs` `responseHash`) and the receipt's file sha256.
- **What is never committed:** the raw provider payload, the API key and account identifiers.
- **Data class:** `dataClass: "PRIVATE_RESEARCH"`, the repo's private class. `validateOddsSnapshot` already refuses anything else ("odds snapshots never ship publicly").

### 2c. Leak scanning

- `assertNoSecretLeak(payload, [KEY])` runs on every artifact before it is written, as the EPL capture does (`capture-epl-odds.mjs:407`).
- A new test fails if any file under `app/public/data/nba/**` contains a provider bookmaker key, an American-price field beside a `player_points` key, or the `odds/nba` path.
- The post-build `data-platform/export-leak.test.mjs` pattern is extended to the same strings, run by the release owner, never here.
- Sportsbook URLs and deep links stay banned, per the product plan's scan (branch `claude/nba-product-legs-gated` §6, Terms `legal/texts.mjs:61`).

---

## 3. Identity matching

### 3a. Events: teams plus commence time

- Use `joinOddsEventToSchedule` (`app/src/lib/sports/odds/event-join.mjs`). Both teams must resolve against **one** canonical schedule row, within the default ±45 min start tolerance.
- Teams resolve through an NBA normaliser built from `roster-contract.mjs` `espnTeamById` names, so it is id-backed and not free text.
- Zero candidates → `UNMATCHED`. Two or more → `AMBIGUOUS`. Both quarantine, and the closest is never picked.
- A home/away swap is recorded (`orientation: SWAPPED`) and refused for this market.
- The providerEventId → canonicalEventId lineage persists. The same provider id joining a different game later is a lineage violation that quarantines.

### 3b. Players: ESPN `providerAthleteId` ↔ provider outcome `description`

The provider sends a player **name** with no team and no id, so the rules are deterministic and ordered. The first rule that decides wins.

1. **Context first.** The candidate set is the union of the two joined teams' rosters from the ESPN roster owner (the latest capture ≤ the price's capture instant). The player must also be in the official NBA snapshot for that event (`official-snapshot.mjs`, family `pts`), or there is nothing to evaluate. A name is never matched outside an event and roster context.
2. **Exact normalised name.** Use `normalizePlayerName` semantics (NFD, accent fold, punctuation strip; same as NFL `player-identity.mjs`). Exactly one candidate → `MATCHED`.
3. **Reviewed alias table.** File: `data/internal/research/nba/identity/odds-api-player-aliases.json`. Each row holds `{providerName, providerAthleteId, teamId, evidence, reviewedBy, reviewedAt}`. A hit → `MATCHED_ALIAS`. Rows are added by a human-reviewed commit only. An agent may propose a row but never approve its own.
4. **Generational suffix**, as a fallback only on a miss. Use `stripGenerationalSuffix` (the NFL 2026-09-25 lesson: 8 of 12 unresolved labels were suffix disagreements). It is accepted only if it identifies exactly one candidate → `MATCHED_SUFFIX`, recorded as such.
5. **Otherwise** → `UNRESOLVED` (zero candidates) or `AMBIGUOUS` (two or more, e.g. two players with the same normalised name on the two rosters). The row is quarantined with its reason, counted and reported daily. It never reaches the evaluator and is never reported as "not offered".

**Lineage:** a (providerName, teamId) pair that resolved to athlete A and later resolves to athlete B is a violation that quarantines both until reviewed.

---

## 4. Price normalisation

- **Two-way only.** An `Over` and an `Under` for the same athlete, same point and same book in the main `player_points` market. A missing side → `ONE_SIDED_PRICE`, never synthesised. Two different main points for one player at one book → ambiguous, refused. Alternates are out of scope.
- **De-vig: the evaluator's own.** Proportional two-way, refused outside the sanity band (1, 1.25] (`snapshot-contract.mjs` via `market-evaluator.mjs`). Raw implied probabilities are recorded before normalisation so the vig stays visible. No product de-vigs on its own.
- **Timestamps.** Each row carries the capture instant and the bookmaker's own `last_update`. The evaluator's `capturedAt` is the **older** of the two. Staleness is `LEAN_RULE.maxPriceAgeMs` (12 h, `LEG_BOUNDS`): `PRICE_STALE`, `PRICE_FROM_FUTURE` and `PRICE_AFTER_LOCK` are already blocking reasons.
- **Operator allowlist (PR 1130).** Request only `ELIGIBLE_OPERATOR_KEYS` through the `bookmakers` parameter. Any other key in a response (including the `KNOWN_OFFSHORE_KEYS`) is rejected with its own reason code (`OPERATOR_NOT_ELIGIBLE`). PR 1130 is still a draft, so until it merges the capture pins the same nine keys as a constant with a test that equals PR 1130's list. Consensus composition (decisions M-3/M-4) is moot for this lane, because no ineligible book is ever requested.
- **One representative book per market for counting.** The same (event, athlete, line) at several books is **one** priced row. The representative is chosen by newest capture, then book key ascending, **never by price** (product plan §4). If the books disagree on the line, the row is "line disagreement", recorded and not counted.

---

## 5. Settlement eligibility (points)

Settlement is a new `player_points` rule in a v2 of `app/src/lib/sports/nba/settlement-contract.mjs`. Today it
grades team markets only and refuses every other market with `VOID_PENDING_REVIEW`. The contract still only
grades; a separate append-only ledger writes.

| Case | Rule |
|---|---|
| Source | the official box score `pts` for the matched `providerAthleteId`, read only when the finals record holds a `STATUS_FINAL` for the event. The settler never reads `latest.json` alone |
| Final under review | if the event is in the finals record's `conflicts` or `refused`, or the box score's team point sums disagree with the recorded final, the row is **`VOID_PENDING_REVIEW`**. **401901822 is the worked example** (`docs/nba/RESTATEMENT_PROPOSAL_401901822.md`): a 1-point Edey correction would flip a 9.5 line |
| DNP | `didNotPlay` true, or minutes null or 0 → `VOID` (no action), counted separately and never a loss |
| Played | minutes ≥ 1 → graded |
| Whole line | `pts === line` → `PUSH`. A half line cannot push |
| Over / under | `pts > line` → over wins; `pts < line` → under wins |
| Postponed / cancelled | `STATUS_POSTPONED` or `STATUS_CANCELED`, or no FINAL within 72 h of the scheduled tip → `VOID_PENDING_REVIEW`. A rescheduled game is a new event join and **never** inherits a pre-postponement price |
| Stat corrections | PR 1154's bounded box-score re-check: after tip, within 72 h, at most every 6 h, with the corrected payload stored beside the original. A change that alters a settled row appends a **CORRECTION** (`cause: BOXSCORE_CORRECTION`, `supersedes`) and never edits the row. A row is **provisional** until the 72 h window closes, and only then counts toward §7 |
| Preseason | not eligible. The prereg is regular season only |

---

## 6. Price-aware EV: the shared evaluator only

- Every lean, probability, edge and EV comes from **`evaluateMarket`** (`app/src/lib/consistency/market-evaluator.mjs`).
- It is called on the **official NBA snapshot** with `family: "pts"` (integer support, continuity rule), the S1 line and the two American prices, `capturedAt` as in §4, and `now` = the evaluation instant.
- The rule is `LEAN_RULE` `price-aware-ev@1` (EV ≥ 0.03 and edge ≥ 0.02). This plan adds no constant.
- The adapter is `boardRowEvaluation` (branch `claude/nba-top-boards-v2`, `top-board-evaluation.mjs`) with a verified price object of kind `nba-player-prop-price@1`. Its provenance carries the receipt sha, capture file sha, book, athlete and line.
- Product legs, when ever admitted, use `nbaLegFromEvaluation` (branch `claude/nba-product-legs-gated`). It copies the evaluator's numbers verbatim.
- **No product, board, Ask answer or report re-derives a lean.** This is the founder's 2026-10-20 one-official-forecast rule. What-if simulations never feed picks.
- While NBA is HISTORICAL_ONLY and the snapshot is PRIVATE, every evaluation comes back **unqualified**: `PUBLICATION_PRIVATE`, `FAMILY_NOT_PUBLISHED`, `SPORT_NOT_PRODUCT_ELIGIBLE`. The shadow records the lean anyway. That is the purpose of a shadow, and nothing reads it as a pick.

---

## 7. Shadow evaluation

### 7a. Ledger

- **File:** `data/internal/research/nba/points-shadow/ledger.json`. `dataClass: PRIVATE_RESEARCH`, `productEligible: false`.
- **Lineage:** append-only `INITIAL / PENDING_RESOLVED / CORRECTION` with `supersedes`, as in `top-board-grading.mjs` and PR 1154. A guard refuses any edit or removal.
- **One row per (event, athlete) at S1, holding:**
  - the frozen evaluation: snapshot id, forecast receipt sha, pOver/pUnder/pPush, lean, EV, edge, line, both prices, book, capture file sha;
  - then the S3 close (line, prices, no-vig);
  - then settlement (§5).

### 7b. Metrics

Points only and regular season only; nothing is pooled.

| Metric | Definition |
|---|---|
| Priced rows *n* | S1 rows with an allowlisted two-way price, a matched athlete, a model distribution and a final, non-provisional settlement |
| Hit rate vs break-even | over rows where the evaluator leaned (lean ≠ NONE), decisive outcomes only (pushes and voids are reported, not counted). Realised hit rate vs the mean break-even 1/decimal of the side taken, plus flat-stake ROI. Both come with a **game-clustered bootstrap 95 % CI** |
| Against the de-vigged close | on **all** priced rows: Brier and log loss of the model's decisive P(over) against the S3 no-vig P(over), as a paired difference with a game-clustered bootstrap 95 % CI. Lower is better |
| CLV | for leaned rows, no-vig close P(side) − no-vig entry P(side), and the price CLV. Mean with CI |
| Coverage | identity quarantines, one-sided prices, operator rejections and line disagreements per night |

### 7c. The bar

From `docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md` §6–§8; nothing new is introduced:

1. **First, the PUBLIC FORECAST row for points:** n ≥ 1,500 matched player-games with expectedMinutes ≥ 20; minutes MAE ≤ 6.0; conditional MAE ≥ 5 % better than the season-mean-rate baseline; p10–p90 coverage in [0.76, 0.84]; ECE ≤ 0.05; forward shadow with pre-tip artifacts only (§8).
2. **Then PUBLIC → PRODUCT ELIGIBLE:** "prop price receipt; hit rate at the market line ≥ break-even over ≥ 500 priced rows". The §7 preamble adds the house rule that a priced market must beat the de-vigged closing market on Brier **and** log loss.

**Claim discipline.** A market "beats" break-even or the close only when the 95 % interval excludes 0. A point
estimate on the right side of the line is reported as "not shown".

**One interpretation needs founder confirmation.** The prereg row does not say which 500 rows the hit rate is
measured on. This plan reads it as **leaned rows**, which is stricter than all priced rows. The founder should
confirm that reading when approving; no number changes either way.

**Pace, as an estimate only.** The one measured coverage is the 2026-06-10 Finals game (18 players across 7 books
priced). At roughly 10 matched, priced regular-season rows per game, 500 priced rows takes about 50 games (about a
week). The leaned subset, and §6's 1,500 matched player-games, take longer. No row accrues before the receipt
exists. Every day without one is a day of zero priced rows (gap report D1).

---

## 8. Activation sequence

Each step is its own reviewed PR or decision. The release-owner session is the only merger. No step starts before the previous step's evidence exists.

| Step | Owner | What | Evidence that it is done |
|---|---|---|---|
| E0 | engineering | Fix the dry-run prefix hazard (validate the full fixed prefix up to `<`). Fix the lab settler's fall-through, which routes unknown sports to MLB (gap report B3). Both can land now, independent of any decision | tests: `AUTHORIZE:props-points:…` is INVALID against the h2h card; an NBA leg in `settle-lab-cards` refuses |
| E1 | engineering → release owner | Add the `props-points` card and its closure-packet queue item, and update the card-count test. The h2h card stays byte-identical | `reconcileDecisionsWithQueue` empty; dry-run validates the new template |
| **F1** | **founder** | Answer `AUTHORIZE:props-points:<ceiling>:<expiry>` or DEFER. Confirm the §2 slot offsets and the §7 leaned-rows reading | the founder's answer, quoted verbatim |
| E2 | engineering → release owner | Commit the receipt (§1c) verbatim in its own commit. Add the parser `nba` entry, the `DATED` expiry kind, market enforcement and the NBA ledger path, with tests | `parseSportAuthorizationReceipt(text, "nba").ok`; NFL/UFC/EPL receipts refuse for nba and the reverse; the date is enforced |
| E3 | engineering | Capture script: dry run by default; prints the worst case; `assertCallAllowed` before each call; `recordRequest` after; `isDuplicateRequest`; the §3 joins; the §4 normaliser; §2 storage and leak scan. Fixture tests only | the dry-run plan for one real slate shows credits ≤ 3 × events |
| **F2** | **release owner** | The workflow (cron slots S1–S3). Workflows are release-owner territory | a reviewed workflow diff |
| E4 | release owner (first live run) | One slate live under the receipt. Reconcile the ledger against the provider's `x-requests-last` / `x-requests-used` headers | ledger spend = header spend; 0 leaks |
| E5 | engineering + human reviewer | Alias-table review loop for `UNRESOLVED` labels | daily quarantine count trending to 0 with reviewed rows |
| E6 | engineering | Settlement contract v2 (`player_points`, §5) on top of PR 1154's correction re-check and finals-under-review exclusion | tests: DNP, whole-line push, postponement, the 401901822-shaped correction |
| E7 | engineering | Shadow ledger (§7a) and a daily per-family priced-row counter in the NBA report | rows accrue privately; nothing under `app/public/data` changes |
| **F3** | **founder** | Read §7 results when §6 and §7 are met: the forecast bar, then the product bar | a per-market report with CIs, not pooled |
| **F4** | **founder** | Any move out of HISTORICAL_ONLY, or a per-family grant; `NBA_MARKET_CONFIG.playerFamilies`; lifting prereg §13; merging PR 1130; any Terms change; any publication | separate PRs, each citing F3 |

Founder-gated, in one list: F1, F3 and F4. Release-owner-gated: every merge, F2 and E4.

---

## 9. What is explicitly NOT authorized, by this plan or by a points receipt

- Publishing any NBA price, line, lean, probability, edge, EV, pick or ranking on any public page, export, Ask answer or `app/public/data/**` file.
- Activating any NBA product: Bank Builder, Moonshot, Parlay Lab, Smart Betslip, Top Prop Boards with lines. This includes moving the capability registry, adding `nba` to `SETTLEABLE_SPORTS` or lab `SOURCES`, or adding a `FAMILY_PRODUCT_GRANTS` entry.
- Any market except `player_points`: no rebounds, assists, 3PM, PRA/P+R/P+A, alternates, h2h, spreads or totals. h2h keeps its own separate, unchanged token.
- Any call after tip, any live/in-play capture, and the historical odds endpoints.
- Bookmakers outside the allowlist, including every `KNOWN_OFFSHORE_KEYS` book. Requesting `regions` in place of `bookmakers` is also out.
- Funding the legacy `pipeline/` odds provider or the manual `nba-market-probe.yml` from this receipt.
- Spending before the receipt is committed **and** parses, retrying a failed or absent market, or exceeding the ceiling or the expiry.
- Links, deep links, affiliate placement or betslip prefill (Terms `legal/texts.mjs:61`).
- Placing or facilitating any wager. Nothing on this site places wagers.
- Changing `NBA_MARKET_CONFIG.model.kind` from `NONE`, or any model, forecast, preregistration bar or methodology constant.
- Restating any historical NBA result. That has its own approval path (`docs/nba/RESTATEMENT_PROPOSAL_401901822.md`).
