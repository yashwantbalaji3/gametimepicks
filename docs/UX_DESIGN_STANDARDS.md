# GameTimePicks UX Design Standards (DS-001)

**Status:** In force from UX Release 2A (2026-10-14). Approved by the founder as part of the UX System V2 plan (roadmap §16, DS-001).

**Scope:** These are the shared rules every change in Release 2A, Release 2B and LIVE-F applies, and every later UI change follows. They are written from the primitives and tokens already in the codebase. This is not a new design language, and it is not the full design-system migration (that is P2: spacing tokens, a single card surface, the radius ratchet and `SportHubShell`).

**Use in review:** each UI PR names the rules below that it applies. If a change cannot follow a rule, the PR says why. A one-off exception is never silently added.

---

## 1. Truth before styling (applies to everything below)
1. **A status describes the data.** A label, badge or count is derived from the artifact or owner that holds the fact. It is never hand-written beside it. If two surfaces show the same fact, they read the same owner.
2. **Pending, void, withdrawn and push are never losses.** Unsettled is not 0–0. An absent value is "—" or a sentence, never a zero.
3. **Dates and times are Eastern.** Use `lib/et-stamp.mjs` (`etStamp`, `etDayLabel`) or `formatTimestamp` (both the date and the time are in ET). Never print `slice(0, 10)` of a UTC instant, and never print a raw ISO string on a public surface. CSV exports keep the raw UTC instant.
4. **"Today" only when it is today.** A dated snapshot names its date ("from the Oct 12 capture"). "This week" means within the look-ahead window. "Today" means the reader's ET day and the item's own state says so.
5. **A forecast's freeze time is never later than its event start.** For MLB, use `forecastFrozenAt` (`lib/mlb/full-game/sim-provenance.ts`). If the time is unknown, say nothing rather than print a later run's clock.
6. **Market and model stay distinct.** A sportsbook price is labelled as the book's, with the book and capture time. A model number is labelled as the model's. They are never merged into one "edge" claim without a validated record.
7. **No raw codes in public text.** `CAPABILITY_GATED`, `NOT_ELIGIBLE`, `STATUS_FINAL`, `R5` and similar codes, file names (`*.md`, `*.json`) and endpoints are translated into a sentence. The exact technical text stays available in a `<details>` disclosure, on a methodology page, or on a clearly labelled research view. It is not deleted.

## 2. Status vocabulary
One set of words per meaning, everywhere:

| Meaning | Word(s) | Owner |
|---|---|---|
| Event not started | **Upcoming** (live surfaces may show **Scheduled** + start time) | `lib/live/lifecycle.mjs` `LIFECYCLE_LABEL` |
| In progress | **Live** (**Delayed** when the feed is stale) | same |
| Finished, not yet graded | **Final · grading pending** | same |
| Finished and graded | **Final** | same |
| No live feed for this sport | **Live tracking unavailable** (never implied live) | LIVE-F |
| Forecast fixed before start | **Forecast locked pregame** / "Pregame GameTime · frozen" | live panel |
| Model verdict states | `PUBLIC_STATE_LABEL` / `PUBLIC_STATE_MEANING` | `lib/command-center/contract.ts` |
| A WATCH verdict | "Watch · not yet distinguishable from <floor>" | `model-status.ts` |
| Product lane closed | "<Lane> closed — <plain reason>" + details | `plainLaneReason` |
| Legacy/archived record | **Archived** + "last updated <date>" | `StatusPill` `archived` |

- Status is never carried by colour alone. Every chip states its status in words (`StatusPill`, live `StateChip`).
- A final event shows no period or clock line. The period line is a fact about a game in progress (NEW-2).

## 3. Probability display
- A model probability is written as **"N% of simulated games"** (simulations) or **"N% chance · <outcome>"** (analytic models). It is followed, where relevant, by its validation status ("unvalidated", "experimental").
- No intensity words that read as confidence in the outcome ("VERY STRONG", "lock", "best bet"). The stored `strengthLabel` stays in the artifact, and the display uses the share.
- A model-health statement names the measure: "log loss (lower is better)", the model vs baseline numbers, n, and the 95% interval. "Better than" is said only when the whole interval excludes zero (`logLossVerdict`). A hit rate shown beside a verdict is labelled "for context only".
- Draw/tie mass is shown wherever the market has one (EPL).

