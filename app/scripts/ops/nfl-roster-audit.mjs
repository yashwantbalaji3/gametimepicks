#!/usr/bin/env node
/**
 * NFL ROSTER / AVAILABILITY / USAGE AUDIT (Session 4, §42–§43, §68) — one command, read-only.
 *
 * For every upcoming published player board: re-runs `auditBoard` against the canonical owners
 * (current rosters, injuries contract, role evidence, weekly forecast current-season usage) instead
 * of trusting the board's own `integrity.violations`, then reports per team and across all 32 rosters.
 *
 * Usage: node app/scripts/ops/nfl-roster-audit.mjs [--dir <boards>] [--after <iso>] [--json]
 * Exit: 0 clean · 1 violations found · 2 could not run. Writes nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { auditBoard, currentSeasonUsageIndex, isUnavailableState } from "../../src/lib/sports/nfl/board-roster-integrity.mjs";
import { isBlockingStatus } from "../../src/lib/sports/injuries/contract.mjs";
import { checkUsageCapture, USAGE_FRESHNESS } from "../../src/lib/sports/nfl/usage-freshness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const DIR = path.resolve(arg("--dir", path.join(ROOT, "app/public/data/nfl/player-board")));
const read = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const die = (m) => { console.error(`REFUSED: ${m}`); process.exit(2); };

const rosterDoc = read(path.join(ROOT, "app/public/data/nfl/rosters/latest.json")) ?? die("no roster capture");
const rosterByTeam = new Map(rosterDoc.teams.map((t) => [t.teamAbbr, new Set(t.players.map((p) => `nfl-athlete-${p.id}`))]));
const injuries = read(path.join(ROOT, "data/internal/research/injuries/nfl/latest.json")) ?? die("no injuries capture");
const unavailable = new Map();
for (const e of injuries.entries ?? []) if (e?.athleteId && isBlockingStatus(e.status)) unavailable.set(`nfl-athlete-${e.athleteId}`, e.status);
const roleEvidence = read(path.join(ROOT, "data/internal/nfl/role-evidence/latest.json")) ?? die("no role evidence");
for (const ev of roleEvidence.events ?? []) for (const tv of Object.values(ev.teams ?? {})) for (const p of tv.players ?? []) if (isUnavailableState(p.state)) unavailable.set(p.playerId, p.state);

const boards = fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f)).map((f) => read(path.join(DIR, f)))
  .filter((b) => b?.artifact === "nfl-player-board" && Date.parse(b.kickoffUtc) > Date.parse(arg("--after", new Date().toISOString())))
  .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc));
if (!boards.length) { console.log("NO_BOARDS — nothing upcoming to audit; a result, not a pass"); process.exit(0); }

const fdir = path.join(ROOT, "data/internal/research/nfl/replay/player-props-share-level-forward");
const usage = new Set();
/* Session 5 — the forecast's own share column per week, so the audit recomputes every share-sourced pool. */
const sharesByWeek = new Map();
const weekOf = (b) => `${b.kickoffUtc.slice(0, 4)}-${String(b.week).padStart(2, "0")}`;
for (const w of new Set(boards.map(weekOf))) {
  const forecast = read(path.join(fdir, `${w}.json`));
  for (const k of currentSeasonUsageIndex({ forecast, season: Number(w.slice(0, 4)) })) usage.add(k);
  const m = new Map();
  if (forecast?.columns) {
    const C = Object.fromEntries(forecast.columns.map((c, i) => [c, i]));
    for (const r of forecast.rows ?? []) if (r[C.espnId] != null) m.set(`${r[C.espnId]}|${r[C.team]}|${r[C.market]}`, r[C.share]);
  }
  sharesByWeek.set(w, m);
}

