# End-to-end visual upgrade — Bank Builder centerpiece + sport identity

Date: 2026-06-11 · Branch: `bank-builder-visual-upgrade` · Base: `7c27ce6`

Launch-quality UI/UX polish pass with the Bank Builder experience as the
centerpiece, plus a reusable sport-identity layer adopted on the highest-traffic
surfaces. Presentation-only: no bankroll / ledger / settlement state was
mutated.

## Data-integrity proof (no mutation)

The public artifacts were byte-identical before and after this change:

| Artifact | Field | Value |
|---|---|---|
| `public-summary-latest.json` | currentBankrollUnits | **728.76** (unchanged) |
| | currentProgressionStep | **3** (unchanged) |
| | record | **2–0–0** (unchanged) |
| `public-ledger-latest.json` | nextPickStatus | **pending** (unchanged) |
| | entries | **2 settled** (unchanged) |

The official Step-3 World Cup card remains a *pending, presentation-derived*
candidate (Mexico ML + South Korea or Czechia DC, $728.76 → $1,423.64). It is
never written to the settled ledger.

## Audit answers (Phase 1)

1. **Where Bank Builder appears:** `/bank-builder` (full), `/today` (status
   module + official card), nav links. Home (`/`) re-exports `/today`.
2. **Old $2,000/$4,500 ladder in public UI:** none in the ladder render
   (config is Step 3 $700→$1,400, Step 4 $1,400→$3,500, Step 5 $3,500→$10,000).
   One stale caveat — `world-cup-flex-card.tsx` said "$2,000 ladder target" —
   **fixed** to "$1,400 ladder floor".
3. **Stale $444.19 in public UI:** none. All public surfaces read
   `loadPublicBankBuilderSummary()` ($728.76). The internal $444.19 summary is
   never shown publicly.
4. **Official WC card:** `/bank-builder` + `/today`.
5. **/today vs /bank-builder consistency:** both show $728.76 / Step 3 / pending
   / same WC candidate.
6. **Sport identity:** previously scattered — emoji hardcoded in 6+ components,
   CSS vars only for `--sport-all/mlb/nba/mixed`, no identity for soccer/UFC/
   NHL/IPL/bank_builder. Now centralised in `sport-identity.ts`.
7. **Assets:** no real team-logo / player-headshot image files exist (only the
   brand PNG). Country flags render via Unicode emoji (`FlagBadge`). No fake
   portraits were introduced — honest generic glyphs only.

## Before → after page structure (`/bank-builder`)

Unchanged section order (clean hierarchy preserved): Hero+KPIs → Ladder tower →
Run plan → Official Step-3 card → Previous hits → footer. What changed is the
*visual language*, not the information architecture.

- **Hero:** plain `PageHero` → decorative shell with a Bank Builder identity orb
  (🏦), soft pitch-grid motif (`.gtp-field-grid`), gold gradient wash, and an
  entrance fade. Eyebrow now "Paper ladder · current run".
- **KPIs:** Paper bankroll ($728.76, "Step 3 / 5"), Today's goal ($1,400 ·
  "from $700 · pending"), Today's card (Pending · "World Cup · Step 3"), Record
  (2–0).
- **Ladder tower:** added a breathing active-glow ring on the current rung and a
  soft emerald "completed" glow + ✓ on cleared rungs. Existing gold fill, "you
  are here" pulse, and staggered reveal kept.
- **Official card:** elevated — World Cup identity orb, per-leg **flag matchup**
  (real ISO codes from `teams.json` via `FlagBadge`; degrades to a monogram for
  unknown countries), market tags (`Double chance` / `Moneyline (90′)`), a `90′
  regulation` chip, a breathing `Pending result` chip, and an entrance fade.
- **Previous hits:** rewritten as compact, sport-identity cards (new
  `previous-hits.tsx`). Each shows the sport orb, real economics
  ($before → $after, +profit, combined American), the event ("NBA Finals Game
  4"), an "official result confirmed" chip, and a **player-free** leg summary
  (count + markets). Player names are intentionally never surfaced — see below.

## Previous-hits: real detail, no player names

The settled ledger carries player legs (Step 1 MLB, Step 2 NBA Finals). The
public cleanup explicitly bans player-name clutter (Seager/Hoerner et al.). We
resolve this by summarising legs as count + distinct markets only
(`bank-builder-previous-hits.ts` → `summarizePreviousHitLegs`), e.g.
"2-leg card · batter hits" and "2-leg same-game card · REB · PRA". This is an
honest omission (no fabrication) and is unit-tested against the real ledger so
no future edit can leak a name onto the page.

Real economics shown (not the rounded prompt values): Step 1 $100 → **$211.85**,
Step 2 $211.85 → **$728.76**.

## Sport identity system (`sport-identity.ts`)

`getSportIdentity(sport)` → `{ key, label, shortLabel, icon, accentVar,
gradient, ballLabel }`. Canonical keys: soccer (⚽), mlb (⚾), nba (🏀), ufc
(🥊), nhl (🏒), ipl (🏏), mixed (🔀), bank_builder (🏦). Aliases normalise the
many spellings (world_cup/fifa-world-cup/wc/mls/epl → soccer; wnba → nba; etc.);
unknown input degrades to the neutral `mixed` identity. The established
`--sport-mlb/nba/mixed` hues were **preserved**; new `--sport-soccer/ufc/nhl/
ipl/bank` vars were added in `globals.css`.

**Adopted now:** `/bank-builder` (hero orb, official-card orb + flag legs,
previous-hits orbs, tower), the shared `SportCard` (→ `/today` and `/sports`,
replacing a one-off `#3b82f6` MLB color). The system is importable everywhere
else for incremental adoption (see follow-ups).

## Animations / graphics added (CSS-first, all gated behind `prefers-reduced-motion`)

`.gtp-fade-up` (entrance), `.gtp-card-hover` (lift), `.gtp-pressable` (tap),
`.gtp-active-glow` (breathing ring), `.gtp-sport-orb` (gradient glyph badge),
`.gtp-progress-rail`, `.gtp-spark` (completed sparkle), `.gtp-field-grid`
(pitch motif). Reuse the existing `reveal-up` / `vault-pulse` keyframes where
possible. No animation library added (none exists; native CSS is the house
pattern).

## Routes touched / verified

- **Edited render:** `/bank-builder`, shared `SportCard` (→ `/today`, `/sports`).
- **Verified consistent (read public summary):** `/today` ($728.76, no $444.19).
- **Stale fix:** `world-cup-flex-card.tsx` ($2,000 → $1,400 floor).

## Tests / build / copy audit

- `npx tsc --noEmit`: clean.
- Test suite: **808 pass / 0 fail** (+11 new: sport-identity, previous-hits
  summary no-player-names, official-leg flag data).
- `npm run build`: clean static export.
- Copy audit: `/bank-builder` and `/today` page content clean; only the allowed
  site-wide "No guarantees" responsible-use footer remains.

## Honest limitations / follow-ups

- **No real logos/headshots exist**, so flags are Unicode emoji and previous
  hits use sport orbs, not team crests. If a logo/headshot asset pipeline is
  added later, `FlagBadge` / the orbs are the adoption points.
- **Sport identity is adopted on the command surfaces** (Bank Builder, the
  shared SportCard → /today + /sports). Full adoption on every sport-page hero,
  `/games` game cards, `/picks` filters, and fixture headers is available via
  `getSportIdentity` and is a low-risk incremental follow-up — not yet wired on
  those routes in this pass.