## 4. Cards, spacing and typography
- **Surface:** existing tokens only. Use `--vault-panel` / `--vault-panel-elevated` backgrounds and `--vault-border` / `--vault-border-strong` borders. New raw hex colours are blocked by `lib/uiux/token-ratchet.test.mjs`.
- **Radius:** 12 px for event cards (the NFL live card; the MLB live card converges to it in LIVE-F), 10–14 px for section panels, 3–4 px for status chips, and 999 px only for pills. Do not introduce a new radius value; the radius ratchet is P2.
- **Padding:** 12–14 px inside event cards and 16 px inside section panels. On phones, keep a 16 px page gutter.
- **Type:**
  - body: `--font-display` (Geist) at 12.5–14 px;
  - labels: `--font-label` (Release 1) — uppercase mono is for codes and numbers, not sentences;
  - scores and figures: tabular numerals (`tabular-nums`);
  - headings: `SectionHeader` (one `h1` per page, then `h2`/`h3` in order).
- **Floor:** no new text below 11 px. Existing 8.5–10 px chips are migrated as they are touched (GTP-31, P2).
- **Density:** secondary sections fold into `MoreDisclosure` (`components/ui/more-disclosure.tsx`), and anchors and URLs are preserved. A section is never removed to shorten a page.

## 5. Team logos, player portraits and fighter images
- **Team logos:** use `TeamLogo` (`components/team-logo.tsx`, ESPN CDN by abbreviation) or the entity facade's `TeamLogo` (`components/entity`). Sizes are fixed: `sm` 24 · `md` 36 · `lg` 56 · `xl` 80. Event cards use `sm` or `md`; headers use `lg`.
- **Fallback:** a missing or failed logo renders the monogram or initials (`TeamMark` / `TeamBadge`), never a broken image. Abbreviation aliases (e.g. MLB `AZ` → `ari`) are explicit and verified.
- **Player portraits:** use `PlayerAvatar` / `PlayerPortrait` with an **exact provider ID**. Never name-match a photo. Sports without an authorized portrait CDN render initials.
- **Fighter images:** use only the `photoUrl` the UFC card artifact already carries for that exact `athleteId` (GTP-16). No lookup by name.
- **Alt text:** an image beside a visible name is decorative (`alt=""` or `aria-hidden`), so the name is not read twice (GTP-31). A standalone image carries the entity's name.
- **Never** show one entity's image for another. If identity is unknown, show initials.

## 6. Buttons, links and CTAs
- **Hit area:** at least 44 × 44 px for every tappable control (`.gtp-ev-cta`, `minHeight: 44`). Visible text may be smaller, but the hit area may not.
- **One primary CTA per card.** Its label says what happens: "Open report →", "Open game report →", "View archived report →". Never "Generate" for precomputed content.
- **Link text names its destination.** No "click here", and no file names as link text.
- **Disclosures** use native `<details>`/`<summary>` (keyboard and touch operable, no tooltip-only content).

## 7. Sport navigation and filters
- **Sport tabs:** one control pattern across hubs and `/live`. They use `role="tablist"`/`role="tab"` with `aria-selected` and `aria-controls`, arrow keys plus Home/End (`useRovingTabs`, Release 2B), and one tab stop.
- **Filters:** state is reflected in the URL where the page already supports it, a filter change never moves focus unexpectedly, and the result count updates in text.
- **Order** of sports follows the Simulation Hub order. A sport without current activity appears in the secondary "coverage" group, never as active.

## 8. Live surfaces (LIVE-F, applies from Release 2B)
- One event-card layout across sports:
  - status chip (§2);
  - team identity (logo plus full name, abbreviation fallback);
  - score in tabular numerals ("—" when unreported, never 0);
  - the period line only while live;
  - the frozen-forecast line;
  - a visible "Open game report →".
- Progress is shown only where the live feed supplies a verified value. No invented statistics, no "on pace", and no implied tracking for sports without a validated live adapter (UFC; NBA until validated; soccer).
- No `aria-live` polling announcements. The state lives in each card's accessible name.

## 9. Responsive layout and accessibility
- Layouts are checked at **320, 390, 768 and 1440 px**, with no page-level horizontal scroll (tables scroll inside their own container).
- Keyboard: every control is reachable, focus is visible, Escape closes menus, and focus returns to the opener.
- Charts carry a text or table equivalent. Motion respects `prefers-reduced-motion`.
- Tests: the a11y structural audit (`scripts/audit-accessibility.mjs`) and the Playwright a11y suite (`e2e/accessibility.spec.ts`) run on every UI release. New interactive patterns get an e2e case.

## 10. Verification per release (acceptance package)
Each release lists:
- the findings addressed and the routes affected;
- before-and-after behaviour;
- automated test results;
- desktop (1440) and phone (390) browser verification;
- unresolved issues or regressions;
- expected Vercel impact (builds, and that there are no preview deployments).
