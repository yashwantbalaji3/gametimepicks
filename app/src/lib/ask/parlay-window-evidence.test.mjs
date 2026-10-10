/**
 * The parlay-window evidence judge — mutation suite.
 *
 * The published-parlays guard (ask-published.test.mjs) runs on the built export, so it only ever sees today's
 * window. These run in the unit phase on fixtures shaped exactly like the producer's output
 * (pipeline/snapshot_optimizer.py `generationReceipt`) and prove, case by case, that the judge
 *   - PASSES a genuinely evidenced empty window (the real 2026-10-08 / 09 / 10 shape), and
 *   - FAILS each bad case: missing output, failed run, stale artifact, incomplete or self-contradicting receipt,
 *     absent evidence, unexplained emptiness, unusable inputs — including when other days carry candidates.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { judgeParlayWindow, snapshotEvidence, windowAudit, PARLAY_DAY_VERDICT as V } from "./parlay-window-evidence.mjs";

const SECTIONS = { low: 2, medium: 3, high: 4, longshot: 5 };
const clone = (x) => JSON.parse(JSON.stringify(x));

function board({ date, games = 1, leans = 40, gen = `${date}T09:27:00+00:00` }) {
  return { date, generatedAt: gen, games, leans, pendingReason: games ? null : "no_events" };
}

/** A snapshot as snapshot_optimizer.py writes it, receipt included. */
function snapshot({ date, games = 1, legs = 37, eligible = { low: 1, medium: 1, high: 1, longshot: 1 }, slips = {}, receipt = true, b }) {
  const gen = `${date}T09:27:47+00:00`;
  const legPool = { legs: Array.from({ length: legs }, (_, i) => ({ gameId: `g${i % Math.max(games, 1)}` })) };
  const publicRiskSections = Object.fromEntries(Object.keys(SECTIONS).map((s) => [s, {
    all: Array.from({ length: slips[s] ?? 0 }, () => ({})), nba: [], mlb: Array.from({ length: slips[s] ?? 0 }, () => ({})), multi: [],
  }]));
  const distinctGames = legs ? games : 0;
  const publicSlips = Object.values(slips).reduce((n, v) => n + v, 0);
  const reason = (s) => {
    if ((slips[s] ?? 0) > 0) return null;
    if (legs === 0) return "no_leg_pool";
    if (SECTIONS[s] > distinctGames * 2) return "structurally_infeasible";
    if ((eligible[s] ?? 0) < SECTIONS[s]) return "insufficient_eligible_legs";
    return "no_priced_compatible_combination";
  };
  const doc = { date, generatedAt: gen, totalSlips: publicSlips, legPool, publicRiskSections };
  if (receipt) {
    doc.generationReceipt = {
      receiptVersion: 1, producer: "pipeline.snapshot_optimizer", status: "completed", date, generatedAt: gen,
      outcome: publicSlips ? "SLIPS_BUILT" : b.games === 0 && b.leans === 0 ? "NO_QUALIFYING_GAMES" : "NO_ELIGIBLE_SLIPS",
      inputs: {
        nba: { present: false, parsed: false, games: null, leansLoaded: 0, generatedAt: null, pendingReason: null },
        mlb: { present: true, parsed: true, games: b.games, leansLoaded: b.leans, generatedAt: b.generatedAt, pendingReason: b.pendingReason },
      },
      legPool: { totalLegs: legs, distinctGames },
      publicSlips,
      publicSections: Object.fromEntries(Object.entries(SECTIONS).map(([s, min]) => [s, {
        minLegs: min, maxLegs: min + 1, maxLegsPerGame: 2,
        eligibleLegs: { all: eligible[s] ?? 0, nba: 0, mlb: eligible[s] ?? 0 },
        candidates: { all: slips[s] ? 10 : 0, nba: 0, mlb: slips[s] ? 10 : 0 },
        slips: slips[s] ?? 0, emptyReason: reason(s),
      }])),
    };
  }
  return doc;
}

