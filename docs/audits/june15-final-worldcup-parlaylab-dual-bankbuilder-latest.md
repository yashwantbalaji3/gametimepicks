# June 15 final readiness — Dual Bank Builder launch + WC refresh (preview PR)

Branch `june15-final-worldcup-parlaylab-dual-bankbuilder`, stacked on the #491 branch
(`d4fc2cb`) so all the World Cup Odds-API + API-Football work is preserved. PREVIEW —
do not merge without owner review.

> Base decision: branched off the #491 branch (not main) to keep the WC odds + recent-form
> enrichment from PRs #490/#491. This PR stacks on #491; merge after it (or merge the stack).

---

## Phase 1 — credential + source verification
- **API-Football** `/status`: Pro, active, quota healthy (key only in gitignored `.env`).
  `/fixtures?league=1&season=2026&date=2026-06-15` → 4 fixtures; `/standings` → real groups;
  `/fixtures?team&last=5` → real recent form. Requests used: a handful (well within 7500/day).
- **The Odds API**: `soccer_fifa_world_cup` active; MLB active. Credits ≈ 332 remaining after
  refreshing the 2 upcoming WC fixtures (cleared stale cache for current prices).

## Phase 2 — June 15 slate inventory (at 17:12 ET)
| Sport | State |
|---|---|
| World Cup | Spain/Sweden FT, Belgium live; **2 upcoming**: Saudi Arabia v Uruguay (18:00 ET), Iran v New Zealand (21:00 ET) |
| MLB | **all 10 games upcoming** (first pitch 6:41pm ET+), 199 High-confidence legs |
| NBA | no slate | UFC | UFC 250 settled (recap only) |

## Phases 3–5 — World Cup projections refreshed (upcoming only)
Regenerated for the **2 upcoming** fixtures with fresh prices → **9 market projections**
(moneyline ×2, totals ×1, double_chance ×2, btts ×2, draw_no_bet ×2), all odds-backed, and
**enriched with real recent form + group** from API-Football (dataQuality B). Finished/live
matches are excluded (honest — they can't be pregame legs). 1 WC card + mixed MLB+WC cards.

## Phase 7 — Dual Bank Builder LAUNCHED ✅ (the headline)
`build_dual_bank_builder.py` selected two distinct lanes from **119 eligible upcoming
odds-backed legs** (114 MLB + 5 WC). Written to `bank-builder/dual-lanes-latest.json`
(status `pending`); the completed first run artifact is untouched.

| Lane | Thesis | Legs | Combined | $100 → | Joint model |
|---|---|---|---|---|---|
| **A** | Lower-variance, cross-sport | Uruguay or Draw (double chance, −1100, 87%) + Alec Burleson Over 1.5 hits (−151, 78%) | **−123** | **$181** | 69% |
| **B** | Differentiated, higher return | Otto Lopez Over 0.5 (−245, 84%) + Pavin Smith Under 1.5 (−173, 78%) | **+122** | **$222** | 66% |

Lane A is intentionally the steadier lane (highest joint probability → shorter combined
≈ $181, just under the $190–230 ideal but the most defensible lower-variance pair); Lane B is
the higher-return lane ($222). Different legs, no shared game, both pending, all legs were
upcoming at launch. Rendered LIVE on `/today` (after the WC focus) and `/bank-builder`, with
the completed `$100 → $10,376.17 · 5–0` run shown as a recap beneath.

## UI
- **`/today`**: WC focus → **Dual Bank Builder (live lanes)** → MLB parlays → … → results.
- **`/bank-builder`**: completed crown + the two live lanes (legs, odds, $100 → return, pending).
- WC focus dropdowns retain 3-way (Draw real) + double chance + totals + recent-form pills.

## Integrity / tests / build
- No fabrication: real odds (The Odds API) + real form (API-Football); only UPCOMING legs in
  the lanes; completed first run + UFC 250 settlement byte-untouched; `.env` gitignored + not
  staged (no key material in the diff).
- New `dual-bank-builder.test.mjs` (6 tests): two pending lanes, $100 + 2 odds-backed legs each,
  no shared leg, differentiated, ~$200 return, **completed run preserved**, no banned copy.
- 916 tests pass; tsc clean; build clean (187 pages — finished WC matches dropped honestly).

## Honest limitations / deferred (documented next increment)
- **World Cup player props** (anytime-goalscorer / shots): odds exist on The Odds API and
  API-Football player data is now available — but full integration (player→API-Football match,
  per-player recent goal/shot form, hit-rate viz, eligibility gating, PlayerPropsExplorer) is a
  large, focused build deferred to the next PR. Not faked: the stale props stay removed and the
  WC player-props state remains an honest "unavailable / next increment".
- Deep Parlay Lab / Build filter additions (Player Props / Team Props / Double Chance / Totals
  chips) and a dedicated `/world-cup` tab redesign: the new markets + lanes flow through the
  existing components; the expanded filter matrix is a follow-up.
- The slate is late in the day (only 2 WC matches + the MLB slate remained upcoming at launch),
  so card counts reflect what was genuinely eligible — not padded to a target.

**Recommendation:** review on the preview; merge the Dual Bank Builder launch + WC refresh after
the #490/#491 stack. Next increment: World Cup player props (odds + API-Football recent form).
