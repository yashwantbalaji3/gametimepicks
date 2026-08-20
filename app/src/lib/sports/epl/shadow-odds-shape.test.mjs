/**
 * The capture and the shadow spoke different shapes, so NO EPL fixture could ever price.
 *
 * capture-epl-odds.mjs publishes one row per fixture carrying `matchResult` (a median across books).
 * runEplShadow filtered on `marketType`/`market`, which those rows do not have, so the three-way set
 * was always empty and every fixture reported READY_EXCEPT_ODDS — the engine working perfectly and
 * publishing nothing. Proven not to be staleness by running against odds one hour old.
 *
 * The first case below is the exact committed capture shape: it returns READY_EXCEPT_ODDS under the
 * old filter and a real prediction under the fixed one, so this fails against the bug it describes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fitEplStrength } from "./strength-state.mjs";
import { runEplShadow } from "./shadow-run.mjs";

const APP = process.cwd();
const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/epl/corpus-v1.json"), "utf8"));
const state = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-21T00:00:00Z" });

const FIXTURE = {
  eventId: "soccer:epl:arsenal-v-coventry-city:20260821t1900",
  homeClub: "Arsenal", awayClub: "Coventry City", kickoffIso: "2026-08-21T19:00:00Z",
};
/** The committed capture shape — per-fixture consensus, no marketType discriminator. */
const CAPTURE_SNAPSHOT = {
  capturedAt: "2026-08-20T07:47:26Z",
  rows: [{
    eventId: FIXTURE.eventId, providerEventId: "abc123", kickoffIso: FIXTURE.kickoffIso,
    home: "Arsenal", away: "Coventry City",
    matchResult: [
      { outcome: "Arsenal", american: -560, books: 11 },
      { outcome: "Draw", american: 700, books: 11 },
      { outcome: "Coventry City", american: 1400, books: 11 },
    ],
  }],
};
const NOW = "2026-08-20T08:47:26Z"; // one hour after capture — freshness cannot be the cause

/**
 * The REAL committed capture, used wherever a full artifact must build. Hand-rolling a snapshot is
 * how the original defect happened — an imagined shape that nothing actually produces — so the
 * pricing path is exercised against the bytes on disk, and the synthetic rows below are used only to
 * prove which shapes the FILTER accepts.
 */
function realSnapshot() {
  const p = path.join(APP, "public/data/soccer/epl/odds/latest.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}
function realFixture(snap) {
  const capFile = fs.readdirSync(path.join(APP, "public/data/soccer/epl/fixtures")).find((f) => f.startsWith("capture-"));
  const season = JSON.parse(fs.readFileSync(path.join(APP, "public/data/soccer/epl/fixtures", capFile), "utf8"));
  const ids = new Set((snap.rows ?? []).map((r) => r.eventId));
  return season.rows.find((r) => ids.has(r.eventId)) ?? null;
}

test("the committed capture shape is NOT discarded — the exact bug", () => {
  // Under the old marketType-only filter this row was invisible and the state was READY_EXCEPT_ODDS
  // with fresh odds. Anything other than that state means the shape now reaches the market layer.
  const out = runEplShadow({ fixture: FIXTURE, nowIso: NOW, strengthState: state, oddsSnapshot: CAPTURE_SNAPSHOT });
  assert.notEqual(out.state, "READY_EXCEPT_ODDS", `capture-shaped rows are still being dropped: ${out.reason}`);
});

test("REAL committed odds price a REAL fixture end to end", () => {
  const snap = realSnapshot();
  if (!snap?.rows?.length) return; // no capture committed yet — nothing to assert against
  const fixture = realFixture(snap);
  if (!fixture) return;
  const now = new Date(Date.parse(snap.capturedAt) + 3600_000).toISOString();
  const out = runEplShadow({ fixture, nowIso: now, strengthState: state, oddsSnapshot: snap });
  assert.equal(out.state, "CURRENT_PRE_EVENT", `real capture did not price: ${out.reason ?? out.rule}`);
  assert.ok(out.artifact?.market?.bookmakers?.length > 0, "the de-vigged market must reach the artifact");
});

test("a consensus is NEVER reported as a bookmaker that posted a price", () => {
  const snap = realSnapshot(); if (!snap?.rows?.length) return;
  const fixture = realFixture(snap); if (!fixture) return;
  const out = runEplShadow({ fixture, nowIso: new Date(Date.parse(snap.capturedAt) + 3600_000).toISOString(), strengthState: state, oddsSnapshot: snap });
  const src = out.artifact.market.bookmakers[0];
  assert.match(src.bookmaker, /consensus/i, "a median across books must be labelled as such");
  assert.match(src.bookmaker, /11/, "the book count belongs in the label, not just a bare 'consensus'");
});

test("the RAW price is de-vigged here — never the capture's already-de-vigged figure", () => {
  // Taking noVig as input would de-vig twice and quietly shrink the favourite.
  const snap = realSnapshot(); if (!snap?.rows?.length) return;
  const fixture = realFixture(snap); if (!fixture) return;
  const out = runEplShadow({ fixture, nowIso: new Date(Date.parse(snap.capturedAt) + 3600_000).toISOString(), strengthState: state, oddsSnapshot: snap });
  const { impliedSum, noVig } = out.artifact.market.bookmakers[0];
  assert.ok(impliedSum > 1.02 && impliedSum < 1.15, `vig must be visible before removal, got ${impliedSum}`);
  const total = noVig.reduce((n, o) => n + o.prob, 0);
  assert.ok(Math.abs(total - 1) < 1e-5, `de-vigged outcomes must sum to 1, got ${total}`);
});

test("the per-book shape still works — this is additive, not a replacement", () => {
  const perBook = {
    capturedAt: CAPTURE_SNAPSHOT.capturedAt,
    rows: [{
      eventId: FIXTURE.eventId, marketType: "h2h", bookmaker: "bookx",
      outcomes: [
        { name: "Arsenal", price: -560 }, { name: "Draw", price: 700 }, { name: "Coventry City", price: 1400 },
      ],
    }],
  };
  const out = runEplShadow({ fixture: FIXTURE, nowIso: NOW, strengthState: state, oddsSnapshot: perBook });
  assert.notEqual(out.state, "READY_EXCEPT_ODDS", "per-book rows must still be accepted by the filter");
});

test("a snapshot for a DIFFERENT fixture still prices nothing", () => {
  const other = { ...CAPTURE_SNAPSHOT, rows: [{ ...CAPTURE_SNAPSHOT.rows[0], eventId: "soccer:epl:someone-else:20260821t1900", providerEventId: "zzz" }] };
  const out = runEplShadow({ fixture: FIXTURE, nowIso: NOW, strengthState: state, oddsSnapshot: other });
  assert.equal(out.state, "READY_EXCEPT_ODDS", "prices must never cross fixtures");
});