/** Assemble the projection's parlays.json the way buildParlays does: one day per snapshot + the window audit. */
function project(snaps, boards, { failures = {}, extraBoardDates = [], askSlips = {}, withheld = {} } = {}) {
  const byDate = {};
  for (const [date, doc] of Object.entries(snaps)) {
    byDate[date] = {
      date, generatedAt: doc.generatedAt,
      profiles: askSlips[date] ? { LOW: Array.from({ length: askSlips[date] }, () => ({ sport: "MLB" })) } : {},
      withheldMarketContext: withheld[date] ?? 0,
      evidence: snapshotEvidence(date, doc, { mlb: boards[date] ? { generatedAt: boards[date].generatedAt } : null, nba: null }),
    };
  }
  const dates = Object.keys(byDate).sort();
  return {
    dates, byDate,
    windowAudit: windowAudit({ windowDates: dates, snapshotDates: dates, boardDates: [...Object.keys(boards), ...extraBoardDates], failures }),
  };
}

/** The real 2026-10-10 window, as the producer now records it. */
function realWindow() {
  const boards = {
    "2026-10-08": board({ date: "2026-10-08", games: 1, leans: 43 }),
    "2026-10-09": board({ date: "2026-10-09", games: 0, leans: 0 }),
    "2026-10-10": board({ date: "2026-10-10", games: 1, leans: 41 }),
  };
  const snaps = {
    "2026-10-08": snapshot({ date: "2026-10-08", legs: 35, eligible: { low: 1, medium: 2, high: 3, longshot: 3 }, b: boards["2026-10-08"] }),
    "2026-10-09": snapshot({ date: "2026-10-09", games: 0, legs: 0, eligible: {}, b: boards["2026-10-09"] }),
    "2026-10-10": snapshot({ date: "2026-10-10", legs: 37, eligible: { low: 0, medium: 1, high: 1, longshot: 1 }, b: boards["2026-10-10"] }),
  };
  return { boards, snaps };
}

const verdictOf = (j, date) => j.days.find((d) => d.date === date)?.verdict;

/* ─────────────────────────────  THE GENUINE CASES PASS  ───────────────────────────── */

test("a genuinely evidenced empty window passes: single-game slates and an off day", () => {
  const { boards, snaps } = realWindow();
  const j = judgeParlayWindow(project(snaps, boards));
  assert.deepEqual(j.fatal, []);
  assert.equal(j.vacuous, true);
  assert.equal(verdictOf(j, "2026-10-08"), V.EMPTY_EVIDENCED);
  assert.equal(verdictOf(j, "2026-10-09"), V.NO_QUALIFYING_GAMES);
  assert.equal(verdictOf(j, "2026-10-10"), V.EMPTY_EVIDENCED);
});

test("a window with candidates passes, and a pre-receipt empty day beside it is tolerated (F-1 unchanged)", () => {
  const { boards, snaps } = realWindow();
  snaps["2026-10-11"] = snapshot({ date: "2026-10-11", games: 3, legs: 90, eligible: { low: 8 }, slips: { low: 6 }, b: (boards["2026-10-11"] = board({ date: "2026-10-11", games: 3, leans: 110 })) });
  delete snaps["2026-10-08"].generationReceipt; // older than every receipt → legacy
  const j = judgeParlayWindow(project(snaps, boards, { askSlips: { "2026-10-11": 6 } }));
  assert.deepEqual(j.fatal, []);
  assert.equal(verdictOf(j, "2026-10-11"), V.HAS_SLIPS);
  assert.equal(verdictOf(j, "2026-10-08"), V.MISSING_EVIDENCE);
});

test("a card-leg withholding still makes a window non-vacuous", () => {
  const { boards, snaps } = realWindow();
  for (const d of Object.values(snaps)) delete d.generationReceipt;
  const j = judgeParlayWindow(project(snaps, boards, { withheld: { "2026-10-10": 4 } }));
  assert.deepEqual(j.fatal, []);
  assert.equal(verdictOf(j, "2026-10-10"), V.WITHHELD);
});

/* ─────────────────────────────  EVERY BAD CASE FAILS  ───────────────────────────── */

const fails = (j, verdict, re) => {
  assert.ok(j.fatal.length > 0, "expected the judge to fail");
  assert.ok(j.fatal.some((f) => f.startsWith(verdict) || (re && re.test(f))), `expected a ${verdict} failure, got:\n${j.fatal.join("\n")}`);
};

