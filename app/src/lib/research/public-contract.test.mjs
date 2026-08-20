/**
 * SPRINT 050 — the public research contract is what users will read. It must not be able to lie.
 *
 * This guards the ARTIFACT, not the builder. A surface renders `terminal-summary.json`; if that file
 * can carry a market-beating claim, an unexplained empty state, a quarantined date wearing a hit rate,
 * or a system-status badge that hides a failed stage, then every guard upstream was decoration.
 *
 * The specific failures being prevented all have precedent here:
 *   · a hardcoded 51.7% drifted from the ledger for weeks (Sprint 046);
 *   · a green workflow hid a refused settlement for a day (Sprint 049);
 *   · a "beat the market" phrasing survived until a source scan was added (Sprint 047).
 *
 * Run: npx tsx --test src/lib/research/public-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd();
const DIR = path.join(APP, "public/data/research");
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

/** Every phrase here has appeared in this codebase and been removed by an earlier sprint. */
const PROHIBITED = [
  /\bedge\b/i,
  /\block\b/i,
  /\bbest bet\b/i,
  /\bguarantee(d|s)?\b/i,
  /\bbeat(s|ing)? the (market|sportsbook|book)\b/i,
  /\bmarket[- ]beating\b/i,
  /\bprofitab(le|ility)\b/i,
  /\bsure thing\b/i,
  /\bcan't lose\b/i,
];

test("the contract artifacts exist and are well-formed", () => {
  for (const f of ["terminal-summary.json", "system-status.json", "daily-brief.json"]) {
    assert.ok(fs.existsSync(path.join(DIR, f)), `${f} is missing — run npm run research:contract -- --write`);
  }
  const s = read("terminal-summary.json");
  assert.equal(s.kind, "public-research-terminal-summary");
  assert.equal(typeof s.schemaVersion, "number");
  assert.ok(s.asOfSettledDate, "the summary must state which settled date it describes");
});

// ── the claims ─────────────────────────────────────────────────────────────────

test("no prohibited language anywhere in the public artifacts", () => {
  for (const f of ["terminal-summary.json", "system-status.json", "daily-brief.json"]) {
    const text = fs.readFileSync(path.join(DIR, f), "utf8");
    for (const re of PROHIBITED) {
      const m = text.match(re);
      assert.equal(m, null, `${f} contains prohibited phrasing: "${m?.[0]}"`);
    }
  }
});

test("the prohibited scan actually has teeth", () => {
  // A banned-phrase scan that matches nothing passes forever.
  const sample = "Our model is market-beating and this pick is a lock.";
  assert.ok(PROHIBITED.some((re) => re.test(sample)), "the pattern set must catch an obvious violation");
});

test("every published rate carries its denominator", () => {
  const s = read("terminal-summary.json");
  assert.ok(s.modelUniverse.decisiveRows > 0, "the headline rate needs a row count");
  assert.ok(Array.isArray(s.modelUniverse.dateRange) && s.modelUniverse.dateRange.length === 2,
    "and a date window");
  for (const [m, v] of Object.entries(s.registry.markets)) {
    assert.ok(typeof v.n === "number" && v.n > 0, `${m} has a status but no sample size`);
    assert.ok(v.hitRate95 && v.hitRate95.low != null, `${m} has a rate but no interval`);
  }
});

test("the research universe is explicitly separated from the paper-money record", () => {
  const s = read("terminal-summary.json");
  assert.match(s.modelUniverse.label, /research/i);
  assert.match(s.modelUniverse.separateFromPaperRecord, /never combined/i);
  // The paper record's numbers must not appear in this artifact at all.
  const text = fs.readFileSync(path.join(DIR, "terminal-summary.json"), "utf8");
  assert.doesNotMatch(text, /19-14/, "the paper record must not be placed beside the research rate");
  assert.doesNotMatch(text, /19,065|19065\.4/, "nor the paper bankroll");
});

// ── calibration honesty ────────────────────────────────────────────────────────

test("calibration copy states the limitation alongside the benefit", () => {
  const c = read("terminal-summary.json").calibration;
  assert.ok(c, "the contract must expose the calibration layer");
  const joined = c.plainLanguage.join(" ");
  assert.match(joined, /overconfident/i, "must admit the raw model is overconfident");
  assert.match(joined, /does not create new predictive information/i, "must state what calibration does NOT do");
  assert.match(joined, /scored more accurately than ours/i, "must state that the market still scored better");
});

test("the calibration evaluation agrees with itself", () => {
  const e = read("terminal-summary.json").calibration.evaluation;
  assert.equal(
    e.stillBehindMarket, e.calibratedBrier > e.marketBrier,
    "the stillBehindMarket flag must agree with the Brier scores it summarises",
  );
  assert.ok(e.calibratedBrier < e.rawModelBrier, "calibration is only claimed when it measurably helped");
});

// ── the registry, and anti-curation ────────────────────────────────────────────

test("an empty APPROVED set is explained rather than left blank", () => {
  const r = read("terminal-summary.json").registry;
  if (r.counts.APPROVED === 0) {
    assert.equal(r.noneApproved, true);
    assert.ok(r.statusNote.length > 60, "an empty APPROVED set needs an explanation, not silence");
    assert.match(r.statusNote, /evidence/i);
  }
});

