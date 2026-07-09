# Internal / Legacy Route Audit + Archive Plan (2026-07-09)

**Audit-only.** No routes were redirected, hidden, noindexed, or deleted by this
document. Every recommendation that changes user-facing behavior (redirect,
hide, archive, delete) is marked **owner approval required** — the founder is
asleep, so nothing here is implemented. Money untouched; canonical md5
`affe6b21071f2b3be96bb2774eb347c3`.

64 page routes total (`find src/app -name page.tsx`). Baseline HEAD when audited:
`69c66577` (Chunk 9A). Direct-URL support for every route below is preserved.

## A. Primary public spine — keep as-is

| Route | Role | Data source | Class | Keep? | Action | Owner? |
|---|---|---|---|---|---|---|
| `/` | Focused landing | canonical loaders | public | yes | keep | — |
| `/simulate` | Simulator lobby | game-simulations | public | yes | keep | — |
| `/today` | Daily model hub | boards + portfolio | public | yes | keep | — |
| `/bank-builder` | Flagship ladder | bank-builder + portfolio | public | yes | keep | — |
| `/results` | Trust Center (Chunk 6B) | portfolio + mlb/results | public | yes | keep | — |

## B. Public secondary — keep (already grouped in the command rail / nav)

`/games` (Game Lab hub), `/games/[sport]/[gameId]` (game report, noindex dynamic),
`/picks` (Build-a-Pick nav label; "Parlay Lab" product name in body is
intentional — locked by `unified-nav-labels.test.mjs`), `/build`, `/moonshot`
(Longshot Lab), `/world-cup-specials` (Soccer Specials), `/mr-dub` (Daily
Dashboard), `/mlb`, `/world-cup` (+ `/groups`, `/round-of-32`, `/schedule`,
`/teams`, `/team/[code]`, `/round-of-32/[slug]`), `/learn`, `/methodology`,
`/about`, `/responsible-use`, `/sports`.

- Data sources: per-sport boards/projections under `public/data/*`; results under
  `public/data/mlb/results` + `results/*`.
- **Keep all.** These are the secondary surfaces the mission wants under
  More/secondary nav; they already live there. No action.

## C. Sport hubs + per-sport sub-boards — keep, honest inactive states

`/nba`, `/ufc`, `/nhl`, `/ipl` and their `/{board,parlays,power,results}` (+
`/board/[date]` for mlb/nhl/ipl), `/mlb/{board,parlays,power,results}`.

- Verified honest: `/nba` renders "No NBA games on the active slate" when empty;
  `/ufc` renders "Awaiting two-sided moneyline lines for the next card." No page
  fabricates an active slate.
- **Keep all.** Recommended (owner approval): as leagues go dormant, keep these
  under More/Game-Research only and lean on the existing honest empty states —
  no redirect/delete.

## D. Results sub-routes — keep

`/results/mlb` (= `/mlb/results`, now with the Chunk-9A model-performance-ledger
banner), `/results/model-audit` (cross-sport edge/quartile/calibration audit),
`/results/nba`, `/results/nhl`, `/results/ipl`, `/results/parlays`,
`/results/date/[date]` (noindex per-date deep link). **Keep all.**

## E. Legacy cross-sport boards — candidates to demote LATER

| Route | Role | Data source | Class | Keep? | Recommended action | Owner? |
|---|---|---|---|---|---|---|
| `/board` | Legacy all-sport board w/ tabs | `lib/data` getBoardForDate | legacy (superseded by `/games`) | keep URL | demote to More-only or redirect → `/games` later | **yes** |
| `/projections` | Legacy projections board | projections artifacts | legacy | keep URL | demote to More-only later | **yes** |
| `/events` | Sports Event Hub (schedule-only, 3 leagues, ESPN snapshot) | ESPN schedule snapshot | legacy/utility | keep URL | keep or fold into `/games` later | **yes** |

These three are still linked from the command rail. They predate the `/games`
Game Lab hub, which is now the canonical "browse any game" surface. Recommended
**later, with approval**: drop them from the rail (keep direct URLs) or redirect
`/board` → `/games`. Not done tonight — redirect/hide is a user-facing change.

## F. Retired landings — already correct, leave alone

| Route | State | Nav | Action |
|---|---|---|---|
| `/trends` | noindex "Player trends (retired)" landing | 0 nav surfaces | none — already retired cleanly, history preserved |
| `/homer-nukes` | noindex "Homer Nukes (retired)" landing | 0 nav surfaces | none — retired 2026-06-30, landing kept for old links |

Both are already the desired end-state (noindex retired landing, out of nav,
direct URL still resolves). **No action.**

## G. Internal / admin — keep internal

| Route | Role | Data source | Class | Nav | Action | Owner? |
|---|---|---|---|---|---|---|
| `/ops` | READ-ONLY admin dashboard (no write actions) | `public/data/admin/status.json` | internal | 0 (noindex) | keep as-is | — |
| `/preview/june20` | One-off dated internal full-site preview | static | internal | 0 (noindex/notFound) | archive LATER | **yes** |

`/ops` is correctly internal (noindex, not in nav, read-only, shows only figures
already public). `/preview/june20` is a dated one-off; recommend archiving it
later (owner approval) — harmless meanwhile (noindex, unlinked).

## H. Legacy redirects — keep permanently

| Route | Redirects to | Action |
|---|---|---|
| `/parlays` | `/picks` | keep — never break old links |
| `/parlay-lab` | `/picks` | keep — never break old links |

## Archive plan summary (all owner-gated, none done tonight)

1. **Legacy boards** `/board`, `/projections`, `/events`: drop from the command
   rail (keep direct URLs) and/or redirect `/board` → `/games`. Owner approval.
2. **`/preview/june20`**: archive/delete the one-off internal preview. Owner
   approval.
3. **Dormant-league hubs** (`/nba`, `/nhl`, `/ufc`, `/ipl`): no change — the
   honest empty/awaiting states already handle off-season. Optionally demote to a
   More/Game-Research group. Owner approval for any nav move.
4. Everything in A/B/D/F/G-`/ops`/H: **keep as-is.**

Nothing above requires a route deletion tonight, and none was performed.

## Appendix — Chunk 7 (secondary consolidation) status

The Chunk 7 goal — "secondary products under More so they don't clutter the
flagship spine" — is **already met** by earlier chunks and needs no risky change:

- The desktop **command rail** already groups items by section (Simulate ·
  Today · Bankroll · Sports · Learn); `nav.tsx` carries a primary/secondary
  divider (`beforeDivider`).
- Nav **labels are already clean** on every nav surface (Build-a-Pick, Longshot
  Lab, Daily Dashboard, Soccer Specials) — pinned by `unified-nav-labels.test.mjs`.
- The `unified-nav-labels` test deliberately scopes the rename to **nav
  surfaces**; "Parlay Lab" / "Moonshot" as **product names in educational bodies**
  (methodology, responsible-use, /picks) are intentional, not residues. A broad
  body rebrand would contradict that pinned constraint and is an **owner naming
  decision** — deliberately not done overnight.
- Off-season honesty already exists (§C). No product is made to look active.