test("MUTATION absent evidence: today's real state (three pre-receipt empty days) fails as vacuous", () => {
  const { boards, snaps } = realWindow();
  for (const d of Object.values(snaps)) delete d.generationReceipt;
  const j = judgeParlayWindow(project(snaps, boards));
  fails(j, V.MISSING_EVIDENCE);
  assert.ok(j.fatal.some((f) => /pass vacuously/.test(f)));
});

test("MUTATION absent evidence: a receipt-less snapshot newer than a receipt-bearing one fails even beside candidates", () => {
  const { boards, snaps } = realWindow();
  snaps["2026-10-08"] = snapshot({ date: "2026-10-08", games: 3, legs: 90, eligible: { low: 8 }, slips: { low: 6 }, b: boards["2026-10-08"] });
  delete snaps["2026-10-10"].generationReceipt;
  const j = judgeParlayWindow(project(snaps, boards, { askSlips: { "2026-10-08": 6 } }));
  fails(j, V.MISSING_EVIDENCE, /stopped recording/);
});

test("MUTATION missing output: an upstream board with no snapshot fails, even when the window has candidates", () => {
  const { boards, snaps } = realWindow();
  snaps["2026-10-10"] = snapshot({ date: "2026-10-10", games: 3, legs: 90, eligible: { low: 8 }, slips: { low: 6 }, b: boards["2026-10-10"] });
  const j = judgeParlayWindow(project(snaps, boards, { extraBoardDates: ["2026-10-11"], askSlips: { "2026-10-10": 6 } }));
  fails(j, V.MISSING_OUTPUT);
  assert.equal(verdictOf(j, "2026-10-11"), V.MISSING_OUTPUT);
});

test("MUTATION missing output: no snapshot at all, only a board", () => {
  const j = judgeParlayWindow(project({}, { "2026-10-10": board({ date: "2026-10-10" }) }));
  fails(j, V.MISSING_OUTPUT);
});

test("MUTATION failed run: a recorded failure with no snapshot fails as FAILED_RUN, not as missing output", () => {
  const { boards, snaps } = realWindow();
  const j = judgeParlayWindow(project(snaps, boards, {
    extraBoardDates: ["2026-10-11"],
    failures: { "2026-10-11": { attemptedAt: "2026-10-11T09:27:00+00:00", errorType: "KeyError" } },
  }));
  fails(j, V.FAILED_RUN);
  assert.equal(verdictOf(j, "2026-10-11"), V.FAILED_RUN);
});

test("MUTATION failed run: a failure newer than the date's snapshot fails (the latest attempt crashed)", () => {
  const { boards, snaps } = realWindow();
  const j = judgeParlayWindow(project(snaps, boards, { failures: { "2026-10-10": { attemptedAt: "2026-10-10T15:00:00+00:00", errorType: "ValueError" } } }));
  fails(j, V.FAILED_RUN);
});

test("MUTATION stale artifact: the board was regenerated after the run read it", () => {
  const { boards, snaps } = realWindow();
  boards["2026-10-10"] = { ...boards["2026-10-10"], generatedAt: "2026-10-10T13:00:00+00:00" };
  fails(judgeParlayWindow(project(snaps, boards)), V.STALE_OR_INCOMPLETE, /regenerated/);
});

test("MUTATION stale artifact: a pre-receipt snapshot older than its board fails even beside candidates", () => {
  const { boards, snaps } = realWindow();
  snaps["2026-10-10"] = snapshot({ date: "2026-10-10", games: 3, legs: 90, eligible: { low: 8 }, slips: { low: 6 }, b: boards["2026-10-10"] });
  delete snaps["2026-10-08"].generationReceipt;
  boards["2026-10-08"] = { ...boards["2026-10-08"], generatedAt: "2026-10-08T20:00:00+00:00" };
  fails(judgeParlayWindow(project(snaps, boards, { askSlips: { "2026-10-10": 6 } })), V.STALE_OR_INCOMPLETE, /regenerated/);
});

