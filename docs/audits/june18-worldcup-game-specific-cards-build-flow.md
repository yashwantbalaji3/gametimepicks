# June 18 — Engine game-specific cards on World Cup game pages + Build-from-game

_Branch `june18-worldcup-game-specific-cards-build-flow` off main `86c78c0c` (#520). ~13:51 ET._

## Diagnosis
| surface | source | game id used | cards available | visible before | mapping issue |
|---|---|---|---|---|---|
| `/parlays` Same-game tab | engine `gameSpecific` | leg eventId (per group) | 13 groups (8 MLB + 5 WC) | yes (in tab) | — |
| WC game page suggested cards | `normalizeWcCards(loadWorldCupParlays())` (native) | fixture label match | native (0 per game) | **0** | native cards not fixture-matched |
| WC game page | `getGameDetail` (`PublicGameDetail`) | Odds API matchId | team proj 5 + player props 24 | yes | matchId not exposed for mapping |
| `/build?game=` | `BuildExperience` (already reads query) | `gameId` | filters pool | **already works** | — |

- Engine game-specific WC groups (June 18, mid-afternoon): **5** — Switzerland (gameId `289bc2` hash), Canada team (`27` numeric), Mexico team (`28` numeric), Canada players (`fa9502` hash), Mexico players (`0f2aeae` hash). Czech started (16:00 UTC) → excluded.
- **Why game-page cards were 0:** engine same-game groups key on a MIX of Odds API hash + internal numeric matchId; the native card path didn't map them; `PublicGameDetail` didn't expose `matchId`.
- **Safest mapping:** match a group to a fixture by **(a) gameId === fixture matchId** (catches hash-keyed groups) **OR (b) a leg participant containing a fixture team name** (catches numeric-keyed groups, e.g. "Canada or Draw" → Canada–Qatar). Never leak to the wrong game.

## Changes
- `PublicGameDetail` gains `matchId`; `worldCupDetails` sets it.
- New `lib/world-cup/game-specific-cards.ts` — `getGameSpecificCardsForGame({matchId, homeTeam, awayTeam})` → engine same-game cards mapped to the fixture, bucketed by risk; emits a **group-scoped unique parlayId** (`<gameId>:<id>`) since the engine's same-game id omits the gameId (collides across games — latent bug worked around).
- The route computes engine cards (WC only) and passes them to `GameDetailPage`.
- `GameDetailPage` renders a **"Suggested parlays for this game"** section: engine cards by risk (Lower variance / Balanced / Higher return / Longshot) via the shared `ParlayCard` (visuals + expandable leg drawers), with an honest empty state + Build-from-game CTA when none. Native fixture cards kept as a secondary set.
- `BuildExperience` filter banner now reads **"Building from {game}"** (was generic); `/build?game=<id>` already filtered + has a clear button (verified).

## Verification (per fixture, mid-afternoon)
| fixture | engine cards | risk buckets |
|---|---|---|
| Czech vs South Africa | 0 (game started → honest empty) | — |
| Switzerland vs Bosnia | 3 | Balanced 3 |
| Canada vs Qatar | 3 | Balanced 3 |
| Mexico vs South Korea | 3 | Balanced 3 |

Built static HTML (`out/games/world-cup/canada-vs-qatar-2026-06-18/index.html`) confirms the section, Canada legs, engine markets, risk labels, and Build CTA render. (`next dev` 500s on SSG dynamic routes under `output: export` — a dev-only quirk; the static build renders them.)

## Guards
- **Bank Builder Step 2 untouched** (Czech ML + Josh Bell; Switzerland ML + Goldschmidt); protected `public/data/bank-builder/*` untouched; no data files changed.
- No fabrication — only real engine cards, matched by id/team. tsc clean · **1023 app tests** (matcher: correct fixture, no leak, empty-state) · build OK (all WC game routes rendered) · copy/secret/protected audits clean.

## Honest limitation
Only Balanced (medium) engine cards exist today, so Lower-variance/Higher-return/Longshot buckets show honest empty states. Player-prop same-game cards exist for Canada/Mexico (hash-keyed) and are attributed correctly.
