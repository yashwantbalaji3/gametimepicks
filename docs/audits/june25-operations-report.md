# June 25, 2026 — Operations Report

_Production-operations pass after the June-24 settlement. Money integrity held throughout: canonical
bankroll **$10,076.17** / crown **$10,376.17** / record **13-3** never moved except by the official seed
model. 1409/1409 tests pass, tsc clean, build clean._

---

## 1. Production verification (Phase 1)

Production (`gametime-picks.vercel.app`) matches canonical post-settlement state:

| Page | Verified |
|---|---|
| Mr. Dub | bankroll $10,076.17 (×14), crown $10,376.17, record 13–3, no stale 12-2; daily-summary June-24 row opens $10,176.17 → closes $10,076.17 (−$100, 1W/1L) |
| Bank Builder | Lane A **🏆 $10K REACHED** / completed ($10,089.23), Lane B stopped; banking operator-gated |
| WC Specials / Homer Nukes / Moonshot / Homepage | render cleanly, 0 console errors, 0 broken images |

No page reflected pre-settlement state. (The `$10,176.17` occurrences on Mr. Dub are legitimate daily-summary
history — June-24's opening balance — not stale.)

## 2. June 25 generation status (Phase 3)

All four products generated from **live June-25 data** (~32 Odds-API credits, credit-guarded):

| Product | June-25 status |
|---|---|
| **World Cup Specials** | **5 cards** (+968 … +2402), real odds, team-model fallback (no soccer player props) |
| **Homer Nukes** | **2 lanes × 3 legs × $10** (+4368 / +7034) from 437 live HR props across 9 MLB games |
| **Bank Builder** | **No auto-card** — Lane A COMPLETED the $10k ladder (banking pending), Lane B STOPPED (lost June-24 Step 3; restart pending). Both operator-gated. |
| **Moonshot** | **Awaiting** — candidate lanes priced below the +700 longshot floor; not activated (no fabrication) |

Source artifacts written: `market-outlook-2026-06-25.json` (20 matches, real de-vigged odds),
`projections/2026-06-25.json` (6 fixtures, 27 markets), `mlb/home-run-props/2026-06-25.json` (9 games).

## 3. Root cause of the "no June-25 data" blockage (Phase 2)

**Not** a broken/disabled pipeline, stale cache, or expired fetch. Evidence:
- The `.env` holds a **valid** `ODDS_API_KEY` (17,914 credits remaining) + `API_FOOTBALL_KEY`. The sandbox key
  check hit `/v4/sports/` → HTTP 200. The earlier "dormant keys" reading checked only the shell env, not `.env`.
- The WC odds/projection + MLB-props pipelines run via **GitHub Actions `workflow_dispatch` (manual, no cron)**
  — `world-cup-odds.yml`, `mlb-daily.yml` (which is also `dry_run` unless `MLB_MODE=write_board`). Local runs
  default to `ODDS_DRY_RUN=true`.
- **Root cause: a manual-trigger / scheduler gap** — the June-25 generation fetch had simply never been
  dispatched. Running the pipeline directly (this pass) produced the full slate. **Fix:** generation is
  restored, and the settlement half is now cron-automated (§4); the generation fetch remains the one manual/
  scheduled trigger to confirm is enabled in CI.

## 4. Automated daily settlement pipeline (Phase 4)

**Gap found:** the nightly cron (`automation_settle.sh`) settled NBA + MLB but **not** the World Cup / Mr-Dub
seed-model chain — that was manual. **Implemented** `scripts/settle_soccer_day.sh`, wired into
`nightly-settle.yml` (cron 05:30 / 07:30 UTC, non-fatal):

```
fetch official FT (fetch_official_soccer.py)
  → grade + persist history (persist-soccer-settlement.mjs · never money)
  → seed-model apply (settle-daily-portfolio.mjs · bankroll/ladder)
  → reconcile (build-mr-dub-ledger.mjs · portfolio/ledger/daily-summary)
```

**Invariants (9 tests, all green):** never fabricates · official-final (FT) gated · partial-safe (a card with
any unsettled leg holds) · idempotent / rerun-safe (settled steps skipped, rows deduped; verified live — a
June-24 dry-run re-grades with money unchanged) · API-unavailable → NO-OP (no key / fetch fail / zero FT
writes nothing, exits 0) · crown immutable, only lost $100 seeds move the bankroll.

## 5. Ladder completion recommendation (Phase 5)

**KEEP PENDING — do not auto-bank.** Evidence in-repo: every completion reference is explicitly
`OPERATOR-GATED (not an auto-applied money model)`; **no tested completion-banking model exists**; Step 5 is
the final rung (no auto-advance target); auto-crediting the $10,089.23 rolled value would be an untested
money mutation. The completion is recorded + now celebrated (`pendingLaneCompletions`, ladder
`laneStatus: "completed"`, Bank Builder "🏆 $10K REACHED"); bankroll/crown untouched, awaiting an explicit
operator banking decision. _No new rule invented._

## 6. Operator-experience review (Phase 6) — top 20

**Implemented this pass (highest-value, safe):**
1. ✅ **Bank Builder Lane A was mislabeled "ACTIVE" after completing the $10k ladder** → now the celebrated
   **"🏆 $10K REACHED — ladder COMPLETE"** terminal state (`buildPublicDualLadder` had a `completed` type but
   no branch setting it; a fully-cleared lane fell through to "active"). The flagship milestone now reads as a win.

**Recommended next (prioritized):**
2. Lane B "Starting path" should explicitly read "**Stopped — lost June-24 Step 3; restart operator-gated**"
   so a stopped lane isn't mistaken for a fresh start.
3. Surface the **$10,089.23 pending-banking decision** as an explicit operator CTA on Bank Builder + Mr. Dub.
4. Add a clear **"slate: Jun 25" date chip** on every product surface (some pages infer it only from card text).
5. Moonshot "awaiting / below +700 floor" — explain the floor in one line so "awaiting" doesn't read as broken.
6. WC Specials: show the **team-model-fallback reason** ("no soccer player props from the feed") inline.
7. Homer Nukes: label the Homer Score **"Partial Model (0/7 Statcast)"** wherever a confidence is shown.
8. Homepage: lead with the **June-25 slate + the $10K milestone**, not the settled crown.
9. De-duplicate the "FULL LEDGER ON MR. DUB" link (appears twice per lane).
10. Mr. Dub master-ledger table: add a one-line **"paper, rolled-stake — separate from canonical bankroll"** caption.
11. Consistent money formatting (some `$10,076.17`, some `10076.17`) across components.
12. Empty/awaiting states need a friendly explainer, not a blank rung.
13. Add a **"last settled: Jun 24"** freshness stamp to the ledger so users see recency.
14. Moonshot page: clarify it is **separate from the core Bank Builder record** (already in copy — make it prominent).
15. WC Specials longshot odds: add an "educational, low-hit-rate" risk note near the +2402 card.
16. Mobile: verify the 5-rung ladder rail doesn't overflow on ~380px (spot-check).
17. Onboarding: a one-paragraph "how the dual ladder + seed model works" explainer for first-time visitors.
18. Crown vs active bankroll: a tooltip explaining the difference (frequently confusing).
19. Settlement transparency: link each settled card to its official-source line.
20. Accessibility: ensure status chips have non-color cues (icons/text), not color alone.

## 7. Readiness score

**9.0 / 10 — production-ready for June 25.** Settlement reconciled + automated, all four products generated
from live data, site verified, completion celebrated, 1409/1409 tests green, tsc + build clean, money frozen.
The −1.0 is operator decisions still pending (Lane A banking, Lane B restart) + the generation fetch's CI
trigger to confirm enabled + the documented P1s (WC projection-prob quarantine, Homer Statcast).

### Remaining blockers
- **Operator decisions:** Lane A completion banking (KEEP PENDING per §5); Lane B restart (operator-gated).
- **CI generation trigger:** confirm the WC-odds / MLB-board workflows are scheduled (not just manual) for daily
  auto-generation — settlement is now cron-automated; generation is the remaining manual/scheduled trigger.
- **P1 (carried):** quarantine the inverted WC projection model-prob; wire Homer Nukes Statcast (0/7).
