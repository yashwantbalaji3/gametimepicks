/**
 * Cross-sport identity audit — the detector, and the committed reconciliation it produces.
 *
 * Run: npx tsx --test src/lib/audits/event-identity-audit.test.mjs
 *
 * Two identity defects were each found by tripping over ONE row, and both turned out to be classes:
 * a doubleheader slug collision that the public route had always handled and the simulation adapter
 * had not, and a completeness vocabulary the classifier and the engine did not share. Neither was
 * visible until a specific row landed in the gap. This runs the detectors over every sport's
 * committed data instead.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { auditPopulation, rollUpSport, worstVerdict, IDENTITY_FINDINGS, SPORT_VERDICTS } from "./event-identity-audit.mjs";

const pop = (rows, extra = {}) =>
  auditPopulation({ sport: "mlb", scope: "fixture", rows, identityOf: (r) => r.id, ...extra });

test("a clean population reports nothing", () => {
  const out = pop([{ id: 1 }, { id: 2 }]);
  assert.deepEqual(out.findings, []);
  assert.equal(out.rows, 2);
  assert.equal(out.identified, 2);
});

test("DUPLICATE_IDENTITY · two rows claiming one id is a finding", () => {
  const out = pop([{ id: 7 }, { id: 7 }]);
  assert.equal(out.findings[0].kind, "DUPLICATE_IDENTITY");
  assert.match(out.findings[0].detail, /2 rows claim id 7/);
});

test("SLUG_COLLISION · the defect that opened this, in miniature", () => {
  const out = pop(
    [{ id: 823539, slug: "bos-vs-nyy-2026-08-29" }, { id: 823501, slug: "bos-vs-nyy-2026-08-29" }],
    { slugOf: (r) => r.slug },
  );
  assert.equal(out.findings.length, 1);
  assert.equal(out.findings[0].kind, "SLUG_COLLISION");
  assert.match(out.findings[0].detail, /the URL cannot serve both/);
  // Distinct ids, colliding slug — the two checks are independent and only one fires.
  assert.ok(!out.findings.some((f) => f.kind === "DUPLICATE_IDENTITY"));
});

test("MISSING_IDENTITY · a row with no id cannot be settled or corrected", () => {
  const out = pop([{ id: null }, { id: "" }, { id: 3 }]);
  assert.equal(out.findings.filter((f) => f.kind === "MISSING_IDENTITY").length, 2);
  assert.equal(out.identified, 1);
});

test("UNJOINED_DERIVED · a derived row whose identity is absent upstream describes nothing", () => {
  const out = pop([{ id: 1 }, { id: 99 }], { upstream: new Set(["1"]) });
  assert.equal(out.findings.length, 1);
  assert.equal(out.findings[0].kind, "UNJOINED_DERIVED");
});

test("REFUSAL · an empty sport is NO_EVENTS, never OK", () => {
  /*
   * Every check passes vacuously over an empty set. Calling that a pass is how a detector goes quiet
   * at exactly the moment a sport stops producing.
   */
  const s = rollUpSport("nfl", []);
  assert.equal(s.verdict, "NO_EVENTS");
  assert.notEqual(s.verdict, "OK");
  assert.match(s.note, /vacuous/);
});

test("REFUSAL · unreadable artifacts are UNKNOWN, and UNKNOWN outranks a known defect", () => {
  const s = rollUpSport("epl", [], { readable: false });
  assert.equal(s.verdict, "UNKNOWN");
  assert.equal(worstVerdict(["OK", "FINDINGS", "UNKNOWN"]), "UNKNOWN");
  assert.equal(worstVerdict(["OK", "NO_EVENTS"]), "NO_EVENTS");
  assert.equal(worstVerdict(["OK", "OK"]), "OK");
  for (const v of SPORT_VERDICTS) assert.ok(typeof v === "string");
  for (const k of IDENTITY_FINDINGS) assert.ok(typeof k === "string");
});

/* ── THE COMMITTED RECONCILIATION ──────────────────────────────────────────────────────────────── */

/*
 * The MLB dates whose SIMULATION and PREDICTION artifacts were generated before the shared slug rule
 * existed. Those artifacts are published bytes and are not rewritten — a regeneration today produces
 * different picks, so overwriting them would retroactively alter a published forecast.
 *
 * SHRINK-ONLY. A date may leave this list (superseded, corrected through lineage); none may be
 * added. A new date appearing means the fix regressed, and this guard must fail rather than grow.
 */
const PRE_SLUG_RULE_DATES = Object.freeze(new Set(["2026-07-28", "2026-08-17", "2026-08-29"]));

test("LIVE · every collision in the committed corpus is a known pre-fix date", () => {
  const p = path.join(process.cwd(), "..", "data", "internal", "audits", "event-identity.json");
  if (!fs.existsSync(p)) return; // the audit has not been run in this checkout
  const audit = JSON.parse(fs.readFileSync(p, "utf8"));

  const unexpected = [];
  for (const sport of audit.sports ?? []) {
    for (const f of sport.findings ?? []) {
      const date = /(\d{4}-\d{2}-\d{2})/.exec(f.scope ?? "")?.[1] ?? null;
      const known = f.kind === "SLUG_COLLISION" && date && PRE_SLUG_RULE_DATES.has(date);
      if (!known) unexpected.push(`${f.sport} ${f.scope}: ${f.kind} — ${f.detail}`);
    }
  }
  assert.deepEqual(unexpected, [], `identity findings outside the frozen pre-fix set:\n  ${unexpected.join("\n  ")}`);
});

test("LIVE · the audit actually looked at something — a vacuous pass is not a pass", () => {
  const p = path.join(process.cwd(), "..", "data", "internal", "audits", "event-identity.json");
  if (!fs.existsSync(p)) return;
  const audit = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.ok(audit.totals.rows > 100, `only ${audit.totals.rows} rows audited — the detector found nothing to read`);
  const byName = new Map((audit.sports ?? []).map((s) => [s.sport, s]));
  for (const sport of ["mlb", "nfl", "ufc", "epl"]) {
    assert.ok(byName.has(sport), `${sport} is not covered by the audit`);
    assert.ok(SPORT_VERDICTS.includes(byName.get(sport).verdict), `${sport}: verdict outside the vocabulary`);
  }
});
