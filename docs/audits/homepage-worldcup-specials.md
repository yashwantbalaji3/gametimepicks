# June 19 — Homepage World Cup Specials (5 Moonshot-style WC parlays)

_Branch `homepage-worldcup-specials` off main `59570a1b`. Audit at 2026-06-19 22:17 UTC._

## Slate reality at generation time (22:17 UTC)
Four WC fixtures on today's slate; **only two are pre-event** — the rest have kicked off and are excluded (pre-event only, fail-closed):

| fixture | kickoff (UTC) | state | usable for Specials |
|---|---|---|---|
| USA vs Australia | 19:00Z | **started** | no (USA excluded per spec) |
| Scotland vs Morocco | 22:00Z | **started** | no |
| Brazil vs Haiti | 00:30Z (+1) | pre-event | **yes** |
| Turkey vs Paraguay | 03:00Z (+1) | pre-event | **yes** |

So every Special spans the two pre-event games (Brazil–Haiti + Turkey–Paraguay). "≥2 games where available" is satisfied (exactly 2 available). The honest diagnostic records the two excluded started games.

## Audit
| area | current state | issue | planned fix | success condition |
|---|---|---|---|---|
| homepage sections | `/today` (re-exported by `/`) has Quick actions → Engine summary → Today's Focus (WC) → Bank Builder rail → Mr. Dub → Suggested parlays → UFC → sport cards | no World Cup Specials feature box | add a `WorldCupSpecialsBox` section below Today's Focus, above the generic suggested cards | box renders 5 WC-only cards (or honest empty state) |
| WC player-prop pool | `world-cup/player-projections/latest.json` (192 props; 4 real markets) — adapter `loadWorldCupPlayerPropLegs` exists | not yet filtered to the strict Specials leg range (−250<odds<+200) or game-paired into Specials cards | new generator reads the feed, filters strict range + pre-event, pairs by game | 29 in-range player props across the 2 pre-event games |
| WC team-prop pool | `world-cup/projections/latest.json` (19 projections; moneyline/DC/totals/BTTS/DNB) | extreme favorites (Brazil ML −1100, DC −7000, Turkey DC −400) fall outside −250..+200 | generator filters to −250<odds<+200 | 6 in-range team legs across the 2 pre-event games |
| Moonshot active artifact | `moonshot-lane/active.json` (Step 1 +808: Morocco ML, Vinícius GS, Saibari GS, Turkey or Draw) | must NOT be mutated; Specials must not duplicate it exactly | generator excludes an exact match of the active Moonshot card; box reads its own snapshot only | artifact byte-identical; `active_moonshot_card_excluded` diagnostic present |
| Bank Builder active artifact | `methodology/launch/dual-bank-builder-active.json` (Lane A USA+Gonzales, Lane B Turkey-or-Draw+Hoskins) | must NOT be mutated; no exact-duplicate Special | generator excludes exact BB card matches; box never writes BB data | artifact byte-identical; `active_bank_builder_card_excluded` diagnostic present |
| Mr. Dub exposure | `mr-dub/portfolio.json` (core $297.88 / total $322.88) | must NOT change — Specials are suggested-only, not active exposure | box is presentation-only; no exposure write | portfolio byte-identical |
| generated cards | engine suggested cards live in `/parlays`/`/picks` | no dedicated 5-card WC Specials surface | snapshot `world-cup/world-cup-specials.json` + homepage box | snapshot has ≤5 cards, all constraints satisfied |
| homepage UI | Moonshot card uses moon/indigo accent | need a distinct WC/lava-gold treatment so Specials ≠ Moonshot ≠ Bank Builder | new component (gold/lava trophy styling), 5 stacked cards, drawers | visually distinct, premium, paper-only framing |
| mobile layout | homepage is `overflow-x-hidden`, cards stack | must keep no-overflow on the new box | single-column stack, `overflow` guarded, fixed-size avatars | no horizontal scroll added |

## Config (Phase 1)
`WORLD_CUP_SPECIALS_CONFIG`: count 5, stakePreview $10, combined odds (700, 3000) exclusive, leg odds (−250, +200) **exclusive** (reject −250/−251/+200/+201), ≥2 team props, ≥2 player props, ≥2 games per card, scope `world_cup`.

## Guards
- Real markets only — the 4 posted player markets (Anytime Goalscorer / Shots on Target / Assists / Shots) + posted team markets (ML / DC / total goals / BTTS / DNB). No fabricated "score or assist" combined market (feed has goalscorer + assists separately only). No fabricated "team first to score" (not in the feed).
- Pre-event only (start > now); started games excluded.
- Strict per-leg range −250<odds<+200 applied on top of the engine guards (−500..+1200).
- No mutation of Moonshot / Bank Builder / Mr. Dub active artifacts or protected `public/data/bank-builder/*`.
- Canonical/allowed copy only (no lock/safe/safest/guaranteed/guarantee/sure thing/free money/risk-free/can't miss). Allowed: World Cup Specials, high-volatility, Moonshot-style, odds-backed, paper-only, model-ranked, attacking props, team anchors, player upside, limited-data, market-implied, correlation-disclosed, official settlement, longshot.

## Inspiration-card reconciliation (do not copy blindly)
- "USA ML" / USA legs — **excluded** (USA started).
- "Balogun to score or assist" — **no such combined market** in the feed (goalscorer + assists are separate) → not fabricated.
- "Achraf Hakimi 1+ shots" — Morocco game **started**; not usable. Where shots props exist they use the exact posted label ("Shots" / "Shots on Target"), not renamed.
- "Brazil team first to score" — **not in the feed** → not fabricated.
- Strategy style reused (team anchors + attacking props + DC/totals/ML across multiple games), built from the real pre-event pool (Brazil–Haiti + Turkey–Paraguay).
