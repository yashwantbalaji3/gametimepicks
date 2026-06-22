# Full UI/UX Navigation Audit + Sportsbook-Style Redesign

**Date:** Monday June 22 2026. **Branch:** `full-uiux-navigation-sportsbook-redesign` (off `origin/main` `1a66977a`).
**Goal:** Make the product feel organized, premium, and sportsbook-like (paper-only), with intuitive navigation and every model pick discoverable by tab.

## Phase 1 — Information architecture (browser QA, not just code)

The app is mature with a deep lava/casino design system already in place (`--lava-*`, `--risk-*`, `--sport-*` tokens; sportsbook/ticket components). The problem is **coherence and navigation clarity**, not missing primitives.

| route | current headline | cards shown | picks visible? | confusion (1-5) | issue |
|---|---|---|---|---|---|
| `/today` | Daily command center | WC focus, Specials, BB rail, Mr.Dub, suggested cards | ✅ comprehensive | 3 | quick-action row duplicates desktop rail; header bank chip ambiguous |
| `/picks` | "Parlay Lab" | coverage matrix + cards by sport/risk | ✅ | 2 | desktop rail labels it "Picks", everything else "Parlay Lab" |
| `/parlays` | "Parlays" | ParlaysExplorer (same engine) | ✅ | 3 | near-duplicate of /picks; not in nav (secondary) |
| `/build` | "Build — custom paper card" | eligible-leg pool | ✅ | 2 | fine |
| `/games` | "Tonight's games" | 18 games across sports | ✅ (game cards) | 1 | directory; fine |
| `/world-cup` | WC command center | 8-tab hub (games/proj/props/cards/markets/results) | ✅ | 1 | strong |
| `/mlb` | MLB hub | 7-tab hub (Games 13 / Proj 25 / Props 567 / Cards 18) | ✅ | 1 | strong |
| `/nba` | NBA hub | 0 games (offseason) — honest "lines pending" | ⚠️ | 3 | **leaks a stale Jun-10 "Market Outlook" (Spurs @ Knicks) on today's slate** |
| `/ufc` | UFC Moneyline V1 | "next slate loading · previous event settled" | ✅ (honest empty) | 1 | **gold-standard honest empty state** |
| `/bank-builder` | $100→$10K paper ladder | Dual lanes + Moonshot + crown | ✅ | 2 | leg HIT/MISS badges shipped prior PR |
| `/mr-dub` | Paper portfolio | bankroll/exposure/ledger/moonshot | ✅ | 2 | settled-moonshot fixed prior PR |
| `/results` | Track record | accuracy + settled slates + BB steps | ✅ | 1 | fine |
| `/methodology` | Reference | concept cards + math + per-sport | n/a | 1 | reference only |
| `/sports` | Sport directory | 4 sport cards w/ counts | n/a | 1 | directory; fine |

### Navigation findings
- **Desktop** = `CommandRail` (left rail, lg+), already well-grouped: **Today** (Today/Games/Picks/Build) · **Bankroll** (Bank Builder/Mr.Dub/Results) · **Sports** (World Cup/MLB/NBA/UFC) · **Learn** (How it works/Methodology/About). Good hierarchy.
- **Mobile** = top `Nav` scroll strip + `MobileBottomNav` (6 buckets).
- **Label incoherence:** `/picks` is "Picks" in the rail but "Parlay Lab" everywhere else (page title/H2, mobile top nav, mobile bottom nav, and 20+ cross-links). → unify to **"Parlay Lab"** (the established name) in the rail.
- **Header bankroll ambiguity (explicit P1):** the status-bar bank chip shows the **crown** ($10,376.17 · Step 5 · 5–0) with no label distinguishing it from the **active** bankroll ($10,176.17 · 8–2). Users can't tell the two apart.
- **Desktop duplication:** `/today`'s quick-action grid (Games/World Cup/Parlay Lab/Build/Bank Builder/Results) duplicates the left rail on desktop → contributes to the "jumbled" feel.

### Duplicated content (by design, acceptable)
Suggested parlays appear on /today, /picks, /parlays (same engine); Bank Builder appears on /today (rail), /bank-builder (full), /mr-dub (transparency). These are intentional contextual surfaces, not bugs — but /picks vs /parlays naming should be coherent.

