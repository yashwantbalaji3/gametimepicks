/**
 * EVERY FROZEN PAIRING LANDS IN EXACTLY ONE STATUS (UFC-001 · U4 / D3 — proposal, nothing applied).
 *
 * Run: npx tsx --test src/lib/sports/ufc/pairing-status.test.mjs
 *
 * The real case first: Gall v Dumas was frozen in three pre-start snapshots, replaced by Hernandez v
 * Dumas before the final one, and has read "pending 1" ever since. The fixture is a read-only
 * extraction of the committed 2026-09-26 snapshots, corpus results and ledger rows.
 *
 * Then the edges the rule must NOT swallow: a replacement after the final snapshot, a bout the
 * provider drops after the final snapshot, a bout still on the card but unpriced at the final freeze.
 * Each of those stays AWAITING_RESULT. Withdrawn is reached only on positive evidence.
 *
 * The checks are a table so the MUTATION PROBES at the bottom can run the same table against
 * deliberately broken copies of the module: each probe must be killed by at least one check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { classifyPairings, PAIRING_STATUS, PAIRING_FLAG, EXCLUDED_STATUS } from "./pairing-status.mjs";
import { boutKey } from "./model-vs-market.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL = JSON.parse(fs.readFileSync(path.join(HERE, "fixtures/pairing-status-2026-09-26.json"), "utf8"));
const GALL = "2026-09-26:mickey gall|sedriques dumas";
const HERNANDEZ = "2026-09-26:luis hernandez|sedriques dumas";

/* ── synthetic card builders ───────────────────────────────────────────────────────────────── */
const D = "2030-01-05";
const START = "2030-01-05T21:00Z";
const AFTER = "2030-01-07T08:00:00Z";
const row = (a, b, pick, p, pid) => ({
  boutId: boutKey(D, a, b), providerBoutId: pid, eventDate: D, eventName: "Test Card",
  pick, opponent: pick === a ? b : a, modelProbability: p, marketProbability: 0.5, impliedSum: 1.04, books: 5, modelId: "test",
});
const snap = (file, capturedAt, rows, skipped = []) => ({ file, capturedAt, event: { name: "Test Card", slateDate: D, startUtc: START }, rows, skipped });
const won = (a, b, winner, extra = {}) => ({ boutId: boutKey(D, a, b), eventDate: D, winner, loser: winner === a ? b : a, void: false, source: "test", ...extra });
const noWinner = (a, b, resultStatus) => ({ boutId: boutKey(D, a, b), eventDate: D, winner: null, loser: null, void: true, resultStatus, source: "test" });

