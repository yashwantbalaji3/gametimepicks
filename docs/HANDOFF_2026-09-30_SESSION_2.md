# Handoff: 2026-09-30, Session 2: Ask GameTime

**Scope:** Ask reliability, grounding and product experience. This is a point-in-time snapshot. For current truth, read the repo, `/data/build-info.json` and `gh pr list`. It continues [`HANDOFF_2026-09-30_SESSION_1B.md`](./HANDOFF_2026-09-30_SESSION_1B.md).

## Settlement runtime (F1 proof)

- **Status:** pending. No 2026-10-01 nightly-settle slot has run yet; the first is at 05:17Z.
- **Next check (Session 1B's, unchanged):**
  - The first Oct 1 slot writes `2026-10-01.json`.
  - A later slot after daily-products appends `2026-10-01.r2.json`.
  - The original stays byte-identical, and the workflow stays green.
- **Earlier red runs:** the three red 09-30 runs (13:01Z, 14:53Z, 16:03Z) predate #858. Session 1B already recorded them as class C refusals.

## Why Ask fell back

Every cause was reproduced, and each was then measured on the real model: the PR preview is non-production and exposes `usage.verifierViolations`. None of the fixes loosened a truth rule.

| # | Cause | Evidence | Fix |
|---|---|---|---|
| 1 | A probability was paraphrased as a pick | PIT 54.4% / CLE 42.6% with no pick became "GameTimePicks favors Pittsburgh". The verifier refused it as `UNSUPPORTED_PICK`, which is correct. The retry ("no unsupported numbers") was the fix for a different rule; the writer said "expects Pittsburgh to win" and was refused again. | The writer is taught the kinds of evidence. A rule-specific retry. Rule ids per attempt. |
| 2 | **False-positive class eight:** an href read as a number | The forecast tool's own link `/nfl/game/401872964/` failed the numeric check. On the preview this caused **2 of 3** fallbacks for "the Steelers game", and no retry can fix a correct link. | Only hrefs the evidence issued are exempt; an invented `/nfl/game/999999999/` is still refused. |
| 3 | Retrieval | Named teams were narrowed to today's date. "PIT" resolved to the MLB Pirates, and the refusal said "no forecast is published for 2026-10-01". | A planner rule for named teams (with sport, no date). A refusal names the filter that emptied it. |
| 4 | Live gateway shape drift | Live evidence read "Null not reported" for PHI 1 – ATL 3. The eval stub used the same invented shape, so the eval passed. | The tool reads `competitors.*`, counts states itself, and never prints "null". |
| 5 | Two teams resolved as one | Yankees vs Red Sox came back as "those are the same team", then "? wins and ? losses". | Placeholders take distinct resolutions. Evidence reads the owner's `w`/`l`/`t`. |

## Shipped

| PR | What |
|---|---|
| #863 | Rule ids (`ASK_VERIFY_RULE`) and claim spans. `receipt.attempts[]`, never overwritten. `retryReason`, `fallbackReason`. The retry comes from `ASK_RETRY_GUIDANCE[rule]`. KINDS OF EVIDENCE in the writer. The Production audit line logs `verifierRules`, `attemptOutcomes`, `retryReason`, `fallbackReason` (check names only). Negation gains nothing/none/neither, with intensifier idioms stripped. A pick is cleared only by a negation *before* it ("likes PIT, not CLE" is refused). A W–L given to GameTime must appear as a record (recent form "4 of 5" had passed as "GameTime is 4-1" on real data). The class-eight href exemption. Forecast refusals name the filter. The named-team planner rule. |
| #864 | `getResultsDay`: "how did GameTimePicks do yesterday?" from the Results V2 owners that `/results/date/<d>/` renders. They go into the daily `results.json` `days` field. ET yesterday; nothing totalled; pending is never a loss. Distinct placeholder resolution. The team-compare W–L field names. The live gateway's real shape. |
| #865 | Ask UX. Composer-first empty state (390px input top 414 of 844px; it had been below the fold). Grouped starters, each verified on Production. `readableAnswer`: no `[E2:report]` tokens, ET timestamps, no raw markdown links, no duplicate link lines. A list-aware renderer. A label on fallback answers. |
| #866 | `* ` and numbered lists render as lists. Gemini's bullets had rendered as one run-on line on Production; after the deploy the "yesterday" answer rendered 7 list items at 390px and 10 at 1280px. |
| #867 | Every registry tool has a "Used:" label. Six Results/Coverage tools had leaked their function name, e.g. "Used: getResultsDay". A test requires a label per tool. |

## Evals

- **Before:** 128/128, from a writer that echoes the evidence.
- **After:** 140 cases and 1054 checks. New:
  - `para-01..05`: a paraphrasing writer that learns only from the rule-specific retry; attempt-1 audit preserved; published-pick positive control; negation positive control; inline evidence links.
  - `mut-25..28`: "nothing but" injury; contrast pick; recent form as a GameTime record; a writer summing the day into "9-4, a 69% day".
  - `rday-01..03`: settled, pending and missing day.
  - `live-01` now requires the real teams and score.
- **Mutation probes.** Each landed, was caught, and was restored by md5:
  - the pick verb;
  - generic retry;
  - attempt-1 overwrite;
  - negation (all words, and `none` alone);
  - negation scope;
  - the "nothing but" idiom;
  - the GameTime-record rule;
  - market-context withholding;
  - the href exemption;
  - yesterday changed to today;
  - pending changed to lost;
  - distinct resolution;
  - the live shape read.
- ⚠ **Three guards were first vacuous and were fixed:**
  - the negation control was already negated by "has not published";
  - the compare test asserted on public evidence that never carries refusal details;
  - the live eval stub used a shape the gateway does not produce.

## Production acceptance

All on `2809caa974`, the #865 deploy, with the real provider.

| Question | Result |
|---|---|
| What does GameTimePicks think about the Steelers game? | PASS on attempt 1. PIT 54.4% / CLE 42.6%. "Has not published a separate pick". Links the NFL game report. |
| Who does GTP pick in the Steelers game? | PASS. No separate pick; gives the probabilities. |
| Why? (as a follow-up) | PASS. Restates the model's numbers and invents no cause. NFL forecasts publish no `why` factors. |
| Liverpool v Manchester City | PASS. It had previously fallen back as "nothing published today". |
| What's happening today? | PASS. PHI 3, ATL 3, Top 9th, plus the counts. It had previously fallen back with "Null not reported". |
| How did GameTimePicks do yesterday? | PASS. Every 09-29 call keeps its own grade, with no combined figure, and links `/results/date/2026-09-29/`. It had previously answered "not one of NFL, EPL, or UFC". |
| How has Josh Allen / Juan Soto performed recently? | PASS. Real recent values, labelled as history. |
| Build me a medium-risk card. | Honest withhold: all 24 candidates use market-context families. |
| Compare the Yankees and the Red Sox | PASS. Head-to-head 25–19; season 41–26 vs 40–28. It had previously said "same team", then "? wins". |
| Is Lamar Jackson injured / what's the DraftKings line? | Refused: GameTimePicks holds neither. |

- **UI, on Production with real answers, at 390px and 1280px:**
  - no horizontal overflow, no console errors, no broken images;
  - no `[E…]`, raw ISO timestamp, `](/`, `undefined`, `NaN` or `null` in `<main>`;
  - the input keeps focus.
- **Deep links:** all return 200: `/results/date/2026-09-29/`, `/nfl/game/401872964/`, `/live/`, `/build/`, `/results/`, `/compare/teams/mlb/?a=…&b=…`, `/epl/match/liverpool-v-manchester-city-2026-10-11/`.

## Not changed

- Verifier strictness: tightened in four places and loosened nowhere. Class eight exempts only hrefs the evidence itself issued.
- Model publication status, product eligibility, settlement semantics.
- Suggested / Bank Builder / Moonshot methodology.
- Odds spend.
- Soccer leagues.

## Founder decisions required

None.

## DP

No tasks assigned; onboarding only.

## Backlog (Ask)

- **"This week's NFL forecasts":** the tool takes one date, and an omitted date is today. It needs a bounded upcoming-window argument.
- **A standalone "why does the model give Pittsburgh…"** resolves to the MLB Pirates. The refusal is now honest, but the planner should pass the sport from context.
- **Player comparison default family:** the compare owner picks 2022 receiving yards for two QBs. That's the owner's selection, not Ask's.
- **Raw stat keys in player form** ("hitsRunsRbis"): the evidence should use labels.
- **Writer follow-up suggestions** can offer questions Ask cannot answer, e.g. "results for MLB player-prop leans", which are market-context families and not listed. Follow-ups are not grounded against the tool catalogue.
- **"What changed?"** is not built: there is no clean change-feed owner.
- **Session 1B backlog, unchanged:** decided-lane pending-leg copy, player-prop game identity, UX-1 nav owner, mobile page length, mono labels.

## Next recommended fresh session

Read the Oct 1 nightly-settle slots (the F1 proof). Then take one bounded roadmap item. Soccer expansion needs founder authorization.
