/**
 * NFL Top Boards under eligibility@1 + provenance (row G, PD 2026-11-11). A committed per-game board (WSH @ NYG,
 * 401873052) with injected rows: the Achane IR record (resolved from the committed incident slices), a listed-
 * questionable star, an UNKNOWN row. Plus the frozen daily Top-5 and the provenance chain.
 * Run (from app/): npx tsx --test src/lib/sports/nfl/top-boards-eligibility.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildTopBoards, unfeaturedSummary } from "./top-boards.mjs";
import { UNFEATURED_LABEL, exclusionCounts, rankFamily } from "./board-ranking.mjs";
import { boardProvenance, provenanceUnavailable, sha256 } from "./board-provenance.mjs";
import { eligibilityRecord, resolveEligibility } from "../../availability/eligibility.mjs";
import { recoverFromHistory } from "../injuries/carry-forward.mjs";
import { freezeDay } from "../../../../scripts/results/freeze-daily-top-boards.mjs";

const APP = process.cwd();
const FX = JSON.parse(fs.readFileSync(path.join(APP, "src/lib/availability/__fixtures__/incidents-2026-11.json"), "utf8"));
const A = FX.achane;
const history = recoverFromHistory({ nowIso: A.injuriesAtPublish.generatedAt, captures: [A.lastCaptureListingHim, A.injuriesAtPublish], roster: A.rosterAtPublish });
const ACHANE_REC = eligibilityRecord(resolveEligibility({ sport: "nfl", playerId: "4429160", teamId: "15", asOf: A.publishedAt, injuries: { generatedAt: A.injuriesAtPublish.generatedAt, entries: history.entries }, roster: A.rosterAtPublish }));
const NOW = "2026-11-11T02:00:00Z";
const BOARD_FILE = path.join(APP, "public/data/nfl/player-board/401873052.json");
const base = JSON.parse(fs.readFileSync(BOARD_FILE, "utf8"));
const star = (id, name, team, eligibility, extra = {}) => ({
  playerId: id, name, team, participation: "AVAILABLE_ROLE_UNCERTAIN", eligibility,
  markets: { player_receptions: { mean: 11.2, p10: 7, median: 11, p90: 15, pricingState: "NOT_PROBED" }, player_reception_yds: { mean: 150, p10: 90, median: 148, p90: 210, pricingState: "NOT_PROBED" }, anytime_td: { probability: 0.97, pricingState: "NOT_PROBED" } },
  ...extra,
});
const ok = { state: "ELIGIBLE", reasons: [], contractVersion: "eligibility@1" };
const board = {
  ...base,
  players: [
    ...base.players,
    star("nfl-athlete-4429160", "De'Von Achane", "WSH", ACHANE_REC),
    star("nfl-athlete-9000001", "Questionable Star", "NYG", { ...ok, flags: ["QUESTIONABLE"] }, { participation: "QUESTIONABLE" }),
    star("nfl-athlete-9000002", "Unverified Star", "NYG", { state: "UNKNOWN", reasons: ["ROSTER_STALE"], contractVersion: "eligibility@1" }),
  ],
};
const slotFor = () => ({ pricingState: "NOT_PROBED" });
const top = () => buildTopBoards({ weekBoards: [board], now: NOW, slotFor });
const boardOf = (t, family) => t.weekly.boards.find((b) => b.family === family);

test("Achane (IR carried off the feed) resolves INELIGIBLE and is on no board: not ranked, not un-featured, counted by reason only", () => {
  assert.equal(ACHANE_REC.state, "INELIGIBLE");
  const t = top();
  for (const b of t.weekly.boards.filter((x) => x.rows)) {
    assert.ok(!b.rows.some((r) => r.playerId === "nfl-athlete-4429160"), `${b.id}: not ranked`);
    assert.ok(!b.unfeatured.some((r) => r.playerId === "nfl-athlete-4429160"), `${b.id}: not shown un-featured`);
  }
  const rec = boardOf(t, "player_receptions");
  assert.ok(rec.availabilityExcludedByReason.ELIGIBILITY_INELIGIBLE >= 1);
  assert.ok(rec.availabilityExcludedByReason.ELIGIBILITY_UNKNOWN >= 1, "UNKNOWN is excluded too");
  assert.doesNotMatch(JSON.stringify(rec.availabilityExcludedByReason), /Achane|nfl-athlete/, "the public exclusion record carries no names or ids");
});

test("listed questionable (R6): never ranked, never top-3; shown un-featured with the label where he would have placed", () => {
  const t = top();
  for (const fam of ["player_receptions", "player_reception_yds", "anytime_td"]) {
    const b = boardOf(t, fam);
    assert.ok(!b.rows.some((r) => r.playerId === "nfl-athlete-9000001"), `${fam}: not ranked`);
    assert.ok(!b.rows.slice(0, 3).some((r) => r.playerId === "nfl-athlete-9000001"), `${fam}: not top-3`);
    assert.deepEqual(b.unfeatured.map((u) => [u.playerId, u.label]), [["nfl-athlete-9000001", UNFEATURED_LABEL]], `${fam}: un-featured, labelled`);
    assert.ok(!b.unfeatured.some((u) => u.playerId === "nfl-athlete-9000002"), "an UNKNOWN player is not shown at all");
  }
  assert.deepEqual(unfeaturedSummary(t.weekly).map((u) => [u.name, u.boards]), [["Questionable Star", ["Receiving yards", "Receptions", "Anytime touchdown"]]]);
  // a questionable player whose projection would NOT have placed is not listed
  const low = { ...board, players: board.players.map((p) => (p.playerId === "nfl-athlete-9000001" ? { ...p, markets: { player_receptions: { mean: 0.2, median: 0, p10: 0, p90: 1, pricingState: "NOT_PROBED" } } } : p)) };
  assert.equal(boardOf(buildTopBoards({ weekBoards: [low], now: NOW, slotFor }), "player_receptions").unfeatured.length, 0);
});

test("exclusion counts: reasons only; serialized blocked lists stay small (the board objects are not enumerable)", () => {
  const blocked = [];
  rankFamily([board], "player_receptions", "median", { asOf: NOW, blocked });
  assert.ok(blocked.length >= 3);
  assert.ok(JSON.stringify(blocked).length < 300 * blocked.length, "no board serialized inside a blocked entry");
  assert.deepEqual(Object.keys(exclusionCounts(blocked)), ["total", "byReason"]);
});

test("provenance: the official snapshot id + board sha per event, one chain hash; deterministic; any change moves it", () => {
  const bytes = fs.readFileSync(BOARD_FILE);
  const ev = [{ eventId: "401873052", official: { snapshotId: "snap-a", basis: "LIVE", forecastGeneratedAt: "2026-11-11T01:02:01Z" }, boardSha256: sha256(bytes), boardGeneratedAt: base.generatedAt }];
  const p = boardProvenance(ev);
  assert.equal(p.complete, true);
  assert.match(p.chainHash, /^[0-9a-f]{64}$/);
  assert.deepEqual(boardProvenance(ev), p);
  assert.notEqual(boardProvenance([{ ...ev[0], official: { ...ev[0].official, snapshotId: "snap-b" } }]).chainHash, p.chainHash, "another official snapshot ⇒ another chain");
  assert.notEqual(boardProvenance([{ ...ev[0], boardSha256: sha256(Buffer.concat([bytes, Buffer.from(" ")])) }]).chainHash, p.chainHash, "one changed board byte ⇒ another chain");
  const missing = boardProvenance([{ ...ev[0], official: { snapshotId: null, refusal: "NO_OFFICIAL_RECORD" } }]);
  assert.deepEqual([missing.complete, missing.events[0].refusal], [false, "NO_OFFICIAL_RECORD"]);
  assert.deepEqual(provenanceUnavailable("x"), { schema: p.schema, complete: false, chainHash: null, state: "UNAVAILABLE", reason: "x" });
  assert.deepEqual(buildTopBoards({ weekBoards: [board], now: NOW, slotFor, provenance: p }).provenance, p, "the top boards carry it");
});

test("frozen daily Top-5: same inputs ⇒ byte-identical document; carries provenance, counts and un-featured rows", () => {
  const prov = boardProvenance([{ eventId: "401873052", official: { snapshotId: "snap-a" }, boardSha256: "b".repeat(64) }]);
  const a = JSON.stringify(freezeDay("2026-11-12", [board], NOW, undefined, { provenance: prov }), null, 2);
  const b = JSON.stringify(freezeDay("2026-11-12", [board], NOW, undefined, { provenance: prov }), null, 2);
  assert.equal(a, b);
  const doc = JSON.parse(a);
  assert.deepEqual(doc.provenance, prov);
  const rec = doc.boards.find((x) => x.propFamily === "player_receptions");
  assert.ok(!rec.rows.some((r) => ["nfl-athlete-4429160", "nfl-athlete-9000001", "nfl-athlete-9000002"].includes(r.playerId)));
  assert.deepEqual(rec.unfeatured.map((u) => u.playerId), ["nfl-athlete-9000001"]);
  assert.doesNotMatch(JSON.stringify(rec.excludedForAvailability), /nfl-athlete|Achane/);
  // write-once: the producer never rewrites an existing day (flag wx + the existence check), and every frozen day on file
  // predates this change (no provenance key) — they stay byte-identical
  const src = fs.readFileSync(path.join(APP, "scripts/results/freeze-daily-top-boards.mjs"), "utf8");
  assert.match(src, /if \(fs\.existsSync\(file\)\) \{ console\.log\(`\$\{day\}: already frozen — write-once, left untouched`\); continue; \}/);
  assert.match(src, /flag: "wx"/);
  for (const f of fs.readdirSync(path.join(APP, "public/data/results/top-boards"))) assert.ok(!("provenance" in JSON.parse(fs.readFileSync(path.join(APP, "public/data/results/top-boards", f), "utf8"))), `${f}: an earlier frozen day is untouched`);
});