const AB = row("Al A", "Bo B", "Al A", 0.61, "1");
const CD = row("Cy C", "Di D", "Cy C", 0.55, "2");
const EF = row("Ed E", "Fe F", "Fe F", 0.70, "3");
const GH = row("Gus G", "Hal H", "Gus G", 0.52, "4");
const card = (...snaps) => snaps;
const one = (out, boutId) => {
  const p = out.cards.flatMap((c) => c.pairings).find((x) => x.boutId === boutId);
  assert.ok(p, `pairing ${boutId} classified`);
  return p;
};
const counts = (out, slate = D) => out.cards.find((c) => c.slateDate === slate).counts;
const deepFreeze = (o) => { if (o && typeof o === "object") { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ── the check table ───────────────────────────────────────────────────────────────────────── */
const CHECKS = [
  {
    name: "REAL: Gall v Dumas is WITHDRAWN_BEFORE_START with its snapshot evidence and the Hernandez replacement",
    run(classify) {
      const out = classify({ snapshots: clone(REAL.snapshots), results: clone(REAL.results), now: "2026-10-10T12:00:00Z" });
      const g = one(out, GALL);
      assert.equal(g.status, PAIRING_STATUS.WITHDRAWN_BEFORE_START);
      assert.equal(g.providerBoutId, "401923433");
      assert.equal(g.evidence.firstSnapshot.file, "snapshot-202609221527.json");
      assert.equal(g.evidence.lastSnapshot.file, "snapshot-202609241534.json");
      assert.equal(g.evidence.finalSnapshot.file, "snapshot-202609261455.json");
      assert.equal(g.evidence.snapshotsContaining, 3);
      assert.equal(g.evidence.inFinalSnapshot, false);
      assert.deepEqual(g.evidence.replacement, { boutId: HERNANDEZ, providerBoutId: "401924683", sharedFighters: ["Sedriques Dumas"], source: "final_snapshot" });
      assert.equal(g.result, null);
      // the record of the forecast is kept, unchanged: pick Gall at 0.5115 (market 0.5635)
      assert.equal(g.forecast.pick, "Mickey Gall");
      assert.equal(g.forecast.modelProbability, 0.5115);
    },
  },
  {
    name: "REAL: 2026-09-26 reads frozen 9 = graded 8 + withdrawn 1, pending 0; every graded pairing matches the ledger",
    run(classify) {
      const out = classify({ snapshots: clone(REAL.snapshots), results: clone(REAL.results), now: "2026-10-10T12:00:00Z" });
      const c = counts(out, "2026-09-26");
      assert.deepEqual(
        { frozen: c.frozen, graded: c.graded, void: c.void, withdrawn: c.withdrawn, pending: c.pending, den: c.hitRateDenominator },
        { frozen: 9, graded: 8, void: 0, withdrawn: 1, pending: 0, den: 8 },
      );
      assert.equal(out.cards[0].reconciles, true);
      // DENOMINATOR EFFECT IS NIL FOR GRADED BOUTS: same 8 ids, same hit, same probability, same source snapshot.
      for (const l of REAL.ledger) {
        const p = one(out, l.boutId);
        assert.equal(p.status, l.hit ? PAIRING_STATUS.GRADED_WIN : PAIRING_STATUS.GRADED_LOSS, l.boutId);
        assert.equal(p.forecast.modelProbability, l.modelProbability);
        assert.equal(p.forecast.pick, l.pick);
        assert.equal(p.forecast.sourceFile, l.sourceFile);
        // the corpus's "…|raul rosas jr." re-keys exactly to the snapshot's "…|raul rosas jr" — no loose join needed
        assert.deepEqual(p.flags, [], l.boutId);
      }
      // the never-frozen bouts of the final snapshot are listed apart, outside the frozen population
      const ex = out.cards[0].excluded;
      assert.equal(ex.filter((e) => e.status === EXCLUDED_STATUS.UNPRICED_EXCLUDED).length, 2);
      assert.equal(ex.filter((e) => e.status === EXCLUDED_STATUS.NO_READ_EXCLUDED).length, 2);
    },
  },
  {
    name: "REAL: before the card starts nothing is withdrawn — the 'final' snapshot is only the latest so far",
    run(classify) {
      const out = classify({ snapshots: clone(REAL.snapshots), results: [], now: "2026-09-25T18:00:00Z" });
      const g = one(out, GALL);
      assert.equal(g.status, PAIRING_STATUS.AWAITING_RESULT);
      assert.ok(g.flags.includes(PAIRING_FLAG.CARD_NOT_STARTED));
      assert.equal(out.cards[0].finalSnapshotDetermined, false);
      // snapshots captured after `now` are not yet known
      assert.ok(out.cards[0].ignoredSnapshots.some((s) => s.file === "snapshot-202609261455.json"));
    },
  },
  {
    name: "REAL: card started but the provider has reported nothing — Gall stays AWAITING (CARD_UNREPORTED)",
    run(classify) {
      const out = classify({ snapshots: clone(REAL.snapshots), results: [], now: "2026-09-27T01:00:00Z" });
      const g = one(out, GALL);
      assert.equal(g.status, PAIRING_STATUS.AWAITING_RESULT);
      assert.ok(g.flags.includes(PAIRING_FLAG.CARD_UNREPORTED));
      assert.equal(counts(out, "2026-09-26").withdrawn, 0);
    },
  },
  {
    name: "DRAW, NO CONTEST, and a winner-only no-winner each VOID by the source's own word, never a loss",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-04T12:00Z", [AB, CD, EF, GH]));
      const out = classify({ snapshots: snaps, results: [noWinner("Al A", "Bo B", "draw"), noWinner("Cy C", "Di D", "no_contest"), noWinner("Ed E", "Fe F", undefined), won("Gus G", "Hal H", "Hal H")], now: AFTER });
      assert.equal(one(out, AB.boutId).status, PAIRING_STATUS.VOID_DRAW);
      assert.equal(one(out, CD.boutId).status, PAIRING_STATUS.VOID_NO_CONTEST);
      assert.equal(one(out, EF.boutId).status, PAIRING_STATUS.VOID_NO_WINNER_UNSPECIFIED);
      assert.equal(one(out, GH.boutId).status, PAIRING_STATUS.GRADED_LOSS);
      const c = counts(out);
      assert.deepEqual([c.void, c.graded, c.hitRateDenominator, c.withdrawn, c.pending], [3, 1, 1, 0, 0]);
    },
  },
  {
    name: "LATE REPLACEMENT after the final snapshot is NOT withdrawn: AWAITING_RESULT, flagged",
    run(classify) {
      // A|B is in the final snapshot; after it, Bo B fought a short-notice Zed Z instead.
      const snaps = card(snap("s1", "2030-01-04T12:00Z", [AB, CD]), snap("s2", "2030-01-05T15:00Z", [AB, CD]));
      const out = classify({ snapshots: snaps, results: [won("Zed Z", "Bo B", "Bo B"), won("Cy C", "Di D", "Cy C")], now: AFTER });
      const p = one(out, AB.boutId);
      assert.equal(p.status, PAIRING_STATUS.AWAITING_RESULT);
      assert.ok(p.flags.includes(PAIRING_FLAG.POSSIBLE_LATE_REPLACEMENT));
      assert.equal(p.evidence.replacement.boutId, boutKey(D, "Zed Z", "Bo B"));
      assert.equal(counts(out).withdrawn, 0);
    },
  },
  {
    name: "CANCELLED OUTRIGHT, no replacement: WITHDRAWN_BEFORE_START with replacement null",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-03T12:00Z", [AB, CD]), snap("s2", "2030-01-05T15:00Z", [CD]));
      const out = classify({ snapshots: snaps, results: [won("Cy C", "Di D", "Di D")], now: AFTER });
      const p = one(out, AB.boutId);
      assert.equal(p.status, PAIRING_STATUS.WITHDRAWN_BEFORE_START);
      assert.equal(p.evidence.replacement, null);
      assert.equal(p.evidence.lastSnapshot.file, "s1");
      const c = counts(out);
      assert.deepEqual([c.frozen, c.graded, c.withdrawn, c.pending, c.hitRateDenominator], [2, 1, 1, 0, 1]);
    },
  },
  {
    name: "DISAPPEARS FROM THE PROVIDER but was in the final snapshot: stays AWAITING_RESULT, never withdrawn",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-05T15:00Z", [AB, CD]));
      const out = classify({ snapshots: snaps, results: [won("Cy C", "Di D", "Cy C")], now: AFTER });
      const p = one(out, AB.boutId);
      assert.equal(p.status, PAIRING_STATUS.AWAITING_RESULT);
      assert.deepEqual(p.flags, []);
    },
  },
  {
    name: "UNPRICED at the final freeze but frozen earlier: not withdrawn, not a loss; never-frozen unpriced is UNPRICED_EXCLUDED",
    run(classify) {
      const snaps = card(
        snap("s1", "2030-01-03T12:00Z", [AB, CD]),
        snap("s2", "2030-01-05T15:00Z", [CD], [{ boutId: "1", reason: "no usable two-way price for this bout" }, { boutId: "9", reason: "no usable two-way price for this bout" }, { boutId: "8", reason: "the model published no read for this bout" }]),
      );
      const out = classify({ snapshots: snaps, results: [won("Cy C", "Di D", "Cy C")], now: AFTER });
      const p = one(out, AB.boutId);
      assert.equal(p.status, PAIRING_STATUS.AWAITING_RESULT);
      assert.ok(p.flags.includes(PAIRING_FLAG.ON_FINAL_CARD_WITHOUT_FORECAST));
      const c = counts(out);
      assert.deepEqual([c.frozen, c.withdrawn, c.pending, c.unpricedExcluded, c.noReadExcluded], [2, 0, 1, 1, 1]);
      assert.deepEqual(out.cards[0].excluded.map((e) => [e.providerBoutId, e.status]), [["9", "UNPRICED_EXCLUDED"], ["8", "NO_READ_EXCLUDED"]]);
      // and once it fights, the earlier frozen forecast grades — exactly as the grader does today
      const later = classify({ snapshots: snaps, results: [won("Cy C", "Di D", "Cy C"), won("Al A", "Bo B", "Al A")], now: AFTER });
      assert.equal(one(later, AB.boutId).status, PAIRING_STATUS.GRADED_WIN);
      assert.ok(one(later, AB.boutId).flags.includes(PAIRING_FLAG.FOUGHT_THOUGH_ABSENT_FROM_FINAL));
    },
  },
  {
    name: "FOUGHT THOUGH ABSENT from the final snapshot: graded, flagged — the provider's report beats absence",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-03T12:00Z", [AB, CD]), snap("s2", "2030-01-05T15:00Z", [CD]));
      const out = classify({ snapshots: snaps, results: [won("Cy C", "Di D", "Cy C"), won("Al A", "Bo B", "Bo B")], now: AFTER });
      const p = one(out, AB.boutId);
      assert.equal(p.status, PAIRING_STATUS.GRADED_LOSS);
      assert.ok(p.flags.includes(PAIRING_FLAG.FOUGHT_THOUGH_ABSENT_FROM_FINAL));
    },
  },
  {
    name: "DUPLICATE RESULT: classified once, flagged, denominators unchanged",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-05T15:00Z", [AB, CD]));
      const out = classify({ snapshots: snaps, results: [won("Al A", "Bo B", "Al A"), won("Al A", "Bo B", "Al A", { source: "other" }), won("Cy C", "Di D", "Cy C")], now: AFTER });
      const p = one(out, AB.boutId);
      assert.equal(p.status, PAIRING_STATUS.GRADED_WIN);
      assert.ok(p.flags.includes(PAIRING_FLAG.DUPLICATE_RESULT));
      assert.equal(p.resultsNotApplied.length, 0);
      const c = counts(out);
      assert.deepEqual([c.frozen, c.graded, c.hitRateDenominator], [2, 2, 2]);
      // a duplicate that names the void kind upgrades an unspecified no-winner, it does not conflict
      const v = classify({ snapshots: snaps, results: [noWinner("Al A", "Bo B", undefined), noWinner("Al A", "Bo B", "draw")], now: AFTER });
      assert.equal(one(v, AB.boutId).status, PAIRING_STATUS.VOID_DRAW);
      assert.ok(one(v, AB.boutId).flags.includes(PAIRING_FLAG.DUPLICATE_RESULT));
    },
  },
  {
    name: "OVERTURNED RESULT (out of scope): flagged, NOT applied — the first official record stands",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-05T15:00Z", [AB]));
      const original = won("Al A", "Bo B", "Al A", { recordedAt: "2030-01-06T08:00Z" });
      const overturn = { ...noWinner("Al A", "Bo B", "no_contest"), overturned: true, recordedAt: "2030-02-20T08:00Z" };
      // listed newest-first on purpose: order of the input must not decide
      const out = classify({ snapshots: snaps, results: [overturn, original], now: "2030-03-01T00:00:00Z" });
      const p = one(out, AB.boutId);
      assert.equal(p.status, PAIRING_STATUS.GRADED_WIN);
      assert.ok(p.flags.includes(PAIRING_FLAG.RESULT_CHANGED_NOT_APPLIED));
      assert.equal(p.resultsNotApplied.length, 1);
      assert.equal(p.resultsNotApplied[0].overturned, true);
      // an unmarked later record that disagrees is the same fact: flagged, not applied
      const flip = classify({ snapshots: snaps, results: [original, won("Al A", "Bo B", "Bo B", { recordedAt: "2030-01-09T00:00Z" })], now: "2030-03-01T00:00:00Z" });
      assert.equal(one(flip, AB.boutId).status, PAIRING_STATUS.GRADED_WIN);
      assert.ok(one(flip, AB.boutId).flags.includes(PAIRING_FLAG.RESULT_CHANGED_NOT_APPLIED));
      // only an overturn record, no base: nothing to stand on, so it waits
      const orphan = classify({ snapshots: snaps, results: [overturn], now: "2030-03-01T00:00:00Z" });
      assert.equal(one(orphan, AB.boutId).status, PAIRING_STATUS.AWAITING_RESULT);
      assert.ok(one(orphan, AB.boutId).flags.includes(PAIRING_FLAG.NO_BASE_RESULT));
    },
  },
  {
    name: "IMMUTABILITY: classification never changes a frozen forecast's probability or pick, and never touches its inputs",
    run(classify) {
      const AB1 = { ...AB, modelProbability: 0.58 };   // the forecast moved between snapshots
      const snaps = card(snap("s1", "2030-01-03T12:00Z", [AB1, CD, EF]), snap("s2", "2030-01-05T15:00Z", [AB, CD]));
      const results = [noWinner("Cy C", "Di D", "draw"), won("Al A", "Bo B", "Bo B")];
      const before = JSON.stringify({ snaps, results });
      deepFreeze(snaps); deepFreeze(results);              // any write to an input throws in strict mode
      const out = classify({ snapshots: snaps, results, now: AFTER });
      assert.equal(JSON.stringify({ snaps, results }), before);
      // the record is the LATEST pre-start row that held the pairing — whatever its status
      assert.equal(one(out, AB.boutId).forecast.modelProbability, 0.61);
      assert.equal(one(out, AB.boutId).forecast.pick, "Al A");
      assert.equal(one(out, AB.boutId).status, PAIRING_STATUS.GRADED_LOSS);
      assert.equal(one(out, CD.boutId).forecast.modelProbability, 0.55);
      assert.equal(one(out, EF.boutId).status, PAIRING_STATUS.WITHDRAWN_BEFORE_START);
      assert.equal(one(out, EF.boutId).forecast.modelProbability, 0.70);
      assert.equal(one(out, EF.boutId).forecast.pick, "Fe F");
      // the returned record itself cannot be edited downstream
      assert.ok(Object.isFrozen(one(out, AB.boutId).forecast));
      assert.throws(() => { one(out, AB.boutId).forecast.modelProbability = 0.99; }, TypeError);
    },
  },
  {
    name: "LEAKAGE: a snapshot captured at or after the start is ignored, never the final snapshot",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-05T15:00Z", [AB, CD]), snap("s2", "2030-01-05T21:00Z", [CD]));
      const out = classify({ snapshots: snaps, results: [won("Cy C", "Di D", "Cy C")], now: AFTER });
      assert.equal(out.cards[0].finalSnapshot.file, "s1");
      assert.ok(out.cards[0].ignoredSnapshots.some((s) => s.file === "s2" && /at or after the card start/.test(s.reason)));
      assert.equal(one(out, AB.boutId).status, PAIRING_STATUS.AWAITING_RESULT);
    },
  },
  {
    name: "SPELLING IS NOT EVIDENCE: 'Syguła' and reversed name order join loosely (flagged) — never withdrawn, never a wrong hit",
    run(classify) {
      // Real shapes from main: the snapshot folds "Syguła" to "sygu a"; the corpus spells "Sygula".
      // The snapshot says "Jingnan Xiong"; the corpus says "Xiong Jingnan".
      const SY = row("Klaudia Syguła", "Nora Cornolle", "Klaudia Syguła", 0.60, "5");
      const XI = row("Julia Polastri", "Jingnan Xiong", "Julia Polastri", 0.75, "6");
      assert.equal(SY.boutId, `${D}:klaudia sygu a|nora cornolle`);
      const snaps = card(snap("s1", "2030-01-03T12:00Z", [SY, XI, AB]), snap("s2", "2030-01-05T15:00Z", [AB]));
      const results = [
        { boutId: `${D}:klaudia sygula|nora cornolle`, eventDate: D, winner: "Klaudia Sygula", loser: "Nora Cornolle", void: false },
        { boutId: `${D}:julia polastri|xiong jingnan`, eventDate: D, winner: "Xiong Jingnan", loser: "Julia Polastri", void: false },
        won("Al A", "Bo B", "Al A"),
      ];
      const out = classify({ snapshots: snaps, results, now: AFTER });
      const sy = one(out, SY.boutId), xi = one(out, XI.boutId);
      assert.equal(sy.status, PAIRING_STATUS.GRADED_WIN);
      assert.equal(xi.status, PAIRING_STATUS.GRADED_LOSS);
      for (const p of [sy, xi]) {
        assert.ok(p.flags.includes(PAIRING_FLAG.RESULT_JOINED_BY_LOOSE_NAME));
        assert.ok(p.flags.includes(PAIRING_FLAG.FOUGHT_THOUGH_ABSENT_FROM_FINAL));
      }
      assert.equal(counts(out).withdrawn, 0);
    },
  },
  {
    name: "A RESULT NAMING SOMEONE ELSE is not graded against the pick",
    run(classify) {
      const snaps = card(snap("s1", "2030-01-05T15:00Z", [AB]));
      const bad = { boutId: AB.boutId, eventDate: D, winner: "Zed Z", loser: "Bo B", void: false };
      const out = classify({ snapshots: snaps, results: [bad], now: AFTER });
      assert.equal(one(out, AB.boutId).status, PAIRING_STATUS.AWAITING_RESULT);
      assert.ok(one(out, AB.boutId).flags.includes(PAIRING_FLAG.RESULT_NAMES_MISMATCH));
    },
  },
  {
    name: "EXACTLY ONE STATUS, reconciliation holds, and the output does not depend on input order",
    run(classify) {
      const snaps = [snap("s1", "2030-01-03T12:00Z", [AB, CD, EF]), snap("s2", "2030-01-05T15:00Z", [CD, GH])];
      const results = [won("Cy C", "Di D", "Cy C"), noWinner("Gus G", "Hal H", "draw")];
      const a = classify({ snapshots: snaps, results, now: AFTER });
      const b = classify({ snapshots: [...snaps].reverse(), results: [...results].reverse(), now: AFTER });
      assert.equal(JSON.stringify(a), JSON.stringify(b));
      const all = new Set(Object.values(PAIRING_STATUS));
      for (const c of [...a.cards, ...classify({ snapshots: clone(REAL.snapshots), results: clone(REAL.results), now: "2026-10-10T12:00:00Z" }).cards]) {
        assert.equal(c.reconciles, true);
        assert.equal(new Set(c.pairings.map((p) => p.boutId)).size, c.pairings.length);
        for (const p of c.pairings) assert.ok(all.has(p.status), p.status);
      }
      assert.deepEqual(a.cards[0].pairings.map((p) => p.status), [
        PAIRING_STATUS.WITHDRAWN_BEFORE_START, PAIRING_STATUS.GRADED_WIN, PAIRING_STATUS.WITHDRAWN_BEFORE_START, PAIRING_STATUS.VOID_DRAW,
      ]);
    },
  },
];

