/**
 * TEAM, CLUB AND FIGHTER HISTORY OVER GAME-LEVEL ROWS (2026-10-05 audit, A1) — the join that makes it possible
 * (lib/ask/forecast-participants.mjs) and the evidence it feeds.
 *
 * The join is checked against the repository's own independent ids for the same game, not against a remembered
 * fact: MLB StatsAPI's away/home ids by gamePk, and the ledger's own NFL team-score rows for the same event.
 *
 * Run: cd app && npx tsx --test src/lib/ask/ask-forecast-participants.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { makeParticipantJoiner, readableCall } from "./forecast-participants.mjs";
import { getForecastHistory } from "./tools/forecast-record.mjs";
import { buildEvidence } from "./evidence.mjs";
import { verifyAnswer } from "./verifier.mjs";
import { ASK_FORECAST_KINDS, ASK_FORECAST_ROW, ASK_STATUS, askAssetPath } from "./contract.mjs";

const REPO = path.resolve(process.cwd(), "..");
const readJsonl = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

/* ═══════════════════════════  the joiner, on fixtures  ═══════════════════════════ */

const ENTS = [
  { id: "mlb-team-136", kind: "team", sport: "MLB", label: "Seattle Mariners", hint: "SEA" },
  { id: "mlb-team-140", kind: "team", sport: "MLB", label: "Texas Rangers", hint: "TEX" },
  { id: "mlb-team-1", kind: "team", sport: "MLB", label: "Dupe One", hint: "DUP" },
  { id: "mlb-team-2", kind: "team", sport: "MLB", label: "Dupe Two", hint: "DUP" },
  { id: "epl-team-359", kind: "team", sport: "EPL", label: "Arsenal" },
  { id: "epl-team-331", kind: "team", sport: "EPL", label: "Brighton & Hove Albion" },
  { id: "ufc-athlete-1", kind: "player", sport: "UFC", label: "Jacobe Smith" },
  { id: "mlb-player-9", kind: "player", sport: "MLB", label: "Texas Rangers", hint: "TEX" },
];
const join = makeParticipantJoiner(ENTS);

test("MLB / NFL sides join by abbreviation, in matchup order", () => {
  assert.deepEqual(join({ sport: "MLB", subjectType: "GAME", matchup: "TEX @ SEA" }), [["mlb-team-140", "Texas Rangers"], ["mlb-team-136", "Seattle Mariners"]]);
});

test("EPL clubs and UFC fighters join by exact name; a fighter with no entity is left out, not guessed", () => {
  assert.deepEqual(join({ sport: "EPL", subjectType: "GAME", matchup: "Brighton & Hove Albion v Arsenal" }), [["epl-team-331", "Brighton & Hove Albion"], ["epl-team-359", "Arsenal"]]);
  assert.deepEqual(join({ sport: "UFC", subjectType: "BOUT", matchup: "Jacobe Smith vs Bruce Whitehead" }), [["ufc-athlete-1", "Jacobe Smith"]]);
  assert.equal(join({ sport: "UFC", subjectType: "BOUT", matchup: "Jacob Smith vs Bruce Whitehead" }), null, "a near name is not a match");
});

test("FAIL CLOSED: a shared key, a self-match, a non-game row or an unknown shape joins nothing", () => {
  assert.deepEqual(join({ sport: "MLB", subjectType: "GAME", matchup: "DUP @ SEA" }), [["mlb-team-136", "Seattle Mariners"]], "the ambiguous side is dropped");
  assert.equal(join({ sport: "MLB", subjectType: "GAME", matchup: "SEA @ SEA" }), null);
  assert.equal(join({ sport: "MLB", subjectType: "PLAYER", matchup: "TEX @ SEA" }), null, "a player row's subject is the player");
  assert.equal(join({ sport: "MLB", subjectType: "GAME", matchup: "Texas at Seattle" }), null);
  assert.equal(join({ sport: "LIGUE_1", subjectType: "GAME", matchup: "Nice v Lille" }), null, "no Ask entities for Ligue 1 clubs");
});

/* ═══════════════════════════  the joiner, on the repository's own data  ═══════════════════════════ */

const entities = JSON.parse(fs.readFileSync(path.join(REPO, "data/ask-projection/v1/entities.json"), "utf8")).entries;
const realJoin = makeParticipantJoiner(entities);
const gameRows = (sport) => readJsonl(`data/internal/forecast-ledger/v1/${sport}.jsonl`).filter((r) => r.subjectType === "GAME" || r.subjectType === "BOUT");

