/**
 * THE MARKET MATRIX IS THE ACCEPTANCE GATE'S INSTRUMENT, so it is guarded like one (P0 · §9).
 *
 * ⚠ AN AUDIT THAT READS THE THING IT AUDITS PROVES NOTHING. The population must come from the
 * canonical SCHEDULE. If the matrix enumerated events from the weekly boards — or from the capture
 * — it would agree with them by construction, and the one question it exists to answer ("is any
 * eligible pre-start event missing entirely?") would be unaskable, because a missing event is
 * missing from those artifacts too. That is the whole defect class: a denominator taken from the
 * numerator's source.
 *
 * These run the real script against the committed artifacts, pinned, with no network.
 *
 * Run: npx tsx --test src/lib/sports/nfl/market-matrix.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const SCRIPT = path.join(APP, "scripts/nfl/audit-nfl-market-matrix.mjs");
const SRC = fs.readFileSync(SCRIPT, "utf8");

/**
 * Pinned to THE CAPTURE'S OWN INSTANT, so the report is reproducible and — more importantly — asks
 * its question at the moment the question was answered.
 *
 * ⚠ PINNING TO THE EARLIEST KICKOFF WAS WRONG, and the coverage gate below is what showed it. That
 * instant is hours BEFORE the capture ran, so the eligible set included a game that had already
 * kicked off by the time the sweep happened — and the guard reported a "partial sweep" for an event
 * the lane is REQUIRED not to query. Coverage is a claim about a moment: "when we last asked, had
 * we asked about every eligible event?" Evaluating it at a different moment measures a different
 * population, and the arithmetic then disagrees with a lane that behaved perfectly.
 */
const pinnedNow = () => {
  const capturedAt = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/markets/latest.json"), "utf8")).capturedAt; } catch { return null; }
  })();
  if (capturedAt && Number.isFinite(Date.parse(capturedAt))) return capturedAt;
  /* No capture on disk: fall back to just before the earliest scheduled kickoff, which at least
     gives the guards below a populated week to inspect. */
  const s = JSON.parse(fs.readFileSync(path.join(APP, "public/data/nfl/schedule/latest.json"), "utf8"));
  const pre = (s.rows ?? []).filter((r) => r.statusRaw === "STATUS_SCHEDULED").sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : 1));
  if (!pre.length) return null;
  return new Date(Date.parse(pre[0].dateUtc) - 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
};

const runMatrix = (now) => JSON.parse(execFileSync("node", [SCRIPT, "--now", now, "--json"], { cwd: APP, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));

test("the population comes from the canonical SCHEDULE, never from the artifacts being audited", () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  assert.match(code, /schedule\.rows/, "the eligible set is enumerated from the schedule owner's own rows");
  assert.ok(!/eligible[\s\S]{0,200}weekly\?\.boards/.test(code),
    "the population must not be derived from the weekly boards — a denominator taken from the numerator's source cannot show a missing event");
  /* And it refuses rather than guessing when the population is unknowable. */
  assert.match(SRC, /REFUSED: no canonical schedule/, "an audit with no population must refuse, not report zero");
});

test("the matrix runs, and its coverage arithmetic closes", () => {
  const now = pinnedNow();
  if (!now) return; // no scheduled NFL event committed: nothing to enumerate and nothing claimed
  const r = runMatrix(now);

  assert.equal(r.artifact, "nfl-market-matrix");
  assert.equal(r.dataClass, "PRIVATE_RESEARCH");
  assert.ok(r.coverage.eligibleEvents > 0, "a pinned pre-kickoff instant must find the week's events");
  assert.equal(r.events.length, r.coverage.eligibleEvents, "every eligible event gets a row in the event summary");
  assert.equal(
    r.coverage.eventsProbed + r.coverage.eventsNotProbed,
    r.events.filter((e) => e.boardPublished).length,
    "every event with a player board is either probed or not — there is no third state, and an event may not fall out of the accounting",
  );
  assert.equal(r.coverage.notProbedEvents.length, r.coverage.eventsNotProbed, "the named list and the count are the same fact");

  /* Row states partition: every row has exactly one display status, and they sum to the row count. */
  const summed = Object.values(r.rowsByDisplayStatus).reduce((a, b) => a + b, 0);
  assert.equal(summed, r.rows.length, "every row carries exactly one display status");
  for (const status of Object.keys(r.rowsByDisplayStatus)) {
    assert.ok(["PRICED", "NOT_OFFERED", "NOT_PROBED", "IDENTITY_UNRESOLVED", "STALE"].includes(status),
      `unexpected display status ${status} — the grammar is closed, and a new state must be a decision`);
  }
});

