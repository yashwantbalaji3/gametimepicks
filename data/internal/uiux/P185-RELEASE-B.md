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
---

# Release E — Market Center and Build

Most of what this release asks for was **already there and was left alone.** Market Center already
opens by naming what each market can honestly show ("both sides, one side, or neither"), already
labels rows `Model + market` / `Market only`, already renders a zero as a named answer — *"No ranked
picks for 2026-08-18. That is the model's answer for this slate, not a missing update."* — and
already carries a glossary covering every term on the page. Build already explains each empty tier
in its own words (*"every card in this tier reused a leg already on the ladder, or ran past the
five-leg cap"*). The charter says to preserve what works; two things did not.

## 1 · The beginner comparison was one click away, at every viewport

`how-to-read-markets.tsx` rendered as a single `<details>` with **no `open` attribute**. Its own
file header says *"The worked example is the important part"* — and it was closed by default on
desktop and mobile alike, together with the **only definition of `pp`** on a page where every
difference cell renders a `pp` figure.

The charter is explicit on both counts: the page must "open with a beginner comparison", and must
not "leave unexplained 'pts' or columns". A collapsed disclosure fails the same way hover does — the
reader has to already know to go looking.

P141's density reasoning is preserved rather than argued with: **the full glossary stays collapsed**,
so a returning reader still pays nothing for it. What moved out is the one sentence that makes the
column legible, with the unit folded into it:

    model 58.6% − market 66.6% = −8.0 pp
    … the model is 8.0 percentage points lower than the market here — pp is the gap between two
    percentages, not scoring points.

Verified in the export by document order: the example now sits at byte 32,214 and the first
`<details>` at 33,036.

## 2 · A page header that described one section of the page

`/build` derived **both** its status badge and its count chip from `pool` — the **advanced
builder's** gated leg pool. That pool is legitimately empty on a slate where nothing clears the
suggested-card gates, and the advanced builder says exactly that further down the page.

Read at page level it badged the whole surface **"Data pending"** and printed **"0 Eligible legs"**
directly above a risk ladder rendering **seven real legs across two tiers**. The reader is told the
page is empty while looking at its cards.

This is the same shape as both Release D findings: a number built for one scope, reused for a
broader claim.

| | before | after |
|---|---|---|
| status | `pool.length > 0 ? pregame : data_pending` | also considers the ladder's own card count |
| chip | `Eligible legs` (page-level verdict) | `Advanced-builder legs` + `Suggested cards` |

"Data pending" is now **absent** from the built page, and the advanced builder keeps its own honest
empty state — which was always the right place for that fact.

## Guards

`reading-key-visibility.test.mjs` (4) and `build-header-scope.test.mjs` (3), comments stripped
before scanning. Two assert against the BUILT export, including one checking the worked example
precedes the first `<details>` in document order — `<details>` content is in the HTML whether open
or closed, so a naive grep cannot tell the difference.

---

# Release F — products, portfolio, Results

Most of this release was **already true and was left alone**, and one thing I nearly "fixed" was
correct by design.

## Verified rather than changed

- Bank Builder opens with *"No qualified card today — Today's slate was checked in full and nothing
  met the card's qualification policy. No card is published rather than forcing one."*
- Moonshot states its own lifetime record as **0–7**: *"every Moonshot card settled so far has
  lost … published as a transparent record of a high-variance approach that has not worked."*
- Homer Nukes: *"this is a list, not a parlay. A 30% pick that does not land is the model behaving
  as described."*
- Results keeps pending / settled / exposure distinct and says *"a pending card is never counted as
  a loss."*
- The charter's "remove vague 'paused for days' copy" found nothing on a reachable surface. The one
  live "paused" string is cycle-scoped with a reason.

**The near-miss.** `/mr-dub` shows *"Latest settlement · 42 days ago"* beside *"No qualified card
today"*, which looks like a stale product next to a site that settled through Aug 17. It is not:
P144 built that pairing deliberately — the badge is the **protected history** (the last official
grading of the $100→$10K journey) and the second marker is **current operations**. That is exactly
the charter's *"current operations separate from protected history"*. This is money-adjacent display
logic and it was verified before touching, not after.

## The real finding: a receipt that hid its own outcome

Measured across five viewports and seven product routes on the built export. Page-level horizontal
scroll: **clean everywhere**. Inner clipping told a different story:

    /results/ @360   a settled receipt hid 240px
    /results/ @390   the same row hid ~111px

The row is `player · matchup · market/threshold · final result`, and `· final N` is the **last
child** — so it is the first thing `truncate` removes. On the record page, at phone width, the
settlement outcome was the part that disappeared:

    "Jackson Merrill · SD vs NYM · Hits + Runs + RBIs Over 1.5 · final 1"
     └──────────────── visible ────────────────┘└─── hidden ───┘

Fixed in `risk-section-drilldown.tsx` (and the same pattern in `settled-player-accordion.tsx`) by
making truncation apply from `sm` up and letting the row **wrap** below it. Truncation is still
right once the line fits; it is not right when it eats the result.

## Two mistakes worth recording

1. **I fixed the wrong component first.** `settled-player-accordion.tsx` had the same defect and was
   worth fixing, but it was not the row rendering on `/results` — the DOM path showed a `<span>`
   inside an `<li>`, and I had edited a `<div>`. A rebuild proved it: still 240px. The lesson is the
   one this session keeps relearning — locate against the rendered DOM, not against a plausible
   source match.
2. **My first guard passed for the wrong reason.** It queried `div.font-mono` while the real element
   is a `span`, so it went green against an export that still had the defect. Widening the selector
   made it fail correctly at 240px. A guard that has never failed against the bug it describes has
   not been tested.

Then it over-caught: matching any dot-separated mono text flagged an internal audit label
(`AUDIT SIGNAL · MARKET:BATTER_TOTAL_BASES`, 146px) — real truncation, but not the claim the test
makes. The assertion now names its invariant exactly: **a row that reports how something settled may
not hide the settlement.**

`e2e/p185-product-viewports.spec.ts` — 6 tests: no horizontal scroll on five product routes at
360/390/768/1280/1440, plus the settlement-line rule at both phone widths.


---

# RESUME ARTIFACT — exact state at the end of this session

## Numbers

| measure | P184 baseline | now |
|---|---|---|
| raw colour literals | 1,616 | **1,276** (−21.0%) |
| · theme drift on LIVE routes | *unmeasured* | **764** |
| · drift in unreachable components | *unmeasured* | 408 — adjudicate, do not migrate |
| · identity data / mask stops / illustration art | *counted as drift* | 89 / 8 / 7 — never migrate |
| files carrying literals | 266 | 255 |
| semantic tokens | 143 | 176 |
| dead links | 1 | **0** |
| nav surfaces on the canonical list | 3 of 4 | **4 of 4** |
| suite | 4,564 / 0 | **4,587 / 0** |

## Releases shipped

| # | release | commit |
|---|---|---|
| 1 | B1/B2 — hue contract + four-offender proving batch | `3f055abf7` |
| 2 | B3 — status/badge + game/simulation clusters | `739f2999f` |
| 3 | B4 — ladders/products + illustration boundary | `dfaa4e8a8` |
| 4 | C — global shell and navigation presentation | `a87f211ba` |
| 5 | D — Home / Simulate availability truth | `42a0856b4` |
| 6 | E — Market Center reading key + Build header scope | `a1c426095` |
| 7 | F — settled receipts keep their outcome on a phone | `13a92671a` |
| 8 | G — the schedules directory stops overclaiming absence | `55dc07e93` |
| 9 | H — learn/trust cluster audited, nothing to fix | `a3d1f6504` |
| 10 | I — UI/UX audit rendered on the operator console | `f625616b4` |

## Not started

**J** cross-site assurance and reset.

Release I shipped the part the charter names specifically — the UI/UX evidence the console was
missing. Its fuller ask (filterable, drillable cards with owner, priority, dependency, age and
acceptance test; completion percentages derived from receipts) is a larger build on the existing
work board and was not attempted.

**The boundary I and J share, verified** is the public/private boundary they share, because it
is a P0 and the check is cheap:

    /launch   present in source · ABSENT from out/ · noindex
    /ops      present in source · ABSENT from out/ · noindex
    /preview  present in source · ABSENT from out/

Capability intact, export clean. `prune-internal-routes.mjs` runs in the build and reports what it
removed on every run.

## Start here

1. `node scripts/uiux/baseline.mjs` — compare to the table; explain any movement.
2. `npx tsx --test $(find src -name '*.test.mjs')` **serially**. Read `# fail`, not the exit code.
3. `designSystem.migrationQueue` is the ranked REACHABLE work — already excludes dead components,
   identity data, mask stops and illustration art. Every reachable offender above 16 is migrated.
   Next: `game/mlb-game-lab-report` (14), `mlb/mlb-game-section` (14),
   `world-cup/structured-moonshot-section` (14), `board-date-rail` (13), `nav` (13).

## Open, recorded rather than dropped

1. **408 drift literals in unreachable components** — retire-or-rewire per component, not a
   recolour. `DualLadderBoard` (44) is guarded as removed; deleting it must repoint that guard.
2. **Two theme islands with zero opt-ins** (`.gtp-canvas`, `[data-theme="premium-gold"]`) — the
   charter says remove legacy islands AND stops for capability removal without parity. Owner's call.
3. **Five legacy hues named but not merged** — every pair measured 1.5–13.5 dE against its nearest
   token; dE < 1.0 is the imperceptibility threshold. Each merge owes a screenshot review.
4. `--vault-scrim-navy` (#161E3E) sits on a **conditional branch** of the game-report hero that did
   not render on the game inspected. Find the state that renders it first.
5. **UFC's sport gate disagrees with what /ufc publishes.** The directory calls it SCHEDULE_ONLY
   because its gate says so; the hub publishes a trained three-market model. P185 fixed the false
   *sentence* and deliberately did NOT promote the gated state — `SIMULATION_READY and beyond
   require their sport-gate stages`. Either the gate is behind or the hub is ahead; that is an
   engineering/founder call.
6. **An internal audit label truncates 146px** on `/results` at 360
   (`AUDIT SIGNAL · MARKET:BATTER_TOTAL_BASES`). Real, but not settlement-bearing, so the Release F
   guard deliberately does not cover it.

## Method notes worth keeping

- **One token per HUE + `color-mix()` at the call site**, never one token per literal.
  `color-mix(in srgb, C p%, transparent)` is exactly `rgba(C, p/100)` — pixel-identical by
  construction. Guarded on three engines by `e2e/p185-color-mix.spec.ts`.
- **Measure CIEDE2000 before merging two hues.** Every "obviously identical" pair here failed.
- **Strip comments before scanning source.** The repo's own guards say it has hit that trap
  repeatedly.
- **Locate against the rendered DOM, not a plausible source match.** Release F cost a full rebuild
  to learn this: the `<span>` in the DOM was not the `<div>` I had edited.
- **A guard that has never failed against the bug it describes has not been tested.** Two guards
  this session passed for the wrong reason until the selector was widened.
- **Then check it does not over-catch.** The same guard flagged an unrelated audit label until its
  invariant was stated exactly.
- **Repoint failing guards, never weaken them.** Nine did this session; two caught real regressions.
- **Assert against the BUILT export** where the claim is about what a visitor sees.
- **A closed axis is closed for a reason.** Release G's first fix invented a coverage word to
  describe UFC honestly — and thereby routed around the sport gate the axis exists to enforce. The
  guard that caught it was right, and the correct fix was smaller: narrow the false sentence, leave
  the gated claim alone, and raise the mismatch.

---

# Release G — sport hubs

The charter's rule here is that *"a schedule-only sport remains useful but does not masquerade as a
simulation product."* The defect found was the **mirror** of it — and the fix is smaller than the
defect, deliberately.

## /sports contradicted /ufc

| surface | says |
|---|---|
| `/sports` | UFC tile: **"Schedule only — not modelled"** and *"This sport has no simulations, no predictions and no picks on this site."* |
| `/ufc` | *"Winner, method and finishing round for every bout on the next card"* — from *"a fight model trained on 8,642 decisive bouts, with each of its three markets tested separately against a base-rate baseline."* |

Understating is safer than overstating, and it is still two public surfaces disagreeing.

## What I nearly did, and why I did not

My first fix promoted UFC's `coverage` out of `SCHEDULE_ONLY` and invented a state word for it.
**A guard caught it** — `adapters.test.mjs` asserts *"coverage values from the closed axis only"* —
and reading the contract showed exactly why that guard exists:

> `SCHEDULE_ONLY` is a legitimate public state; **SIMULATION_READY and beyond require their
> sport-gate stages**; `PUBLIC_ACTIVE` additionally requires founder activation.
> — `src/lib/sports/schedule-contract.mjs`

Coverage is a **gated** claim, and inventing a word outside the closed axis is precisely the route
around the gate that closing the axis prevents. I had no evidence UFC had cleared those stages. The
promotion was reverted in full.

## What actually shipped

The **sentence** was the falsifiable part, and it claimed something the page cannot vouch for:
*"…no picks ON THIS SITE."* A schedules directory knows what is on the schedules directory:

    This section is the schedule only. What is published for this sport, if anything,
    is on its UFC hub.

The intro no longer counts UFC among the schedule-only sports; it names MLB as the one fully
modelled sport and says the NFL and UFC hubs each state what they publish and how experimental it
is. **No coverage state changed.**

## Raised, not papered over

The gate-versus-hub mismatch is ticketed: either UFC's gate is behind and it should be run through
its stages, or `/ufc` is publishing ahead of its gate. That is an engineering/founder call, not a UI
release's.

## Verified rather than changed

- `/mlb` — Simulation Center, 15 games, 686 projections, category track record inline.
- `/nfl` — "public beta", and *"this model picked winners no better than a coin flip"* on the hub.
- `/epl` — *"publishing a number here would be a guess wearing a model's clothes."*
- `/sports` NBA — off-season, reason named.

## Guard

`coverage-truth.test.mjs` — the directory makes no site-wide negative claim; the coverage axis stays
closed and ungamed; and the built directory and built UFC hub do not contradict each other,
conditional on the hub still publishing.

---

# Release H — Learn, trust and support

**Audited, and almost entirely verified rather than changed.** All six surfaces already open with a
plain-English purpose and the paper-only framing, and the charter's requirement that this cluster be
a progressive learning path with a canonical glossary is already met by `/learn` → `/market-guide` →
`/methodology`.

| surface | opens with |
|---|---|
| `/learn` | *"A 2-minute guide for everyone — no betting background needed."* Numbered path: Today → Simulate → … |
| `/market-guide` | *"What every number on the site means — in plain English."* |
| `/methodology` | *"The models are intentionally explainable — no deep learning, no black boxes."* |
| `/about` | *"…no sports-betting background required."* |
| `/responsible-use` | *"not a tipster · not a betting advisory"* |
| `/system-status` | *"Every stage below reports for itself. The overall state is the worst of them — we do not average a failure away behind four successes."* |

`/system-status` meets the charter's state-vocabulary rule outright. It distinguishes healthy from
withheld per stage, and the withheld state is explained in full:

> This slate's board was built before a data-integrity guard was in place, and two halves of a
> doubleheader could not be told apart. Rather than grade predictions against the wrong game, we
> left the date unsettled. It has no win/loss record and is excluded from every rate on this site.

That names the date, the cause and the consequence. It is the standard the rest of the site is
measured against, not a defect.

## One structural observation, raised not changed

2026-07-28 is **permanently** quarantined, so the "Latest settlement" stage reports Withheld forever
— and under worst-of aggregation the **overall** status is Withheld forever, while the other four
stages report OK and the newest settled slate is current.

A headline that can never be green stops carrying information: a reader cannot separate *"a
historical date is quarantined, everything current is fine"* from *"settlement is broken right
now"*. But worst-of on an integrity gate is exactly the fail-closed behaviour that must not be
weakened to make a badge look better. Ticketed for a decision rather than adjusted here.

**No changes shipped in Release H.** Recording a release as "audited, nothing to fix" is a real
outcome; manufacturing a change to show activity would be the failure mode this charter names when
it says not to relitigate what already reconciles.

---

# Release I — the UI/UX audit lands on the operator console

The console already exists and is substantial: an eleven-group IA contract, health strip, executive
overview, today queue, completion matrix, 30-day roadmap, work board, watches, founder actions,
release history, runbooks and transition readiness. Release I did **not** rebuild it.

What it was missing is the thing the charter names explicitly for this section:

> Render the UI/UX route matrix, drift counts, migration progress and screenshots/evidence
> references here so an operator can understand remaining work without reading code or handoff prose.

None of that was on the console. Nine releases of measured work lived only in an artifact and a
markdown file — exactly the "handoff prose" the charter says an operator should not have to read.

## What shipped

A `uiux` section in the **Evidence** group, whose declared authority is already *"committed audit
artifacts, rendered verbatim"*. It renders:

- **Headline tiles** — literals now vs baseline with the delta and percentage, files carrying them,
  semantic tokens added, dead links.
- **Drift by class**, with the disposition of each: only *theme drift on live routes* is migration
  work. Unreachable drift says ADJUDICATE, identity data says NEVER MIGRATE, mask stops say NOT A
  COLOUR, illustration art says NOT THEMEABLE. An operator reading the raw total would otherwise
  size the remaining work at 1,276 when it is 764.
- **Route matrix** — totals, exports, redirects, and the internal routes pruned from the public
  export, named.
- **The ranked next work**, reachable files only.
- **Evidence references** — the scanner, the ratchet, the e2e guards and the audit, by path.

## Every figure derives; nothing is typed

The one hard-coded measurement is the **P184 origin** (1,616 literals, 143 tokens, 2026-08-18,
`eeff42d61`) — a delta needs a fixed origin, and that origin is a historical fact rather than a
current claim. Everything beside it is read from `data/internal/uiux/baseline.json`.

A hand-typed percentage on an operator console is worse than no console: it is the same drift the
audit exists to measure, wearing a dashboard's clothes. The guard fails if any current figure is
inlined into the page or the builder.

## Two design decisions worth stating

- **One shape, always.** `buildUiuxEvidence` returns identical keys whether or not the artifact
  exists. A union return makes every consumer narrow before reading a figure, and the first one that
  forgets is how a dashboard starts rendering `undefined`.
- **Absent is not zero.** With no artifact the section says so and renders no figures — `now` is
  `null`, never `0`. Zero is a claim; absent evidence is a different claim, and the console makes
  the second one.

## Boundary preserved

`/launch` stays host-protected, `noindex`/`no-store` and **absent from the public export** —
re-verified in the build, and asserted by the guard. The artifact it reads lives under
`data/internal/` for the same reason: it inventories internal routes.

## Not done in Release I

The charter's fuller ask — filterable, drillable cards with owner, priority, dependency, age and
acceptance test per item, and completion percentages derived from receipts — is a larger build on
top of the existing work board. This release added the evidence the console was missing about the
UI/UX programme itself, which is the part it named specifically.

---

# Release J — cross-site assurance and final acceptance

## Classification: MATERIAL_PROGRESS

Not COMPLETE. The charter reserves COMPLETE for *"every active public route passing route,
responsive, comprehension, visual-system, motion/reduced-motion, asset, accessibility, truth and
production gates"*. Ten of the programme's releases shipped; the visual-system gate is
**21% migrated, not closed**, and four decisions remain open that are not mine to make. Claiming
COMPLETE would be the exact overstatement this programme spent ten releases removing from the
product.

## Gate matrix — all green

| gate | result |
|---|---|
| typecheck (cleared `.next`) | clean |
| serial suite | **4,596 / 0** · 4 skipped |
| production build | exit 0 · **253 exported HTML** |
| public/private boundary | `/launch`, `/ops`, `/preview` **all pruned** from the export |
| P185 e2e (3 engines) | **15 / 15** — shell, product viewports, color-mix on Chromium + WebKit + Firefox |

## Every census rebuilt from the final tree

| measure | P184 `eeff42d61` | final | delta |
|---|---|---|---|
| raw colour literals | 1,616 | **1,268** | **−348 (−21.5%)** |
| · theme drift, live routes | *unmeasured* | 756 | the migration queue |
| · theme drift, unreachable | *unmeasured* | 408 | adjudicate, not recolour |
| · identity data | *counted as drift* | 89 | never migrate |
| · mask stops | *counted as drift* | 8 | not a colour |
| · illustration art | *counted as drift* | 7 | not themeable |
| files carrying literals | 266 | 253 | −13 |
| semantic tokens | 143 | 176 | +33 |
| routes / exported | 55 / 47 | 55 / 47 | unchanged |
| dead links | 1 | **0** | closed |
| orphan routes | 4 | 4 | all internal, by design |
| nav sources on the shared contract | 3 of 4 | **4 of 4** | footer joined |
| components / single-call-site | 305 / 232 | 305 / 232 | unchanged — census is a lead, not a defect |
| motion keyframes / reduced-motion blocks | 42 / 77 | 42 / 77 | unchanged |
| suite | 4,564 / 0 | **4,596 / 0** | +32 tests |

The ratchet ceiling was lowered to the final count in this release, so the artifact, the ceiling and
the tree all reconcile.

## Premises corrected by evidence

1. **team-badge was not the worst offender.** 68 of its 72 literals are team brand colours.
2. **Two of the four named offenders were unreachable dead code** — migrating them would have moved
   a number and changed nothing a user sees.
3. **Mask stops and SVG illustration fills are not theme values** — two further boundaries the flat
   count conflated.
4. **`--vault-gold-bright` held green.** A token whose name says gold and whose value is green is how
   a retired palette survives a rebrand.
5. **Every "obviously identical" hue pair was perceptible** — 1.5–13.5 dE, against a 1.0 threshold.
6. **The mobile bar's abbreviation had existed and was silently lost** when the surface was derived
   from the registry.
7. **The homepage's "30 games simulation-ready today" was a pool size**, not an availability count.
8. **A settled receipt truncated away its own outcome** on the record page at phone width.
9. **`/sports` said UFC publishes nothing** while `/ufc` publishes a three-market model.

## What is NOT closed

**P1 — visual system.** 756 theme-drift literals remain on live routes. Ranked queue in the
artifact; every reachable offender above 16 is migrated.

**P1 — four open decisions, each with an owner who is not me.**

| item | why it is not mine |
|---|---|
| 408 literals in unreachable components | retire-or-rewire is a capability decision |
| two zero-opt-in theme islands | the charter stops for capability removal without parity |
| UFC's gate vs its hub | promoting a gated coverage state needs the gate, or founder activation |
| one quarantined date reddening system status forever | weakening a fail-closed integrity gate |

**P2 — five named legacy hues** pending merge with screenshot review; one navy scrim on an
unrendered conditional branch; an internal audit label truncating 146px on `/results` at 360.

**Not attempted:** Release I's drillable-card build (owner/priority/dependency/age/acceptance per
item, completion from receipts). Release B4's graphics-and-motion foundation — sport motifs, named
motion roles — was not built; motion counts are unchanged from the baseline and this is the largest
untouched section of the charter.

---

# B4 — the graphics and motion foundation

Named in the Release J acceptance as the largest untouched section of the charter. Built now.

## Measured first

    44 keyframes                    (two duplicated outright)
    0  named motion tokens          ← every animation hard-coded its own timing
    77 reduced-motion blocks        added one at a time, reactively

The same shape as the colour problem this programme opened with. Six interaction durations
(120/160/180/200/220/240ms) that are **one intent typed six ways**, and **four near-identical
decelerate curves**:

    cubic-bezier(0.22, 0.61, 0.36, 1)   ×11
    cubic-bezier(0.2,  0.8,  0.2,  1)   ×5
    cubic-bezier(0.22, 1,    0.36, 1)   ×4

## The role system

Eleven roles, each carrying the five fields the charter asks for — duration, easing, distance,
performance budget, reason to exist — plus a sixth: **`forbidden`**, what the role may *not* do. That
field is load-bearing, because a role without a stated limit is one a future author will overuse.

A role names the *reason* to move; the timing follows from the reason rather than from whoever wrote
the component. It is the motion equivalent of one token per hue. `EASING` collapses the four
decelerate curves to the one that was already most used.

**`progress` has no constant duration on purpose** — its duration is *data*. A progress animation
with a hard-coded length is a loading bar that lies.

## Reduced motion is a contract, not an off-switch

The charter's wording is precise and easy to half-follow: reduced mode *"removes nonessential
spatial/looping movement but **keeps focus, progress, state and loading feedback understandable**"*.
Blanket-disabling everything fails the second half — a user who asked for less motion still needs to
know a control took focus and that work is running.

| behaviour | roles |
|---|---|
| **keep** | `hover-focus`, `state-change`, `progress` — the motion *is* the feedback |
| **shorten** | `disclosure` — direction survives, distance goes (220ms → 80ms) |
| **remove** | entrance, exit, emphasis, number-transition, chart-draw, ambient, route-transition |

## Determinism is protected in the contract

This product publishes fixed artifacts, so the two roles that could smuggle in a false impression
say so in their own definition, and a guard asserts the wording stays:

> `number-transition` — **NEVER count up to a deterministic published number.** It implies the value
> is being computed now; it was computed once and committed.
>
> `chart-draw` — never redraw on every re-render; repeated drawing implies resampling.
>
> `progress` — never loop on a finished or unavailable artifact to imply live work.

## Guards

- `motion-roles.test.mjs` — 7 tests: all eleven roles present with every field; **CSS is generated
  from the contract so the two cannot drift**; reduced motion follows each role's declared
  behaviour; progress has no constant duration; the determinism bans are still worded; one
  decelerate curve; tokens live on `:root`.
- `e2e/p185-motion-roles.spec.ts` — **9 assertions across Chromium, WebKit and Firefox**, with
  reduced motion actually applied via a browser context rather than asserted from source.

## A false pass, caught

The easing test first passed on all three engines against an export built *before* the tokens
existed — because an all-empty result is trivially "unique". Same failure as Release F's selector.
The test now asserts each value is non-empty *before* asserting they agree.

## Not built

**Shared graphic motifs** (stadium-light ambience, score ribbon, probability arc, particle/noise
texture, data-grid depth) and **sport motifs** (MLB diamond, NFL yard-line, NBA court, EPL pitch,
UFC octagon, NHL rink). The charter orders them "build shared motifs, *then* define sport motifs" —
both sit on top of this foundation and neither is started. The 44 existing keyframes are also not
yet migrated onto the roles; the contract exists and the next author has somewhere to migrate *to*.

---

# B4 — the shared graphic motifs

All five the charter names, in one file, CSS and SVG only: **stadium-light ambience, score ribbon,
probability arc, particle/noise texture, data-grid depth**. No image assets — a motif that needs a
file is a motif that breaks when the file 404s, and there is no licensing surface.

## They obey the systems this programme built

- **Zero raw colour literals.** Every hue is a semantic token. The ratchet would have caught it
  repo-wide, but decoration is the file most tempted, so the guard checks it directly.
- **No invented timings.** Every animation names a motion role from the B4 contract; a guard fails
  on any bare `ms`/`s` inside an `animation` shorthand. That is how the four near-identical easing
  curves happened the first time.
- **Reduced motion reaches them for free.** Because they read role tokens rather than their own
  durations, the contract applies without a per-motif media query — which is precisely what the 77
  hand-added blocks were.

## The line between decoration and data

Four are decoration: `aria-hidden`, `pointer-events: none`, no announcement.

**`ProbabilityArc` is not.** It renders a real number, so it carries `role="img"` and an accessible
label containing the value. And it repeats the distinction this programme kept finding:

> A null probability draws **no fill at all** and renders an em dash. A zero-length arc reads as
> "0% chance"; the honest statement for a missing value is "we do not have this".
>
> **Absent is not zero.**

## Determinism, protected in the code

The product publishes fixed artifacts, and the charter bans "fake reroll animation, arbitrary jitter
or cosmetic differentiation". So:

- No `Math.random`, no `Date.now` anywhere in the motifs.
- The grain uses **`seed={7}`** — a fixed `feTurbulence` seed, so every reader sees the identical
  texture, like everything else the product publishes.
- The arc draws **once** (`both`, never `infinite`). An arc that redraws on every render implies the
  number was resampled.

A guard asserts each of those three.

## Still not built

**Sport motifs** — MLB diamond/pitch trail, NFL yard-line/drive path, NBA court/shot arc, EPL
pitch/three-way, UFC octagon/tale-of-the-tape, restrained NHL rink. The charter orders shared motifs
first, then sport motifs; the shared layer now exists for them to build on.

**Adoption.** These are primitives, not placements. Nothing on a route consumes them yet — putting
`StadiumLights` behind a hero is a visual change on a live surface and owes the before/after
screenshot review this programme has required of every visible change.

---

# B4 — the sport motifs

All six the charter names, in the order it names them, now that the shared layer exists:
**MLB diamond + pitch trail · NFL yard-line + drive path · NBA court + shot arc · EPL pitch +
three-way · UFC octagon + tale-of-the-tape · NHL rink**.

Same contract as the shared layer: SVG only, semantic tokens only, motion roles only. Each reads its
own `--sport-*` accent, so a hub gets native character without any file inventing a colour. **Zero
raw literals** — the census is unchanged.

## A field diagram is geometry, not data

All six are decoration and say so. None takes a score, a probability or a player: the guard asserts
the **props type** contains no datum. The moment a motif renders a number it stops being a motif and
has to be labelled and behave like `ProbabilityArc`, and keeping that line bright is the point.

Each motif draws the *shape of its sport's question* rather than an outcome — a pitch trail going
nowhere, a shot arc with no basket, a 1X2 bar group that is the shape a three-way market has.

**NHL is deliberately the plainest, and that is measured.** The charter asks for "restrained
NHL/rink treatment" because the sport is off-season with no live board, so a guard counts strokes
and fails if the rink is ever busier than any other motif. A motif richer than the product behind it
is the visual polish this programme spent nine releases removing.

## A guard that false-positived on itself

The "no data" check first matched any identifier and flagged `line(accent, pct)` — a local geometry
helper. A guard that fires on its own file's internals teaches the next author to delete it, so it
is scoped to the props type, which is the actual invariant.

---

# Pending decision · UFC's gate vs its hub — RESOLVED, and neither option was right

The ticket offered two readings: the gate is behind, or `/ufc` publishes ahead of it. **Ran the
gate. Neither.**

    mlb   LIVE_ELIGIBLE
    nfl   SCAFFOLDED
    ufc   SCAFFOLDED      ← every stage PARTIAL, each with its own "PARTIAL, deliberately" note
    epl   SCAFFOLDED
    nba   SCAFFOLDED

UFC's five gate stages — markets, schedule, identity, settlement, data, model — are **all PARTIAL,
none PROVEN**, each with an explicit reason (paid ingests are CI-only so no capture has succeeded;
replacement/cancellation lineage still unobserved; model activation OFF). `SCAFFOLDED` is exactly
right, and `/ufc` publishing an experimental model that names its own baseline is *consistent* with
it.

**The real gap is in the coverage axis, not either surface.** `COVERAGE_STATES` offers
`SCHEDULE_ONLY`, `DATA_READY`, `SHADOW_MODEL`, `SIMULATION_READY`, `PICKS_ELIGIBLE`,
`PUBLIC_ACTIVE`, `OFF_SEASON`, `SOURCE_STALE`, `INCIDENT` — and **none of them means "published,
experimental, pre-simulation-ready"**. `SHADOW_MODEL` ("internal research only") is wrong because
the model is public; `SIMULATION_READY` is wrong because the gate says otherwise.

So Release G's decision holds and is now explained rather than merely cautious: the false *sentence*
was the fixable part, and the *state* could not be made accurate without a new axis value. Adding
one is a schedule-contract change, which is the owner's call — and it would also give NFL and EPL a
truthful state, since both are `SCAFFOLDED` too.

---

# Pending decision · the 408 unreachable literals — ADJUDICATED

The ticket asked for a **retire-or-rewire ruling per component**, not a recolour. Done mechanically,
over all 75 files rather than the top-15 slice the artifact stores.

## Method

Reachability from every route entrypoint, then for each unreachable file with drift: does any
**non-test** file still reference it, and does any **guard** assert it stays removed?

| ruling | meaning | files | literals |
|---|---|---|---|
| **WIRING** | imported by live code, but no route reaches it | 25 | **132** |
| **DEAD · guarded** | unreferenced in prod, and a test asserts its removal or content | 14 | **115** |
| **DEAD · unreferenced** | nothing references it at all | 36 | **161** |
| | | **75** | **408** |

## What each ruling means for the next session

**WIRING (132) is the interesting third.** These are *not* dead — something in live code still
imports them, but no route can reach that importer either. They are the tail of a chain whose head
was cut. Each needs the chain walked: if the capability should be reachable, restoring the route
wiring turns 132 literals into ordinary migration work; if not, the whole chain retires together.
`bank-builder-preview-panel` (35) is the clearest case — its only importer is `dual-ladder-board`,
which is itself guarded as removed.

**DEAD · guarded (115) must not be deleted casually.** A guard asserting removal is load-bearing:
`dual-ladder-board` alone is referenced by five tests, and `bank-builder-cross-lane.test.mjs`
asserts it *stays* removed from `/bank-builder`. Deleting the component without repointing that
guard deletes the proof that the removal was deliberate. Retire the file **and** rewrite the guard
to assert the invariant against whatever now owns it.

**DEAD · unreferenced (161) is the safe majority.** Nothing references these at all — not prod, not
tests. They can be retired on their own evidence, one commit per cluster, with the census lowering
as the receipt.

## What I did NOT do

I did not delete anything. Retiring 75 components is a capability decision across Bank Builder,
Moonshot, Mr. Dub and World Cup surfaces — several of them money-adjacent — and the charter's rule
stands: *"A low call-site count is not permission to delete or merge."* This turns a 408-literal
number into 75 named files with a ruling each, which is the input that decision needed and was
missing.

Reproduce with the classifier logic in `scripts/uiux/baseline.mjs` (reachability) plus a
non-test-reference check; the artifact's `worstOffenders[].routeReachable` carries the first half.

---

# Pending decision · the theme islands — RETIRED

## The ticket said two. There was one.

`[data-theme="premium-gold"]` **did not exist**. All that remained was a comment saying the tokens
were "activated as a scoped theme in the `[data-theme="premium-gold"]` block below" — pointing at a
block that had already been deleted. That is how a reader concludes a theme is available when it is
not, and it is the same lying-artifact family as `--vault-gold-bright` holding green and
`var(--vault-warn, #ea580c)` backing gold with orange.

`.gtp-canvas` was real but was **7 rule blocks scattered across 3,500 lines**, not the single block
the ticket implied — which is why the earlier session correctly declined to do it in the context it
had left.

## Removed

- 7 `.gtp-canvas` rule blocks
- 11 orphaned token declarations, each verified at **zero references** in both CSS and TSX first:
  `--gtp-canvas`, `--gtp-canvas-edge`, `--gtp-paper`, `--gtp-paper-deep`, `--gtp-champagne`,
  `--gtp-gold-soft` (declared **twice**, with different values), `--gtp-ink`, `--gtp-ink-mute`,
  `--gtp-surface-light`, `--gtp-gold-on-light`
- 4 comment blocks describing scopes that no longer exist

**Capability check:** neither scope had a single opt-in anywhere in `src/` — no component used the
class, nothing set the attribute, no guard referenced either. A scope nothing can enter is not
latent capability; it is a second palette to keep in sync. That is what changed since the charter's
"stop for capability removal without parity" applied — parity is trivial when the other side is
empty.

## A third stale artifact, found on the way

The `:root` block carried a **hand-verified contrast table** citing `--gtp-card (#161E3E)` — the
navy the token held *before* the green rebrand. Every ratio in it was measured against a colour the
file no longer defines. A stale contrast table is worse than none, because it reads as verification.

Recomputed against the values actually shipped:

    on --gtp-card (#121A16):
      --vault-text      (#F5F7F6)  16.47:1  AA
      --vault-text-mute (#B4BEB8)   9.28:1  AA
      --vault-gold      (#D4AF37)   8.43:1  AA
      --vault-success   (#4ADE80)  10.17:1  AA
      --vault-accent    (#34D399)   9.22:1  AA

## Verification

Brace balance checked after every edit · typecheck clean · suite **4,617 / 0** · build exit 0, 253
exported HTML · **`gtp-canvas` appears 0 times in the built CSS** · `/launch` still pruned.

---

# Pending decision · system status — I WAS WRONG, AND THE PAGE WAS RIGHT

Recorded 2026-08-19 06:41 ET.

## The premise I filed the ticket on

*"2026-07-28 is permanently quarantined, so the headline reads Withheld forever while four stages
report OK and the newest settled slate is current. A headline that can never be green stops carrying
information."*

**The second half of that was false.** I read *"Newest fully settled slate: 2026-08-17"* off the page
as the settlement pipeline's position. It is not — that line comes from the **daily research brief**.
The research corpus's own position is `freshness.asOfSettledDate`, and it is **2026-07-27**.

    predictionHistory   READY        complete through 2026-07-27
    latestSettlement    QUARANTINED  2026-07-28 … settlement has not moved past it

2026-07-28 is the **very next date**. Settlement genuinely has not moved past it. The headline is not
a stale badge pinned by ancient history — **it is true**, and it should be red.

Two different artifacts, two different "settled through" dates, on the same page. I conflated them.

## What shipped anyway, and why it is still worth having

The distinction the ticket reached for is real even though today's case falls on the other side of
it: **a quarantine that blocks is not the same as one settlement has moved past.**

    blocking     date >= newest settled date   → QUARANTINED, dominates worst-of
    historical   date <  newest settled date   → the gate SUCCEEDING, named but not pinning
    unknown      no settled date at all        → assumed blocking (fail closed)

The reframe that makes this safe: **a permanently withheld historical date is the integrity gate
working.** Reporting it as a standing failure inverts the meaning of the thing it reports. What must
redden is a quarantine that is *blocking*.

Today's state is **unchanged and still QUARANTINED**, correctly. What changes is later: when
settlement moves past 2026-07-28, the headline will go green on its own instead of staying pinned —
and a genuinely historical quarantine will never pin it in the first place.

Disclosure is not reduced in either branch: the withheld dates are named in the stage's own detail
line and listed in full in the contract's `quarantines` block, which the page renders as its own
"Withheld slates" section.

## Guarded in both directions, on synthetic inputs

Letting a historical quarantine stop reddening the headline is one edit away from letting a current
one stop reddening it too, so the self-test exercises both against the same function the real
contract uses: historical → READY and still named; `2026-08-17` and `2026-08-18` → QUARANTINED and
overall non-READY; mixed → still red; **no settled date → assumed blocking.**

## The lesson

I filed this ticket confident enough to phrase it as "a headline that can never be green". Reading
one number off a rendered page and assuming which artifact produced it is the same mistake as
reading a raw colour count and assuming every literal is drift. **Two numbers on a page that look
like the same fact usually are not.**