test("MLB: every joined game agrees with StatsAPI's away/home team ids for the same gamePk", () => {
  const dir = path.join(REPO, "app/public/data/mlb/statsapi-schedule");
  const sched = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) for (const g of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).games ?? []) sched.set(String(g.gamePk), g);
  let checked = 0;
  const bad = [];
  for (const r of gameRows("mlb")) {
    const g = sched.get(String(r.eventId));
    const p = realJoin(r);
    if (!g || !p) continue;
    checked += 1;
    if (p.length !== 2 || p[0][0] !== `mlb-team-${g.away.id}` || p[1][0] !== `mlb-team-${g.home.id}`) bad.push(`${r.eventId} ${r.matchup}`);
  }
  assert.ok(checked >= 100, `positive control: enough games overlap to mean something (${checked})`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${checked} disagree`);
});

test("NFL: every joined game agrees with the ledger's own team-score rows for the same event", () => {
  const rows = readJsonl("data/internal/forecast-ledger/v1/nfl.jsonl");
  const teams = new Map();
  for (const r of rows.filter((x) => x.subjectType === "TEAM")) teams.set(r.eventId, (teams.get(r.eventId) ?? new Set()).add(r.subjectId));
  let checked = 0;
  const bad = [];
  for (const r of rows.filter((x) => x.subjectType === "GAME")) {
    const t = teams.get(r.eventId);
    const p = realJoin(r);
    if (!t || !p) continue;
    checked += 1;
    if (!(p.length === 2 && t.size === 2 && p.every(([id]) => t.has(id)))) bad.push(`${r.eventId} ${r.matchup}`);
  }
  assert.ok(checked >= 50, `positive control (${checked})`);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} of ${checked} disagree`);
});

test("coverage: MLB, NFL and EPL game rows join on both sides", () => {
  for (const sport of ["mlb", "nfl", "epl"]) {
    const rows = gameRows(sport);
    const both = rows.filter((r) => realJoin(r)?.length === 2).length;
    assert.ok(rows.length > 0 && both / rows.length >= 0.99, `${sport}: ${both} of ${rows.length} joined both sides`);
  }
});

/* ═══════════════════════════  the history a team now gets  ═══════════════════════════ */

const K = (k) => ASK_FORECAST_KINDS.indexOf(k);
const row = (o) => ASK_FORECAST_ROW.map((c) => o[c] ?? null);
const INDEX = {
  schemaVersion: 1, artifact: "ask-forecast-record", available: true, asOf: "2026-10-05T10:00:00Z",
  families: [
    { sport: "MLB", family: "mlb_moneyline", label: "Moneyline", kind: "BINARY_PROBABILITY", pickRecord: { win: 1, loss: 1, push: 0, basis: ["PUBLISHED_PICK"] }, href: "/results/forecasts/mlb/moneyline/" },
    { sport: "MLB", family: "mlb_total", label: "Game total", kind: "BINARY_PROBABILITY", pickRecord: { win: 1, loss: 0, push: 0, basis: ["PUBLISHED_PICK"] }, href: "/results/forecasts/mlb/total/" },
  ],
  gaps: [],
};
const SEA_TEX = [["mlb-team-140", "Texas Rangers"], ["mlb-team-136", "Seattle Mariners"]];
const SHARD = {
  schemaVersion: 1, artifact: "ask-forecast-rows", sport: "mlb", columns: [...ASK_FORECAST_ROW], kinds: [...ASK_FORECAST_KINDS],
  dict: { families: [["MLB", "mlb_moneyline"], ["MLB", "mlb_total"]], subjects: [["mlb-823092", "TEX @ SEA", null, SEA_TEX]], matchups: ["TEX @ SEA"] },
  rows: [
    row({ family: 0, date: "2026-09-09", subject: 0, matchup: 0, kind: K("BINARY_PROBABILITY"), probability: 0.585, state: "SETTLED", finalValue: 0, finalCategory: "LOSS", observed: 0, brier: 0.342, directional: "LOSS", call: "SEA (home)" }),
    row({ family: 1, date: "2026-09-09", subject: 0, matchup: 0, kind: K("BINARY_PROBABILITY"), probability: 0.484, state: "SETTLED", finalValue: 1, finalCategory: "WIN", observed: 1, brier: 0.266, directional: "WIN", call: "UNDER 9" }),
  ],
};
const ctx = () => ({ turn: { load: async (p) => (p === askAssetPath.forecastRecord() ? { ok: true, json: INDEX } : p === askAssetPath.forecastRows("mlb") ? { ok: true, json: SHARD } : { ok: false }) } });
const evidenceOf = (env) => buildEvidence([{ tool: "getForecastHistory", status: env.status, error: env.error, detail: env.detail, links: env.links, data: env }]);

