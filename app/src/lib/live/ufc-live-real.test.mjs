/**
 * UFC-001 · THE REAL CARD — UFC Fight Night: Allen vs. Duncan (ESPN 600061541), 2026-10-10.
 *
 * Every input here is a sanitized REAL scoreboard snapshot from the read-only recorder, replayed in
 * capture order (`fixtures/mma-live-20261010-timeline.json`, delta-encoded). Nothing is simulated and
 * nothing touches the network. The tests are deterministic: the same snapshots always yield the same
 * states, and every expectation below was first OBSERVED in the data before it was written down.
 *
 * What the real data taught, and what each test pins:
 *   - PRE_FIGHT and WALKOUTS are ESPN `state: "in"` with period 0 — nobody is fighting → UPCOMING.
 *   - STATUS_IN_PROGRESS and STATUS_IN_PROGRESS_2 alternate within one bout → both are IN_ROUND.
 *   - The in-round clock COUNTS DOWN → time remaining in the round.
 *   - STATUS_END_OF_ROUND → between rounds, round kept, NO clock (even when ESPN puts a number there).
 *   - STATUS_FINAL's clock is ELAPSED at the finish, unofficial (and was corrected once: 2:01 → 2:59).
 *   - A FINAL can carry NO winner (Gatto–Kareckaite) → result pending, never an inferred winner.
 *   - The event status lags the bouts → never consulted for a bout.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { memoReset } from "../../../api/_live-core.mjs";
import { normalizeMmaEnvelopes } from "./adapters/espn-mma.mjs";
import { UFC_LIVE_STATE, deriveUfcBoutState, groupUfcBouts } from "./ufc-live.mjs";

globalThis.React = React;
const { buildUfcRosterFrom } = await import("./ufc-hub-data.ts");
const { UfcBoutCard } = await import("../../components/live/ufc-live-hub.tsx");

const here = path.dirname(new URL(import.meta.url).pathname);
const APP = path.join(here, "..", "..", "..");
const TIMELINE = JSON.parse(fs.readFileSync(path.join(here, "fixtures", "mma-live-20261010-timeline.json"), "utf8"));
const CARD = JSON.parse(fs.readFileSync(path.join(APP, "public/data/ufc/card-latest.json"), "utf8"));

/** Rebuild every full scoreboard payload from the delta-encoded fixture, in capture order. */
function expandTimeline(tl) {
  const bouts = new Map();
  return tl.snapshots.map((s) => {
    for (const c of s.changed) bouts.set(c.id, c);
    return {
      capturedAt: s.capturedAt,
      payload: { events: [{ ...s.event, competitions: s.order.map((id) => structuredClone(bouts.get(id))) }] },
    };
  });
}
const SNAPS = expandTimeline(TIMELINE);
const at = (iso) => {
  const s = SNAPS.find((x) => x.capturedAt === iso);
  assert.ok(s, `no real snapshot at ${iso}`);
  return s;
};
const envAt = (iso, boutId) => normalizeMmaEnvelopes(at(iso).payload, iso).find((e) => e.eventId === boutId);

/** A roster bout for an ESPN bout id, built from the REAL feed's own athlete ids and names. */
function rosterBoutFor(boutId, pregame = null, settlement = null) {
  const e = envAt(SNAPS[0].capturedAt, boutId);
  const [r, b] = e.competitors.fighters;
  return {
    boutId, canonicalBoutKey: "", href: `/ufc/bout/${boutId}/`, position: "Bout", startUtc: e.startTime,
    weightClass: null, scheduledRounds: 3, titleFight: false,
    red: { athleteId: r.athleteId, name: r.name, record: null, photoUrl: null },
    blue: { athleteId: b.athleteId, name: b.name, record: null, photoUrl: null },
    pregame, unmodelledReason: null, settlement,
  };
}
const view = (iso, boutId, pregame = null) =>
  deriveUfcBoutState({ bout: rosterBoutFor(boutId, pregame), envelope: envAt(iso, boutId), feed: "OK", nowMs: Date.parse(iso) + 5_000 });

