#!/usr/bin/env node
/**
 * NBA UNIFIED PROPS ROSTER for one ET slate: verified starters plus a sixth man per team, and the per-cell readiness map.
 * Report-only: it changes no forecast. Reads the committed lane and free ESPN roster, depth-chart, injury and game-log
 * endpoints (no paid API). Readiness comes from assessPlayer (audit §8; constants await founder approval).
 *
 *   node scripts/social/nba-unified-roster.mjs --date 2026-11-04 --out ~/gtp-evidence/readiness-1104 [--lines export.json]
 *
 * Writes <out>/ready_in.json (inputs), <out>/roster.json (GTP_NBA_UNIFIED_ROSTER for render-social-pack) and
 * <out>/readiness-<date>.json (the per-game table). Folded from the November 2 scratch scripts; same rules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assessPlayer } from "../../src/lib/sports/nba/player-readiness.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const SEASON = { espnYear: 2027, label: "2026-27" };
// Reasons that hide the whole row (rendered as "Review"); other reasons hide only the affected cell. As used 2026-11-02.
export const HIDE_ROW = new Set(["B_CAP", "B_GAP", "B_ELIG", "R_41", "R_GAP", "R_THIN", "R_MISSED_1", "R_NO_CURRENT"]);
// A team whose unprojected available players took this share of its last-3 minutes is under review. As used 2026-11-02.
export const TEAM_COVERAGE_REVIEW = 0.15;
const OUT = new Set(["Out", "Injured Reserve"]);
const POS = ["pg", "sg", "sf", "pf", "c"];

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); } catch { /* retry */ }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return {};
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let k = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (k < items.length) { const i = k++; out[i] = await fn(items[i]); } }));
  return out;
}

/** Gather ESPN inputs per team. */
export async function readinessInputs({ lane, lines = new Map() }) {
  const teams = lane.games.flatMap((g) => ["away", "home"].map((s) => ({ g, s, ab: g[s].abbr })));
  const T = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
  const ros = {}, dep = {};
  for (const { ab } of teams) {
    ros[ab] = (await getJson(`${T}/teams/${ab.toLowerCase()}/roster`)).athletes ?? [];
    dep[ab] = (await getJson(`${T}/teams/${ab.toLowerCase()}/depthcharts`)).depthchart?.[0]?.positions ?? {};
  }
  const inj = {};
  for (const g of lane.games) for (const t of (await getJson(`${T}/summary?event=${g.providerEventId}`)).injuries ?? []) for (const p of t.injuries ?? []) inj[p.athlete.id] = p.status;
  const ids = Object.values(ros).flat().map((a) => a.id);
  const logs = new Map(await pool(ids, 12, async (id) => {
    const j = await getJson(`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog?season=${SEASON.espnYear}`);
    const ev = [];
    for (const ss of j.seasonTypes ?? []) if (/Regular/.test(ss.displayName) && ss.displayName.includes(SEASON.label)) for (const c of ss.categories ?? []) for (const e of c.events ?? []) ev.push([e.eventId, Object.fromEntries((j.labels ?? []).map((l, i) => [l, e.stats[i]]))]);
    return [id, ev];
  }));
  const out = {};
  for (const { g, s, ab } of teams) {
    // eventIds rise with the schedule; proxy for date order
    const order = [...new Set(ros[ab].flatMap((a) => (logs.get(a.id) ?? []).map(([e]) => e)))].sort((a, b) => Number(b) - Number(a));
    const P = Object.fromEntries(g.players[s].map((p) => [String(p.providerAthleteId), p]));
    const last3 = new Set(order.slice(0, 3)); let tot = 0, unp = 0;
    for (const a of ros[ab]) {
      const m = (logs.get(a.id) ?? []).filter(([e]) => last3.has(e)).reduce((n, [, st]) => n + Number(st.MIN ?? 0), 0); tot += m;
      if (!P[a.id] && !OUT.has(inj[a.id])) unp += m;
    }
    const t = { players: {}, teamGames: order.length, sum: Math.round(Object.values(P).reduce((n, p) => n + p.expectedMinutes, 0) * 10) / 10, n: Object.keys(P).length, covShare: tot ? Math.round((unp / tot) * 1000) / 1000 : null, starters: [], bench: [], names: Object.fromEntries(ros[ab].map((a) => [a.id, a.fullName])), injAll: {} };
    for (const pos of POS) { const at = dep[ab][pos]?.athletes ?? []; if (at.length && !t.starters.includes(String(at[0].id))) t.starters.push(String(at[0].id)); }
    t.bench = POS.flatMap((pos) => (dep[ab][pos]?.athletes ?? []).slice(1).map((x) => String(x.id)));
    for (const [i, p] of Object.entries(P)) {
      const ev = logs.get(i) ?? []; const ms = ev.map(([, st]) => Number(st.MIN ?? 0)); const n = ms.length; const es = new Set(ev.map(([e]) => e));
      const avg = (K) => (n ? ev.reduce((x, [, st]) => x + Number(st[K] ?? 0), 0) / n : null);
      t.players[i] = { name: p.name, mu: p.expectedMinutes, n, cur: n ? ms.reduce((a, b) => a + b, 0) / n : null, minLo: n ? Math.min(...ms) : null, minHi: n ? Math.max(...ms) : null, injStatus: inj[i] ?? p.injuryStatus ?? null, teamGames: order.length, missedLast: order.length > 0 && !es.has(order[0]), missedTwo: order.length >= 2 && !es.has(order[0]) && !es.has(order[1]), injured: Boolean(p.injuryStatus || inj[i]), medians: { pts: p.medians.pts, reb: p.medians.reb, ast: p.medians.ast }, recent: { pts: avg("PTS"), reb: avg("REB"), ast: avg("AST") }, lines: Object.fromEntries(["pts", "reb", "ast"].map((k) => [k, lines.get(`${i}:${k}`) ?? null])) };
    }
    t.injAll = Object.fromEntries(Object.keys(t.names).filter((i) => i in inj).map((i) => [i, inj[i]]));
    out[ab] = t;
  }
  return out;
}

