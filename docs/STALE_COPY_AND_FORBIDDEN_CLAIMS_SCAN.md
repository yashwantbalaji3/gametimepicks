# Stale-Copy & Forbidden-Claims Scan — 2026-07-13

Scan of `app/src` + `public/data` for stale "today/tonight/live" copy and forbidden claims
(best bet / lock / guaranteed / positive EV / validated edge / official pick / BB-or-Moonshot UFC).
**Bottom line: no forbidden claim is ever affirmatively rendered.** One real stale-as-live bug was found and
**fixed this pass** (`/sports`); the rest are honest, gated, hedged, or dead code.

## Fixed this pass
- **`/sports` rendered "Live today" for the stale 07-11 slate** (`sports/page.tsx`, `sport-card.tsx`) —
  `.live` was derived from content presence, not `date == today`, and the page had no freshness correction.
  **Fix:** every sport's `live` now requires its slate/board/event date to equal the real ET date; header reads
  "no live slate today" when zero are live. Verified: built `/sports` now has **0 "Live today"**, 4 "Off today".

## Should-fix (documented, not changed this pass)
- **`/projections` hero `sub="today"`** (`projections/page.tsx:205-210`) — labels the build-date slate "today"
  with no banner; a frozen stale export reads "· today" with 0 games. Page is unlinked + NBA off-season → P2.
  *Fix:* gate the "today" sub on `slateDate === currentEtDate()` or add `FreshnessBadge`.
- **`/mlb/board`, `/mlb/power`** land on the 07-11 board with no liveness banner (games marked settled, so not a
  hard lie) → P1 add the banner.

## Forbidden claims — all safe (classified)
| location | string | verdict |
|---|---|---|
| `lib/glossary.ts:41` | "Positive EV means a theoretical long-run paper edge … never a betting recommendation" | ✅ hedged definition |
| `world-cup/round-of-32/*`, `lib/world-cup/game-script.ts` | "NOT a guaranteed score", "a real result, not a lock", "a lean, not a lock" | ✅ negations |
| `lib/home/spotlight-event.ts`, `lib/market-ticker.ts`, `lib/empty-state-taxonomy.ts` | `FORBIDDEN=[…]` blocklists | ✅ validators, not rendered |
| `components/bank-builder/ladder-v2.tsx` | "we lock profit", `p.lock` | ✅ allowed profit-locking sense (banked $) |
| UFC surfaces | "market-implied … picks stay gated until validation" | ✅ never a "pick"; no BB/Moonshot-UFC product |

## "today/tonight/live" hits — honest or dead
- **Honest + gated:** `/mlb` QuickAction "Tonight" (nav category; page has FreshnessBadge); `/simulate` MLB rows
  labelled by date; the 6 hub banners.
- **Dead code (no importer — latent only):** `components/homepage-sports-rail.tsx` ("Tonight on GameTimePicks",
  "Live tonight"), `curated-tonight-card.tsx`, `curated-projections-card.tsx`, `tonight-matchup-card.tsx`.
  *Recommend deleting for hygiene (P2) so they can't be re-mounted stale.*
- **Content-gated:** `featured-headliners.tsx:237` "tonight's slate" returns null when empty; NBA off-season so
  it never mounts.

## Data + dev artifacts — clean
- `public/data` "fake" hits are disclaimers ("no fabricated legs") or fighter names ("Lock Jaw" nickname,
  "Todorovic"); `bank-builder-locks.json` "Lock consumed" = internal profit-lock ledger note.
- `app/src` `placeholder/dummy/TODO/FIXME/debug` = React `placeholder=` props, component names
  (`…PlaceholderPage`), honest copy ("no fake leans", "not yet simulated placeholders"). **Nothing ships to users.**

## Verdict
No forbidden claim rendered; no stale-as-live on any *current* route after the `/sports` fix. Residual copy items
(`/projections` "today", `/mlb/board` banner, dead-code deletion) are P1-P2 polish, not safety blockers.