const GATTO = "401924511";   // Gatto vs Kareckaite — went the distance; FINAL with no winner flag
const PEREIRA = "401924512"; // Zhelezniakova vs Pereira — stopped at the end of R1; winner Pereira
const FRYE = "401927418";    // Frye Jr. vs Harris — stoppage in R1; final time corrected 2:01 → 2:59

test("REAL 0 · the fixture is the real card, in capture order, with the transitions it claims", () => {
  assert.ok(SNAPS.length >= 40, `${SNAPS.length} snapshots`);
  for (let i = 1; i < SNAPS.length; i++) assert.ok(SNAPS[i].capturedAt > SNAPS[i - 1].capturedAt, "capture order");
  assert.equal(SNAPS[0].payload.events[0].id, "600061541");
  assert.equal(SNAPS[0].payload.events[0].competitions.length, 12);
  const names = new Set(SNAPS.flatMap((s) => s.payload.events[0].competitions.map((c) => c.status.type.name)));
  for (const n of ["STATUS_SCHEDULED", "STATUS_PRE_FIGHT", "STATUS_FIGHTERS_WALKING", "STATUS_IN_PROGRESS", "STATUS_IN_PROGRESS_2", "STATUS_END_OF_ROUND", "STATUS_FINAL"]) {
    assert.ok(names.has(n), `${n} occurs in the real data`);
  }
});

test("REAL 1 · ⚠ PRE-FIGHT while the EVENT still reads scheduled: the bout is upcoming, and the event status is never read", () => {
  const s = at("2026-10-10T21:01:03Z");
  assert.equal(s.payload.events[0].status.type.name, "STATUS_SCHEDULED", "the event status lagged the bout");
  const e = envAt(s.capturedAt, GATTO);
  assert.equal(e.state, "PRE");
  assert.equal(e.phase, "PRE_FIGHT");
  assert.equal(e.period, null, "no round, no clock");
  const v = view(s.capturedAt, GATTO);
  assert.equal(v.state, UFC_LIVE_STATE.UPCOMING);
  assert.equal(v.label, "Pre-fight");

  // Flip the EVENT status to anything at all: no bout's derived state changes.
  for (const fake of [{ name: "STATUS_FINAL", state: "post", completed: true }, { name: "STATUS_IN_PROGRESS", state: "in" }]) {
    const p = structuredClone(s.payload);
    p.events[0].status = { type: fake };
    const a = normalizeMmaEnvelopes(s.payload, s.capturedAt);
    const b = normalizeMmaEnvelopes(p, s.capturedAt);
    assert.deepEqual(b, a, "a bout's envelope does not depend on the event status");
  }
});

test("REAL 2 · WALKOUTS is upcoming — no round, never 'live'", () => {
  const v = view("2026-10-10T21:07:05Z", GATTO);
  assert.equal(v.phase, "WALKOUTS");
  assert.equal(v.state, UFC_LIVE_STATE.UPCOMING);
  assert.equal(v.label, "Walkouts");
  assert.equal(v.round, null);
  assert.equal(v.clock, null);
});

test("REAL 3 · both IN_PROGRESS names are a bout in a round, with the clock as time REMAINING", () => {
  const a = view("2026-10-10T21:14:39Z", GATTO); // STATUS_IN_PROGRESS_2 · "R1, 3:47"
  const b = view("2026-10-10T21:19:11Z", GATTO); // STATUS_IN_PROGRESS   · "R1, 0:07"
  assert.equal(at("2026-10-10T21:14:39Z").payload.events[0].competitions.find((c) => c.id === GATTO).status.type.name, "STATUS_IN_PROGRESS_2");
  assert.equal(at("2026-10-10T21:19:11Z").payload.events[0].competitions.find((c) => c.id === GATTO).status.type.name, "STATUS_IN_PROGRESS");
  for (const [v, clock] of [[a, "3:47"], [b, "0:07"]]) {
    assert.equal(v.state, UFC_LIVE_STATE.LIVE);
    assert.equal(v.phase, "IN_ROUND");
    assert.equal(v.round, 1);
    assert.equal(v.clock, clock);
  }
  assert.equal(envAt("2026-10-10T21:14:39Z", GATTO).period.clockMeaning, "REMAINING_IN_ROUND");
});

