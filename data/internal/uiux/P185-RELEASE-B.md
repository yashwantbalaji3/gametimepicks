# Program 185 · Release B1/B2 — the design-system conversion train

PRIVATE_INTERNAL. Derived from `scripts/uiux/baseline.mjs`; every number here is reproducible by
running it. Nothing in this file is exported to the public site.

## What moved

| measure | P184 | after B1/B2 | delta |
|---|---|---|---|
| raw colour literals | 1,616 | 1,464 | **−152** |
| files carrying literals | 266 | 264 | −2 |
| semantic tokens declared | 143 | 164 | +21 |
| suite | 4,564 / 0 | 4,571 / 0 | +7 tests |

Ratchet ceilings lowered in the same commit as the migration, per the charter.

## The scanner was wrong a third time, in the same way

P184 recorded two scanner corrections (JSX-only `href=` matching, redirects miscounted as orphans).
A third is recorded here, because a flat count of every hex in every `.tsx` named four worst
offenders and **two of them should never be migrated at all**:

| P184 named offender | count | verdict |
|---|---|---|
| `team-badge.tsx` | 72 | **identity data.** 68 of 72 are team brand colours. `#003087` is a fact about the Yankees, not a theme value — migrating it destroys team identity. Real drift: 4. |
| `game-detail-page.tsx` | 46 | genuine, reachable — migrated |
| `dual-ladder-board.tsx` | 44 | **unreachable.** `DualLadderBoard` was deliberately removed from `/bank-builder` and `bank-builder-cross-lane.test.mjs` asserts it stays removed. Migrating it changes nothing a user can see. |
| `mlb-simulation-report-v2.tsx` | 40 | genuine, reachable — migrated |

`bank-builder-preview-panel.tsx` (35), the next candidate, is imported only by `dual-ladder-board`
and is therefore also unreachable.

This is the same failure mode as the first orphan list: a count that ignores a boundary invites a
change that is actively wrong. The boundaries are now in the scanner and pinned by tests.

## The count is now split three ways

    themeDrift      1,367   literals that SHOULD be a semantic token   (migrate these)
      · reachable     959   on a live route — the number that matters
      · unreachable   408   in components no route can pull in
    identityData       89   a team's/club's own brand colour           (never migrate; relocate)
    maskStops           8   #000 as a mask alpha stop — not a colour

All three are pinned in `token-ratchet.test.mjs`. Reclassifying a literal cannot lower any ceiling,
because the class it moves *into* is pinned too. Four corruption probes confirm it:

| probe | result |
|---|---|
| A · new literal in a live component | 3 tests fail |
| B · new literal in an unreachable component | 2 tests fail |
| C · literal disguised as identity data | 2 tests fail |
| D · literal disguised as a mask stop | 2 tests fail |

## What was actually migrated

Ranked by the charter's own rule — literal count x route reach x user visibility:

| file | drift removed | route |
|---|---|---|
| `game/game-detail-page.tsx` | 46 → 2 | `/games/[sport]/[gameId]` |
| `game/mlb-simulation-report-v2.tsx` | 40 → 0 | game report |
| `game/simulation-animation.tsx` | 33 → 2 | game report |
| `parlays/parlays-explorer.tsx` | 28 → 0 | `/build` |
| `team-badge.tsx` | 4 → 0 (68 identity untouched) | sitewide |
| `cricket-team-badge.tsx` | 5 → 0 (21 identity untouched) | sitewide |

The residual 2+2 are `#000` mask stops, which are alpha values and correctly excluded.

## Why this migration is pixel-identical by construction

Not one token per literal — that is the "wrapper token whose value is another unexplained raw
colour" the charter forbids. One token per HUE, with the alpha at the call site:

    rgba(52, 211, 153, 0.18)
      -> color-mix(in srgb, var(--vault-accent) 18%, transparent)

`color-mix(in srgb, C p%, transparent)` premultiplies to alpha = p and colour = C, so the two are
exactly equal. Verified as computed values in the browser rather than by eye, and pinned by
`e2e/p185-color-mix.spec.ts` on **all three engines** — a colour-mix failure in one engine would
render those card surfaces fully transparent, so this is a real risk, now guarded:

    accent 18%  -> color(srgb 0.203922 0.827451 0.6 / 0.18)  == rgb(52,211,153) @ .18
    wash 5%     -> color(srgb 1 1 1 / 0.05)                  == rgb(255,255,255) @ .05
    ink 45%     -> color(srgb 0 0 0 / 0.45)                  == rgb(0,0,0) @ .45

