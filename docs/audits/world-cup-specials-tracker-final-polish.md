# World Cup Specials Tracker + Final Product Completion

**Date:** Monday June 22 2026, ~8:40 PM ET. **Branch:** `world-cup-specials-tracker-final-polish` (off `origin/main` `219fafa6`, PR #559).
**Scope:** a dedicated World Cup Specials Tracker (route + component) like Bank Builder/Moonshot, kept fully separate; Moonshot next-slate activation rules + candidate expiry. **No core bankroll/exposure/record/crown changed; no settlement run.**

## Phase 1 — data integrity snapshot (preserved, no P0)
| field | value |
|---|---|
| active bankroll | $10,176.17 |
| core exposure | $200 |
| moonshot exposure | $0 |
| specials exposure | $0 (suggested cards, never placed) |
| total exposure | $200 |
| core record | 8-2-0-2 |
| moonshot record | 0-1 |
| specials record | 0–0 (none settled on the current slate) |
| crown | $10,376.17 · 5-0 |
| Lane A / Lane B | Step 3 pending / Step 1 pending |
| Moonshot status | stopped; 2 candidates |
| World Cup Specials | 5 June-22 cards, no dedicated tracker (until now) |

## World Cup Specials Tracker
- **Route:** `/world-cup-specials` ("World Cup Specials Tracker") with the shared cinematic `PicksSurfaceHeader` (matches /moonshot, /picks, sport hubs) + "World Cup hub" / "View Results" CTAs + paper-only note.
- **Component:** `components/specials/world-cup-specials-tracker.tsx` (full/compact/summary modes) built on the shared `TicketCard`/`LegRow`/`OddsPill`/`StatusPill`/`RiskPill` primitives.
- **Deriver:** `lib/world-cup/specials-tracker.ts` (pure, tested) maps the committed `world-cup-specials.json` into candidate / in-progress (pending) / settled rows **without changing settlement logic or fabricating anything** — status is derived: `cardStatus` won/lost → settled; any leg's game kicked off → pending; else candidate.
- **Current slate:** the 5 June-22 specials each span a started game + the pending 11 PM Jordan/Algeria leg → all show as **"In progress · pending settlement"** (honest — not playable, not yet graded). Record **0–0**, exposure **$0**.

## Separation (preserved)
World Cup Specials carry **no placed exposure** (suggested longshot cards), so their record is the W-L of officially-settled cards and exposure is always **$0**. Separate from Bank Builder core (8-2-0-2 / $200), Moonshot (0-1 / $0), Mr. Dub core record, and the protected crown ($10,376.17). Deriving/showing specials mutates nothing.

## Settlement rules (tracker)
candidate (pre-event, no exposure) → pending (game started, ungraded) → won/lost/void (official `cardStatus` + per-leg `settlementStatus`/`settlementReason` from API-Football). Settled cards render **"Settled review — not a pre-event pick."** No new settlement was performed in this UI pass.

## Moonshot next-slate activation rules + candidate expiry
- New `lib/moonshot/activation-rules.ts`: `candidateReadiness(candidate, nowIso)` → `ready` | `kickoff_too_close` (< 30 min cutoff) | `expired` (a game kicked off) | `out_of_band` (odds outside +600..+2000). Constants: `ACTIVATION_CUTOFF_MIN=30`, band 600–2000, default stake $25, max 2 lanes, max $50 exposure.
- Added real `startTimeUtc` to the existing Moonshot candidate legs (Norway/Senegal `00:00Z`, Jordan/Algeria `03:00Z`) so the rule is machine-checkable.
- `/moonshot` + `/mr-dub` now show each candidate's readiness reason. At build time (8:40 PM ET, after the 8 PM Norway/Senegal kickoff) both candidates correctly read **"Expired — a game has kicked off; not activatable (review only, no exposure)"** — no late exposure, honest.

## Nav / entry points
- Desktop rail (Sports group): **🏆 WC Specials** (active on `/world-cup-specials`).
- Specials box (rendered on `/today` + `/world-cup`): "Open the World Cup Specials tracker →" CTA.
- Mobile: `/world-cup-specials` → Games bucket (bottom nav) + "Sports" top-nav highlight; no bottom-nav crowding.

## Verification
- **Tests:** 1221 / 1221 (+5: tracker derivation candidate/pending/settled + $0 exposure, separation from core/moonshot/crown, route uses shared primitives + review-only settled, reachable from rail + box CTA, activation cutoff blocks late activation + expires after kickoff). **tsc:** clean. **`next build`:** clean (`/world-cup-specials` built).
- **Audits:** no banned copy; `.env` untracked / no secrets; **core/crown/world-cup/mr-dub data untouched**; only `moonshot-lane/active.json` changed (additive `startTimeUtc` on candidates — no status/record/result touched); no extreme odds.
- **Browser QA (mobile 375 / 320 + desktop 1440):** `/world-cup-specials` tracker (5 pending cards, no exposure, separate) + cinematic header + rail "WC Specials" active; `/moonshot` candidates show "Expired" readiness; zero horizontal overflow; console clean; bankroll/crown preserved.

## Deliberately NOT changed
- No settlement performed (Jordan/Algeria 11 PM pending; most specials legs ungraded).
- No exposure placed anywhere; Moonshot candidates expired (no late activation).
- Bank Builder lane cards / Mr.Dub core slips / Results — kept on existing tested rendering (full `tickets/` migration remains backlog).
- Core bankroll, exposure, records, crown — untouched.

## Remaining backlog
1. When a slate has ≥2 comfortably-pre-event independent games, activate Moonshot lanes from "ready" candidates (→ moonshot exposure $50, total $250).
2. Persist settled Specials history across days (a `world-cup-specials-history.json`) so the tracker shows a real multi-day record (currently single-slate; older days not backfilled).
3. Migrate `dual-ladder-board` / Mr.Dub core slips / Results rows to the shared `tickets/` primitives behind updated tests.
4. Fold `PicksSurfaceHeader` + `SportOverviewHero` into one `SurfaceHeroShell`.