test("REAL 4 · ⚠ the in-round clock COUNTS DOWN on every bout, in every round (so it is time remaining)", () => {
  const secs = (c) => { const [m, s] = c.split(":").map(Number); return m * 60 + s; };
  let pairs = 0;
  for (const boutId of SNAPS[0].payload.events[0].competitions.map((c) => c.id)) {
    let prev = null;
    for (const s of SNAPS) {
      const e = normalizeMmaEnvelopes(s.payload, s.capturedAt).find((x) => x.eventId === boutId);
      if (e?.phase !== "IN_ROUND" || !e.period?.clock) { prev = e?.phase === "IN_ROUND" ? prev : null; continue; }
      if (prev && prev.round === e.period.number) {
        assert.ok(secs(e.period.clock) < secs(prev.clock), `${boutId} R${e.period.number}: ${prev.clock} → ${e.period.clock} must count down`);
        pairs++;
      }
      prev = { round: e.period.number, clock: e.period.clock };
    }
  }
  assert.ok(pairs >= 10, `observed ${pairs} same-round clock pairs`);
});

test("REAL 5 · END OF ROUND is between rounds — the round, NO clock (even when ESPN puts a number there)", () => {
  const v = view("2026-10-10T21:25:26Z", GATTO); // "End R2", clock "-"
  assert.equal(v.state, UFC_LIVE_STATE.LIVE);
  assert.equal(v.betweenRounds, true);
  assert.equal(v.round, 2);
  assert.equal(v.clock, null);

  // Frye–Harris "End R1" carried "2:01" — the time REMAINING at the stoppage. It is not shown.
  const raw = at("2026-10-10T22:07:43Z").payload.events[0].competitions.find((c) => c.id === FRYE).status;
  assert.equal(raw.type.name, "STATUS_END_OF_ROUND");
  assert.equal(raw.displayClock, "2:01");
  const f = view("2026-10-10T22:07:43Z", FRYE);
  assert.equal(f.betweenRounds, true);
  assert.equal(f.clock, null, "a number at end of round would be read as a running clock");

  // And mid-round "R3, -" is a round with an absent clock — not 0:00.
  const r3 = view("2026-10-10T21:31:29Z", GATTO);
  assert.equal(r3.phase, "IN_ROUND");
  assert.equal(r3.round, 3);
  assert.equal(r3.clock, null);
});

test("REAL 6 · ⚠ FINAL WITHOUT A WINNER → result pending: no winner, no outcome, never a draw", () => {
  const first = SNAPS.find((s) => s.payload.events[0].competitions.find((c) => c.id === GATTO).status.type.name === "STATUS_FINAL");
  assert.equal(first.capturedAt, "2026-10-10T21:34:30Z");
  const raw = first.payload.events[0].competitions.find((c) => c.id === GATTO);
  assert.equal(raw.status.type.completed, true);
  assert.equal(raw.competitors.some((c) => c.winner === true), false, "ESPN flagged no winner at FINAL");
  const v = view(first.capturedAt, GATTO, { pickName: raw.competitors[0].athlete.displayName, pickAthleteId: raw.competitors[0].id, opponentName: null, winChance: 0.5443, modelId: "m", publishedAt: null });
  assert.equal(v.state, UFC_LIVE_STATE.FINAL_PROVISIONAL);
  assert.equal(v.group, "AWAITING_OFFICIAL_RESULT");
  assert.equal(v.label, "Final · result pending");
  assert.equal(v.result.winnerName, null);
  assert.equal(v.result.winnerAthleteId, null);
  assert.equal(v.outcome, null);
  assert.equal(v.result.round, 3);
  assert.equal(v.result.clock, "5:00");
  assert.equal(v.result.clockUnofficial, true);
});

