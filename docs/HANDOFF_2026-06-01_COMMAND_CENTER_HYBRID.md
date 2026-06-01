# Handoff — Command Center hybrid productionization (2026-06-01)

**Author:** automated session (Claude) · **Final main SHA:** `f1367a6` (advances with this doc PR).

Productionized a **hybrid** UI direction from the three structural preview
concepts (A Command Center, B Social Story, C Guided Flow), keeping the brand
**gold/vault theme**. Shipped as four small, independently‑verified PRs, each
gated on the real `Vercel – gametimepicks` deploy (green + `mergeStateStatus`
CLEAN) before merge. **No data / pipeline / optimizer / settlement /
generated‑data changes** in any PR.

## PRs merged this cycle
| PR | Title | Diff scope |
|----|-------|-----------|
| **#218** | Command Center shell — left rail + slate status bar (PR 1/4) | `layout.tsx` + new `command-rail.tsx`, `slate-status-bar.tsx` |
| **#219** | Dashboard home + featured slip card (PR 2/4) | `page.tsx` only |
| **#220** | Additive guided "New here?" beginner module (PR 3/4) | `page.tsx` + new `guided-start/guided-start.tsx` |
| (this) | docs: Command Center handoff (PR 4/4) | docs only |

Squash SHAs: #218 `2cd2fcc` · #219 `58e0d69` · #220 `f1367a6`.

## What shipped (live in production)
- **Shell (A):** a persistent **left‑rail navigation** on desktop (grouped
  Overview / Tools / More, mirroring `nav.tsx`'s active‑route logic). The
  production top `Nav` is kept for **mobile only**; mobile bottom nav unchanged.
  A persistent **slate status bar** (today · active slate settled/pregame ·
  latest settled · `$100` paper) read from the same loaders — honest.
- **Dashboard home (A + B):** Home is a modular grid — a **Featured slip** card
  (B's idea, the model's headline slip via the existing `ParlayTicketCard`,
  honestly labelled with the slate date + settled/pending state) above the full
  **`ParlayLabBuilder`** (filters + Build My Card intact), with a sidebar of
  modules (Track Record · Bank Builder · Projections · Events).
- **Guided module (C, additive):** a collapsible **"New here? Find a card in 3
  steps"** module at the top of Home (sport → game → comfort → real matching
  cards + CTAs). It **does not replace** the builder, Build My Card, or the
  featured slip. It reuses the builder's own helpers
  (`filterSlipsBySportTeamPlayer`, `getAvailableGamesFromSlips`,
  `combinedAmericanOddsFromLegs` + `classifyOddsSection`) so options reflect
  only what truly exists and counts are honest.

## Ported from A / B / C — and left out
**Included:** A's left rail + status bar + dashboard structure; B's featured
slip card + stronger visual hierarchy; C's guided sport→game→comfort entry +
honest empty states.

**Intentionally left out:** A's cool‑teal terminal palette and its removal of
the mobile top nav; B's vibrant magenta theme + heavy glow (off‑brand, hurts
dense‑data legibility); C's full light‑theme flip (dark‑first app — a clean
light theme needs per‑component token migration) and its "wizard replaces the
app" gating (the guided module is **additive**, the full builder stays).

## Honesty / guardrails (all preserved)
- Active slate labelled today / latest / **settled** from real loaders, never
  fabricated. With the June‑1 morning‑projections run succeeded, the home shows
  **2026‑06‑01** as the active **pregame** slate; latest settled stays
  **2026‑05‑30** (June‑1 not settled). `/results` shows May 30 settled; no
  May‑25/26 leak, no June‑1‑settled leak.
- Guided sport options show only sports that exist (June‑1 is MLB‑only → only
  *Any sport* + *MLB*, no NBA/Mixed); game options are real games with slips;
  comfort maps to Low/Medium/High/Longshot with live counts (0 shown honestly,
  empty state = "an honest gap, not a hidden pick").
- Bank Builder paper‑trading only; Events schedule‑only (WNBA/UFC/FIFA, no
  odds/projections); no banned betting copy; no fabricated
  projections/parlays/results; no May‑31 backfill.

## Verification (every PR)
`npx tsx --test src/lib/*.test.mjs` → **562/562** · `npx tsc --noEmit` clean ·
`npm run build` green · browser‑verified at **1280 + 375** (no horizontal
overflow, no console errors) · **Build My Card works** (✓ tray with stake +
projected payout) · filters intact · Bank Builder paper‑only · `/results`
honest. Preview concept branches **#213 / #214 / #215 remain OPEN, draft, not
merged** (the productionization re‑implemented their best ideas in clean
production code rather than merging them).

## Known limitations / next work
1. **Top chrome density:** desktop/mobile stack a disclaimer strip + the new
   status bar + the market ticker. It's acceptable (each is thin + informative)
   but a future pass could merge the ticker's record into the status bar.
2. **Mobile navigation = top strip + bottom bar** (the rail is desktop‑only). A
   future option is a rail **drawer** on mobile for parity.
3. **Deeper pages** (Projections, Parlay Lab, Results, Bank Builder) inherit the
   shell + status bar but keep their existing internals; module‑izing those
   surfaces is optional follow‑up.
4. The guided module's cards are **display + CTA** (no direct write into the
   builder's Build‑My‑Card tray, by design — avoids shared‑state risk). Wiring a
   real "add to my card" hand‑off is a possible enhancement if desired.
5. Stale operator PRs **#1/#2/#4/#5** remain obsolete (closeable).

No concept branch was merged; production stays honest, paper‑only, and
schedule‑only throughout.
