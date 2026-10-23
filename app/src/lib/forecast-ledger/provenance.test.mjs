/**
 * Audit 2026-10-23 · A-T07 · F01 — forecast provenance. Every ledger row resolves to RECEIPT | GIT_HISTORY |
 * LEGACY_UNKNOWN for model id, event start and publication stamp; recovered values come only from exact matches against
 * committed files; once recovered they are frozen. Each probe applies a real mutation and asserts it is caught, beside a
 * no-mutation control.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { FORECAST_KIND, validateRow } from "./contract.mjs";
import { makeRow } from "./row.mjs";
import { compareLedgers } from "./append-only.mjs";
import { fieldProvenance, PROVENANCE_FIELDS, PROVENANCE_STATE, provenanceCounts, rowProvenance, validateRecovered } from "./provenance.mjs";
import {
  attachRecovered, eplPlayerSnapshotEvidence, GIT_EVIDENCE_REL, GIT_EVIDENCE_SCHEMA, ligue1ArchiveEvidence, nflBoardEvidence, ufcSnapshotEvidence,
} from "./provenance-evidence.mjs";
import { mergeEvidence } from "../../../scripts/results/recover-forecast-provenance-git.mjs";

const ROOT = path.resolve(process.cwd(), "..");
const { RECEIPT, GIT_HISTORY, LEGACY_UNKNOWN } = PROVENANCE_STATE;
const withProv = (r, owner, recovered = {}) => ({ ...r, provenance: { owner, alsoPublishedOn: [], notes: [], recovered } });

const prop = (over = {}) => withProv(makeRow({
  sport: "NFL", competition: "NFL", season: "2031", eventId: "9001", eventStart: "2031-10-05T17:00Z", matchup: "A @ B",
  subjectType: "PLAYER", subjectId: "nfl-athlete-1", subjectDisplay: "P One", teamId: "B", family: "player_receptions",
  forecastKind: FORECAST_KIND.CONTINUOUS, modelStatusAtPublish: "PUBLISHED", publicationSurface: "nfl-player-board",
  receiptId: "9001:nfl-athlete-1:player_receptions#abc", publishedAt: "2031-10-05T15:00:00Z", projection: 4.6, rangeLow: 2.1,
  rangeHigh: 8.2, rangeCoverage: 0.8, recoverability: "EXACT_FROZEN", ...over,
}), "nfl-prop-settlement");
const board = (over = {}) => ({
  generatedAt: "2031-10-05T15:00:00Z",
  families: { player_receptions: { state: "PUBLISHED", model: "nfl-player-share-level-v1" }, anytime_td: { state: "PUBLISHED" } },
  players: [{ playerId: "nfl-athlete-1", markets: { player_receptions: { median: 4.6, p10: 2.1, p90: 8.2 }, anytime_td: { probability: 0.31 } } }],
  ...over,
});
const reader = (files) => (rel) => files[rel] ?? null;

// ── per-field and per-row state ──────────────────────────────────────────────────────────────────────────────────
test("a value the row carries is RECEIPT from its owner record; a git-read forecast's stamp is GIT_HISTORY; nothing → LEGACY_UNKNOWN", () => {
  const r = prop({ modelId: "m1" });
  assert.deepEqual(fieldProvenance(r, "modelId"), { state: RECEIPT, value: "m1", source: "data/internal/nfl/prop-settlement/" });
  assert.equal(rowProvenance(r).state, RECEIPT, "control: all three recorded");
  assert.equal(rowProvenance(prop()).state, LEGACY_UNKNOWN, "no model id → the row is LEGACY_UNKNOWN");
  assert.deepEqual(fieldProvenance(prop(), "modelId"), { state: LEGACY_UNKNOWN, value: null, source: null }, "unknown stays empty");
  const viaGit = { ...prop({ modelId: "m1", receiptId: "git:a717fdc3f986" }) };
  assert.equal(fieldProvenance(viaGit, "publishedAt").state, GIT_HISTORY);
  assert.match(fieldProvenance(viaGit, "publishedAt").source, /^git:a717fdc3f986 \(recorded by /);
  assert.equal(fieldProvenance(viaGit, "eventStart").state, RECEIPT, "the start is the owner's, not the revision's");
  assert.equal(rowProvenance(viaGit).state, GIT_HISTORY, "weakest field decides");
  const rec = withProv(prop(), "nfl-prop-settlement", { modelId: { value: "m2", state: RECEIPT, source: "app/x.json#families.player_receptions.model" } });
  assert.equal(fieldProvenance(rec, "modelId").value, "m2");
  assert.equal(rowProvenance(rec).state, RECEIPT);
  assert.deepEqual(provenanceCounts([r, prop(), viaGit, rec]), { RECEIPT: 2, GIT_HISTORY: 1, LEGACY_UNKNOWN: 1 });
});

test("recovered entries are typed: state, value, source; git evidence names its commit; a time is an instant", () => {
  assert.deepEqual(validateRecovered("modelId", { value: "m", state: RECEIPT, source: "a.json#model.id" }), [], "control");
  assert.ok(validateRecovered("modelId", { value: "m", state: LEGACY_UNKNOWN, source: "x" }).length, "LEGACY_UNKNOWN is never a recovered state");
  assert.ok(validateRecovered("modelId", { value: "", state: RECEIPT, source: "x" }).length, "empty value");
  assert.ok(validateRecovered("modelId", { value: "m", state: RECEIPT, source: "" }).length, "no source");
  assert.ok(validateRecovered("publishedAt", { value: "yesterday", state: RECEIPT, source: "x" }).length, "not an instant");
  assert.ok(validateRecovered("publishedAt", { value: "2031-01-01T00:00:00Z", state: GIT_HISTORY, source: "a.json" }).length, "git without a commit");
  assert.ok(validateRecovered("modelVersion", { value: "1", state: RECEIPT, source: "x" }).length, "not a provenance field");
  const row = withProv(prop({ modelId: "m1" }), "nfl-prop-settlement", { modelId: { value: "m2", state: RECEIPT, source: "x" } });
  assert.ok(validateRow(row).some((p) => /carries modelId itself/.test(p)), "a recovered value never shadows the row's own");
});

// ── RECEIPT matchers: exact or nothing ───────────────────────────────────────────────────────────────────────────
test("NFL board: a frozen prop row takes the model of the SAME board revision; any mismatch gives nothing", () => {
  const read = reader({ "app/public/data/nfl/player-board/9001.json": board() });
  assert.deepEqual(nflBoardEvidence(prop(), read), { modelId: { value: "nfl-player-share-level-v1", state: RECEIPT, source: "app/public/data/nfl/player-board/9001.json#families.player_receptions.model" } });
  assert.deepEqual(nflBoardEvidence(prop({ projection: 4.7 }), read), {}, "different median → not this revision");
  assert.deepEqual(nflBoardEvidence(prop({ publishedAt: "2031-10-05T15:30:00Z" }), read), {}, "different generatedAt → not this revision");
  const td = prop({ family: "anytime_td", forecastKind: FORECAST_KIND.BINARY, projection: null, rangeLow: null, rangeHigh: null, rangeCoverage: null, probability: 0.31, probabilityType: "MODEL" });
  assert.deepEqual(nflBoardEvidence(td, read), {}, "the board names no model for this family → nothing, never another family's model");
});

test("NFL board: a Weeks 1–2 reconciliation row gets the board's stamp only if the board predates kickoff and rounds to the printed values", () => {
  const read = reader({ "app/public/data/nfl/player-board/9001.json": board() });
  const recon = withProv(prop({ publishedAt: null, projection: 4.6, rangeLow: 2.1, rangeHigh: 8.2 }), "nfl-week-reconciliation");
  const e = nflBoardEvidence(recon, read);
  assert.equal(e.publishedAt.value, "2031-10-05T15:00:00Z");
  assert.equal(e.publishedAt.state, RECEIPT);
  assert.equal(e.modelId.value, "nfl-player-share-level-v1");
  assert.deepEqual(nflBoardEvidence({ ...recon, rangeHigh: 8 }, read), {}, "printed range differs → not this board");
  assert.deepEqual(nflBoardEvidence({ ...recon, modelStatusAtPublish: "ESTIMATE" }, read), {}, "family state differs → not this board");
  const late = reader({ "app/public/data/nfl/player-board/9001.json": board({ generatedAt: "2031-10-05T17:00:00Z" }) });
  assert.deepEqual(nflBoardEvidence(recon, late), {}, "a board stamped at kickoff is not the pre-kickoff board");
});

test("EPL players: the snapshot's goal model identifies anytime-goalscorer rows only; shots on goal stay unknown", () => {
  const snap = { generatedAt: "2031-08-21T18:18:24Z", model: { id: "epl-player-v2-shrunk-rate" }, fixtures: [{ kickoffUtc: "2031-08-21T19:00:00Z", players: [{ playerId: "7", probability: 0.2884, shotsOnGoalOver05: 0.61 }] }] };
  const read = reader({ "app/public/data/soccer/epl/player-projections/snapshot-203108211818.json": snap });
  const row = { sport: "EPL", family: "epl_anytime_goalscorer", modelId: null, receiptId: "snapshot-203108211818.json", publishedAt: "2031-08-21T18:18:24.000Z", eventStart: "2031-08-21T19:00:00Z", subjectId: "epl-athlete-7", probability: 0.2884 };
  assert.equal(eplPlayerSnapshotEvidence(row, read).modelId.value, "epl-player-v2-shrunk-rate");
  assert.deepEqual(eplPlayerSnapshotEvidence({ ...row, probability: 0.29 }, read), {}, "value mismatch");
  assert.deepEqual(eplPlayerSnapshotEvidence({ ...row, family: "epl_shots_on_goal_over_0_5", probability: 0.61 }, read), {}, "the snapshot does not identify the shots model");
});

test("Ligue 1 archive and UFC snapshot: same event, same stamp, same numbers — else nothing", () => {
  const l1 = { rows: [{ eventId: "soccer:ligue-1:1", forecastAt: "2031-09-11T18:00:25Z", probs: { home: 0.5, draw: 0.3, away: 0.2 }, modelId: "epl-model-v1-split-poisson" }] };
  const read = reader({ "app/public/data/soccer/ligue-1/forecasts/2031-09-11.json": l1 });
  const list = () => ["2031-09-11.json"];
  const row = { sport: "LIGUE_1", eventId: "soccer:ligue-1:1", modelId: null, publishedAt: "2031-09-11T18:00:25Z", classProbabilities: { home: 0.5, draw: 0.3, away: 0.2 } };
  assert.equal(ligue1ArchiveEvidence(row, read, list).modelId.value, "epl-model-v1-split-poisson");
  assert.deepEqual(ligue1ArchiveEvidence({ ...row, classProbabilities: { home: 0.5, draw: 0.2, away: 0.3 } }, read, list), {}, "different vector");
  const snap = { capturedAt: "2031-08-22T17:27:00Z", event: { startUtc: "2031-08-22T21:00Z" }, rows: [{ providerBoutId: "44", modelProbability: 0.61 }] };
  const ur = reader({ "data/internal/research/ufc/model-vs-market/snapshot-203108221727.json": snap });
  const bout = { sport: "UFC", eventId: "44", eventStart: null, receiptId: "snapshot-203108221727.json", publishedAt: "2031-08-22T17:27:00Z", probability: 0.61 };
  assert.deepEqual(ufcSnapshotEvidence(bout, ur), { eventStart: { value: "2031-08-22T21:00Z", state: RECEIPT, source: "data/internal/research/ufc/model-vs-market/snapshot-203108221727.json#event.startUtc" } });
  assert.deepEqual(ufcSnapshotEvidence({ ...bout, probability: 0.6 }, ur), {}, "different bout probability");
  assert.deepEqual(ufcSnapshotEvidence({ ...bout, publishedAt: "2031-08-22T18:00:00Z" }, ur), {}, "a different capture");
});

// ── attaching: frozen once recorded, never leaking ───────────────────────────────────────────────────────────────
test("attach: committed evidence is kept over a recomputation; a publication stamp at/after the start is refused", () => {
  const read = reader({ "app/public/data/nfl/player-board/9001.json": board() });
  const fresh = attachRecovered([prop()], { read });
  assert.equal(fresh.rows[0].provenance.recovered.modelId.value, "nfl-player-share-level-v1", "control: matched");
  const kept = { modelId: { value: "nfl-player-share-level-v0", state: RECEIPT, source: "app/public/data/nfl/player-board/9001.json#families.player_receptions.model" } };
  const out = attachRecovered([prop()], { read, prior: new Map([[prop().forecastId, kept]]) });
  assert.deepEqual(out.rows[0].provenance.recovered.modelId, kept.modelId, "a later rewrite of the board never changes an attested value");
  assert.equal(out.report.conflicts.length, 1, "…and the disagreement is reported");
  const homer = withProv(prop({ publishedAt: null, eventStart: null }), "mlb-homer-nukes-settled");
  const git = new Map([[homer.forecastId, {
    eventStart: { value: "2031-09-08T22:40:00Z", state: GIT_HISTORY, source: "git:67ba8acfca77:f.json#gameDate" },
    publishedAt: { value: "2031-09-08T23:00:00Z", state: GIT_HISTORY, source: "git:67ba8acfca77:f.json#generatedAt", committedAt: "2031-09-08T23:01:00Z" },
  }]]);
  const leak = attachRecovered([homer], { git });
  assert.equal(leak.rows[0].provenance.recovered.publishedAt, undefined, "published after the start → no publication evidence");
  assert.equal(leak.rows[0].provenance.recovered.eventStart.value, "2031-09-08T22:40:00Z");
  assert.equal(rowProvenance(leak.rows[0]).state, LEGACY_UNKNOWN);
  assert.match(leak.report.refused.join(" "), /not before the start/);
  const bad = attachRecovered([homer], { git: new Map([[homer.forecastId, { modelId: { value: "m", state: GIT_HISTORY, source: "f.json" } }]]) });
  assert.deepEqual(bad.rows[0].provenance.recovered, {}, "malformed evidence is refused, not attached");
});

test("append-only: recovered evidence may be added, never changed or removed (control: identical passes)", () => {
  const e = { modelId: { value: "m", state: RECEIPT, source: "a.json#model.id" } };
  const a = withProv(prop(), "nfl-prop-settlement", e);
  assert.deepEqual(compareLedgers([a], [a]), [], "control");
  assert.deepEqual(compareLedgers([prop()], [a]), [], "gaining evidence is allowed");
  const kinds = (next) => compareLedgers([a], [next]).map((v) => v.kind);
  assert.deepEqual(kinds(withProv(prop(), "nfl-prop-settlement", {})), ["RECOVERED_EVIDENCE_CHANGED"], "evidence removed");
  assert.deepEqual(kinds(withProv(prop(), "nfl-prop-settlement", { modelId: { ...e.modelId, value: "m2" } })), ["RECOVERED_EVIDENCE_CHANGED"], "evidence rewritten");
  assert.deepEqual(kinds(withProv(prop(), "nfl-prop-settlement", { modelId: { ...e.modelId, state: GIT_HISTORY } })), ["RECOVERED_EVIDENCE_CHANGED"], "state rewritten");
  const { merged, conflicts } = mergeEvidence({ x: e }, { x: { modelId: { ...e.modelId, value: "m2" } }, y: e });
  assert.deepEqual(merged.x, e, "the git-evidence file keeps a committed entry");
  assert.deepEqual(conflicts, ["x modelId"]);
  assert.deepEqual(merged.y, e, "and gains new ones");
});

// ── the committed ledger and git evidence ───────────────────────────────────────────────────────────────────────
function committedLedger() {
  const dir = path.join(ROOT, "data/internal/forecast-ledger/v1");
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
  const rows = [];
  for (const s of Object.values(manifest.sports)) for (const l of fs.readFileSync(path.join(dir, s.file), "utf8").split("\n")) if (l.trim()) rows.push(JSON.parse(l));
  return { rows, manifest };
}

test("committed ledger: every row has a provenance state, every recovered value is well-formed, and none leaks", () => {
  const { rows, manifest } = committedLedger();
  for (const [sport, m] of Object.entries(manifest.sports)) {
    assert.deepEqual(m.provenance, provenanceCounts(rows.filter((r) => r.sport === sport)), `${sport}: manifest provenance counts are the rows'`);
  }
  for (const r of rows) {
    const pv = rowProvenance(r);
    assert.ok(Object.values(PROVENANCE_STATE).includes(pv.state), r.forecastId);
    for (const [f, e] of Object.entries(r.provenance?.recovered ?? {})) {
      assert.equal(r[f], null, `${r.forecastId}: ${f} recovered only where the row lacks it`);
      assert.deepEqual(validateRecovered(f, e), [], `${r.forecastId} ${f}`);
    }
    for (const f of PROVENANCE_FIELDS) if (pv.fields[f].state === LEGACY_UNKNOWN) assert.equal(pv.fields[f].value, null, "unknown is empty");
    const pub = pv.fields.publishedAt.value;
    const start = pv.fields.eventStart.value;
    if (pub && start) assert.ok(Date.parse(pub) < Date.parse(start), `${r.forecastId}: published ${pub} at/after start ${start}`);
  }
});

test("committed git evidence: schema, a commit-named source per value, and only for rows that lack the field", () => {
  const p = path.join(ROOT, GIT_EVIDENCE_REL);
  assert.ok(fs.existsSync(p), "git-history evidence is committed");
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(doc.schemaVersion, GIT_EVIDENCE_SCHEMA);
  const byId = new Map(committedLedger().rows.map((r) => [r.forecastId, r]));
  const ids = Object.keys(doc.entries);
  assert.deepEqual(ids, [...ids].sort(), "entries sorted by forecastId (deterministic)");
  assert.equal(doc.counts.rows, ids.length);
  for (const [id, e] of Object.entries(doc.entries)) {
    const r = byId.get(id);
    assert.ok(r, `${id} is a ledger row`);
    for (const [f, v] of Object.entries(e)) {
      assert.equal(v.state, GIT_HISTORY);
      assert.match(v.source, /^git:[0-9a-f]{12}:app\/public\/data\/[^#]+\.json#/, `${id} ${f}`);
      assert.equal(r[f], null, `${id}: ${f} recovered only where the row lacks it`);
      assert.deepEqual(r.provenance.recovered[f], v, `${id}: the ledger carries the committed evidence verbatim`);
    }
  }
});
