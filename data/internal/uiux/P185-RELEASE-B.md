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
