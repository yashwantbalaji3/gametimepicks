# Social Graphics & Captions V2.2: engineering handoff

**Status:** 2026-10-28, local only.
- **Commit:** `7e44b97f9f` (V2.2), plus this doc in the follow-up commit.
- Nothing was pushed, merged, deployed, published or bought.
- **No design approval was recorded.** Template `gtp-social@2.2` needs your own click on "Approve this design version" in the Queue. No V2.1 approval carries over to it.

## 1. What changed

| Area | Change | Where |
|---|---|---|
| Footer | One line per sport, exact founder text. The technical footer lines ("Projected medians · players as published…", frozen time) are gone from the graphic; provenance stays in the package evidence and the console | `render/social-v2.mjs` `DISCLOSURES` / `disclosureFor`, `shell.html` `.disclosure` |
| Name typography | Shared tokens (`--pname-*`): one size, weight (800), family (GTP Condensed) and left edge per component | `social-v2.css` |
| Name formatting | Deterministic forms, chosen before any shrinking: full name → initial + full surname (suffix kept) → surname (only where the team is already shown). A short form two players would share is dropped for both. A group of names shares one size. If no form fits at the floor, the render is **refused**. Names are never clipped or dropped | `recap/player-names.mjs`, the fit script in `shell.html` |
| NBA stat table | Stacked rows: the name spans the full width, with PTS / REB / AST on a grid beneath. All 12 games of Oct 28 render at 32 px | `social-v2.css`, `render/social-v2.mjs` |
| Captions | One editorial voice for all formats, two variants per format, rotated deterministically per game. Length is X-weighted (emoji = 2). Every number still traces to a claim | `contracts/captions.mjs`, `contracts/post-queue.mjs` `xLength` |
| NBA featured players | Your editorial list is used first; otherwise a deterministic fallback (most published expected minutes, no injury flag). The basis is shown in the console. A featured player is a caption highlight, not a model ranking | `editorial/featured-players.json`, `recap/social-v2.mjs` `featuredFor` |
| Queue | The caption shows real line breaks, an "N/280 on X" counter and the featured players with their basis | `surfaces/console/app.js`, `styles.css` |

## 2. Deliverables

All under `command-center/out/social-v22/` (git-ignored):

| File | What |
|---|---|
| `sheet-1-nba-before-after.png` | NBA stat lines, V2.1 vs V2.2 (MIA @ ATL, OKC @ DAL) |
| `sheet-2-name-typography-zoom.png` | Names at 2×: V2.1 vs V2.2 |
| `sheet-3-nba-long-names.png` | 6 NBA games with long, hyphenated or suffixed names (Gilgeous-Alexander, Alexander-Walker, Antetokounmpo, Jr. suffixes) |
| `sheet-4-nfl-and-nba-formats.png` | NFL Top 3 TD (CAR @ GB), Top 5 TD, Top 5 receiving yds, NBA and NFL Predicted Winner, and a synthetic long-surname stress test (labelled; not a real board) |
| `sheet-5-mobile-390.png` | Every format at 390 px wide (iPhone X feed width) |
| `sheet-6-footers-all-sports.png` | The footer line for NFL, NBA, MLB, UFC and EPL |

Single graphics are `nba-players-<TEAM>.png` (12 games), `nfl-*.png` and `nba-pregame-MIA-ATL.png`.

Captions: `docs/captions-v2.2-before-after.md` (5 NBA + 5 NFL, before and both after variants). All 20 V2.2 captions pass `checkCaption`.

## 3. Tests

- **Full suite: 140/140, normal and network-blocked** (`npm test`, `npm run test:offline`).
- **New:** `tests/social-v22.test.mjs`. It covers:
  - exact footers;
  - all 12 NBA games fitting at one size;
  - NFL Top 3 and Top 5 sizes;
  - name forms (suffixes, particles, shared short forms);
  - featured players and fallback;
  - captions and fingerprints;
  - each review fix.
- **Updated, not weakened:**
  - `social-v2.test.mjs`: the clutter test now asserts the mandated footer appears exactly once, and checks the rest of the text as strictly as before.
  - `queue-v2.test.mjs`: new caption wording, same values asserted.

## 4. Independent review (6 findings, all fixed with tests)

1. **Postgame TD captions used full names where the graphic uses surnames.** Fixed: they now use `last`.
2. **Long compound TD surnames (Valdes-Scantling Jr., Westbrook-Ikhine) made the Top 3 TD render refuse.**
   - Fixed: feature names may wrap to two lines.
   - The group may step down together to 65% (the narrow Top 3 columns only; 80% elsewhere).
   - All three stay at one size: 35 px in the stress test. Normal cards stay at the 52 px token.
3. **A Top 5 caption said "leads" on a tie.** Fixed: "it's tight at the top".
4. **"Thursday Night Football" on Thanksgiving night and in the Week 1 opener.** Fixed: the plain weekday is used instead.
5. **The NBA caption fallback wording, when a team has no eligible featured player.** Fixed.
6. **The Decisions-view counter used plain `.length`.** Fixed: it now uses the X-weighted length.

## 5. Blockers and open items

- **Featured list:** only 2 entries so far (MIA Bam Adebayo, ATL Jalen Johnson, from your brief). The other 22 teams use the fallback, labelled in the console. To change who is featured, add entries to `editorial/featured-players.json`.
- **Queue rebuild:** the console was restarted on V2.2 code. The V2.2 packages appear after the next queue build. The open V2.1 packages are superseded then; decided ones are untouched.
- **Design approval:** yours to record (gtp-social@2.2).
- **Linux rendering:** still untested (hosted runner, CP-H1).
- **No source for TD availability:** this stays your manual confirmation.
- **Next milestone:** X Publisher V1, not started.
