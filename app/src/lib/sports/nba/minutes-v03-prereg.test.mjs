/**
 * NBA minutes v0.3 vs v0.1 · the preregistered protocol and its scorer (docs/NBA_MINUTES_V03_PROTOCOL.md). NOT ARMED.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { APPROVED_PROTOCOL_SHA256, PROTOCOL_APPROVED_AT, PROTOCOL_DRAFT_SHA256, PROTOCOL_REL, VERDICTS, confirmatoryGame, gameRows, scoreProtocol, MIN_GAMES, MIN_PLAYER_GAMES } from "./minutes-v03-prereg.mjs";

const REPO = path.resolve(process.cwd(), "..");

test("the protocol file's bytes are pinned; the protocol is NOT approved and the scorer refuses", () => {
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO, PROTOCOL_REL))).digest("hex"), PROTOCOL_DRAFT_SHA256, "an edit is a new registration");
  assert.equal(APPROVED_PROTOCOL_SHA256, null);
  assert.equal(PROTOCOL_APPROVED_AT, null);
  let code = 0;
  try { execFileSync("node", [path.join(process.cwd(), "scripts/nba/research/score-nba-minutes-v03-prereg.mjs")], { stdio: "pipe" }); } catch (e) { code = e.status; }
  assert.equal(code, 3, "NOT_APPROVED: nothing is scored");
  assert.ok(!fs.existsSync(path.join(REPO, "data/internal/research/nba/minutes-prereg/look.json")), "no look exists");
  const wf = fs.readdirSync(path.join(REPO, ".github/workflows")).filter((f) => fs.readFileSync(path.join(REPO, ".github/workflows", f), "utf8").includes("score-nba-minutes-v03-prereg"));
  assert.deepEqual(wf, [], "no workflow runs the scorer before approval (arming is a separate reviewed change)");
});

const game = (asOf, over = {}) => ({ providerEventId: "1", dateUtc: "2026-12-01T00:30:00Z", label: "NBA REGULAR SEASON — SHADOW", home: { providerTeamId: "10" }, away: { providerTeamId: "20" }, forecast: { inputAsOf: asOf, players: { home: [{ providerAthleteId: "a", expectedMinutes: 30, availability: "unknown" }, { providerAthleteId: "b", expectedMinutes: 22, availability: "unknown" }], away: [] } }, ...over });
const box = { status: "STATUS_FINAL", boxscoreAvailable: true, players: [{ providerAthleteId: "a", providerTeamId: "10", minutes: 34 }, { providerAthleteId: "b", providerTeamId: "10", minutes: 20 }, { providerAthleteId: "c", providerTeamId: "10", didNotPlay: true }] };
const APPROVED = "2026-11-20T00:00:00Z";

test("confirmatory: both families frozen strictly after approval, aligned, pre-tip, final — every other game refused with its reason", () => {
  assert.deepEqual(confirmatoryGame(game("2026-11-30T20:00:00Z"), game("2026-11-30T20:00:00Z"), box, APPROVED), { ok: true, reason: null });
  assert.equal(confirmatoryGame(game("2026-11-30T20:00:00Z"), game("2026-11-30T20:00:00Z"), box, null).reason, "NOT_APPROVED");
  assert.equal(confirmatoryGame(game("2026-11-19T20:00:00Z"), game("2026-11-19T20:00:00Z"), box, APPROVED).reason, "v0.1_FROZEN_BEFORE_APPROVAL", "the 146 exploratory games, and every pre-approval game, never count");
  assert.equal(confirmatoryGame(game("2026-12-01T01:00:00Z"), game("2026-12-01T01:00:00Z"), box, APPROVED).reason, "v0.1_NOT_PRE_TIP");
  assert.equal(confirmatoryGame(game("2026-11-30T20:00:00Z"), game("2026-11-30T21:00:00Z"), box, APPROVED).reason, "NOT_ALIGNED");
  assert.equal(confirmatoryGame(game("2026-11-30T20:00:00Z"), game("2026-11-30T20:00:00Z"), { ...box, status: "STATUS_IN_PROGRESS" }, APPROVED).reason, "PENDING_FINAL");
  assert.equal(confirmatoryGame(game("2026-11-30T20:00:00Z"), null, box, APPROVED).reason, "MISSING_FAMILY");
});

test("unit: played players only (a DNP is outside it); a one-model projection is a coverage miss, not a paired row", () => {
  const g3 = game("x", { forecast: { inputAsOf: "x", players: { home: [{ providerAthleteId: "a", expectedMinutes: 33, availability: "unknown" }], away: [] } } });
  const rows = gameRows(game("x"), g3, box);
  assert.deepEqual(rows.map((r) => [r.id, r.actual, r.v01, r.v03]), [["a", 34, 30, 33], ["b", 20, 22, null]]);
});

test("verdicts: INSUFFICIENT_N below either minimum; PROMOTE_CANDIDATE needs CI < 0, MAE ≤ 6.0 and no harm; harm or worse → REJECT", () => {
  const mk = (nGames, f) => Array.from({ length: nGames }, (_, g) => Array.from({ length: 6 }, (_, i) => ({ game: String(g), id: `${g}-${i}`, tags: [i < 2 ? "star" : "bench"], ...f(g, i) }))).flat();
  const better = mk(MIN_GAMES, (g, i) => ({ actual: 30, v01: 30 + 6 + (i % 2), v03: 30 + 2 + ((g + i) % 3) }));
  assert.ok(better.length >= MIN_PLAYER_GAMES);
  assert.equal(scoreProtocol(better, { subgroups: ["star", "bench"] }).verdict, VERDICTS.PROMOTE_CANDIDATE);
  assert.equal(scoreProtocol(better.slice(0, 600), { subgroups: ["star", "bench"] }).verdict, VERDICTS.INSUFFICIENT_N);
  const worse = better.map((r) => ({ ...r, v01: r.v03, v03: r.v01 }));
  assert.equal(scoreProtocol(worse, { subgroups: ["star", "bench"] }).verdict, VERDICTS.REJECT);
  const harmStars = better.map((r) => (r.tags[0] === "star" ? { ...r, v03: r.actual + 12 + (Number(r.game) % 3) } : r));
  const h = scoreProtocol(harmStars, { subgroups: ["star", "bench"] });
  assert.deepEqual(h.noHarm.slicesSignificantlyWorse, ["star"]);
  assert.equal(h.verdict, VERDICTS.REJECT, "a subgroup significantly worse vetoes promotion");
  const highMae = better.map((r) => ({ ...r, v01: r.actual + 14 + (Number(r.game) % 2), v03: r.actual + 7 + (Number(r.game) % 3) }));
  assert.equal(scoreProtocol(highMae, { subgroups: [] }).verdict, VERDICTS.INCONCLUSIVE, "better but above the 6.0 minutes bar is not a promotion candidate");
});
