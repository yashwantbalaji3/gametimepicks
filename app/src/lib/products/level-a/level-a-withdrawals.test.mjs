/**
 * Level A: a withheld forecast is COUNTED, and a card pulled before its cutoff is RECORDED as withdrawn (release owner
 * 2026-10-26, after 849804 left the 10-26 model at 20:51:41Z with no reason and the record could not say so).
 *   1. SOURCE_NOT_READY / SOURCE_UNAVAILABLE: the MLB reader returns every game with the owner's own status; the leg
 *      contract refuses a game that is not "ready", so refusedByReason accounts for it. No card changes.
 *   2. withdrawn.jsonl: append-only events (withdrawn / reinstated) beside the suggestions record, never editing it.
 *   3. The 5 backfilled 10-26 mixed-card events, checked against the record and the deployment evidence.
 * Run: npx tsx --test src/lib/products/level-a/level-a-withdrawals.test.mjs
 * Selections and snapshots marked FIXTURE are test inputs. REAL-DATA tests read committed 10-26 inputs PINNED to the
 * 22:51:01Z build (__fixtures__/level-a-sources-2026-10-26.json and the dated snapshot file), never "the latest" file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

import { LEG_REFUSAL, levelALeg, levelASuggestions } from "./suggestions.mjs";
import { levelASources, mlbSelections } from "./sources.mjs";
import { buildLevelAModel, LEVEL_A_SERVED_PATH, LEVEL_A_SERVED_SCHEMA, modelSha256 } from "./model.mjs";
import { LEVEL_A_WITHDRAWAL_SCHEMA, recordEntries, withdrawalEvents, withdrawalReason, withdrawalViolations } from "./record.mjs";
import { slipButtonText } from "./slip.mjs";
import { PAGE_FOR, runFromDeployment, verdictLine } from "../../../../scripts/products/record-level-a-from-deployment.mjs";

globalThis.React = React;
const { default: LevelASuggestions } = await import("../../../components/products/level-a-suggestions.tsx");
const REPO = path.resolve(process.cwd(), "..");
const readLines = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));

/* ─── 1. a withheld forecast is counted ───────────────────────────────────────────────────────────────────────── */
/** FIXTURE selection. */
const mlbSel = (o = {}) => ({
  sport: "mlb", eventId: "fx-1", eventLabel: "A @ B", startUtc: "2026-10-26T23:00:00Z", market: "winner",
  selection: { code: "away", label: "A to win" }, probability: 0.55, sourceStatus: "ready",
  forecast: { owner: "fixture", modelId: "fx", stampedAt: "2026-10-26T16:00:00Z", ref: null }, uncertainty: null, participantStatuses: [],
  settlement: { grader: "mlb-official-final", market: "moneyline", side: "away" }, ...o,
});

test("SOURCE STATUS: degraded → SOURCE_NOT_READY, anything else not ready → SOURCE_UNAVAILABLE; ready or no verdict passes", () => {
  const now = "2026-10-26T20:00:00Z";
  assert.equal(levelALeg(mlbSel(), { now }).ok, true);
  assert.equal(levelALeg(mlbSel({ sourceStatus: undefined }), { now }).ok, true, "a source with no readiness verdict is not checked");
  const degraded = levelALeg(mlbSel({ sourceStatus: "degraded" }), { now });
  assert.deepEqual(degraded.refusal.reasons, ["SOURCE_NOT_READY"]);
  assert.deepEqual(degraded.refusal.text, ["The official forecast is marked degraded: incomplete inputs."]);
  assert.equal(LEG_REFUSAL.SOURCE_NOT_READY, "The official forecast is marked degraded: incomplete inputs.");
  for (const s of ["unavailable", "started-before-generation"]) assert.deepEqual(levelALeg(mlbSel({ sourceStatus: s }), { now }).refusal.reasons, ["SOURCE_UNAVAILABLE"], s);
});