for (const c of CHECKS) test(c.name, () => c.run(classifyPairings));

test("`now` is required — no clock is read inside the module", () => {
  assert.throws(() => classifyPairings({ snapshots: [], results: [] }), /now/);
});

/* ── MUTATION PROBES ───────────────────────────────────────────────────────────────────────────
 * Each probe breaks one load-bearing line of the module. The check table above must fail on every
 * one of them; a probe that survives means the rule it breaks is not pinned. The target text must
 * exist, so a refactor cannot quietly turn a probe into a no-op.
 */
const PROBES = [
  ["withdraw before the provider has reported the card", "} else if (!cardReported) {", "} else if (false) {"],
  ["ignore an unpriced-at-final provider id", "} else if (finalSkipped.has(String(f.row.providerBoutId))) {", "} else if (false) {"],
  ["treat a final-snapshot pairing as absent", "} else if (inFinal) {", "} else if (false && inFinal) {"],
  ["withdraw before the card starts", "const started = startMs != null && nowMs >= startMs;", "const started = true;"],
  ["accept post-start snapshots", "else if (x.t >= startMs)", "else if (x.t > startMs + 1e15)"],
  ["apply the newest (overturning) record", "let base = candidates[0];", "let base = ordered.at(-1);"],
  ["no void branch (a draw falls through)", "if (isVoid(base)) {", "if (false) {"],
  ["count never-frozen bouts as excluded-or-not blindly", "if (frozenProviderIds.has(pid) || finalProviderIds.has(pid)) continue;", "continue;"],
  ["keep the FIRST row as the record of forecast", "row: r,", "row: prev?.row ?? r,"],
  ["flip win and loss", "=== looseName(f.row.pick) ? PAIRING_STATUS.GRADED_WIN", "!== looseName(f.row.pick) ? PAIRING_STATUS.GRADED_WIN"],
  ["no replacement from the final snapshot", "if (shared.length > 0 || String(r.providerBoutId) === String(row.providerBoutId)) {", "if (false) {"],
  ["drop the duplicate flag", "flags.push(PAIRING_FLAG.DUPLICATE_RESULT);", ";"],
  ["no names check on the winner", "} else if (![...rowNames(f.row), ...fightersOf(boutId)].map(looseName).includes(looseName(base.winner))) {", "} else if (false) {"],
  ["join results on the corpus's raw (unfolded) boutId", "const key = canonicalBoutId(r.boutId);", "const key = r.boutId;"],
  ["no loose-name fallback", "if (records?.length) flags.push(PAIRING_FLAG.RESULT_JOINED_BY_LOOSE_NAME);", "records = null;"],
  ["exact fold for the hit", "status = looseName(base.winner) === looseName(f.row.pick)", "status = foldName(base.winner) === foldName(f.row.pick)"],
  ["withdrawn counted as pending in the reconciliation", "withdrawn = n(PAIRING_STATUS.WITHDRAWN_BEFORE_START), pending = n(PAIRING_STATUS.AWAITING_RESULT);", "withdrawn = 0, pending = n(PAIRING_STATUS.AWAITING_RESULT) + n(PAIRING_STATUS.WITHDRAWN_BEFORE_START);"],
];

test("MUTATION PROBES: every probe is killed by at least one check", async (t) => {
  const src = fs.readFileSync(path.join(HERE, "pairing-status.mjs"), "utf8");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ufc-pairing-probe-"));
  const mvm = pathToFileURL(path.join(HERE, "model-vs-market.mjs")).href;
  const survivors = [];
  try {
    for (const [i, [label, from, to]] of PROBES.entries()) {
      assert.ok(src.includes(from), `probe "${label}" target text not found — update the probe`);
      const mutant = src.replace(from, to).replace('from "./model-vs-market.mjs"', `from "${mvm}"`);
      const file = path.join(dir, `mutant-${i}.mjs`);
      fs.writeFileSync(file, mutant);
      const { classifyPairings: m } = await import(pathToFileURL(file).href);
      const killedBy = [];
      for (const c of CHECKS) { try { c.run(m); } catch { killedBy.push(c.name.slice(0, 40)); } }
      if (killedBy.length === 0) survivors.push(label);
      t.diagnostic(`probe ${i + 1}/${PROBES.length} "${label}": ${killedBy.length ? `KILLED by ${killedBy.length} check(s)` : "SURVIVED"}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(survivors, [], `surviving probes: ${survivors.join("; ")}`);
});