## Change set (high-impact, low-risk — presentational, no data/settlement logic touched)
1. **Nav label coherence** — CommandRail `/picks`: "Picks" → "Parlay Lab" (match the rest of the app); enhance rail active-state + group headers (sportsbook feel).
2. **Header bankroll Crown vs Active** — status-bar shows a distinct **Active** chip ($10,176.17 · record → /mr-dub) and a **Crown** chip ($10,376.17 · 5–0 → /bank-builder), each clearly labeled.
3. **Reduce desktop jumble** — `/today` quick-action grid becomes mobile-only (`lg:hidden`); the desktop rail already covers it.
4. **/nba stale-card guard** — gate the market-outlook section to `games.length > 0` so an empty offseason slate doesn't render a 12-day-old game (matches the /ufc honest-empty pattern).
5. **Sportsbook polish** — premium nav active state, consistent chips.

Guardrails respected: no bankroll/exposure/settlement logic changes; protected crown + results untouched; no fabricated data; no banned copy.

## What shipped (verified in-browser)

| change | file | result |
|---|---|---|
| Rail `/picks` label "Picks" → "Parlay Lab" (coherent with mobile + page + 20 cross-links) | `command-rail.tsx` | rail reads "⊞ Parlay Lab"; active state now has a soft glow + semibold + group accent dot |
| Header **Active** vs **Crown** chips | `slate-status-bar.tsx` | "🏦 Active $10,176.17 · 8–2" (lava) + "👑 Crown $10,376.17 · 5–0" (gold) — unambiguous |
| `/today` quick-action grid → mobile-only (`lg:hidden`) | `today/page.tsx` | desktop no longer duplicates the rail; mobile keeps the 1-tap grid |
| `/nba` market outlook gated to `games.length > 0` | `nba/page.tsx` | offseason slate no longer renders the stale Jun-10 Spurs@Knicks game; honest "lines pending" instead |

### Per-tab model-pick visibility (browser-verified)
Today ✅ · Parlay Lab (/picks) ✅ coverage matrix + cards · Parlays ✅ · Build ✅ leg pool · World Cup ✅ 8-tab hub · MLB ✅ Games 13/Proj 25/Props 567/Cards 18 · NBA ✅ honest "lines pending" (offseason) · UFC ✅ honest "previous event settled" · Bank Builder ✅ lanes+Moonshot+crown · Mr. Dub ✅ bankroll/exposure/ledger/settled-moonshot · Results ✅ settled track record · Games ✅ 18 games · Methodology ✅ reference.

### Nav coherence (all three surfaces now consistent)
- Desktop `CommandRail`: Today · Games · **Parlay Lab** · Build | Bank Builder · Mr. Dub · Results | World Cup · MLB · NBA · UFC | How it works · Methodology · About.
- Mobile bottom nav: Today · Games · **Parlay Lab** · Build · Bank · Mr. Dub.
- Mobile top strip: same labels.

## Verification
- **Tests:** 1208 / 1208 pass. **tsc:** clean. **`next build`:** clean (exit 0, static export `out/`).
- **Audits:** no banned public copy in the diff; `.env` untracked / no secrets; protected crown + `results/` untouched; no data/settlement logic touched.
- **Desktop QA (1440):** rail "Parlay Lab" + premium active state; Active/Crown chips; quick-action row hidden; zero horizontal overflow.
- **Mobile QA (375 + 320):** header chips wrap cleanly into 3 rows (Active lava / Crown gold distinct); quick-action grid shows; bottom nav fixed + non-blocking; zero horizontal overflow on /today, /bank-builder, /picks, /mr-dub.
- **Console:** clean on a fresh server load across all checked routes.

## Remaining UX backlog (deliberately deferred — incremental to avoid churn/regression risk)
1. Deduplicate `/picks` vs `/parlays` (near-identical engine views) — consolidate or make `/parlays` an explicit deep-link, not a parallel page.
2. Soften the dense `/today` "Methodology engine" summary line ("STEP 2 LIVE · 1/2 lanes cleared Step 1") into plainer language.
3. A shared `<PicksPageHeader>` template (status bar + summary chips + tabs) applied uniformly across sport hubs for visual rhythm.
4. Mobile top-nav active-state highlight parity with the rail.
5. Deeper ground-up ticket/card restyle (the design tokens already exist; apply consistently).