test("MLB READER: every game in the latest snapshot is returned with the owner's own status (FIXTURE snapshot)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "levela-mlb-"));
  const dir = path.join(root, "data/internal/mlb/prediction-snapshots/2026-10-26");
  fs.mkdirSync(dir, { recursive: true });
  const game = (gamePk, status, started = false) => ({ gamePk, status, awayTeam: "A", homeTeam: "B", completeness: { startedBeforeGeneration: started }, moneyline: { side: "away", team: "A", simulationProbability: 0.55 } });
  fs.writeFileSync(path.join(dir, "snapshot-202610261600.json"), JSON.stringify({ generatedAt: "2026-10-26T16:00:00Z", predictions: [game(1, "ready"), game(2, "degraded"), game(3, "unavailable"), game(4, "ready", true)] }));
  const rows = mlbSelections({ repoRoot: root, date: "2026-10-26" });
  assert.deepEqual(rows.map((r) => [r.eventId, r.sourceStatus]), [["1", "ready"], ["2", "degraded"], ["3", "unavailable"], ["4", "started-before-generation"]]);
});

/** The 22:51:01Z build's selections, frozen from the files committed at its commit (see the fixture's note). A later
 *  lineup refresh (00:41Z) and the soccer lanes' latest files moved on; this proves the same property forever. */
const PINNED_1026 = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "__fixtures__/level-a-sources-2026-10-26.json"), "utf8"));
const BUILT_1026 = "2026-10-26T22:51:01Z";

test("REAL DATA 10-26 (pinned): the frozen MLB row is exactly what the reader makes of the dated snapshot-202610262040 file", () => {
  assert.equal(PINNED_1026.builtAt, BUILT_1026);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "level-a-1026-"));
  const rel = "data/internal/mlb/prediction-snapshots/2026-10-26/snapshot-202610262040.json";
  fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
  fs.copyFileSync(path.join(REPO, rel), path.join(root, rel)); // the committed, dated file itself — it never changes
  const sims = path.join(root, "app/public/data/mlb/full-game-simulations/2026-10-26.json");
  fs.mkdirSync(path.dirname(sims), { recursive: true });
  fs.writeFileSync(sims, JSON.stringify({ games: [{ gamePk: 849804, firstPitch: "2026-10-27T00:00:00Z" }] })); // first pitch as committed at the build
  assert.deepEqual(mlbSelections({ repoRoot: root, date: "2026-10-26" }), PINNED_1026.selections.filter((s) => s.sport === "mlb"));
  assert.equal(PINNED_1026.selections.find((s) => s.eventId === "849804").sourceStatus, "degraded");
});

test("REAL DATA 10-26 (pinned): 849804 (degraded at 20:40Z) is refused visibly; the cards are exactly what the silent filter produced", () => {
  const sel = PINNED_1026.selections;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "level-a-1026-")); // reads nothing for the day: every input is pinned
  const model = buildLevelAModel({ repoRoot: root, now: BUILT_1026, productDay: "2026-10-26", sources: { selections: sel, nbaProjections: [] }, mixed: { enabled: true } });
  assert.deepEqual(model.refusedByReason, { SOURCE_NOT_READY: 1, INSIDE_CUTOFF: 2, EVENT_STARTED: 7 });
  const r = model.refused.find((x) => x.sport === "mlb" && x.eventId === "849804");
  assert.deepEqual([r.reasons, r.text], [["SOURCE_NOT_READY"], [LEG_REFUSAL.SOURCE_NOT_READY]]);
  for (const now of ["2026-10-26T20:46:26.268Z", BUILT_1026]) {
    const all = levelASuggestions({ selections: sel, now, productDay: "2026-10-26" });
    const old = levelASuggestions({ selections: sel.filter((s) => s.sourceStatus == null || s.sourceStatus === "ready"), now, productDay: "2026-10-26" });
    for (const k of ["legs", "untiered", "parlayLab", "bankBuilder", "moonshot"]) assert.deepEqual(all[k], old[k], `${now}: ${k} unchanged`);
  }
  const html = renderToString(React.createElement(LevelASuggestions, { model, mode: "parlay-lab" })).replace(/<!-- -->/g, "");
  assert.match(html, /1 × The official forecast is marked degraded: incomplete inputs\./, "the page's 'Unavailable today' line counts it");
});