Chromium, WebKit and Firefox all pass.

## Names now describe meaning

`--vault-gold-bright` held `#34D399` and is documented in `globals.css` as "the site-wide ACCENT".
A token whose name says gold and whose value is green is how a red/black/gold premise survives into
a green/black product. `--vault-accent` is the honest name; the old name is now a **proven-identical
alias** (`var(--vault-accent)`, and mirrored in the `.gtp-canvas` light scope) so no consumer
breaks and no sweeping rename was needed.

`lava-theme-tokens.test.mjs` pinned this by literal string. It was repointed to the new wiring and
made **stricter**, not weaker: it now asserts both that `--vault-accent` is `#34D399` and that
`--vault-gold-bright` resolves to it. Two probes confirm — repointing the alias fails, and changing
the accent's value fails.

## Named but NOT merged — deliberately

Five legacy hues are still distinct values. They are now named tokens rather than anonymous
literals, because merging them changes pixels and a pixel change needs a screenshot review this
migration deliberately did not smuggle in:

    --vault-scrim-warm      #0F0A07   brown-black scrim from the red/black era
    --vault-scrim-navy      #161E3E   NAVY gradient head, game report hero (conditional branch)
    --vault-accent-signal   #34A853   simulation-arc green
    --vault-accent-muted    #46825A   muted lane green
    --vault-accent-mint-deep #6EE7A8  second mint, 16/255 from --vault-accent-mint

`--vault-scrim-navy` is the notable one: a navy gradient on a green/black product is the stale
pre-green premise surviving as a literal. It did not render on the game inspected, so it was named
and ticketed rather than changed blind.

## Verification

- typecheck clean from a cleared `.next` (stale `.next` produces phantom errors in this repo)
- production build green; 253 exported HTML files
- suite 4,571 / 0 failures, run serially
- browser: game report + `/build` at 1280x800 and 390x844 on the BUILT export; zero console errors;
  no horizontal page scroll (`scrollWidth == clientWidth`)

## Open, recorded rather than silently dropped

1. Unify the five legacy hues above, each with before/after screenshots and a contrast check.
2. Mobile bottom nav clips its last label at 390px ("MR. DUB'S"). The page does not scroll
   horizontally — the overflow is inside the nav strip. Release C scope.
3. 408 drift literals sit in unreachable components. Classify before migrating: a component no
   route can reach is either dead code to retire deliberately or a wiring defect. Neither is fixed
   by recolouring it.

---

# Release B3 — status/badge and game/simulation clusters

Migrated by cluster rather than by file count, per the charter.

| measure | after B2 | after B3 | delta |
|---|---|---|---|
| raw colour literals | 1,464 | 1,356 | **−108** |
| theme drift | 1,367 | 1,259 | −108 |
| · on live routes | 959 | 851 | −108 |
| files carrying literals | 264 | 259 | −5 |
| semantic tokens | 164 | 170 | +6 |

Cumulative from the P184 baseline: **1,616 → 1,356, −260 literals (−16.1%)**.

| cluster | files | drift removed |
|---|---|---|
| status / badges | `board-date-status-banner`, `mlb/mlb-lean-row`, `status-pill` | 56 |
| game / simulation | `game/mlb-full-game-report`, `game/game-simulation-runner`, `game/wc-game-lab-report` | 52 |

## A role the product used but never named

The status cluster carried an **informational blue** (`#78AFFF`, `#AACDFF`) as raw literals on
status banners and pills. The charter lists "informational" among the semantic roles a token layer
must cover; the product had the role in use and no token for it. Now `--vault-info` /
`--vault-info-bright`.

## Near-duplicate hues were measured, not eyeballed

The obvious move in this cluster was to fold `#F5C35F` into `--vault-warn` (`#F0C75E`) and
`#D6A945` into `--vault-crown` (`#D9A441`) — they look like the same colour typed twice. They are
not. CIEDE2000 against the nearest canonical token, where dE < 1.0 is the threshold for "not
perceptible to the human eye":