test("REAL 7 · final WITH a winner; 5:00 shown as unofficial; a mid-round finish time WITHHELD (ESPN corrects it: 2:01 → 2:59)", () => {
  const p = view("2026-10-10T21:51:07Z", PEREIRA);
  assert.equal(p.state, UFC_LIVE_STATE.FINAL_PROVISIONAL);
  assert.equal(p.label, "Final · awaiting official result");
  assert.equal(p.result.winnerName, "Alice Pereira");
  assert.deepEqual([p.result.round, p.result.clock, p.result.clockUnofficial, p.result.finishTimeWithheld], [1, "5:00", true, false], "stopped at the end of R1: 5:00 is unambiguous");
  assert.equal(p.outcome, null, "a provider winner is not a graded pick");

  const firstFinal = view("2026-10-10T22:09:14Z", FRYE);
  const corrected = view("2026-10-10T22:10:45Z", FRYE);
  assert.equal(firstFinal.result.winnerName, "Allen Frye Jr.");
  // What ESPN said: the remaining-time value first, elapsed one poll later.
  assert.equal(envAt("2026-10-10T22:09:14Z", FRYE).period.clock, "2:01");
  assert.equal(envAt("2026-10-10T22:10:45Z", FRYE).period.clock, "2:59");
  // What we show: neither — one snapshot cannot tell which of the two it holds.
  for (const v of [firstFinal, corrected]) {
    assert.equal(v.result.clock, null);
    assert.equal(v.result.finishTimeWithheld, true);
    assert.equal(v.result.round, 1, "the finish round is still reported");
  }
});

test("REAL 8 · deterministic replay: every bout only moves forward, and nothing is graded without a settlement", () => {
  const RANK = { UPCOMING: 0, LIVE: 1, FINAL_PROVISIONAL: 2 };
  const seqs = {};
  for (const s of SNAPS) {
    for (const e of normalizeMmaEnvelopes(s.payload, s.capturedAt)) {
      const v = deriveUfcBoutState({ bout: rosterBoutFor(e.eventId), envelope: e, feed: "OK", nowMs: Date.parse(s.capturedAt) + 5_000 });
      assert.notEqual(v.state, UFC_LIVE_STATE.FINAL_CANONICAL);
      assert.equal(v.outcome, null);
      if (v.state === UFC_LIVE_STATE.UPCOMING) assert.deepEqual([v.round, v.clock], [null, null], `${e.eventId} upcoming with a round`);
      if (v.state === UFC_LIVE_STATE.LIVE) assert.ok(v.round >= 1, `${e.eventId} live without a round`);
      if (v.betweenRounds) assert.equal(v.clock, null);
      const tag = `${v.state}:${v.label}`;
      const seq = (seqs[e.eventId] ??= []);
      if (seq.length && RANK[v.state] < RANK[seq.at(-1).split(":")[0]]) assert.fail(`${e.eventId} went backwards: ${seq.at(-1)} → ${tag} at ${s.capturedAt}`);
      if (seq.at(-1) !== tag) seq.push(tag);
    }
  }
  // The full real lifecycle of the first bout, exactly.
  assert.deepEqual(seqs[GATTO], [
    "UPCOMING:Scheduled", "UPCOMING:Pre-fight", "UPCOMING:Walkouts", "LIVE:Live", "FINAL_PROVISIONAL:Final · result pending",
  ]);
  assert.deepEqual(seqs[PEREIRA].slice(0, 5), [
    "UPCOMING:Scheduled", "UPCOMING:Pre-fight", "UPCOMING:Walkouts", "LIVE:Live", "FINAL_PROVISIONAL:Final · awaiting official result",
  ]);
});

test("REAL 9 · tonight's roster joined to a mid-card snapshot groups honestly", () => {
  if (CARD.event.providerEventId !== "600061541") return; // the card has moved on
  const roster = buildUfcRosterFrom({ card: CARD, graded: null, etDate: CARD.event.slateDate });
  const s = at("2026-10-10T22:10:45Z");
  const byId = Object.fromEntries(normalizeMmaEnvelopes(s.payload, s.capturedAt).map((e) => [e.eventId, e]));
  const g = groupUfcBouts(roster.bouts, byId, { feed: "OK", nowMs: Date.parse(s.capturedAt) + 5_000 });
  assert.deepEqual(g.AWAITING_OFFICIAL_RESULT.map(({ bout }) => bout.boutId).sort(), [GATTO, PEREIRA, FRYE].sort());
  assert.equal(g.FINAL.length, 0, "nothing is final-official without the graded ledger");
  assert.equal(g.LIVE.length, 0);
  assert.equal(g.UPCOMING.length, 9);
  // The frozen pick rides along unchanged on every bout that has one.
  for (const { bout, view: v } of Object.values(g).flat()) assert.equal(v.pregame, bout.pregame);
});