/* ─── 2. withdrawals ───────────────────────────────────────────────────────────────────────────────────────────── */
const AS_OF = "2026-10-23T14:00:00.000Z";
const SHA = "a".repeat(40);
/** FIXTURE soccer selections (distinct games), one per probability. */
const fx = (p, i, o = {}) => ({
  sport: "epl", eventId: `w-${i}`, eventLabel: `H${i} v A${i}`, startUtc: "2026-10-23T19:00:00Z", market: "1x2",
  selection: { code: "home", label: `Club ${i} to win` }, probability: p,
  forecast: { owner: "fixture", modelId: "fx", stampedAt: "2026-10-23T08:00:00Z", ref: null }, uncertainty: null, participantStatuses: [],
  settlement: { grader: "soccer-1x2-official-final", market: "1x2", side: "home" }, ...o,
});
const PROBS = [0.82, 0.75, 0.6, 0.55, 0.45, 0.4];
const modelAt = (asOf, over = {}) => ({ asOf, ...levelASuggestions({ selections: PROBS.map((p, i) => fx(p, i, over[i] ?? {})), now: asOf, productDay: "2026-10-23" }), refusedByReason: {}, nbaProjections: [] });
const recordFrom = (model, servedFrom) => recordEntries(model, { recordedAt: servedFrom, shownAt: model.asOf, servedFrom });

test("WITHDRAWN: a recorded entry missing before its cutoff gets one event with its window and reason; still-served entries get none", () => {
  const m1 = modelAt(AS_OF);
  const existing = recordFrom(m1, "2026-10-23T14:03:00Z");
  assert.ok(existing.length >= 3);
  const m2 = modelAt("2026-10-23T15:00:00.000Z", { 0: { sourceStatus: "degraded" } });
  const ev = withdrawalEvents({ existing, model: m2, servedFrom: "2026-10-23T15:04:00Z", lastServedFrom: "2026-10-23T14:03:00Z", recordedAt: "2026-10-23T15:05:00Z" });
  const served = new Set(recordEntries(m2, { recordedAt: "x" }).map((e) => e.id));
  assert.deepEqual(ev.map((e) => e.id).sort(), existing.filter((e) => !served.has(e.id)).map((e) => e.id).sort(), "exactly the entries the new deployment no longer serves");
  assert.ok(ev.length >= 1);
  for (const e of ev) {
    assert.equal(e.schema, LEVEL_A_WITHDRAWAL_SCHEMA);
    assert.equal(e.event, "withdrawn");
    assert.deepEqual([e.servedFrom, e.lastServedFrom, e.firstNotServedFrom], ["2026-10-23T14:03:00Z", "2026-10-23T14:03:00Z", "2026-10-23T15:04:00Z"]);
    const orig = existing.find((x) => x.id === e.id);
    if (orig.legs.some((l) => l.eventId === "w-0")) assert.match(e.reason, /^epl:w-0 refused: SOURCE_NOT_READY/);
    else assert.match(e.reason, /^(replaced by a different card for the same slot \([0-9a-f]{16}\)|the slot shows no card now)$/);
    assert.ok(!("price" in e) && !("payout" in e));
  }
  assert.deepEqual(withdrawalEvents({ existing, events: ev, model: m2, servedFrom: "2026-10-23T15:30:00Z", recordedAt: "x" }), [], "never withdrawn twice");
  const back = withdrawalEvents({ existing, events: ev, model: modelAt("2026-10-23T16:00:00.000Z"), servedFrom: "2026-10-23T16:04:00Z", recordedAt: "x" });
  assert.deepEqual(back.map((e) => [e.id, e.event, e.reinstatedFrom]).sort(), ev.map((e) => [e.id, "reinstated", "2026-10-23T16:04:00Z"]).sort(), "served again before its cutoff: reinstated");
});

test("WITHDRAWN: nothing at or after an entry's own cutoff (first start − 30 min), and nothing before it first went live", () => {
  const m1 = modelAt(AS_OF);
  const existing = recordFrom(m1, "2026-10-23T14:03:00Z");
  const empty = { ...modelAt("2026-10-23T18:31:00.000Z"), parlayLab: [], bankBuilder: { card: null }, moonshot: { card: null }, untiered: [], legs: [], refused: [] };
  assert.deepEqual(withdrawalEvents({ existing, model: empty, servedFrom: "2026-10-23T18:30:00Z", recordedAt: "x" }), [], "18:30Z is the cutoff of a 19:00Z start");
  assert.ok(withdrawalEvents({ existing, model: empty, servedFrom: "2026-10-23T18:29:59Z", recordedAt: "x" }).length > 0);
  assert.deepEqual(withdrawalEvents({ existing, model: empty, servedFrom: "2026-10-23T14:02:00Z", recordedAt: "x" }), [], "a deployment live before the entry was");
  assert.equal(withdrawalReason(existing[0], empty, []), existing[0].legs.map((l) => `${l.sport}:${l.eventId} is no longer in the served model`).join("; "));
});