| pair | dE | verdict |
|---|---|---|
| `#F5C35F` vs `--vault-warn` | 2.87 | visible |
| `#D6A945` vs `--vault-crown` | 2.54 | visible |
| `#7EE2A8` vs `#6EE7A8` | 2.10 | visible |
| `#34A853` vs `--vault-accent-deep` | 5.62 | visible |
| `#0A0604` vs `--vault-scrim-base` | 5.70 | visible |
| `#46825A` vs `--vault-accent-deep` | 10.69 | visible |
| `#06091A` vs `--vault-scrim-base` | 11.69 | visible |
| `--vault-success` vs `--vault-accent` | 7.28 | visible |

**Not one candidate clears the threshold.** Every merge that looked free is a visible change owing a
screenshot review. So all of them were named and migrated pixel-identically, and none were folded.
This is the measurement that turns "close enough" from a judgement into a number.

## More stale fallbacks removed

`var(--token, #fallback)` where the token is defined: the fallback is dead code, and in this repo it
had drifted to a *different colour than the token it backs up*:

    var(--vault-warn, #ea580c)          token is #F0C75E (gold) — fallback is ORANGE
    var(--vault-success, #7ee2a8)       token is #4ADE80        — fallback is a different mint
    var(--gtp-success-on-dark, #7ee2a8) token is #6EE7A8        — fallback is a different mint
    var(--vault-gold-bright, #d9a441)   token is #34D399 (green)— fallback is GOLD
    var(--lava-panel, #14100c)          token is #0F1512 (green-black) — fallback is BROWN-black

Every one is a snapshot of a palette the product has since left. None could ever render, so removing
them changes nothing and deletes a trap for the next reader.

---

# Release B4 — ladders/products and Mr. Dub, and a fourth boundary

| measure | after B3 | after B4 | delta |
|---|---|---|---|
| raw colour literals | 1,356 | 1,278 | **−78** |
| theme drift | 1,259 | 1,174 | −85 |
| · on live routes | 851 | 766 | −85 |
| files carrying literals | 259 | 255 | −4 |
| semantic tokens | 170 | 176 | +6 |

Cumulative from the P184 baseline: **1,616 → 1,278, −338 literals (−20.9%)**.
Live-route drift, the number that matters: **−193 since the split was introduced.**

`vertical-ladder-climb`, `moonshot/ladder-v2` and `ladders/product-lanes-ladder` are now at **zero**
raw literals.

## ILLUSTRATION ART — the fourth boundary

Found the same way as the first three. `mr-dub/mr-dub-avatar.tsx` is a first-party inline-SVG
character mark. Its literals are:

    #f2d3a8   skin tone        #3a2a1a   hair
    #f4f6f8   lab coat         #e9edf1   goggles       #1a120c   clipboard

An SVG presentation attribute carrying a raw hex is a **drawing instruction**. Migrating it to a
semantic token recolours the mascot — the same category of wrong as theming the Yankees' navy. Art
that *should* follow the theme already uses `currentColor` or a `var()`, so the rule does not catch
it. Now counted as `illustrationArt` (7), pinned, and probe-tested: a literal disguised as an SVG
fill fails the ratchet.

That makes four classes the flat count conflated:

    themeDrift        migrate           1,174  (766 reachable)
    identityData      never migrate        89
    maskStops         not a colour          8
    illustrationArt   not themeable         7

## Moonshot is a scale, not drift

`#B9A8FF` / `#A99BF5` / `#8B7BF0` / `#6D5FD0` / `#7C4DFF` read like one purple typed five ways. They
are 10–13 dE apart — that is deliberate structure (text / soft / borders / gradient anchors), so
they became a named product scale rather than a merge target.

| pair | dE |
|---|---|
| `#8B7BF0` vs `#B9A8FF` | 13.52 |
| `#7C4DFF` vs `#8B7BF0` | 12.37 |
| `#6D5FD0` vs `#8B7BF0` | 10.84 |
| `#E7B15A` vs `--vault-crown` | 4.11 |
| `#120A07` vs `--vault-scrim-warm` | 1.52 |

## A brand defect found, named, not changed blind

`mr-dub-avatar.tsx` says in its own docstring that it is drawn "in GameTime Picks **lava** colors",
and its badge ring is still a **red → gold** gradient (`rgba(225,29,42,.30)` → `rgba(212,175,55,.18)`)
on a green/black product. Its two `var()` fallbacks pointed at the same retired palette
(`var(--gtp-bank-heat,#e11d2a)` — token is green, fallback is RED). The dead fallbacks are removed;
the ring itself is a visible change and is ticketed, not altered under cover of a token migration.

---

# Release C — global shell and navigation presentation

The P184 baseline said navigation was "substantially healthy" and told this release to improve
presentation rather than manufacture a rewrite. That held: the route graph needed no restructuring.
What it did need was the two things the graph cannot see.

## 1 · The footer was the last surface off the canonical list

P196 put the top nav, command rail and mobile bar on one destination registry
(`src/lib/navigation.ts`) precisely because three hand-maintained lists had drifted into different
products. **The footer was never migrated**, and it had drifted the same way — while labelled
`aria-label="Site map"`:

| omitted from the "sitemap" | what it is |
|---|---|
| `/ufc` | **a LIVE sport** |
| `/epl` | a live schedule hub |
| `/moonshot` | a paper product |
| `/homer-nukes` | a paper product |
| `/mr-dub` | the bankroll journey |

A footer that promises a sitemap and lists two thirds of the site is worse than no footer, because
it reads as the complete answer.

Its own comment justified the short Coverage column — *"a link that promises future coverage is
still a promise"* — and that reasoning is right, but it is about **schedule-only leagues with no
public destinations** (NHL, IPL, WNBA, MLS). It never justified omitting sports that have real live
hubs. Adding them completes the footer's stated principle rather than overriding it.

The footer now derives from `destinationsFor("footer")`, grouped by the registry's own four
questions, so the footer, the rail and the top nav describe one site. Five footer-only destinations
(`/market-guide`, `/research`, `/responsible-use`, `/results/model-audit`, `/results/nba`) joined the
registry rather than staying hand-listed — leaving them out is how the drift started.

Two guards added: the "surfaces are DERIVED" test now covers `footer.tsx`, and a new test fails if
any canonical destination is missing from the sitemap.

## 2 · The mobile bar clipped its last label, and no gate could see it

Measured at 390px on the built export:

    bar overflow          75px
    "MR. DUB'S PORTFOLIO" 132px rendered, against a 58px basis  ← 74 of the 75px
    "BANK BUILDER"         84px
    tap targets            48px  (passing)

The trailing label sat **permanently half-cut behind a hidden scrollbar** (`scrollbarWidth: none`).
An affordance nobody can see is not an affordance.

Every existing gate missed it, and each for a good reason: the page does **not** scroll horizontally
(the bar is its own scroll container, so `scrollWidth == clientWidth` on the document), the
structural a11y audit checks names and roles rather than geometry, and unit tests cannot measure
pixels. It took a viewport measurement.

**The abbreviation had existed and was silently lost.** `nav-active-route.ts` still documents
*"'Bank' is abbreviated for thumb-width"* — the hand-written list had it. When P196 derived the bar
from the registry it took `label` verbatim and undid it, and the comment describing the intent
survived while the behaviour did not.

So `shortLabel` now lives in the registry: `Bank Builder → Bank`, `Mr. Dub's Portfolio → Mr. Dub`.
The **accessible name stays the full label** — WCAG 2.5.3 (Label in Name) requires the visible text
to appear within the accessible name, or a voice-control user saying what they can see would not
match the control. A guard asserts the short form is always a substring of the real one.

Three guards added, and `e2e/p185-shell.spec.ts` asserts the real thing at real viewports:
bar fits at 360 and 390, tap targets clear 44px, visible label ⊂ accessible name, the rendered
sitemap carries every live sport and product, and no page scrolls horizontally at 360/390/768/1280/1440.

## 3 · The one dead link, and the worse half of it

`/nba/board` — a live CTA in `homepage-sports-rail.tsx` reading **"Open NBA projections"**. The
route was retired with `/nba/power` when NBA became `HISTORICAL_ONLY`: the source has been failing
since 2026-06-13 and there is no live projection capability.

The broken href was the *lesser* defect. A working link to a live-looking NBA hub would have been a
bigger lie than a 404. Both halves fixed: `→ /results/nba`, "See NBA settled results".

**Dead links: 1 → 0.**

## 4 · The first viewport said "educational" twice

`DisclaimerBanner` renders globally in `app/layout.tsx`. `slate-status-bar` added
"Paper-only · educational" about forty pixels below it — so the first viewport said it twice before
saying anything about tonight's games. The status-bar copy is dropped; the framing is not weakened
(still global, still above every page, still repeated in context on every product surface that makes
a claim). This is the same call `previous-hits.tsx` already made when it dropped a per-rung
"· paper-only tracking" under a page that already opened with it.

## 5 · Not removed — two theme islands

Release C lists "remove legacy theme islands". `.gtp-canvas` (a full warm light reading surface) and
`[data-theme="premium-gold"]` have **zero opt-ins**. They were left in place anyway: the same charter
says to preserve capability and to STOP for "destructive capability removal without parity", and a
light reading theme is latent capability rather than dead decoration. Ticketed for an owner's call.

## Acceptance

| gate | result |
|---|---|
| route graph reconciled | 55 routes, 47 exported, unchanged |
| dead links | **1 → 0** |
| orphans | 4, all internal (`/launch`, `/ops`, `/preview/*`) — correct |
| redirects one hop | 15/15, no chains |
| internal leak | `/launch`, `/ops`, `/preview` pruned from export |
| surfaces derived | 4/4 (top, rail, mobile, **footer**) |

---

# Release D — Home, Today, Simulate and game reports

The charter's sharpest rule for this release: *"Simulation Hub shows only sports with active current
simulations. Schedule-only, archive-only and off-season sports remain discoverable under
Sports/Schedules and cannot look active through visual polish."* Tested against the built export,
two surfaces failed it — and both failed the same way P179 had already diagnosed for the NFL badge:
**ARTIFACT_READY is not SIMULATION_READY.**

## 1 · The hub called a schedule "active"

Rendered on `/simulate` before this release:

    2 sports live · 15 simulation-ready · 30 games across 2 sports
    ⚾ MLB  active  15 games · 15 ready
    🏈 NFL  active  15 games                    ← same word, zero ready

Every one of those fifteen NFL games was `BASELINE ONLY` — scheduled, with no event-specific signal.

The source made the intent explicit and the code did not enforce it. The comment reads *"NFL: active
ONLY when the canonical eligible set carries simulations"*; the condition was `nflRows.length > 0`,
which is true for a slate of games that are all baseline. **The same failure shape as the mobile
bar: a comment describing an invariant the code had stopped honouring.**

The state word now follows the READY count. NFL keeps its games, its note and its place on the
board — it stops claiming a kind of readiness it does not have:

    1 sport simulating · 15 simulation-ready · 30 games across 2 sports
    ⚾ MLB  active         15 games · 15 ready
    🏈 NFL  baseline only  15 games

`activeSports` (sports with a row) also backed the headline chip "2 sports live" beside "15
simulation-ready" — a pairing that invites reading the other sport's games as *pending* rather than
as a different product. The chip now counts sports that are actually simulating.

## 2 · The homepage overstated availability by 2x

    "30 games simulation-ready today"        ← rendered on 2026-08-18

Only 15 were. The 30 was `readyCount`, which the selector's own documentation defines as *"the total
featurable count for honest '+N more' copy"*. That number is right for the sentence it was built
for and wrong for this one, on **two** independent axes:

| | |
|---|---|
| it spans current **and upcoming** | the other 15 were NFL games on **Aug 22**, four days out |
| it counts market-implied cards as simulations | correct for "+N more below", not for a run-count claim |

A pool size is not an availability claim. `simulationsToday` is now a separate number requiring
*both* `mode === "simulation"` and `date === today`, and the hero reads it. **30 → 15.**

## Guards

`simulate-lobby-honesty.test.mjs`, five tests, comments stripped before scanning (this repo has hit
the denial trap repeatedly — reading prose that describes a refusal as though it performed it):

- a sport's state word is derived from its ready count, never its row count
- the headline counts sports that are SIMULATING, filtered by `simReady`
- the built page renders no "sports live" count
- a sentence containing "today" is backed by `simulationsToday`, which requires both conditions
- the built homepage may not claim more simulation-ready games than the built hub counts

The last two read the BUILT export, because "file exists" is not "page says".

---

# RESUME ARTIFACT — exact state at the end of this session

## Where the numbers stand

| measure | P184 baseline | now | delta |
|---|---|---|---|
| raw colour literals | 1,616 | **1,276** | **−340 (−21.0%)** |
| · theme drift | *(unsplit)* | 1,172 | — |
| ·· **on live routes** | *(unmeasured)* | **764** | the number that matters |
| ·· unreachable | *(unmeasured)* | 408 | do not migrate — adjudicate |
| · identity data | *(counted as drift)* | 89 | never migrate |
| · mask stops | *(counted as drift)* | 8 | not colours |
| · illustration art | *(counted as drift)* | 7 | not themeable |
| files carrying literals | 266 | 255 | −11 |
| semantic tokens | 143 | 176 | +33 |
| dead links | 1 | **0** | closed |
| nav surfaces on the canonical list | 3 of 4 | **4 of 4** | footer joined |
| suite | 4,564 / 0 | **4,580 / 0** | +16 tests |

## Releases shipped

| # | release | commit |
|---|---|---|
| 1 | B1/B2 — hue contract + four-offender proving batch | `3f055abf7` |
| 2 | B3 — status/badge + game/simulation clusters | `739f2999f` |
| 3 | B4 — ladders/products + illustration boundary | `dfaa4e8a8` |
| 4 | C — global shell and navigation presentation | `a87f211ba` |
| 5 | D — Home / Simulate availability truth | `42a0856b4` |

## Start here next session

1. Run `node scripts/uiux/baseline.mjs`. Compare to the table above; explain any movement.
2. Run `npx tsx --test $(find src -name '*.test.mjs')` **serially**. Read `# fail`, not the exit code.
3. `designSystem.migrationQueue` in the artifact is the ranked, REACHABLE work — it already
   excludes dead components, identity data, mask stops and illustration art.

Top of that queue: `game/mlb-game-lab-report` (14), `mlb/mlb-game-section` (14),
`world-cup/structured-moonshot-section` (14), `board-date-rail` (13), `games/simulate-lobby` (13),
`mlb/props-board` (13), `nav` (13). Every reachable offender **above 16** is already migrated.

## Releases not started

E (Market Center / Build) · F (products, portfolio, Results) · G (sport hubs) · H (Learn, trust,
support) · I (protected operator console) · J (cross-site assurance).

## Open, recorded rather than silently dropped

1. **408 drift literals in unreachable components.** Each needs a retire-or-rewire decision, not a
   recolour. `DualLadderBoard` (44) was deliberately removed from `/bank-builder` and a test asserts
   it stays removed; removing the component must repoint that guard, never weaken it.
2. **Two theme islands with zero opt-ins** — `.gtp-canvas`, `[data-theme="premium-gold"]`. Release C
   lists "remove legacy theme islands", but the same charter stops for capability removal without
   parity, and a light reading theme is latent capability. Owner's call: retire or adopt.
3. **Five legacy hues named but not merged** — every candidate measured 1.5–13.5 dE against its
   nearest canonical token, and dE < 1.0 is the imperceptibility threshold. Each merge is a visible
   change owing a screenshot review.
4. `--vault-scrim-navy` (#161E3E) is live on a **conditional branch** of the game report hero that
   did not render on the game inspected. Find the state that renders it before deciding.

## Method notes worth keeping

- **Migrate with one token per HUE plus `color-mix()` at the call site**, never one token per
  literal. `color-mix(in srgb, C p%, transparent)` is exactly `rgba(C, p/100)`, so the migration is
  pixel-identical by construction. Guarded on all three engines by `e2e/p185-color-mix.spec.ts`.
- **Measure CIEDE2000 before merging two hues.** Every "obviously the same colour" pair in this
  repo failed the test.
- **Strip comments before scanning source.** This repo's own guards say it has hit that trap
  repeatedly; two more were added this session that would have tripped it.
- **A guard that fails after a real improvement gets repointed, not deleted** — and usually ends up
  stronger. Seven did this session. One of them (`legacy-route-hiding`) caught a genuine regression.
- **Assert against the BUILT export where the claim is about what a visitor sees.** "File exists" is
  not "page says".