// AVAILABILITY & PLAUSIBILITY GUARD (PD for the founder, 2026-11-04; rules R1-R3 from the NBA engine evaluation's Nov 2
// back-test). Hides rows only; never changes a number. Every hidden row records the rule that hid it.
export const GUARD = Object.freeze({ minGames: 3, hardMinutes: 42, band: 4 });
const GUARD_STATUS = /^(out|day|doubtful|inactive|suspen|injured reserve)/i;
/** Pure. Guard rules that hide this player (empty = shown). `status` is the build-time ESPN injury status. */
export function guardReasons(r, status) {
  const G = GUARD; const out = [];
  if (status && GUARD_STATUS.test(status)) out.push("R1");
  if (!(r.n >= G.minGames)) out.push("R2");
  if (r.mu > G.hardMinutes || (r.minLo != null && r.mu < r.minLo - G.band) || (r.minHi != null && r.mu > r.minHi + G.band)) out.push("R3");
  return out;
}

/** Pure: inputs → roster file and readiness table. */
export function unifiedRoster(I) {
  const roster = { __cells: {}, __guard: {} }, table = {};
  for (const [ab, t] of Object.entries(I)) {
    const A = {};
    for (const [i, r] of Object.entries(t.players)) {
      const a = assessPlayer(r);
      if ((t.covShare ?? 0) >= TEAM_COVERAGE_REVIEW && !a.reasons.some((x) => x[0] === "B")) { a.reasons.push("R_TEAM_COVERAGE"); a.state = "REVIEW"; for (const c of Object.values(a.cells)) if (c.state === "PASS") c.state = "REVIEW"; }
      A[i] = { ...a, name: r.name, mu: r.mu, n: r.n, cur: r.cur && Number(r.cur.toFixed(1)) };
      const status = r.injStatus ?? t.injAll?.[i] ?? null;
      const g = guardReasons(r, status);
      if (g.length) { A[i].guard = g; roster.__guard[i] = g; }
      if (g.length || a.reasons.some((x) => HIDE_ROW.has(x))) A[i].hideAll = true;
      else { const h = ["pts", "reb", "ast"].filter((m) => a.cells[m].reasons.length); if (h.length) A[i].hideCells = h; }
    }
    const isOut = (i) => OUT.has(t.injAll[i]);
    const row = [];
    for (const i of t.starters) {
      if (isOut(i)) continue;
      if (!A[i]) row.push({ id: i, name: t.names[i] ?? i, review: true, text: "No projection available" });
      else if (A[i].hideAll) row.push({ id: i, name: A[i].name, review: true });
      else row.push(i);
    }
    const six = t.bench.concat(Object.keys(A).sort((a, b) => A[b].mu - A[a].mu)).find((i) => A[i] && !A[i].hideAll && !isOut(i) && !row.includes(i));
    if (six) row.push(six);
    roster[ab] = row;
    for (const i of Object.keys(A)) if (A[i].hideCells) roster.__cells[i] = A[i].hideCells;
    table[ab] = { sum: t.sum, n: t.n, cov: t.covShare, rows: row.map((e) => { const i = String(e.id ?? e); const a = A[i]; return { id: i, name: e.name ?? a.name, state: a ? a.state : "NO_PROJECTION", reasons: a?.reasons, guard: a?.guard, hide: a?.hideAll ? "ALL" : a?.hideCells, mu: a?.mu, cur: a?.cur, n: a?.n }; }) };
  }
  return { roster, table };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
  const date = arg("date"), out = arg("out");
  if (!date || !out) { console.error("usage: --date YYYY-MM-DD --out DIR [--lines export.json] [--inputs ready_in.json]"); process.exit(2); }
  const lane = JSON.parse(fs.readFileSync(path.join(APP, `public/data/nba/experimental-public/${date}.json`), "utf8"));
  const lines = new Map((arg("lines") ? JSON.parse(fs.readFileSync(arg("lines"), "utf8")) : []).filter((r) => r.market.line.state === "SHOWN").map((r) => [`${r.identity.playerId}:${r.identity.market}`, r.market.line.value]));
  fs.mkdirSync(out, { recursive: true });
  const I = arg("inputs") ? JSON.parse(fs.readFileSync(arg("inputs"), "utf8")) : await readinessInputs({ lane, lines });
  const { roster, table } = unifiedRoster(I);
  const put = (f, o) => { const tmp = path.join(out, `.${f}.tmp`); fs.writeFileSync(tmp, JSON.stringify(o, null, 1)); fs.renameSync(tmp, path.join(out, f)); };
  if (!arg("inputs")) put("ready_in.json", I);
  put("roster.json", roster); put(`readiness-${date}.json`, table);
  for (const [ab, v] of Object.entries(table)) console.log(ab, v.n, v.cov, v.rows.map((r) => `${r.name.split(" ").pop()}:${r.state[0]}${r.hide ? (r.hide === "ALL" ? "*" : "~") : ""}`).join(" "));
}
