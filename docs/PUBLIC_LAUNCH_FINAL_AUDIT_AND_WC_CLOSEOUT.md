# Public Launch Final Audit + World Cup Closeout — July 21, 2026

Founder direction: **the 2026 World Cup is over — close it off as an active destination.** It may be
referenced as past proof / archive / methodology, but must not hold an active nav tab, sports hub, current
slate, or product-input space. Focus the product on current (MLB) and future (NFL/NBA/NHL) sports.

Money is **locked** and untouched: record 19‑14 · bankroll $19,065.40 · crown $20,465.40 · exposure $0 ·
md5 `affe6b21071f2b3be96bb2774eb347c3`. This mission is product/navigation + audit only.

## Phase 0 — precheck
- HEAD `ce890cf0`; `origin/main` = `origin/june30-reset` = `ce890cf0`; **no drift**; clean tree.
- Money md5 `affe6b21…`; forensic PERFECT; health HEALTHY (verified in-mission).
- Date: 2026-07-21. MLB is the live sport; the World Cup is complete.

## Phase 1 — World Cup active-surface inventory (before)
| Surface | World Cup presence | Action |
|---|---|---|
| `components/nav.tsx` NAV_ITEMS | "World Cup" (`/world-cup`) + "Soccer Specials" (`/world-cup-specials`) items; `SPORT_RE` matches them | **Remove both from the nav; drop from SPORT_RE** |
| `components/command-rail.tsx` | "World Cup" + "Soccer Specials" rail items | **Remove both** |
| `components/homepage-sports-rail.tsx` | a stale "Coming soon · FIFA World Cup 2026" teaser tile + kickoff countdown | **Remove the teaser** |
| `lib/sports-coverage.ts` | `fifa-world-cup` active coverage entry (links to `/world-cup/` hub) | **Drop from active coverage** |
| `lib/products/registry.ts` | `wc-specials` status `active` (route `/world-cup-specials`); `moonshot` stale "soccer / World Cup longshot" blurb | **wc-specials → `retired`; moonshot → MLB blurb** |
| `/world-cup` route | archive already ("The World Cup is complete", no false "Live today" after the July-21 freshness fix) | **Keep as archive-only, out of primary nav** |
| `/world-cup-specials` route | WC-only specials product (now over) | **Retired landing, out of nav, not a product source** |

## Decisions
- **World Cup remains reachable only as an archive** (`/world-cup` renders the completed-tournament archive), not
  in primary nav, not a current slate, not a product input. `/world-cup-specials` becomes a retired-product
  landing (like `/homer-nukes`).
- Bank Builder / Moonshot stay active in paper/review at $0 with **current MLB legs only** (no WC legs).

## Phase 1 — World Cup removed from active surfaces (after)
| File | Change |
|---|---|
| `components/nav.tsx` | Dropped the "World Cup" + "Soccer Specials" nav items; removed both from `SPORT_RE` |
| `components/command-rail.tsx` | Dropped both rail items; MLB now anchors the Sports group |
| `components/footer.tsx` | Removed the "World Cup" Sports link; "Multi-sport: MLB and more" |
| `components/homepage-sports-rail.tsx` | Removed the stale "Coming soon · FIFA World Cup 2026" teaser + its computation/import |
| `app/page.tsx` | Removed the "World Cup Simulations" simulation-hub card (was "Semifinals…"); subtitle now "MLB · UFC" |
| `app/sports/page.tsx` | Removed the World Cup directory tile + its data loads |
| `app/mr-dub/page.tsx` | CTA "/world-cup" → "/mlb"; Moonshot copy no longer says "World Cup longshot" (MLB) |
| `app/projections/page.tsx` | WC-section is data-gated (hidden now); disclosure copy reframed to "archive, not a live sport" |
| `app/picks/page.tsx` | Metadata description drops World Cup as an active sport |
| `lib/sports-coverage.ts` | Removed the `fifa-world-cup` active coverage entry; fixed the stale MLS "World Cup break" blurb |
| `lib/products/registry.ts` | `wc-specials` → **retired**; `moonshot` → MLB (blurb + sport) |
| `app/world-cup-specials/page.tsx` | Reframed as a **retired archive** ("RETIRED 2026-07-21 … no new boxes post"); keeps the historical ledger/tracker as past proof |
| _component sweep_ | Moonshot tracker sport label, home Game-Lab WC column, sport-filter WC chips, yesterday summary, homer-nukes link — gated/relabelled (see Phase 1 tests) |

**Where World Cup remains (archive only, allowed):** `/world-cup` + `/world-cup/*` (completed-tournament archive, no "Live today", no active CTAs), `/world-cup-specials` (retired archive of the specials record), `/results` (past proof), `/methodology` + `/learn` (WC model case study). None of these are in the primary nav.

**New guard test:** `lib/world-cup-closeout.test.mjs` pins: WC not in nav/rail, not in sports coverage, WC-only products retired, and **no active Bank Builder / Moonshot leg uses a World Cup market**.

## Phase 2 — end-to-end deep sweep (second pass, every built route)

A full `out/**/*.html` sweep surfaced WC references the first pass missed — each is now removed, gated, or generalized:

