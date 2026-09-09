# UI/UX Design Lab — current-state audit + 4 preview directions

**Branch:** `design-lab` (preview-only, do not merge). **Routes:** `/design-lab` hub + `/design-lab/v1..v4`. All read real production data via a read-only adapter (`lib/design-lab/data.ts`) — no data mutation, no regeneration, no settlement.

## Current-state audit (live site)
- **Routes:** `/` (= `/today`), `/today`, `/picks` (+ `?sport=` filters), `/ufc` (+ Markets / Expanded Projections / Results tabs), `/results`, `/bank-builder`, `/methodology`, `/mlb`, `/nba`, `/world-cup`, `/games`, `/build`.
- **Nav:** single top nav (sports + Bank Builder) + a mobile bottom nav. Sport pages use a tabbed SportShell.
- **Strengths:** hot-lava theme is consistent (0 neutral Tailwind classes), honest data states (settled/pending/unavailable, model-only vs odds-backed), Bank Builder crown + Coming Soon, UFC fight dropdowns with avatars.
- **Weaknesses for this exploration:** one visual language everywhere; the home/today hero carries a lot at once; `/picks` and `/results` can read dense on mobile; navigation model is fixed (no event-first or feed-first alternative to compare).
- **Data states (real, used by the lab):** Bank Builder **$100 → $10,376.17, 5–0, completed**; UFC Freedom 250 **settled** (moneyline **6–1 / 86%**, cards **0–4**, Gaethje upset); MLB **15 games / 619 leans**. Portraits: NBA/MLB headshots from official CDNs where ids exist; UFC = initials fallback (no image source).

## Competitive UX patterns referenced (concepts, not assets)
- **Navigation:** bottom tab nav + swipeable sport chips (theScore / ESPN / Sleeper); top event switcher (UFC app); filter drawers + segmented controls (DraftKings/FanDuel).
- **Cards:** head-to-head matchup cards with avatars (UFC app); prop/confidence cards (PrizePicks/Underdog); dense metric tiles + edge meters (Action Network / trader dashboards); editorial hero + recap storytelling (sports media).
- **Casino/reward:** glow + crown/streak moments, ladder progress, completion celebration — applied to the paper Bank Builder.
- **Trust:** source + freshness badges, settled-vs-active labels, paper-only disclaimers (kept on every version).

## The 4 directions (built)
| | V1 Immersive Fight Card | V2 Premium Dashboard | V3 Mobile Sports App | V4 Editorial Casino |
|---|---|---|---|---|
| Palette | near-black + crimson `#E11D2A` | graphite/navy + cyan `#22D3EE` | dark + violet `#8B7CF6` | warm gold/crimson `#F0C75E` |
| Nav model | sport switcher + bottom nav, event-first | dashboard, metric-first | sport chips + icon bottom nav, feed-first | editorial sections, scroll-first |
| Hero | main-event matchup (avatars, FINAL/VS) | metric tiles (bankroll, ML record, cards, MLB) | "For You" feed cards | magazine cover story ($100→$10K) |
| Cards | big matchup rows + winner + MODEL ✓ | rows with confidence-meter bars + HIT/MISS | compact feed cards + avatar rail | story modules + result chips |
| Bank Builder | cinematic rung bar | metric ladder tiles | gradient card + violet rungs | gold cover story + Coming Soon |
| Type | bold condensed | tabular/mono-accent | rounded app | serif editorial |
| Best at | UFC, NBA/MLB matchups | Picks, Results, model scanning | daily habit, one-thumb | homepage, Bank Builder/Results story |
| Tradeoff | less data-dense | less "fun" | less desktop density | less tabular |

## Mobile/desktop QA
All 4 verified at **390px** (iPhone): **no horizontal overflow** (scrollWidth == viewport), readable cards, distinct nav patterns, **no console errors**. Real data renders ($10,376.17 / 6-1 / 0-4) on every version. They render below the current production top-nav (additive routes share the root layout) — a final adopted direction would own the full shell.

## Recommendation (hybrid)
- **Homepage/Bank-Builder story:** V4 editorial (the $100→$10K cover + Coming Soon is the strongest emotional hook).
- **Today/Picks/Results scanning:** V2 dashboard (metric tiles + confidence meters + active/settled clarity).
- **Mobile navigation + daily feed:** V3 (sport chips + icon bottom nav).
- **UFC / matchup pages:** V1 (matchup hero + avatars + per-fight model ✓/miss).
- **Best single full direction if forced to pick one:** V3 for daily usability, with V4's hero on `/` and V1's matchup cards on sport pages.

## Honest limitations
- These are **design-direction showcases** (one rich mobile page per version covering the core modules), not 4× full clones of every route — the prompt's sanctioned scope-down. Each demonstrates its visual system on real data.
- Used the route-scoped **single preview** approach (one Vercel preview, 4 sub-routes) rather than 4 separate PR previews — 4 full-site redesigns is a multi-session effort; the route-scoped alternative is explicitly allowed and gives one comparable link.
- UFC fighter portraits are initials (no connected image source). No production data/Bank Builder mutation.