const rows = [];
let total = 0;
const projectedAt = new Map();
for (const b of boards) {
  const shares = sharesByWeek.get(weekOf(b));
  const v = auditBoard({ board: b, rosterByTeam, unavailable, usage, shareOf: (id, team, market) => shares?.get(`${id}|${team}|${market}`) });
  if (!b.coverage) v.push({ code: "NO_COVERAGE_RECEIPT", team: null });
  total += v.length;
  for (const p of b.players ?? []) {
    const prev = projectedAt.get(p.playerId);
    if (prev && prev !== p.team) { v.push({ code: "MULTI_TEAM_ACROSS_SLATE", team: p.team, name: p.name, also: prev }); total += 1; }
    projectedAt.set(p.playerId, p.team);
  }
  for (const [team, c] of Object.entries(b.coverage ?? {})) {
    const n = (s) => c.players.filter((r) => r.state === s).length;
    rows.push({
      game: b.matchup, kickoffUtc: b.kickoffUtc, generatedAt: b.generatedAt, team,
      projected: n("PROJECTED"), unavailable: n("EXCLUDED_UNAVAILABLE"), leftRoster: n("EXCLUDED_NO_CURRENT_ROLE"),
      roleUncertain: n("WITHHELD_ROLE_UNCERTAIN"),
      notModeledByFamily: c.players.reduce((s, r) => s + (r.notModeled?.length ?? 0), 0),
      qbRule: (b.integrity?.qbStarter ?? []).find((q) => q.team === team)?.state ?? "n/a",
      violations: v.filter((x) => x.team === team).map((x) => `${x.code}${x.name ? ` ${x.name}` : ""}`),
    });
  }
  const listed = new Set(Object.keys(b.coverage ?? {}));
  for (const x of v.filter((y) => !y.team || !listed.has(y.team))) rows.push({ game: b.matchup, team: x.team ?? "—", violations: [`${x.code}${x.name ? ` ${x.name}` : ""}${x.players ? ` ${x.players.join("+")}` : ""}`] });
}
/* Session 5 · A6 — current-season usage keeps up with the finals (usage-freshness.mjs). */
const season = Number(boards[0].kickoffUtc.slice(0, 4)) - (new Date(boards[0].kickoffUtc).getUTCMonth() < 6 ? 1 : 0);
const usageFreshness = checkUsageCapture({
  results: read(path.join(ROOT, "app/public/data/nfl/results/latest.json")),
  events: read(path.join(ROOT, `data/internal/research/nfl/player-events-v1/${season}.json`)),
  season, nowIso: arg("--now", new Date().toISOString()),
});
if (usageFreshness.state === USAGE_FRESHNESS.LAGGING || usageFreshness.state === USAGE_FRESHNESS.NO_CAPTURE) {
  total += 1;
  rows.push({ game: "slate", team: "—", violations: [`USAGE_CAPTURE_${usageFreshness.state} ${usageFreshness.missing.map((m) => m.game ?? m.providerEventId).join(", ")}`.trim()] });
}
const teamsCovered = new Set(rows.filter((r) => r.game !== "slate").map((r) => r.team));
const summary = { boards: boards.length, teams: teamsCovered.size, rosterTeams: rosterByTeam.size, violations: total, usageFreshness };
if (process.argv.includes("--json")) console.log(JSON.stringify({ summary, rows }, null, 1));
else {
  console.log(`NFL ROSTER AUDIT · ${boards.length} board(s) · ${teamsCovered.size} team(s) on the slate of ${rosterByTeam.size} rostered`);
  for (const r of rows) {
    console.log(`${(r.game ?? "").padEnd(11)} ${String(r.team).padEnd(4)} proj ${String(r.projected ?? "-").padStart(2)} · out ${r.unavailable ?? "-"} · left ${r.leftRoster ?? "-"} · role? ${r.roleUncertain ?? "-"} · notByFamily ${r.notModeledByFamily ?? "-"} · QB ${r.qbRule ?? "-"} · ${r.violations.length ? `FAIL ${r.violations.join("; ")}` : "PASS"}`);
  }
  console.log(`usage capture: ${usageFreshness.state} — ${usageFreshness.reason}`);
  if (usageFreshness.state === USAGE_FRESHNESS.RESULTS_STALE) console.log("::warning::usage freshness could not be judged — the NFL results owner is stale");
  console.log(`violations: ${total}`);
}
process.exit(total ? 1 : 0);