| Surface | Was | Now |
|---|---|---|
| `/simulate` all-games board | `games-experience.tsx` `CHIPS` included a `world_cup` filter chip | Chip removed (MLB/NBA/UFC); R32 banner gated on `gameCount > 0` |
| `/picks` parlay selector | `parlays-explorer.tsx` mapped **all** `slate.sports` → an empty "World Cup" tab | Archived WC (0 eligible) filtered out of the selector; empty-scope diagnostics drawer gated the same way |
| `/events` schedule hub | a "FIFA World Cup" schedule-only tab (`EVENT_LEAGUE_ORDER`) + stale "MLS pauses for the World Cup" note | WC delisted from the events hub; MLS note de-referenced (WNBA/UFC/MLS remain) |
| `/sports` + `/build` metadata | descriptions advertised "World Cup" as a current pickable/eligible sport | Reworded (MLB-led coverage) |
| `/about` "What's coming next" | "World Cup projection model … the model opens before kickoff" (a **future** WC feature) | Bullet removed (WC is complete, not upcoming) |
| `/simulate` coverage matrix | `market-coverage.ts` sport label "World Cup / soccer", ordered soccer-first ("live now") | Generalized to "Soccer" (a market-implied capability, "no live tournament right now"); MLB ordered first |
| `/today` + `/methodology` copy | "World Cup reads come from market prices" / "framework across … the World Cup" | Generalized to "soccer" (standing honesty principle / capability, not the completed event) |
| `/mr-dub` product attribution | retired **World Cup Specials** product chip rendered as bare "World Cup" (a sport) | Label keeps "Specials" → reads as the archived **product** lane (honest past attribution, `0-18`) |

**Verified-allowed remainders (archive / proof / negation, NOT active):** `/bank-builder` historical cleared rungs ("Step 3 · World Cup group stage" — the real climb); 16 `/games/mlb/*` reports stating there are **no** World Cup legs (negation); `/mr-dub` "World Cup Specials" retired-product ledger + journey steps; `/projections` "World Cup is complete — archive, not a live sport"; `/results` WC-as-past-proof; `/learn` + `/methodology` WC-model case study + data provenance. The `world-cup-closeout.test.mjs` guard was extended to pin the events-hub delisting and the simulate/picks chip gating.

## Phase 8 — Launch readiness scorecard (2026-07-21)
| Category | Status | Notes | Blocking? |
|---|---|---|---|
| Current sport focus | 🟢 GREEN | MLB is the live sport; homepage/simulate/today MLB-first | No |
| World Cup closeout | 🟢 GREEN | End-to-end verified: removed from nav/rail/footer/homepage/sports/products **+ simulate/picks/build/events/sports filters & metadata**; every built-route WC mention is archive/proof/negation only | No |
| MLB report UX | 🟢 GREEN | Unified 12-section V2.5 (board / agreement / distributions / product tags) | No |
| Bank Builder | 🟢 GREEN | Lane A + Lane B active review cards, MLB legs, $0 exposure | No |
| Moonshot | 🟢 GREEN | Step-1 active review card, MLB legs, $0 exposure | No |
| Picks / Top-10 | 🟢 GREEN | MLB-first; Team-markets tab falls back to MLB market context | No |
| Results | 🟢 GREEN | Official 19‑14 vs paper/pending cleanly separated; WC as past proof | No |
| Methodology | 🟢 GREEN | Honest; WC referenced as a case study, not active | No |
| Mobile / Navigation | 🟢 GREEN | WC out of mobile + desktop nav; MLB-led spine | No |
| Safety / legal copy | 🟢 GREEN | Paper-only / not-betting-advice throughout; no banned language | No |
| Data freshness | 🟡 YELLOW | Only 5/15 MLB games priced until the next refresh; honest "awaiting markets" | No |
| Settlement | 🟡 YELLOW | MLB props settle deterministically; WC knockouts stay pending (no trusted 90′ source) — honest | No |
| Internal leaks | 🟢 GREEN | shadow-calibration + public:false artifacts pruned from the build | No |
| Build / tests | 🟢 GREEN | tsc clean · **2,292 tests pass** · build 0 · forensic PERFECT · health HEALTHY (18/18, 1 benign freshness warn) · money md5 `affe6b21…` unchanged | No |

**Public paper beta: 🟢 GO.** **Official-money launch: ⛔ NO-GO** (intentionally — needs a separate explicit founder instruction; exposure stays $0).

## Next 7-day operating plan
1. Each morning: `bash scripts/refresh_daily_products.sh --date <today>` + `generate-mlb-game-simulations.mjs --write` (see `MLB_DAILY_OPERATING_PLAYBOOK.md`); re-run nearer first pitch for fuller coverage.
2. Review the day's eligible MLB legs; approve/hold Bank Builder + Moonshot review cards ($0 unless you explicitly authorize real staking).
3. Settle the prior day from official MLB box scores; keep the 19‑14 official record and paper/review cleanly separated.
4. Publish only when gates are green (tsc · suite · build · forensic · health · leak/fake-claim/product scans · route smoke).
5. Do not re-surface the World Cup as an active sport; it stays an archive.

