# Multi-Sport Product Engine Audit (2026-07-09)

**How Bank Builder / Moonshot / Build-a-Pick / Daily Portfolio are structured today, and what it takes
to make them a true cross-sport candidate engine — WITHOUT changing money or creating exposure.**

Money / record / exposure unchanged. This is an audit + a shared schema + a read-only candidate pool;
no product-card is activated.

---

## Product inventory & sport coupling

| Product | Files | Sport(s) today | Coupling |
|---|---|---|---|
| **Bank Builder** | `src/lib/parlays/dual-bank-builder.ts`, `src/lib/world-cup/bank-builder-proposal.ts`, `src/lib/daily-portfolio/bank-builder-generation.ts` | MIXED (soccer-preferred, MLB fallback) | `isSoccer = l.sport === "WORLD_CUP"` preference; consumes generic `EligibleLeg`; fallback path takes any-sport best-four |
| **Moonshot** | `src/lib/moonshot/moonshot-lane.ts`, `moonshot/activation-rules.ts` | WC-only by design | `sportScope: "world_cup" \| "mixed"` (mixed defined, unused); own `MoonshotCandidateLeg` shape |
| **World Cup Specials** | `src/lib/world-cup/model-qualified-picks.ts` | Soccer-only | WC markets only |
| **Homer Nukes** | `product-allocation.ts` | MLB-only | **retired 2026-06-30** (status "retired") |
| **Parlay Lab / Suggested** | `src/lib/parlay-optimizer.ts`, `parlay-suggested.ts`, `parlays/eligible-leg.ts` | MIXED (generic) | `sport: Sport \| "MIXED"`; no hardcoding |
| **Build-a-Pick** | `parlays/*` | MIXED (generic) | generic `EligibleLeg` pool |
| **Daily Portfolio / Master Ledger** | `src/lib/mr-dub/*`, `daily-portfolio/accounting.ts` | product-agnostic accounting | canonical money in `portfolio.json` |

## A. Which products are sport-locked?

- **Moonshot** — hardcoded WC-only (`sportScope`, mixed never activates).
- **World Cup Specials** — soccer-only by construction.
- **Homer Nukes** — MLB-only, **retired**.
- **Bank Builder** — *not* locked: soccer is a **preference** (`buildSoccerPerLane`, WC survival floor
  ≥65 vs others ≥80), and the fallback selects a game-diversified best-four from any sport.
- **Parlay Lab / Build-a-Pick** — fully generic (`sport: Sport | "MIXED"`).

## B. Which already consume generic legs?

Parlay Lab, Parlay Suggested, Build-a-Pick, and the Bank Builder fallback all consume the generic
`EligibleLeg` (`src/lib/parlays/types.ts`: `sport: Sport`, `odds`, `modelProbability`, `legQualityScore`,
`riskScore`, `marketType`, `side`, `line`, `startTime`). The Daily Portfolio builds lanes from a generic
`ModelPick[]` pool. **The candidate layer is already largely sport-agnostic.**

## C. Where are candidate leg schemas incompatible across sports?

At the `EligibleLeg` grain, **they aren't** — one type spans MLB/NBA/UFC/WORLD_CUP. Divergence is only at
the edges:
- **Photos:** WC uses API-Football headshots; MLB uses the MLB Static CDN.
- **IDs:** WC legs carry `matchId` (int); MLB carry `gamePk` — both normalize to `PublicProjection.matchId`.
- **Settlement source + market grading** (below) — the real incompatibility.

## D. Where does settlement assume one sport / one stat source? (THE blocker)

- `scripts/settle-daily-portfolio.mjs`: `SETTLEABLE = new Set(["moneyline_90","double_chance",
  "draw_no_bet","match_total_goals","btts"])` — **only soccer markets**.
- `src/lib/settlement/soccer-markets.ts` grades from `OfficialResults {matches[], players[]}` sourced
  from **API-Football** only, with soccer-specific 90'/AET/PEN semantics.
- **MLB settlement is NOT wired.** There is a rich MLB *model-performance* grading ledger
  (`settled_leans.jsonl`, graded vs official box scores — see the calibration work) but **no
  product-card settlement path for MLB markets.** A separate `mlb-markets.ts` settlement (statsapi
  final box scores) would be required before an MLB money leg can be graded.