test("WITHDRAWAL GUARD: prefix-preserving, recorded ids only, events alternate, no price", () => {
  const ok = (o) => JSON.stringify({ schema: LEVEL_A_WITHDRAWAL_SCHEMA, id: "x1", event: "withdrawn", ...o });
  const ids = new Set(["x1"]);
  assert.deepEqual(withdrawalViolations({ beforeText: "", afterText: `${ok()}\n${ok({ event: "reinstated" })}\n`, recordIds: ids }), []);
  assert.match(withdrawalViolations({ beforeText: `${ok()}\n`, afterText: `${ok({ reason: "edited" })}\n`, recordIds: ids }).join(), /unchanged prefix/);
  assert.match(withdrawalViolations({ afterText: `${ok({ id: "nope" })}\n`, recordIds: ids }).join(), /not an entry/);
  assert.match(withdrawalViolations({ afterText: `${ok()}\n${ok()}\n`, recordIds: ids }).join(), /withdrawn twice in a row/);
  assert.match(withdrawalViolations({ afterText: `${ok({ event: "reinstated" })}\n`, recordIds: ids }).join(), /reinstated twice in a row/, "reinstated with no withdrawal before it");
  assert.match(withdrawalViolations({ afterText: `${ok({ price: -110 })}\n`, recordIds: ids }).join(), /price field/);
});