test("a PRICED row carries a named book and a capture instant; an unpriced row carries neither", () => {
  const now = pinnedNow();
  if (!now) return;
  const r = runMatrix(now);
  let priced = 0;
  for (const row of r.rows) {
    if (row.displayStatus === "PRICED" || row.displayStatus === "STALE") {
      priced += 1;
      assert.ok(row.providerMarketExists, `${row.player} ${row.family}: priced without a provider market`);
      assert.ok(row.selectedBook, `${row.player} ${row.family}: a displayed price with no book is unattributable`);
      assert.ok(Number.isFinite(Date.parse(row.capturedAt)), `${row.player} ${row.family}: a price must carry the instant it was captured`);
      assert.equal(row.joinStatus, "JOINED");
      /* Shape integrity: a two-sided family has both sides, a yes/no family has no point. */
      if (row.family === "anytime_td") {
        assert.ok(Number.isFinite(row.atdPrice), `${row.player}: an anytime-TD row needs its yes price`);
        assert.equal(row.line, null, `${row.player}: an anytime-TD market has no point`);
      } else {
        assert.ok(Number.isFinite(row.line), `${row.player} ${row.family}: a two-sided row needs its point`);
        assert.ok(Number.isFinite(row.over) && Number.isFinite(row.under), `${row.player} ${row.family}: both sides, from the book that was named`);
      }
    } else {
      assert.equal(row.selectedBook, null, `${row.player} ${row.family}: ${row.displayStatus} must carry no book`);
      assert.equal(row.capturedAt, null, `${row.player} ${row.family}: ${row.displayStatus} must carry no capture instant`);
      assert.equal(row.providerMarketExists, false);
    }
  }
  /*
   * ⚠ NON-VACUITY, STATED RATHER THAN SILENT. With nothing priced the loop above asserts only the
   * absences, which is a real check — so this does not fail. It says so, because a run where the
   * priced branch never executed is a run where half this guard did not happen.
   */
  if (priced === 0) console.log("# note: no priced row in the committed artifacts — the PRICED assertions above did not execute");
});

test("NOT_PROBED is named per event, so the acceptance gate can be read rather than believed", () => {
  const now = pinnedNow();
  if (!now) return;
  const r = runMatrix(now);
  /* The gate itself is a founder-facing number; this asserts it is DERIVED from the per-event
     states rather than typed, which is the difference between a report and an assertion. */
  const derived = r.events.filter((e) => e.boardPublished && !e.probed).length;
  assert.equal(r.coverage.eventsNotProbed, derived, "the headline number must equal the per-event states it summarises");
  for (const e of r.events) {
    assert.ok(["PROBED", "NOT_PROBED", "NO_PLAYER_BOARD"].includes(e.state), `unexpected event state ${e.state}`);
    if (e.state === "PROBED") assert.ok(e.probed);
    if (e.state === "NOT_PROBED") assert.ok(!e.probed && e.boardPublished);
  }
});

/**
 * THE ACCEPTANCE GATE ITSELF (§P0-B): once this week has been swept, NO eligible pre-start event of
 * it may remain NOT_PROBED.
 *
 * ⚠ THE CONDITION IS "ONCE SWEPT", AND IT IS NOT A SOFTENING. A brand-new week exists for hours
 * before its first sweep, and every event in it is legitimately unasked; a guard that failed there
 * would be red every Tuesday and would be switched off by the second week. What the lane must never
 * do is sweep PART of a week — buy prices for nine games and leave six reading "not checked" — and
 * that is precisely what this asserts: if the capture probed ANY event of the current period, it
 * must have probed EVERY eligible one.
 *
 * Events only ever LEAVE the eligible set (they kick off), so `probed ⊇ eligible` holds for the
 * whole week once a sweep has run. A partial sweep is the only way to break it.
 */
test("no eligible current-week event is left NOT_PROBED once the week has been swept", () => {
  const now = pinnedNow();
  if (!now) return;
  const r = runMatrix(now);
  const withBoard = r.events.filter((e) => e.boardPublished);
  if (withBoard.length === 0) return; // nothing published yet: nothing is claimed either way
  const probed = withBoard.filter((e) => e.probed).length;
  if (probed === 0) {
    /* Stated, not silent: this is the pre-sweep state and the guard is inert in it. */
    console.log(`# note: no event of ${r.period.seasonType}-${r.period.week} has been probed yet — the coverage gate is inert until the first sweep`);
    return;
  }
  assert.equal(r.coverage.eventsNotProbed, 0,
    `the week was swept (${probed} of ${withBoard.length} events probed) and ${r.coverage.eventsNotProbed} eligible event(s) are still NOT_PROBED: ${r.coverage.notProbedEvents.join(", ")} — a partial sweep leaves real games reading "not checked"`);
});
