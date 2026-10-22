# NBA UI parity — 2026-10-22

Founder directive 2026-10-22: NBA is a first-class sport with the same navigation, design system, interaction patterns
and responsiveness as NFL, MLB, EPL and UFC. Journey: Homepage → NBA hub (`/nba/`) → today's games → game page
(Simulation Theater) → Official Predictions → simulated box score → Results.

**What did not change:** frozen forecasts, model code, `data/`, workflows, the Theater engine, `labels.mjs` wording,
simulation data and betting-product gating. Withheld fields (team scores, win %, score and player ranges, odds) stay
withheld; no field for them exists in the new code. The engine label stays "Research Possession Simulation — Unvalidated".

"Before" is Production at 14:25Z on 10-22, before today's publish. "After" is this PR.

## Parity table

| # | Dimension | NFL / MLB / EPL / UFC pattern | NBA before | NBA after (this PR) |
|---|-----------|-------------------------------|------------|---------------------|
| 1 | Discovery (homepage) | A Command Center lane each: state, context line, freshness, featured card, "Open X hub →" | Rail link and one line in the schedule strip. No lane; 2 homepage links | NBA lane in the same Command Center (`lib/command-center/nba-lane.ts`). It shows today's matchups (crests, abbreviations, tip time ET), the official side where today's lane has one, a recorded final, and "Open NBA hub →" plus "Top Boards →" when published. The off-day state names the next game. It is promoted by an evidence gate, like UFC: a schedule alone never promotes it |
| 2 | Hub hierarchy | Title → section strip → current period's games → boards → status → results | Title → copy that contradicted the official forecast ("publishes nothing") → schedule of ~54 games, with today's buried | Title → overview (date, game count, first tip, forecast state and freeze time, links to Today's games, Top Boards, Results and How the forecast works) → strip → today's matchup cards → full schedule → model status → results |
| 3 | Cards | `game-summary.tsx` EventCard: panel, crest per side, status chip, read box, **one** action link ("the action is a link, not a row click") | Text-only lane cards (plus none at all before the publish) | `MatchupCard` in the same language: panel, crests, status chip, read box and at most one link (the Theater, only when built). It follows the shared pattern instead of making the whole card clickable, which keeps a11y simple: one target, no nested links |
| 4 | Logos | TeamLogo through the identity system | Crests on schedule rows only | TeamLogo on hub cards and on homepage lane rows. Codes come from the ESPN registry or the lane, never guessed. The monogram fallback is TeamLogo's own |
| 5 | Typography | font-display headings, 12–13.5px body, mono eyebrows | Mixed | Same scale: 18px h2, 17px matchup, 12–13px body, mono eyebrow on the overview |
| 6 | Colour / contrast | `--vault-*` tokens, sport accent per lane | Generic | `--sport-nba` accent on the lane top border and overview. Official = solid crown border (the Theater's `.is-official`); research stays dashed |
| 7 | Formatting | Times in ET, "7:00 PM ET" | ET | ET everywhere. The official table prints the lane's own 1-dp rounding, so it matches Top Boards exactly |
| 8 | Spacing | `vault-page-shell`, gap-6 sections, 1rem card padding | Same shell | Same shell. Card and overview layout lives once in `globals.css` (`.nbx-*`), not per card |
| 9 | Navigation | Sport switcher, sticky section strip, hub link from every lane | No "Top boards" in the strip | The strip gains "Top boards" (as NFL's has). The game page has a nav strip: ← NBA hub · Skip to Official Predictions · Top Boards · Results |
| 10 | Top Boards | NFL: weekly boards on the hub | `/nba/projections` existed, one link from the lane | Linked from the overview, the strip, the homepage lane (when published) and the game page |
| 11 | Model panels | Status chips plus "what the statuses mean" | "Model status" said nothing was published | Model status describes the official forecast accurately (Elo side + v0.1 player medians, experimental, not validated), the withheld list and the research-simulation role |
| 12 | Game-detail entry | Card action → report / simulation | Lane card link, only when built | Unchanged rule. The link exists only for ids from `publicTheaterRouteIds`, the same predicate as the route's `generateStaticParams`. Homepage rows link to the game's `/nba` card (`hubLaneAnchor`); `/` imports nothing from the Theater |
| 13 | Results | Results section and link | Section at the bottom | Linked from the overview, the strip, and the game page's nav and legend. A recorded final also shows on the card and on the game page as the "Real Result" |
| 14 | Empty states | Designed empty line, never blank | "Schedule only — no public forecast" whenever the lane was stale | Four honest states. PUBLISHED. PENDING: "not published yet — frozen before tip-off", with schedule-only cards. NO_GAMES: names the next game. DISABLED: the original "Schedule only — no public forecast" |
| 15 | Mobile | Single column, no horizontal scroll | OK | Cards auto-fill (17.5rem minimum). The official table scrolls inside its own box, so the page does not scroll sideways. Checked at 320 / 390 / 768 / 1440 (see PR) |
| 16 | Keyboard | Native links and buttons, visible focus | — | Skip link to an in-page anchor; the target section has `tabindex=-1` and gets focus. Focus rings on the nav strip and the section. One link per card and per lane row |
| 17 | Touch targets ≥ 44px | `gtp-hit-44`, `.gtp-ev-cta` | — | Overview pills, game-page nav, lane rows and the card CTA are all ≥ 44px |
| 18 | Page weight | `page-weight-budgets.mjs` ceilings | `/nba/` 233.7 KB of 250 | See the PR body (measured in a local build under the shared lock). TeamLogo's four layout utilities moved into `.gtp-team-logo` byte-for-byte, so every crest on every page is ~50 B lighter |
| 19 | Loading | Static export, SSR first paint | SSR | SSR. The official section is in the HTML before any script runs; card status advances on the reader's clock (`GameStatusOnClock`) instead of freezing a build-time "Upcoming" |
| 20 | Console errors | None | None | None at the four widths (see PR) |

## Distinction on the game page

| Part | What it is | Where |
|------|-----------|-------|
| **Official Prediction** | Frozen before tip-off: Elo-favoured side; player MIN / PTS / REB / AST / 3PM medians; PRA, P+R and P+A from the frozen combined distributions (medians of per-draw sums, never sums of medians) | "GameTimePicks Official Predictions", rendered on the server below the Theater. Combos print only for lane rows that reconcile with the official row. Otherwise "—", never 0 |
| **Research Simulation** | One replay from the unvalidated possession engine, with its simulated box score | The Theater and its "Simulation outcome · this run" panels (unchanged) |
| **Real Result** | The official final from the write-once finals record | The game page legend and `/nba/#nba-results` |

## Guards changed (and why)

- `simulation-hub-promotion.test.mjs`: "NBA stays out by name" is replaced by an evidence gate, as the founder
  directive requires. NBA is primary only with today's official forecast, or a committed one at most 3 days old. A
  schedule alone, a stale publication or the lane's rollback switch keeps it under "Other coverage". The other promotion
  doors are unchanged.
- `busiest-state.test.mjs`: adds a busiest NBA lane (a 15-game night) with its own `NBA_LANE_BUDGET`. The four-lane
  `LANE_BUDGET` is unchanged, and the built first-viewport check now includes the NBA lane, which makes it stricter.
- `experimental-public-lane.test.mjs` and `projection-board-dates-status.test.mjs`: add `globalThis.React = React`, the
  same harness line their sibling NBA tests already use, because the card now renders TeamLogo. No assertion changed.
  The per-card < 900 B guard still holds.

## Not done here (follow-ups)

- `/methodology` still describes NBA as "frozen history" and says "MLB is the only sport producing model output". That
  copy predates the 10-20/10-21 decisions, and fixing it is methodology wording, not UI.
- The schedule row status ("Upcoming") in the long `/nba` list is still build-time, as on every hub. Today's games
  have clock-based status on their cards.