test("RECORDER: a verified deployment that drops a pre-cutoff entry appends a withdrawn event beside the record; dry run writes nothing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "levela-wd-"));
  const file = path.join(dir, "suggestions.jsonl");
  const deploy = (model) => {
    const served = { schema: LEVEL_A_SERVED_SCHEMA, public: true, asOf: model.asOf, productDay: model.productDay, modelSha256: modelSha256(model), model };
    const pages = Object.fromEntries(["parlay-lab", "bank-builder", "moonshot"].map((m) => [PAGE_FOR[m], renderToString(React.createElement(LevelASuggestions, { model, mode: m }))]));
    const byPath = { "/data/build-info.json": { builtAt: model.asOf, commit: { sha: SHA } }, [LEVEL_A_SERVED_PATH]: served, ...pages };
    return async (url) => { const v = byPath[new URL(url).pathname]; if (v == null) throw new Error("404"); return typeof v === "string" ? v : JSON.stringify(v); };
  };
  await runFromDeployment({ sha: SHA, servedFrom: "2026-10-23T14:03:00Z", origin: "https://example.test", write: true, file, now: "2026-10-23T14:05:00Z", fetchText: deploy(modelAt(AS_OF)) });
  assert.equal(fs.existsSync(path.join(dir, "withdrawn.jsonl")), false, "nothing withdrawn yet");
  const m2 = modelAt("2026-10-23T15:00:00.000Z", { 0: { sourceStatus: "degraded" } });
  const dry = await runFromDeployment({ sha: SHA, servedFrom: "2026-10-23T15:04:00Z", lastServedFrom: "2026-10-23T14:03:00Z", origin: "https://example.test", write: false, file, now: "2026-10-23T15:05:00Z", fetchText: deploy(m2) });
  assert.ok(dry.withdrawals.length > 0);
  assert.equal(fs.existsSync(path.join(dir, "withdrawn.jsonl")), false, "a dry run writes nothing");
  const before = fs.readFileSync(file, "utf8");
  const run = await runFromDeployment({ sha: SHA, servedFrom: "2026-10-23T15:04:00Z", lastServedFrom: "2026-10-23T14:03:00Z", origin: "https://example.test", write: true, file, now: "2026-10-23T15:05:00Z", fetchText: deploy(m2) });
  assert.ok(fs.readFileSync(file, "utf8").startsWith(before), "the suggestions record only grows");
  const events = fs.readFileSync(path.join(dir, "withdrawn.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(events.length, run.withdrawals.length);
  assert.ok(events.every((e) => e.event === "withdrawn" && e.firstNotServedFrom === "2026-10-23T15:04:00Z" && e.source.sha === SHA));
  assert.match(verdictLine(run), /; \d+ withdrawal events? \(withdrawn /);
});

/* ─── 3. the 10-26 backfill ───────────────────────────────────────────────────────────────────────────────────── */
test("BACKFILL 10-26: exactly the 5 mixed entries, withdrawn 822001fd18 → f10648ad8a, originals unchanged, file passes its guard", () => {
  const record = readLines("data/internal/products/level-a/suggestions.jsonl");
  const wd = readLines("data/internal/products/level-a/withdrawn.jsonl");
  const bf = wd.filter((e) => e.source?.kind === "backfill");
  const mixed = record.filter((e) => e.productDay === "2026-10-26" && e.policy.startsWith("level-a-mixed@1/"));
  assert.equal(mixed.length, 5);
  assert.deepEqual(bf.map((e) => e.id).sort(), mixed.map((e) => e.id).sort());
  for (const e of bf) {
    const orig = mixed.find((m) => m.id === e.id);
    assert.deepEqual([e.event, e.policy, e.tier, e.firstStartUtc, e.servedFrom], ["withdrawn", orig.policy, orig.tier, orig.firstStartUtc, orig.servedFrom]);
    assert.deepEqual([e.lastServedFrom, e.firstNotServedFrom], ["2026-10-26T20:45:13Z", "2026-10-26T20:51:41Z"]);
    assert.ok(Date.parse(e.firstNotServedFrom) < Date.parse(e.firstStartUtc) - 30 * 60_000, "before the card's own cutoff");
    assert.equal(e.reason, "mlb:849804 is no longer in the served model");
    assert.ok(orig.legs.some((l) => l.sport === "mlb" && l.eventId === "849804" && l.probability === 0.529), "the original still holds what readers saw");
    assert.deepEqual([e.source.lastServed.deploymentSha.slice(0, 10), e.source.firstNotServed.deploymentSha.slice(0, 10)], ["822001fd18", "f10648ad8a"]);
    for (const k of ["withdrawn", "withdrawnAt", "firstNotServedFrom"]) assert.ok(!(k in orig), `the suggestion row carries no ${k}`);
  }
  const text = fs.readFileSync(path.join(REPO, "data/internal/products/level-a/withdrawn.jsonl"), "utf8");
  assert.deepEqual(withdrawalViolations({ afterText: text, recordIds: new Set(record.map((e) => e.id)) }), []);
});

test("GRADING UNCHANGED: the grader and Results read only the suggestions and grades files", () => {
  for (const f of ["src/lib/products/level-a/grade.mjs", "scripts/products/grade-level-a-suggestions.mjs", "src/lib/results/level-a-record.mjs"]) {
    assert.doesNotMatch(fs.readFileSync(path.resolve(process.cwd(), f), "utf8"), /withdrawn/, `${f} does not read withdrawals`);
  }
});

/* ─── UX (a): the card button says what it removes ─────────────────────────────────────────────────────────────── */
test("CARD BUTTON: 'Remove card (n legs)', labelled as removing every leg, including any added elsewhere; a leg keeps its words", () => {
  assert.deepEqual(slipButtonText({ inSlip: false, count: 3, label: "Add card to slip", name: "Medium Risk (3 legs)" }), { text: "Add card to slip", aria: "Add card to slip: Medium Risk (3 legs)" });
  assert.deepEqual(slipButtonText({ inSlip: true, count: 3, label: "Add card to slip", name: "Medium Risk (3 legs)" }), { text: "Remove card (3 legs)", aria: "Remove this card's 3 legs from the model slip, including any added elsewhere: Medium Risk (3 legs)" });
  assert.deepEqual(slipButtonText({ inSlip: true, count: 1, name: "BOS to win, NYK @ BOS" }), { text: "In slip · remove", aria: "Remove BOS to win, NYK @ BOS from the model slip" });
  const src = fs.readFileSync(path.resolve(process.cwd(), "src/components/products/level-a-slip.tsx"), "utf8");
  assert.match(src, /const words = slipButtonText\(\{ inSlip, count: keys\.length, label, name \}\)/);
  assert.match(src, /aria-label=\{words\.aria\}/);
});