**Consequence:** a multi-sport *candidate pool* and *preview* are safe now (read-only, no exposure), but
**activating an MLB money leg is blocked until MLB settlement exists.** This is the honest boundary.

## E. What would a shared multi-sport candidate pool take?

1. **Normalize legs into one shape** — a `CandidateLeg` carrying `sport`, `market`, `selection`,
   `marketProbability`, `modelProbability`, optional `calibratedProbability`, `reliabilityWeight`,
   `dataQuality`, `settlementSource`, `productEligible` + reason, `publicLabel`, `artifactSource`.
   (Shipped this pass as pure schema — Phase 8.)
2. **Gate eligibility by settlement** — `canSettle(sport, market)`: WC team markets ✓; WC player props ✓
   (already wired); MLB markets ✗ (until `mlb-markets.ts` exists) ⇒ analysis/watchlist only.
3. **Make the Bank Builder preference pluggable** — replace the hardcoded `isSoccer` with a
   `preferStrategy: "balanced" | "soccer_first" | "sport_agnostic"` and sport-agnostic survival floors.
4. **Parameterize Moonshot** — allow `sportScope: "mixed"` to actually select cross-sport legs when
   correlation is low.
5. **Reuse the correlation check** — `correlationScore ∈ (−0.2, 0.5)` already generic; validate on
   mixed-sport pairs.
6. **Feed calibrated reliability** — once the shadow calibration passes backtest, a leg's
   `reliabilityWeight`/`calibratedProbability` becomes the quality signal for Bank Builder selection.

## F. How is accidental exposure activation prevented today?

- **md5 guard** on `portfolio.json` before/after any promotion (`promote-bank-builder-proposal.mjs`) —
  abort if canonical money changed.
- **Card locks** (`bank-builder-approved.json` / `bank-builder-locks.json`) pin approved legs; a refresh
  can't swap them unless odds go unavailable.
- **Idempotent settlement** — a `settled` step is never re-settled; **all-or-nothing** (`--apply
  REFUSED` if any leg isn't official).
- **Pre-event only** — every leg needs a machine kickoff; `ACTIVATION_CUTOFF_MIN = 30` enforces a
  pre-kickoff buffer; started games are dropped before selection.
- **Exposure is placed-only** — a candidate is `$0` until `status: "active"`; Moonshot capped at
  `MOONSHOT_MAX_EXPOSURE = $50`.

Any multi-sport work must preserve all of these. The candidate pool + preview shipped this pass create
**no** placed exposure (every candidate is `status: candidate`, `productEligible` gated).

## G. How is the official 19-14 record kept separate from model-performance ledgers?

- Canonical bankroll/record live ONLY in `mr-dub/portfolio.json` (+ `ledger.json` history). Bank Builder
  is the canonical compounding bankroll.
- Side lanes (Moonshot, WC Specials) live in `product-ledger/*.json` — **reporting only**, they do not
  drive the bankroll; the master ledger aggregates for display but the $19,065 comes solely from Bank
  Builder settled profit.
- The MLB model-performance ledger (`settled_leans.jsonl`, `calibration/*`, `shadow-calibration/*`) is a
  SEPARATE raw-accuracy record — never merged into the 19-14 product record. This audit keeps that wall.

---

## Roadmap — safe now vs blocked

**Safe now (this pass):** shared `CandidateLeg` schema (pure, unwired), a read-only multi-sport
candidate pool from committed MLB + Soccer artifacts, and a read-only product *preview* (no-play /
watchlist) — none create exposure.

**Blocked until built:**
- **MLB settlement** (`mlb-markets.ts` from statsapi box scores) — required before any MLB money leg.
- **Shadow-calibration rollout** — gated on the backtest go/no-go
  (`docs/SHADOW_CALIBRATION_BACKTEST_PLAN_2026-07-09.md`).
- **Pluggable Bank Builder preference + Moonshot mixed scope** — refactors that touch money-product
  generation; do behind founder approval + tests, not in this read-only pass.

See `docs/MULTI_SPORT_BANK_BUILDER_MOONSHOT_DESIGN_2026-07-09.md` for the product design.
