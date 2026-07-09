# SimTheGame Full-Market Parity + Artifact Audit (2026-07-09)

Phase 1+2 of the full-market build. Supersedes the summary in
`SIMTHEGAME_PARITY_MATRIX_2026-07-09.md` with a build-decision matrix and a
verified data audit. **Money untouched** (`affe6b21…`, 19-14). No market is rendered
that the artifact doesn't back.

## Headline

- **MLB = the real gap.** Today it ingests only 8 **player-prop** markets. But the
  Odds API **does** serve MLB team markets: a verified bulk call
  (`/sports/baseball_mlb/odds?markets=h2h,spreads,totals&regions=us`, **3 credits**,
  balance 18,714→18,711) returned **13/13 July-9 events with DraftKings h2h +
  spreads + totals**. The Odds event id == our `gameId`. → **buildable now.**
- **Soccer/World Cup = already team-market-backed.** The WC pipeline ingests +
  **de-vigs** `moneyline_90` (3-way), `match_total_goals`, `double_chance`, `btts`,
  `draw_no_bet` (artifact `marketsCovered` + note "de-vigged from the sportsbook
  price"), surfaced by `buildWcGameLabReport`. → the gap is a unified game-center
  UI + distributions, not ingest.

## Build-decision matrix (30 modules)

Status: ✅ supported · 🟡 partial · 🔩 blocked-ingest · 🧱 blocked-schema · ⚙️ blocked-generator · 🚫 intentionally-unavailable · ➖ n/a-sport

| # | Module | SimTheGame | GTP now | MLB | Soccer | Required artifact fields | Build now? |
|---|---|---|---|---|---|---|---|
| 1 | Sport selector | sport list | ✅ /simulate lobby | ✅ | ✅ | — | — |
| 2 | Game list | priced games | ✅ | ✅ | ✅ | — | — |
| 3 | Account/credit modal | login gate | 🚫 (paper, no auth) | 🚫 | 🚫 | — | no (out of scope) |
| 4 | Market snapshot | priced lines | 🟡 props only | 🔩→✅ | ✅ | `teamMarkets.*.odds` | **MLB: yes** |
| 5 | Moneyline / win prob | de-vig h2h | ⚙️ | 🔩→✅ | ✅ (3-way) | `teamMarkets.moneyline.noVigProb` | **MLB: yes** |
| 6 | Projected score / center | outside-in | ⚙️ | ⚙️→✅ | ⚙️ | `gameCenter.projected*` | **MLB: yes (derive)** |
| 7 | Spread / run line | de-vig spreads | ⚙️ | 🔩→✅ | 🟡 | `teamMarkets.spread` | **MLB: yes** |
| 8 | Game total | de-vig totals | ⚙️ | 🔩→✅ | ✅ | `teamMarkets.total` | **MLB: yes** |
| 9 | Team totals | de-vig team_totals | ⚙️ | 🔩 (optional) | 🟡 | `teamMarkets.teamTotals` | defer (optional market) |
| 10 | Margin distribution | from spread ladder | ⚙️ | ⚙️→✅ | ⚙️ | `distributions.margin` | **MLB: yes (derive)** |
| 11 | Total distribution | from totals ladder | ⚙️ | ⚙️→✅ | 🟡 | `distributions.totalRuns` | **MLB: yes (derive)** |
| 12 | Scoreline / exact score | grid | ⚙️ | ➖ (no grid) | ⚙️ | `distributions.scoreline` | defer |
| 13 | Period / inning markets | F1/F3/F5 | 🔩 | 🔩 | 🟡 (halves) | inning odds | defer (not ingested) |
| 14 | Player props | model or priced | ✅ **(our core)** | ✅ | 🟡 | `generatedPicks` | ✅ |
| 15 | Box score / avg output | reconciled | 🟡 | 🟡 | 🟡 | per-player means | partial |
| 16 | Biggest model leans | top edges | ✅ | ✅ | ✅ | `generatedPicks.edgePct` | ✅ |
| 17 | Market agreement | sim vs book | ✅ | ✅ | ✅ | edge + calibration | ✅ |
| 18 | Market gaps | anchor gaps | ✅ | ✅ | ✅ | `marketGaps` | ✅ |
| 19 | Corners | de-vig corners | ➖ | ➖ | 🔩 | `specialMarkets.corners` | defer (not ingested) |
| 20 | Cards | de-vig cards | ➖ | ➖ | 🔩 | `specialMarkets.cards` | defer |
| 21 | First scorer | specialty | ➖ | ➖ | 🔩 | `playerMarkets.firstScorer` | defer |
| 22 | BTTS | de-vig btts | ➖ | ➖ | ✅ | WC `btts` | soccer: ✅ (exists) |
| 23 | Asian handicap | de-vig AH | ➖ | ➖ | 🔩 | `teamMarkets.asianHandicap` | defer |
| 24 | Main takeaways | bullets | ✅ | ✅ | ✅ | derived | ✅ |
| 25 | Recap / copy block | copy | ✅ | ✅ | ✅ | derived | ✅ |
| 26 | Historical model-perf layer | — | ✅ **(GTP-only moat)** | ✅ | 🟡 | `/mlb/results` ledger | ✅ |
| 27 | Run-count display | 10k | ✅ (dynamic) | ✅ 10k | 🟡 | `runCount` | ✅ |
| 28 | Mobile layout | responsive | ✅ | ✅ | ✅ | — | ✅ |
| 29 | Locked/free preview | gated | ✅ | ✅ | ✅ | phase gate | ✅ |
| 30 | Admin/account gating | later | 🚫 | 🚫 | 🚫 | — | out of scope |

## Verified artifact audit (Phase 2)

| Sport | Market | Ingested? | Artifact field? | Generator? | UI? | Render now? | Missing step |
|---|---|---:|---:|---:|---:|---:|---|
| MLB | player props (8 keys) | ✅ | ✅ `generatedPicks`/`distributions` | ✅ | ✅ | ✅ | — |
| MLB | moneyline (h2h) | ❌→**avail** | ❌ | ❌ | ❌ | ❌ | ingest+devig+gen+UI (this build) |
| MLB | run line (spreads) | ❌→avail | ❌ | ❌ | ❌ | ❌ | same |
| MLB | game total (totals) | ❌→avail | ❌ | ❌ | ❌ | ❌ | same |
| MLB | team totals | ❌ (not requested) | ❌ | ❌ | ❌ | ❌ | optional — add market key later |
| Soccer | 3-way (moneyline_90) | ✅ | ✅ (de-vigged) | ✅ WC report | ✅ game-lab | ✅ | unify into game-center |
| Soccer | match total goals | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Soccer | double chance | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Soccer | draw no bet | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Soccer | BTTS | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Soccer | player shots/SOT/assists | ❌ | ❌ | ❌ | ❌ | ❌ | not ingested — honest unavailable |
| Soccer | corners / cards / first scorer / AH / exact score | ❌ | ❌ | ❌ | ❌ | ❌ | not ingested — honest unavailable |

## Build plan (this session)

1. **MLB team-market ingest** — bulk `/odds?markets=h2h,spreads,totals` (credit-guarded)
   → de-vig → new `mlb/team-markets/<date>.json` keyed by gameId. Additive; player-prop
   ingest untouched.
2. **MLB market-implied generator** — de-vig h2h→winProb, totals ladder→total-runs
   distribution, spreads→margin/cover; derive projected score range. Add `gameCenter`
   + team distributions to the sim artifact, labelled `method: market_implied` (kept
   DISTINCT from the prop MODEL modules). Deterministic; gated behind field presence.
3. **Dashboard Game Center** — render win prob / projected total / run-line / score
   range / distributions when artifact-backed; pre-click gated; else honest unavailable.
4. **Soccer** — already team-market-backed; surface a game-center view from the WC
   report (follow-up if time); NO fabricated shots/corners/cards/first-scorer.
5. Tests + gates + deploy; money md5 unchanged throughout.

**Regulation-time rule (soccer):** 90-minute markets settle at regulation; ET/penalties
excluded unless the market says otherwise; knockout advancement is separate. (Already
enforced in the WC report — `settlementSupport: regulation_90`.)
