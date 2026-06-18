# June 18 — Mr. Dub portfolio + Bank Builder lifecycle UI + replacement engine

_Branch `june18-mrdub-bankbuilder-ui-replacement-engine` off main `8ae2a92f` (#522). ~15:04 ET._

## Current-state review
| surface | source | issue | desired | files |
|---|---|---|---|---|
| `/bank-builder` Lane A | preview panel `RestartLaneCard` | "fresh restart / $100 queued" awkward copy | natural "$100 starting path · Step 1 · next card queued" | bank-builder-preview-panel.tsx |
| `/bank-builder` money | `money()` tiny mono spans | hard to read | large/high-contrast `MoneyPath` | ui/money-path.tsx |
| `/mr-dub` | server page | flat order, no character, no expand | hero → dual BB → expandable daily → full → exposure + avatar | mr-dub/page.tsx |
| nav (sidebar/desktop/mobile) | nav.tsx / command-rail / nav-active-route | no Mr. Dub | first-class tab | 3 nav files |
| ledger accounting | build-mr-dub-ledger | intermediate step-wins double-counted | rolled/unrealized; realize at close | build-mr-dub-ledger.mjs |
| replacement lifecycle | none | no pre-generated candidates | pre-event candidates per active lane | build-replacement-candidates.mjs |

## What shipped
- **Ledger accounting (correct ladder model):** an intermediate WON step ROLLS (unrealized, $0 realized); a LOST step closes the lane and realizes −$100 (the lane's original paper stake); an OPEN step adds the $100 to open exposure. Result reconciles: **currentBankroll $10,276.17 == daily final closing**; open exposure **$100** (Lane B); record **7–1–0–1**; high-water $10,376.17, max drawdown $100, win rate 88%. Each daily-summary row embeds its exact events; added exposure-by-sport + drawdown/high-water intelligence.
- **MoneyPath** (`ui/money-path.tsx`): large, high-contrast stake → return + paper profit + "Step N of 5"; variants settled/projected/lost/starting. Applied to Bank Builder lane steps + the restart card + Mr. Dub lanes.
- **Lane A public copy:** `RestartLaneCard` rewritten — "Lane A · survival · Step 1", a `$100 starting path` MoneyPath, "next qualified card", "this path starts at $100 while Lane B continues". No "fresh restart"/"failed"/"stopped"/"collapsed" on the public surface.
- **Mr. Dub nav:** added to the desktop nav (`nav.tsx`), sidebar (`command-rail.tsx`, glyph ⚗), and mobile bottom nav (`nav-active-route.ts` + a lab-flask glyph) as a 6th first-class tab.
- **MrDubAvatar** (`mr-dub/mr-dub-avatar.tsx`): first-party inline-SVG lab-coat scientist with goggles + ledger clipboard + lava flask, accessible (role=img + title). On the hero.
- **Mr. Dub page reorder:** (1) standings hero (avatar + bankroll/P-L/exposure/ROI/record), (2) Mr. Dub's Dual Bank Builder (both lanes with context), (3) **expandable daily ledger** (native `<details>` → each day's exact cards + P/L), (4) full ledger (newest-first), (5) exposure & bankroll intelligence (high-water/drawdown/win-rate/exposure-by-sport). Links to/from public Bank Builder.
- **Replacement candidate engine** (`build-replacement-candidates.mjs`): pre-generates not-started, odds-backed WC team-leg candidates per active lane's pending step (replace soccer, keep MLB), with `validUntil` = the partner's start time. Expires once EITHER leg starts → restart-only. Verified: pre-kickoff (18:30Z) Lane B = 2 candidates (Mexico DNB +152, $217→$548); now (19:14Z, Switzerland in-play) = 0 (restart-only).

## Full-site QA (Phase 10/12)
All routes 200: `/ /today /games /picks /parlays /build /bank-builder /mr-dub /results /world-cup /mlb /nba /ufc /methodology /about` + 4 WC game pages (built). Mr. Dub nav present (sidebar + desktop + mobile + BB link card, 6 `/mr-dub` hrefs). Bank Builder: natural Lane A copy (no "fresh restart"), MoneyPath readable, Lane B Goldschmidt active, crown intact. Mr. Dub: avatar, 4/4 sections ordered, 7 expandable `<details>`, drawdown/high-water, bankroll $10,276. No stale UFC active on Today. No console/dev errors.

## Guards
- Protected `public/data/bank-builder/*` untouched (read-only to seed Mr. Dub). No banned copy. tsc clean · **1031 app tests** · build OK (`/mr-dub` rendered) · copy/secret/protected audits clean.

## Honest limitations
- Lane B Step 2 still pending (Switzerland in-play, Goldschmidt 23:05Z) — tonight's settle advances/stops it. Lane A restart stays queued until the next qualified card.
- Replacement candidates currently expire (both lanes' legs started/in-play); the engine + tests prove pre-event generation. Exposure-by-sport is an even split across open legs (refines as cards settle).