test("MUTATION incomplete / self-contradicting receipts each fail", () => {
  const mutations = {
    "status not completed": (d) => { d.generationReceipt.status = "partial"; },
    "receipt from another run": (d) => { d.generationReceipt.generatedAt = "2026-10-09T09:00:00+00:00"; },
    "receipt slip count disagrees": (d) => { d.generationReceipt.publicSlips = 3; },
    "receipt leg count disagrees": (d) => { d.generationReceipt.legPool.totalLegs = 99; },
    "receipt for another date": (d) => { d.generationReceipt.date = "2026-10-09"; },
    "unknown receipt version": (d) => { d.generationReceipt.receiptVersion = 2; },
    "section missing from the snapshot": (d) => { delete d.publicRiskSections.high; },
    "section missing from the receipt": (d) => { delete d.generationReceipt.publicSections.low; },
    "snapshot has no leg pool": (d) => { delete d.legPool; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const { boards, snaps } = realWindow();
    mutate(snaps["2026-10-10"]);
    const j = judgeParlayWindow(project(snaps, boards));
    assert.ok(j.fatal.some((f) => f.startsWith(V.STALE_OR_INCOMPLETE)), `${name}: expected STALE_OR_INCOMPLETE, got ${JSON.stringify(j.fatal)}`);
  }
});

test("MUTATION unexplained emptiness: enough legs and no slip is not accepted as a reason", () => {
  for (const reason of ["no_priced_compatible_combination", "selector_dropped_all", "something_new", null]) {
    const { boards, snaps } = realWindow();
    snaps["2026-10-10"].generationReceipt.publicSections.low.emptyReason = reason;
    snaps["2026-10-10"].generationReceipt.publicSections.low.eligibleLegs.all = 12;
    fails(judgeParlayWindow(project(snaps, boards)), V.MISSING_EVIDENCE, /not explained/);
  }
});

test("MUTATION a stated reason the receipt's own counts contradict is not evidence", () => {
  const cases = {
    "structural with 3 games": (r) => { r.legPool.distinctGames = 3; },
    "insufficient with enough legs": (r) => { r.publicSections.low.eligibleLegs.all = 5; },
    "no leg pool with legs": (r) => { r.publicSections.medium.emptyReason = "no_leg_pool"; },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const { boards, snaps } = realWindow();
    mutate(snaps["2026-10-10"].generationReceipt);
    const j = judgeParlayWindow(project(snaps, boards));
    assert.ok(j.fatal.length > 0, `${name}: a contradicted reason must not pass`);
  }
});

test("MUTATION unusable inputs: missing, unreadable or prop-less boards are not an empty day", () => {
  for (const outcome of ["INPUTS_MISSING", "INPUTS_UNREADABLE", "INPUTS_WITHOUT_PROPS"]) {
    const { boards, snaps } = realWindow();
    snaps["2026-10-10"].generationReceipt.outcome = outcome;
    fails(judgeParlayWindow(project(snaps, boards)), V.STALE_OR_INCOMPLETE, /not usable/);
  }
});

test("MUTATION a NO_QUALIFYING_GAMES claim its own inputs contradict fails", () => {
  const { boards, snaps } = realWindow();
  snaps["2026-10-09"].generationReceipt.inputs.mlb.games = 2;
  fails(judgeParlayWindow(project(snaps, boards)), V.STALE_OR_INCOMPLETE, /disagree/);
});

test("MUTATION the producer built slips the projection does not carry", () => {
  const { boards, snaps } = realWindow();
  snaps["2026-10-10"] = snapshot({ date: "2026-10-10", games: 3, legs: 90, eligible: { low: 8 }, slips: { low: 6 }, b: boards["2026-10-10"] });
  fails(judgeParlayWindow(project(snaps, boards)), V.STALE_OR_INCOMPLETE, /carries none/);
});

test("MUTATION a projection with no window audit, or no day at all, cannot pass", () => {
  const { boards, snaps } = realWindow();
  const doc = project(snaps, boards);
  delete doc.windowAudit;
  assert.ok(judgeParlayWindow(doc).fatal.some((f) => /windowAudit/.test(f)));
  assert.ok(judgeParlayWindow({ byDate: {}, windowAudit: windowAudit({ windowDates: [], snapshotDates: [], boardDates: [] }) }).fatal.length > 0);
});

test("a day built by an older projection (no evidence block) is incomplete, not evidenced", () => {
  const { boards, snaps } = realWindow();
  const doc = project(snaps, boards);
  const old = clone(doc);
  delete old.byDate["2026-10-10"].evidence;
  fails(judgeParlayWindow(old), V.STALE_OR_INCOMPLETE, /no evidence block/);
});
