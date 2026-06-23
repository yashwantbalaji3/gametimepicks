# Model-Only Player Props Matrix + UI/UX Consistency Polish

**Date:** Tuesday June 23 2026, ~12:30 AM ET. **Branch:** `model-only-player-props-uiux-polish` (off `origin/main` `35f26d66`, PR #562).
**Scope:** make player props honest — surface only model-qualified picks (grouped by game × market), keep raw sportsbook inventory out of public recommendations; default the /build pool + /picks suggested cards to model-qualified player props; add a /today readiness strip. No bankroll / crown / Moonshot / Specials mutation.

## Phase 2 — official Jordan/Algeria checkpoint (API-Football, verified at run time)
Jordan **1-0** Algeria — **status `2H` (61′), NOT final.** Argentina 2-0 Austria FT · France 3-0 Iraq FT · Norway 3-2 Senegal FT (all already settled). June 23 slate all NS.
→ **Lane A stays PENDING** (Algeria leg not final; Algeria currently trailing but a started game is never settled). UI/UX + model-picks work continued; no settlement run.

## The honest-props problem + the fix
The slate posts **168 sportsbook player-prop markets** across 4 fixtures (4 markets × 42: anytime goalscorer, shots on target, assists, shots — **no cards market offered**). All are limited-data / market-implied (lineups not posted, `edgePct = 0`). Listing all 168 reads like 168 recommendations. The fix distinguishes three tiers and only surfaces the third publicly:
1. **sportsbook inventory** (all 168) — hidden behind a clearly-labelled disclosure, never a recommendation;
2. **model-evaluated** props (the 168 run through filters);
3. **model-qualified picks** (the ones that pass) — the only thing the public matrix shows.

## Phase 5 — model-qualified rules (`app/src/lib/world-cup/model-qualified-props.ts`)
A prop is **model-qualified** only when ALL hold (single source of truth — `modelQualifies()` — used by both the matrix and the /build pool so they never disagree):
- **settlement-supported market** — one of the 4 posted, officially-settleable markets (Cards/Other are not offered → always "No model-qualified pick"; no fabricated markets);
- **odds-backed + provider** — a real American price AND a named bookmaker;
- **pre-event** — joined to a team kickoff that is still in the future (a started game is never a new pick);
- **odds window** — `-500 ≤ odds ≤ +400` (floor reuses `INDIVIDUAL_LEG_ODDS_GUARDS`; longer prices are Moonshot/Specials longshot territory, not a lower-volatility addable leg);
- **role-quality eligible** — passes `classifyPlayerRoles` (goalkeepers, defenders on attacking props, bench / rotation risk, and unmatched-no-position players are excluded with a reason);
- **market-implied probability floor** — per market: anytime GS ≥ 0.45, SOT ≥ 0.58, shots ≥ 0.55, assists ≥ 0.30.

Selection: rank qualifying candidates per (game × market) by model probability (then shorter price), take the **top one** per cell. Volatility label: odds ≤ +250 → **Addable leg** (lower-volatility); above → **Higher-volatility**. Edge is 0 pre-lineup, so picks are market-implied probability + role quality, **explicitly labelled limited-data** — no fabricated edges.

**Result on the June 23 slate: 168 evaluated → 12 model-qualified picks** (93% of inventory excluded). The /build WC player pool narrows **168 → 37** model-qualified legs.

## Phases 6-9 — surfaces
- **`ModelPlayerPropsMatrix`** (`components/world-cup/model-player-props-matrix.tsx`): game rows × market columns (Anytime Goalscorer · Shots on Target · Assists · Shots · Cards). Desktop = true column grid; mobile = per-game cards, markets stacked, no horizontal overflow. Each cell: player + selection + `OddsPill` + % model-implied + Addable/Higher-volatility, or **"No model-qualified pick."** Header shows "12 model-qualified player-prop picks across 4 games" + "168 sportsbook prop markets evaluated."
- **`/world-cup` Player Picks tab**: leads with the matrix ("Model Player Prop Picks · Model picks only"), then the curated team+player companion, then raw inventory demoted behind **"Available sportsbook markets — not model recommendations."** Tab badge = qualified count (12), not inventory.
- **`/build`**: pool defaults to **model-qualified legs only** (`buildWcPlayerLegs` now applies the role + `modelQualifies` gate); copy updated. Raw inventory excluded.
- **`/picks` (Parlay Lab)**: `loadWorldCupPlayerPropLegs` now applies the role-quality gate, so suggested cards never use a benched / GK / defender-on-attacking-prop player prop. Legs keep market/line/odds/provider + limited-data label.
- **`/today`**: new **"{date} — what's live"** readiness strip — 6 tap-through modules: Bank Builder (Lane B WON / Lane A awaiting), World Cup (4 games / projections), **Model Player Props (12 picks / 168 evaluated → matrix)**, Parlay Lab (cards / model-qualified legs), Moonshot (candidates ready / $0), World Cup Specials (candidates / $0).

## Audit table
| area | current state | issue | planned fix | implemented | verified |
|---|---|---|---|---|---|
| /world-cup player props | 168-prop inventory `<details>` | reads like 168 picks | model-only matrix first; inventory relabelled "not recommendations" | ✅ | ✅ desktop+mobile |
| model-qualified rules | none (raw odds only) | inventory ≠ pick | explicit `modelQualifies` filter module | ✅ | ✅ unit tests |
| /build pool | all 168 WC props (pre-event only) | raw inventory addable | role + model-qualified gate → 37 legs | ✅ | ✅ test + browser |
| /picks suggested cards | player props w/o role gate | could use GK/bench prop | role-quality gate in leg adapter | ✅ | ✅ June-19 cards test green |
| /today | no consolidated readiness | hard to see what's live | 6-module readiness strip incl. model props | ✅ | ✅ mobile screenshot |
| Cards market | not offered by feed | would look "available" | column shows "No model-qualified pick" | ✅ | ✅ |

## Verification
- **Tests:** 1235 / 1235 — 13 new model-qualified-props tests + 1 new /build gate test + 2 pre-existing tests reconciled to the new contract (build-legs synthetic prop now model-qualified; curated-picks tab now leads with the matrix). **tsc:** clean. **`next build`:** clean (all routes prerendered).
- **Audits:** no new banned public copy (only "leakage-safe" technical comments); no secrets in diff; **no data files mutated** — crown ($10,376.17/5-0), results, mr-dub portfolio (bankroll $10,176.17, 9-2-0-1, exposure $100), moonshot (0-1/$0), specials (0-0/$0) all untouched; this is a code-only sprint. No active suggested card uses a started game (pre-event guard + settlement-state test).
- **Browser QA (1440 + 390):** matrix renders 4 games × 5 columns (desktop grid) / stacked (mobile); 12 picks, 168 evaluated, 16 "No model-qualified pick" cells; no horizontal overflow either width; `/today` readiness strip clean on mobile; `/build` 217 eligible legs incl. model-qualified WC props. Console: no errors from new code (one pre-existing dev-only React key warning in `BuildExperience`, unrelated).

## Post-Algeria follow-up (run only after Jordan/Algeria is officially FINAL)
```
pipeline/.venv/bin/python -m pipeline.settlement.settle_stepped_bank_builder --dry-run --date 2026-06-22 --lane lane-a
pipeline/.venv/bin/python -m pipeline.settlement.settle_stepped_bank_builder --apply   --date 2026-06-22 --lane lane-a
node app/scripts/build-mr-dub-ledger.mjs   # rebuild portfolio
```
Do NOT apply until status is FT. (At run time Algeria trailed 0-1 in the 2H — if that holds, Lane A Step 3 settles LOST; settle from the official box score, never the live score.)

## Deliberately NOT changed
- Lane A not settled (Algeria not final).
- No Moonshot exposure activated (candidates stay ready, $0 — no place-exposure flow yet).
- Bankroll / crown / Moonshot / Specials data — untouched (code-only sprint).
- The curated "Top model picks per game" component (kept as the team-market companion; its own short-price player picks are model-ranked, not raw inventory).

## Remaining backlog
1. After Jordan/Algeria FT: settle Lane A via the engine (command above).
2. Moonshot place-exposure / activation flow + accounting tests so "ready" candidates can activate.
3. Add a real per-player model (independent edge) so props carry `edgePct > 0` and confidence rises above limited-data once lineups post.
4. Fix the pre-existing React "unique key" dev warning in `build-experience.tsx`.
5. Generate an MLB June-23 board if wanted; persist Specials history across days.