test("a DISABLED market keeps its full record — history is never curated away", () => {
  const markets = read("terminal-summary.json").registry.markets;
  const disabled = Object.entries(markets).filter(([, v]) => v.status === "DISABLED");
  assert.ok(disabled.length > 0, "batter_total_bases is DISABLED in the current corpus");
  for (const [m, v] of disabled) {
    assert.ok(v.n > 0, `${m} must keep its sample size`);
    assert.ok(v.hitRate != null, `${m} must keep its measured rate`);
    assert.ok(v.rationale && v.rationale.length > 20, `${m} must keep the reason it was disabled`);
  }
});

// ── quarantine visibility ──────────────────────────────────────────────────────

test("a quarantined slate is explicit, explained, and carries no record", () => {
  const qs = read("terminal-summary.json").quarantines;
  assert.ok(qs.length > 0, "2026-07-28 must be represented, not silently absent");
  for (const q of qs) {
    assert.equal(q.status, "QUARANTINED");
    assert.ok(q.date, "a quarantine must name its date");
    assert.ok(q.publicExplanation.length > 80, "and explain itself in plain language");
    for (const forbidden of ["hitRate", "wins", "losses", "decisiveRows"]) {
      assert.ok(!(forbidden in q), `a quarantined date must never carry ${forbidden}`);
    }
  }
});

// ── system status ──────────────────────────────────────────────────────────────

test("system status reports each stage independently", () => {
  const s = read("system-status.json");
  assert.ok(s.stages.length >= 5, "each lifecycle stage must report for itself");
  const VALID = ["READY", "DUE", "DELAYED_WITHIN_GRACE", "FAILED", "QUARANTINED", "STALE", "UNAVAILABLE"];
  for (const st of s.stages) {
    assert.ok(VALID.includes(st.state), `${st.stage} has an unrecognised state "${st.state}"`);
    assert.ok(st.detail && st.detail.length > 5, `${st.stage} needs a detail line`);
  }
});

test("one failing stage cannot hide behind an overall READY", () => {
  // This is the Sprint 049 failure exactly: a green badge over a refused settlement.
  const s = read("system-status.json");
  const bad = s.stages.filter((x) => x.state !== "READY");
  if (bad.length > 0) {
    assert.notEqual(s.overall, "READY", `overall is READY while ${bad.map((b) => b.stage).join(", ")} is not`);
    assert.match(s.overallReason, new RegExp(bad[0].stage), "the reason must name the failing stage");
  }
});

test("the current status genuinely reflects the quarantined settlement", () => {
  const s = read("system-status.json");
  const t = read("terminal-summary.json");
  const settlement = s.stages.find((x) => x.stage === "latestSettlement");
  assert.ok(settlement, "settlement must be its own stage");

  // A refusal is never softened — but "blocking" and "disclosed" are different obligations, and this
  // test used to conflate them. It pinned QUARANTINED because 2026-07-28 sat AT the settlement
  // frontier (asOfSettledDate was 2026-07-27). Now that settlement has advanced to 2026-08-18, that
  // date is permanently behind the frontier. Demanding QUARANTINED forever would make the stage red
  // for the life of the project, and a status that can never be green teaches the reader to stop
  // reading it — the same failure the page's own docstring names.
  const quarantines = (t.quarantines ?? []).map((q) => (typeof q === "string" ? q : q.date));
  const blocking = quarantines.filter((d) => String(d) >= String(t.asOfSettledDate));

  if (blocking.length > 0) {
    // Still at or ahead of the frontier: it MUST block, and it MUST name the date.
    assert.equal(settlement.state, "QUARANTINED", `${blocking[0]} was refused — the status must say so`);
    assert.match(settlement.detail, new RegExp(blocking[0]));
  } else {
    // Historical: it may stop blocking, but it may NEVER stop being disclosed. Dropping a refused
    // date from the contract is the actual softening this test exists to catch.
    assert.ok(quarantines.includes("2026-07-28"),
      "2026-07-28 was permanently refused — it must stay disclosed even once it stops blocking");
    assert.notEqual(settlement.state, "UNAVAILABLE", "an unreadable settlement is never a pass");
  }
});

// ── the daily brief ────────────────────────────────────────────────────────────

test("the public brief carries denominators and a do-not-conclude list", () => {
  const b = read("daily-brief.json");
  assert.ok(b.decisiveRows > 0 && b.wins >= 0, "the brief needs a numerator and denominator");
  assert.ok(b.whatShouldNotBeConcluded.length >= 3, "a brief that only says what was learned reads as a claim");
  assert.match(b.whatShouldNotBeConcluded.join(" "), /paper-money record/i,
    "it must remind the reader the paper record is separate");
  assert.ok(b.scoring.modelBrier != null && b.scoring.marketBrier != null,
    "model and market must be scored on the same rows");
});

test("the brief marks thin market samples rather than reporting them as findings", () => {
  const b = read("daily-brief.json");
  for (const m of b.byMarketFamily) {
    assert.equal(typeof m.sufficientSample, "boolean", `${m.market} must declare whether its sample is readable`);
    if (m.n < 100) assert.equal(m.sufficientSample, false, `${m.market} has n=${m.n} and must be marked insufficient`);
  }
});
