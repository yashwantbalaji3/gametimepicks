/**
 * Release A guards (Program 177): the NFL hub is organised around ONE slate day derived from the
 * canonical index, every simulated game on that slate opens a full report, and the hub uses the
 * shared UI owners `/mlb` already had instead of forked one-offs.
 *
 * These assert STRUCTURE and CONTRACT, not a date. Five guards in this repository broke at a UTC
 * rollover because they pinned "2026-08-13"; nothing here pins a day.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const hub = fs.readFileSync(path.join(APP, "src/app/nfl/page.tsx"), "utf8");
const route = fs.readFileSync(path.join(APP, "src/app/nfl/game/[eventId]/page.tsx"), "utf8");
const card = fs.readFileSync(path.join(APP, "src/components/event-card.tsx"), "utf8");
/** The hub with its own commentary stripped — a comment explaining a removed sentence must not
 *  itself trip the guard that checks the sentence is gone. */
const hubProse = hub.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const anchorSrc = fs.readFileSync(path.join(APP, "src/lib/sports/nfl/slate-anchor.mjs"), "utf8");
const index = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/index.json"), "utf8"));
const schedule = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule/latest.json"), "utf8"));

/*
 * The slate day comes from the SAME function the page calls.
 *
 * This guard used to compute `etDay(index.nextKickoffUtc)` in its own copy of the expression. When
 * a failing nfl-event-window froze the index a day behind the schedule, the page rendered an empty
 * slate and the guard reproduced the identical mistake — then reported it as "the derived slate day
 * must contain at least one game", which names a symptom and not one word of the cause.
 *
 * Two copies of a rule are two chances to be wrong together. There is now one copy, in
 * lib/sports/nfl/slate-anchor.mjs, and this file exercises it rather than restating it.
 */
import { deriveSlateAnchor, etDay } from "./slate-anchor.mjs";

test("the slate day is DERIVED from the canonical index, never pinned", () => {
  // The derivation moved into slate-anchor.mjs so the page and this guard share one copy of the
  // rule. That means the claim has to be checked WHERE IT NOW LIVES: the hub must delegate, and the
  // module it delegates to must be the thing reading the index. Asserting only that the hub calls
  // some function would pass no matter what that function did.
  assert.match(hub, /deriveSlateAnchor\(index, allScheduled\)/, "the hub delegates to the one anchor rule");
  assert.match(anchorSrc, /index\?\.nextKickoffUtc/, "the anchor is the index's own next kickoff");
  const anchorPinned = anchorSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").match(/\b20\d\d-\d\d-\d\d\b/g) ?? [];
  assert.deepEqual(anchorPinned, [], `the anchor rule must not pin a date, found ${anchorPinned.join(", ")}`);
  // No hard-coded calendar day anywhere in the hub's CODE. Scanned against the comment-stripped
  // copy for the same reason it exists two assertions below: a comment recording the date of an
  // incident is documentation, not a pinned slate, and tripping on it teaches the next author to
  // delete the explanation rather than the pin. Code is held to exactly the same standard.
  const pinned = hubProse.match(/\b20\d\d-\d\d-\d\d\b/g) ?? [];
  assert.deepEqual(pinned, [], `the hub must not pin a date, found ${pinned.join(", ")}`);
  assert.ok(index.nextKickoffUtc, "the index publishes an anchor to derive from");
});