test("an MLB team's history lists its games, with the side each probability is for, as the Results page pairs them", async () => {
  const env = await getForecastHistory({ sport: "MLB", teamId: "mlb-team-140" }, ctx());
  assert.equal(env.status, ASK_STATUS.OK);
  assert.equal(env.subject, "Texas Rangers");
  const t = evidenceOf(env).facts.map((f) => f.text).join(" | ");
  assert.match(t, /GameTime published 2 MLB forecasts matching this request for Texas Rangers/);
  assert.match(t, /TEX @ SEA Moneyline: GameTime's probability for SEA \(home\) was 58\.5%; it did not happen/);
  assert.match(t, /TEX @ SEA Game total: GameTime's probability for UNDER 9 was 48\.4%; it happened/);
});

test("a natural answer from that evidence verifies, and an invented record is still refused", async () => {
  const ev = evidenceOf(await getForecastHistory({ sport: "MLB", teamId: "mlb-team-136" }, ctx()));
  const draft = "GameTime has two forecasts on record for the Seattle Mariners, both from Sept. 9 against Texas:\n\n" +
    "- **Moneyline** — 58.5% for SEA (home). It did not happen.\n" +
    "- **Game total** — 48.4% for UNDER 9. It happened.\n\nThis list is not a record.";
  const ok = verifyAnswer(draft, ev, {});
  assert.equal(ok.ok, true, JSON.stringify(ok.violations));
  const bad = verifyAnswer("GameTime is 2-0 on Seattle Mariners games.", ev, {});
  assert.equal(bad.ok, false, "a W–L the evidence does not hold is refused");
});

test("FAIL CLOSED: a team with no joined game still says 'not available', never 'published 0'", async () => {
  const env = await getForecastHistory({ sport: "MLB", teamId: "mlb-team-147" }, ctx());
  assert.equal(env.status, ASK_STATUS.UNSUPPORTED);
  assert.match(env.detail, /not available through Ask yet/);
});

test("readableCall names the side a probability is for; a player's own event stays unworded", () => {
  const B = "BINARY_PROBABILITY";
  assert.equal(readableCall({ forecastKind: B, subjectType: "GAME", direction: "SEA (home)", matchup: "TEX @ SEA" }), "SEA (home)");
  assert.equal(readableCall({ forecastKind: B, subjectType: "GAME", direction: "HOME_WIN", matchup: "SEA @ WSH" }), "WSH (home) to win");
  assert.equal(readableCall({ forecastKind: B, subjectType: "GAME", direction: "OVER_2_5_GOALS", matchup: "Sunderland v Arsenal" }), "over 2.5 goals");
  assert.equal(readableCall({ forecastKind: B, subjectType: "GAME", direction: "HOME_WIN", matchup: "garbled" }), null, "no home side, no words");
  assert.equal(readableCall({ forecastKind: B, subjectType: "PLAYER", direction: "SCORES_TD" }), null);
  assert.equal(readableCall({ forecastKind: B, subjectType: "GAME", direction: "SOME_NEW_ENUM" }), null, "an unknown enum is never guessed at");
  assert.equal(readableCall({ forecastKind: "CONTINUOUS_PROJECTION", subjectType: "GAME", direction: "OVER" }), null);
});

test("on the ledger itself, HOME_WIN's probability is the home side's: observed 1 exactly when the home side won", () => {
  const rows = readJsonl("data/internal/forecast-ledger/v1/nfl.jsonl").filter((r) => r.direction === "HOME_WIN" && r.settlement?.state === "SETTLED");
  assert.ok(rows.length >= 20, `positive control (${rows.length})`);
  const bad = rows.filter((r) => (r.measurement?.observed === 1) !== (r.settlement?.finalCategory === "HOME"));
  assert.deepEqual(bad.map((r) => r.eventId), []);
});
