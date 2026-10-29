/**
 * Batch 1 #5 / #6 (2026-10-29) — the simulate lobby and settled-page clutter.
 *
 *   · settled EPL fixtures and UFC cards stay on their own date, with the final result from the committed graded
 *     record, and link only to pages that are exported (EPL archive slugs; UFC → the graded-picks record until settled
 *     bout pages exist — hook `ufcSettledBoutHref`);
 *   · "Simulation ready" only where a simulation records a run count (allowsRunCountClaim); closed-form EPL / UFC
 *     read "Model report ready";
 *   · a UFC card's start is its earliest start (prelims), not the main event's;
 *   · the finished 2026 World Cup coverage group is archived, never "Available" on /simulate;
 *   · a final NFL game page shows no live-state block; a graded EPL match shows its final state, not
 *     "Started · not saveable".
 *
 * Data-derived over the committed ledgers (no hand-typed scores). Run: npx tsx --test src/lib/simulate/batch1-settled-lobby.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSimulateDay, availableSimulateDates, etDayOf, readyStateLabel, ufcEarliestStart, ufcSettledBoutHref,
  MODEL_REPORT_READY_LABEL, STATE_ACTION,
} from "./day-view.ts";
import { loadEplForecastArchive, eplMatchHref } from "../sports/epl/forecast-view.ts";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const DATA = path.join(APP, "public", "data");
const read = (rel) => fs.readFileSync(path.join(APP, rel), "utf8");
const jsonl = (rel) => fs.readFileSync(path.join(DATA, rel), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const json = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const etTime = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

/** A fixed "today" a few days after the newest graded EPL kickoff, so every recent graded fixture is a past date. */
const graded = jsonl("soccer/epl/results/graded-forecasts.jsonl").filter((r) => r.status === "FULL_TIME" && r.actual);
const newest = graded.map((r) => etDayOf(r.kickoffUtc)).sort().at(-1);
const TODAY = (() => { const d = new Date(`${newest}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 2); return d.toISOString().slice(0, 10); })();

test("settled EPL fixtures stay listed on their date with the ledger's final score and an exported match page", () => {
  const dates = new Set(availableSimulateDates({ today: TODAY }));
  const archive = new Map(loadEplForecastArchive().map((r) => [r.eventId, r]));
  const recent = graded.filter((r) => dates.has(etDayOf(r.kickoffUtc)) && archive.has(r.eventId));
  assert.ok(recent.length > 0, "the window holds graded, archived fixtures");
  const byDate = new Map();
  for (const r of recent) {
    const d = etDayOf(r.kickoffUtc);
    if (!byDate.has(d)) byDate.set(d, buildSimulateDay(d, { today: TODAY }));
    const epl = byDate.get(d).sections.find((s) => s.sport === "epl");
    const e = epl.events.find((x) => x.id === `epl:${r.eventId}`);
    assert.ok(e, `${r.matchup} (${d}) is listed — never "No Premier League fixtures on this date"`);
    assert.equal(e.state, "SETTLED");
    const a = archive.get(r.eventId);
    assert.match(e.stateReason, new RegExp(`^Final: ${a.homeClub.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")} ${r.actual.homeGoalsFT} – ${r.actual.awayGoalsFT} `), "final score from the graded ledger");
    assert.equal(e.href, eplMatchHref(a.slug), "links the archived (exported) match page");
  }
});

test("regression 2026-10-24: Premier League and UFC 333 are on the date, settled, with results", () => {
  const v = buildSimulateDay("2026-10-24", { today: "2026-10-29" });
  const epl = v.sections.find((s) => s.sport === "epl");
  const expected = graded.filter((r) => etDayOf(r.kickoffUtc) === "2026-10-24").length;
  assert.ok(expected > 0);
  assert.equal(epl.events.length, expected, "every graded fixture of the date");
  assert.equal(epl.note, null);
  const ufc = v.sections.find((s) => s.sport === "ufc");
  assert.equal(ufc.events.length, 1);
  const card = ufc.events[0];
  assert.match(card.matchup, /^UFC 333/);
  assert.equal(card.state, "SETTLED");
  assert.match(card.stateReason, /^Final: Alexander Volkanovski def\. Movsar Evloev/);
  const picks = json("ufc/graded-picks.json").picks.filter((p) => p.eventName === card.matchup && typeof p.hit === "boolean");
  assert.match(card.stateReason, new RegExp(`picks graded: ${picks.filter((p) => p.hit).length} of ${picks.length} correct`), "pick tally from the graded record");
});

test("settled UFC cards link only to exported pages; the settled-bout hook is unset until those pages exist", () => {
  assert.equal(ufcSettledBoutHref("UFC 333: Volkanovski vs. Evloev"), null, "TODO(b1-ufc-bouts): no settled bout page on main yet");
  const results = json("ufc/results-latest.json").results;
  const dates = availableSimulateDates({ today: TODAY }).filter((d) => d < TODAY && results.some((r) => r.eventDate === d && r.winner));
  assert.ok(dates.length > 0, "played cards are selectable dates");
  for (const d of dates) {
    for (const e of buildSimulateDay(d, { today: TODAY }).sections.find((s) => s.sport === "ufc").events) {
      assert.ok(["/results/picks/ufc", "/ufc"].includes(e.href), `${e.matchup}: ${e.href} is an exported page`);
      assert.match(e.stateReason, /^Final: /);
    }
  }
});

test("label by run-count capability: 'Simulation ready' needs a run count; closed-form reads 'Model report ready'", () => {
  assert.deepEqual(readyStateLabel("SIMULATION_READY", 10000), { stateLabel: null, actionLabel: STATE_ACTION.SIMULATION_READY });
  for (const rc of [null, undefined, 0, -1, 2.5]) {
    assert.deepEqual(readyStateLabel("SIMULATION_READY", rc), { stateLabel: MODEL_REPORT_READY_LABEL, actionLabel: STATE_ACTION.MODEL_ONLY_NO_MARKET });
  }
  assert.deepEqual(readyStateLabel("SETTLED", null), { stateLabel: null, actionLabel: STATE_ACTION.SETTLED }, "other states untouched");

  for (const d of availableSimulateDates()) {
    for (const s of buildSimulateDay(d).sections) {
      for (const e of s.events) {
        if (e.state !== "SIMULATION_READY") continue;
        if (s.sport === "epl" || s.sport === "ufc") assert.equal(e.stateLabel, MODEL_REPORT_READY_LABEL, `${d} ${e.matchup}: closed-form`);
      }
    }
  }
  const chip = read("src/components/simulate/simulate-day.tsx");
  assert.match(chip, /e\.stateLabel \? \{ \.\.\.STATE_TONE\[e\.state\], label: e\.stateLabel \}/, "the card prints the event's own label");
});

test("UFC card start = its earliest start (prelims), not the main event's", () => {
  assert.equal(ufcEarliestStart({ event: { startUtc: "2026-10-31T21:00Z" }, bouts: [{ startUtc: "2026-11-01T00:00Z" }, { startUtc: "2026-10-31T21:00Z" }] }), "2026-10-31T21:00Z");
  assert.equal(ufcEarliestStart({ event: {}, bouts: [{ startUtc: "2026-11-01T00:00Z" }, { startUtc: "2026-10-31T22:00Z" }] }), "2026-10-31T22:00Z");
  assert.equal(ufcEarliestStart({ event: null, bouts: [] }), null);
  const card = json("ufc/card-latest.json");
  const day = etDayOf(card.event?.startUtc ?? card.bouts?.[0]?.startUtc);
  if (!availableSimulateDates().includes(day)) return; // the current card is outside the window — nothing to read
  const e = buildSimulateDay(day).sections.find((s) => s.sport === "ufc").events.find((x) => x.matchup === card.event?.name);
  assert.ok(e, "the current card is listed on its date");
  assert.equal(e.startLabel, etTime(ufcEarliestStart(card)), "the card's earliest start, not bouts[0]'s");
});

test("the finished 2026 World Cup coverage group is archived and never listed as available on /simulate", async () => {
  const { COVERAGE_SPORTS } = await import("../market-coverage.ts");
  assert.equal(COVERAGE_SPORTS.find((s) => s.key === "soccer")?.archived, true);
  const page = read("src/app/simulate/page.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const mounts = page.match(/<SimulationCoverageMatrix\b[^>]*\/>/g) ?? [];
  assert.ok(mounts.length > 0);
  for (const m of mounts) assert.match(m, /hideArchived/, `${m} hides archived groups`);
  assert.doesNotMatch(page, /sport="soccer"/, "no World Cup matrix on /simulate (it was the EPL filter's matrix)");
  const matrix = read("src/components/simulation-coverage-matrix.tsx");
  assert.match(matrix, /archived \? <ArchivedPill \/> : <StatusPill/, "archived rows never print a status pill");
});

test("a final NFL game page has no live-state block", () => {
  const page = read("src/app/nfl/game/[eventId]/page.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const slots = [...page.matchAll(/\{livePanel\}/g)];
  assert.equal(slots.length, 2, "two slots");
  assert.match(page, /\{isFinal \? \([\s\S]*?\) : <KickoffSlot kickoffUtc=\{f\.kickoffUtc\} startedAtBuild=\{liveTop\} when="after"><div style=\{\{ marginTop: 16 \}\}>\{livePanel\}<\/div><\/KickoffSlot>\}/);
  assert.match(page, /\{isFinal \? null : <KickoffSlot kickoffUtc=\{f\.kickoffUtc\} startedAtBuild=\{liveTop\} when="before">\{livePanel\}<\/KickoffSlot>\}/);
  assert.ok(page.indexOf("const isFinal") < page.indexOf("{isFinal ? ("), "gated on the page's own final facts");
});

test("a graded EPL match shows its final state, not 'Started · not saveable'", () => {
  const page = read("src/app/epl/match/[slug]/page.tsx").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(page, /const gradedMatch = loadEplGradedRecord\(\)\?\.team\.matchesList\.find\(\(m\) => m\.eventId === String\(row\.eventId\)\)/);
  assert.match(page, /\{gradedMatch \? \(\s*<p data-epl-final-badge=""[\s\S]*?Final · full time[\s\S]*?\) : row\.probs && row\.homeClub && row\.awayClub \? \(\s*<div className="mt-3">\s*<SaveForecastButton/, "the final badge replaces the save control");
});