const render = (iso, boutId, pregame = null) => {
  const b = rosterBoutFor(boutId, pregame);
  return renderToStaticMarkup(React.createElement(UfcBoutCard, { bout: b, view: deriveUfcBoutState({ bout: b, envelope: envAt(iso, boutId), feed: "OK", nowMs: Date.parse(iso) + 5_000 }) }));
};

test("REAL 10 · RENDERED on real snapshots: clocks are labelled with what they mean", () => {
  assert.match(render("2026-10-10T21:14:39Z", GATTO), /R1 · 3:47 remaining/);
  const end = render("2026-10-10T21:25:26Z", GATTO);
  assert.match(end, /End of R2/);
  assert.equal(/remaining/.test(end), false, "no clock between rounds");
  const walk = render("2026-10-10T21:07:05Z", GATTO);
  assert.match(walk, /Walkouts/);
  assert.equal(/\bR[0-9]\b/.test(walk), false, "walkouts render no round");
  const pending = render("2026-10-10T21:34:30Z", GATTO);
  assert.match(pending, /Final · result pending/);
  assert.match(pending, /names no winner yet/);
  assert.match(pending, /ended R3 at 5:00, unofficial time/);
  assert.equal(/Reported winner|>Winner</.test(pending), false, "no winner is shown or inferred");
  const won = render("2026-10-10T22:10:45Z", FRYE);
  assert.match(won, /ESPN reports Allen Frye Jr\. won \(ended in R1; finish time not yet confirmed\)/);
  assert.equal(/2:59|2:01/.test(won), false, "a mid-round provider finish time is not shown");
  assert.match(won, /Reported winner/);
  assert.equal(/Pick correct|Pick missed/.test(won), false);
});

test("REAL 11 · the gateway serves a real in-round snapshot with phase and clock meaning, nothing else added", async () => {
  const { default: handler } = await import("../../../api/live.mjs");
  const saved = { en: process.env.LIVE_GATEWAY_ENABLED, sp: process.env.LIVE_PUBLIC_SPORTS };
  const prevFetch = globalThis.fetch;
  process.env.LIVE_GATEWAY_ENABLED = "1";
  process.env.LIVE_PUBLIC_SPORTS = "mlb,nfl,ufc";
  memoReset();
  const body = JSON.stringify(at("2026-10-10T21:14:39Z").payload);
  globalThis.fetch = async () => ({ ok: true, text: async () => body });
  let payload;
  const res = { setHeader() {}, status() { return this; }, json(b) { payload = b; return this; }, end() { return this; } };
  try {
    await handler({ method: "GET", query: { sport: "ufc", date: "2026-10-10" } }, res);
  } finally {
    globalThis.fetch = prevFetch;
    memoReset();
    if (saved.en === undefined) delete process.env.LIVE_GATEWAY_ENABLED; else process.env.LIVE_GATEWAY_ENABLED = saved.en;
    if (saved.sp === undefined) delete process.env.LIVE_PUBLIC_SPORTS; else process.env.LIVE_PUBLIC_SPORTS = saved.sp;
  }
  const g = payload.events.find((e) => e.eventId === GATTO);
  assert.equal(g.state, "LIVE");
  assert.equal(g.phase, "IN_ROUND");
  assert.deepEqual(g.period, { number: 1, clock: "3:47", clockMeaning: "REMAINING_IN_ROUND", label: null });
  const walking = payload.events.filter((e) => e.phase === "SCHEDULED").length;
  assert.equal(walking, 11, "the other eleven bouts are still scheduled");
});
