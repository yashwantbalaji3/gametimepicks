# Simulate-First UX Rebuild — Audit + Restructure Plan (2026-07-09)

Goal: make the product feel like a **polished simulation product with analytics on demand**,
not a long internal report. Money/data untouched (`affe6b21…`, 19-14). This doc records the
audit, what shipped safely this pass, and the plan for the larger (test-entangled) restructure.

## Phase 1 — current pain points

1. **Primary journey works** (pick game → Generate → gated dashboard) but the **post-reveal is a long
   stacked report** (Game Center → dense report → spotlight → tabs), not a staged "answer first, depth
   on demand" dashboard.
2. **Soccer "model" language** implied an independent stat model when WC is **odds-only / market-implied**
   (`modelProbability == de-vigged marketProbability`). → **FIXED this pass** (see below).
3. **Unavailable modules** read as broken ("No persisted per-game Monte-Carlo artifact yet — not yet
   simulated"). → **reworded to a friendly "Coming soon · requires …" roadmap this pass.**
4. **Nav** is already grouped (command rail: Simulate·Today·Bankroll·Sports·Learn; primary/secondary
   divider) — labels are clean and **test-pinned** (`unified-nav-labels`). A further "More" collapse is
   low-value vs the pin risk; documented, not forced.
5. **High-risk shared surface:** the game-detail gate is pinned by **40 assertions in
   `simulate-gated-detail.test.mjs`** (+9 `simulator-first-ux`, +7 `game-simulation-reveal`). Any
   post-reveal restructure must keep the gate intact and update the structure pins carefully.

## Shipped safely this pass (low-risk, high-integrity)

- **Soccer copy → market-implied** (`wc-game-lab-report.tsx` + `wc-report.ts`): "Model report" →
  "Market read · de-vigged sportsbook prices · not an independent stat model"; "Model vs market" →
  "No-vig vs raw price"; "Ranked by model edge" → "Ranked by market read"; "the model reads
  at/against the price" → "the de-vigged read sits at/against"; "What the model likes" → "Strongest
  market reads"; the Track-Record note now says a soccer read is **not** part of the 19-14 record.
- **Coming-soon roadmap language**: unavailable soccer modules now read "Coming soon — requires a
  sampled simulation artifact / a player-stats provider," not "not yet simulated."
- Test updated to the new honest language; suite 1916 green; money md5 unchanged.

## Plan for the tabbed dashboard (recommended careful build, NOT rushed here)

Keep the gate; reorganize the **post-reveal** content into an Overview-led tab set. The gate lives in
`GameSimulationRunner`/`WcSimulationRunner` `postReveal`; wrap `postReveal` in a tab container so the
first thing a user sees after Generate is a **main answer card + quick reads**, with depth behind tabs.

**Soccer:** `Overview` (Match Result Center + quick reads) · `Markets` (all de-vigged: total, BTTS, DC,
DNB, Asian handicap, team totals) · `Scorers` (Coming soon — one-sided odds, needs normalization +
settlement) · `Advanced Report` (the current WcGameLabReport) · `Coming Soon` (grouped roadmap:
player markets / match events / advanced model layer) · `Methodology`.

**MLB:** `Overview` (Game Center headline + quick reads) · `Game Center` · `Player Props` ·
`Distributions` (Coming soon until the alternate-ladder tail-bin build) · `Advanced Report` ·
`Methodology`.

**Risk + approach:** reuse the existing `SportShell`/`ShellTab` component. The 40 gating assertions
pin (a) the gate (postReveal absent pre-click) — **keep exactly** — and (b) the literal postReveal
JSX string — **update to the new tabbed wrapper** in the same careful way prior chunks updated it.
Do it as a dedicated build with browser verification of every tab's gated reveal.

## Also planned (documented)

- **/simulate availability badges** (Phase 8) — artifact-backed per-game chips (MLB: 10,000-run /
  Moneyline / Run line / Total; Soccer: Market dashboard / Match result / Total / BTTS / Asian
  handicap / Team totals). Requires a small lobby loader that reads each game's supported modules.
- **Nav "More" collapse** — owner decision (labels are intentionally test-pinned).

**Owner decision needed:** approve the post-reveal tab restructure (touches the 40-assertion gate
test — safe but must be done deliberately) and the /simulate badge loader.