test("EVERY game on the derived slate day renders, and every simulated one opens a full report", () => {
  const scheduled = schedule.rows
    .filter((r) => r.statusRaw === "STATUS_SCHEDULED")
    .sort((a, b) => a.dateUtc.localeCompare(b.dateUtc));
  const { slateDay, source } = deriveSlateAnchor(index, scheduled);
  const slate = scheduled.filter((r) => etDay(r.dateUtc) === slateDay);
  // The claim is about the RULE, not about today's calendar: whatever day the rule selects, the
  // schedule must actually have games on it. That is exactly what an anchor is for, and it is the
  // assertion that the stale index broke. Its only honest exemption is a schedule with nothing in
  // it at all — an off-season capture is not a defect, and the state is named rather than assumed.
  if (scheduled.length === 0) {
    assert.equal(source, "NONE", "an empty schedule must resolve to NONE, never to a confident day");
    return;
  }
  assert.notEqual(source, "INDEX_UNCORROBORATED", "a day no scheduled game corroborates must never be the slate");
  assert.ok(slate.length > 0, `the rule selected ${slateDay} (via ${source}) and no game is scheduled on it`);

  const eventIds = new Set(index.events.map((e) => e.providerEventId));
  const simulated = slate.filter((g) => eventIds.has(g.providerEventId));
  // whatever is simulated must be reachable: the deep route static-generates from this artifact
  assert.match(route, /generateStaticParams/);
  assert.match(route, /dynamicParams = false/);
  for (const g of simulated) {
    const e = index.events.find((x) => x.providerEventId === g.providerEventId);
    assert.ok(e.projectedScore && e.winProbability && e.total,
      `${g.shortName}: a simulated game must carry a score, a win chance and a total`);
  }
  // the hub links by provider event id — the same key the route generates from
  // P183: the hub now links the SHARED experience at /games/nfl/<slug> — the same page MLB uses —
  // rather than the bespoke /nfl/game route built before NFL fed the shared contract. The intent
  // ("every simulated game opens a full report") is better served, not weakened.
  // P244: the card links the FORECAST report route (generated for every published forecast);
  // the /games/nfl deep-sim page exists only when a participation-backed simulation was produced,
  // and sixteen dead sim links shipped the night the weekly population landed without it.
  assert.match(hub, /\/nfl\/game\/\$\{g\.providerEventId\}\//);
  // a game WITHOUT a simulation is stated as such rather than rendered blank — and since P243
  // C-NFL the absence carries its REASON: a future game says the simulation is coming; a game
  // that kicked off unforecast is missed coverage, never backfilled.
  // REBASED P246: the old copy quoted "from 18 hours before kickoff" — a mechanism detail the
  // founder had removed from the browsing path (and stale: the population is the week, not a
  // clock window). Absence still explains itself, without the internal window number.
  assert.match(hub, /Simulation publishes closer to kickoff and says so here when it does/);
  assert.match(hub, /missed coverage, never backfilled/);
});

test("P243 C-NFL · the lead section is the NATURAL WEEK from the shared read model", () => {
  assert.match(hub, /loadNflEvents|currentPeriodKey/, "period membership comes from the read model");
  assert.match(hub, /eventsInPeriod\(nflEvents, weekKey\)/, "the selected period's events scope the table");
  assert.match(hub, /weekIds\.has\(String\(r\.providerEventId\)\)/, "schedule rows are scoped by period membership, not by one ET day");
  // The missed-coverage count renders when present — a miss is preserved in the header, not folded.
  assert.match(hub, /missedPreEvent \? `, \$\{weekCounts\.missedPreEvent\} missed pre-event coverage` : ""/,
    "the week header preserves missed coverage as its own count");
});

test("the hub CONSUMES canonical state and does not recompute lifecycle", () => {
  /*
   * P252 REBASE. The claim is that the hub does not ROLL ITS OWN lifecycle logic, and it pinned
   * the inline comparison that was the only way to consume the stamp at the time. That comparison
   * was itself the defect: the stamp is written when the event window runs, so the table said
   * "scheduled" beside a game that had kicked off three hours earlier. The hub now consumes the
   * shared owner, which is MORE of what this test asks for — so the assertion moves to the owner
   * and additionally forbids the inline form coming back.
   */
  assert.match(hub, /hasStarted\(/, "started-ness comes from the shared lifecycle owner");
  assert.doesNotMatch(hub, /\.lifecycle\s*(?:===|!==)\s*"/, "the hub must not compare the raw stamp itself");
  /* `Date.now()` is one of two ways to read a clock, and the other one nearly shipped here: a
     first draft of the capture label used `new Date()` to decide whether to print the date, which
     on a static export freezes at BUILD time — a page built Saturday still says "today" on Sunday.
     Both spellings are refused; the label prints the date unconditionally instead. */
  assert.doesNotMatch(hub, /Date\.now\(\)/, "a statically exported page must not compare against build-time now");
  /* Scoped to the LABEL, not the file: the page deliberately takes one build instant for the whole
     render (P252, so two rows are never judged against two clocks), and banning that outright would
     be a detector that fires on the convention instead of the defect. What must never read a clock
     is the capture stamp — "today" there is the build day, not the reader's. */
  const labelFn = hub.slice(hub.indexOf("function capturedLabel"), hub.indexOf("function lastCaptureLabel"));
  assert.ok(labelFn.length > 50, "the capture-label helper must be found for this check to mean anything");
  assert.doesNotMatch(labelFn, /Date\.now\(\)|new Date\(/, "the capture stamp must not be decided from the build clock");
  // REBASED P246: the hero's price count is the WEEK's own (the index's counts block still
  // carried the archived Aug capture after authorization expired — "1" beside a slate with no
  // current prices). The count derives from rows scoped to the selected week, and the zero
  // state names why. The index still owns lifecycle; only this stat moved to the honest scope.
  assert.match(hub, /String\(slateMarketRows\.length\)/);
  /* REPOINTED 2026-09-12: the zero state said "capture not authorized", which stopped being true
     on 2026-09-10 when the founder's renewed NFL receipt landed (500-credit ceiling, expiry at the
     ceiling). What was missing was a RUN, not a permission — and a guard that pins a false reason
     keeps it false. The copy now states only what is observable: the date of the last capture. */
  assert.match(hub, /none current — last capture/);
  assert.doesNotMatch(hub, /capture not authorized/, "the reason must not outlive the authorization it describes");
  // And the capture stamp always carries its date: a bare clock reads as today whatever day it is.
  assert.match(hub, /captured \$\{month\} \$\{Number\(iso\.slice\(8, 10\)\)\}/);
});

test("SHARED OWNERS · the five parity rows are closed by adoption, not by forking", () => {
  for (const [owner, mod] of [
    ["SportOverviewHero", "@/components/sport-overview-hero"],
    ["FreshnessBadge", "@/components/ui/freshness-badge"],
    ["SectionHeader", "@/components/section-header"],
    ["EventCard", "@/components/event-card"],
    ["QuickActionRail", "@/components/quick-action-rail"],
  ]) {
    assert.ok(hub.includes(`import ${owner} from "${mod}"`), `the hub must import the shared ${owner}`);
    assert.ok(new RegExp(`<${owner}[\\s>]`).test(hub), `the hub must actually render ${owner}`);
  }
  // /mlb uses the same owners — that is what makes this parity rather than coincidence
  const mlb = fs.readFileSync(path.join(APP, "src/app/mlb/page.tsx"), "utf8");
  for (const owner of ["SportOverviewHero", "FreshnessBadge", "SectionHeader", "QuickActionRail"]) {
    assert.ok(mlb.includes(owner), `/mlb is the owner of record for ${owner}`);
  }
});

test("EventCard is layout-only — it fetches nothing and decides nothing", () => {
  for (const f of ["node:fs", "process.cwd", "fetch(", "public/data"]) {
    assert.ok(!card.includes(f), `a layout card must not contain ${f}`);
  }
  assert.match(card, /interactive[\s*]+content inside a link/, "the CTA-not-wrapper decision is recorded");
});

test("the hub no longer contradicts itself about publishing simulations", () => {
  assert.ok(!/No NFL models, simulations, or picks are published/.test(hubProse),
    "the page publishes simulations; claiming otherwise is the contradiction the index exists to catch");
  assert.match(hubProse, /published as experimental and are never presented as\s+picks/);
  assert.equal(index.contradictions.length, 0, "the canonical index reports no contradiction");
});

test("LABEL DISCIPLINE survives the rebuild", () => {
  const prose = hubProse;
  for (const banned of ["lock", "best bet", "guaranteed", "profitable", "high-confidence"]) {
    assert.doesNotMatch(prose, new RegExp(`\\b${banned}\\b`, "i"), `the hub must not say "${banned}"`);
  }
  // "beat the market" appears only inside a denial
  for (const m of prose.matchAll(/beats? the (?:sportsbook )?market/gi)) {
    const before = prose.slice(Math.max(0, m.index - 60), m.index);
    assert.match(before, /\bnot\b[^.]{0,40}$|\bnever\b[^.]{0,40}$/i, `"${m[0]}" must appear only inside a denial`);
  }
});
