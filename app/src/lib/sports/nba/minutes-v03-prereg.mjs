/**
 * NBA MINUTES v0.3 vs official v0.1 — the PREREGISTERED scorer (docs/NBA_MINUTES_V03_PROTOCOL.md). PURE; no I/O, no clock.
 * PRIVATE RESEARCH · promotes nothing · changes no official file.
 *
 * NOT ARMED: `APPROVED_PROTOCOL_SHA256` and `PROTOCOL_APPROVED_AT` are null until the founder approves the protocol file's
 * exact bytes. The scorer refuses to score without both, and refuses a protocol file whose sha256 is not the approved one.
 * The draft's bytes are pinned by minutes-v03-prereg.test.mjs (`PROTOCOL_DRAFT_SHA256`): any edit is a new registration.
 *
 * CONFIRMATORY GAME: both the v0.1 and the v0.3 forecast frozen (inputAsOf) STRICTLY AFTER PROTOCOL_APPROVED_AT and strictly
 * before the game's tip-off, the same --now on both (v0.3 is built aligned with v0.1), the game final with a box score.
 * Every game at or before approval — including the 146 exploratory games of 2026-10-20 → 11-11 that shaped this
 * protocol — is development data and never enters a confirmatory number.
 */
import { clusterBootstrap } from "./bootstrap.mjs";

export const PROTOCOL_REL = "docs/NBA_MINUTES_V03_PROTOCOL.md";
export const PROTOCOL_DRAFT_SHA256 = "a6d885732c199bb9bf83b198665454370c7f10ba0142b87c1afbf968bd3baceb";
export const APPROVED_PROTOCOL_SHA256 = null;
export const PROTOCOL_APPROVED_AT = null;
/** Copied minimums (protocol §4): V18 §6 game minimum and the points/rebounds/assists player-game minimum. */
export const MIN_GAMES = 300;
export const MIN_PLAYER_GAMES = 1500;
/** Copied bar (protocol §6): V18 §7 points-family minutes MAE. */
export const MINUTES_MAE_BAR = 6.0;
/** Copied slice minimum (protocol §7): V18 §6 "100 per slice — reported, not gated, until then". */
export const SLICE_MIN_ROWS = 100;
/** Copied primary unit filter (protocol §5): the v0.3 arming text, expectedMinutes ≥ 20 in both. */
export const PRIMARY_MIN_EXPECTED = 20;
export const VERDICTS = Object.freeze({ PROMOTE_CANDIDATE: "PROMOTE_CANDIDATE", REJECT: "REJECT", INCONCLUSIVE: "INCONCLUSIVE", INSUFFICIENT_N: "INSUFFICIENT_N" });

const t = (iso) => (typeof iso === "string" ? Date.parse(iso) : NaN);

/** Is this game confirmatory under the approved protocol? Returns { ok, reason }. */
export function confirmatoryGame(g01, g03, box, approvedAt) {
  const a = t(approvedAt);
  if (!Number.isFinite(a)) return { ok: false, reason: "NOT_APPROVED" };
  if (!g01 || !g03) return { ok: false, reason: "MISSING_FAMILY" };
  const tip = t(g01.dateUtc);
  for (const [k, g] of [["v0.1", g01], ["v0.3", g03]]) {
    const at = t(g.forecast?.inputAsOf);
    if (!(at > a)) return { ok: false, reason: `${k}_FROZEN_BEFORE_APPROVAL` };
    if (!(at < tip)) return { ok: false, reason: `${k}_NOT_PRE_TIP` };
  }
  if (g01.forecast.inputAsOf !== g03.forecast.inputAsOf) return { ok: false, reason: "NOT_ALIGNED" };
  if (!box || box.status !== "STATUS_FINAL" || !box.boxscoreAvailable) return { ok: false, reason: "PENDING_FINAL" };
  return { ok: true, reason: null };
}

/** Paired rows of one game: players who PLAYED; each model's expected minutes (null = not projected, a coverage miss). */
export function gameRows(g01, g03, box, { tagsOf = null, season = null } = {}) {
  const rows = [];
  for (const side of ["home", "away"]) {
    const pick = (g) => new Map((g.forecast?.players?.[side] ?? []).filter((p) => p.availability !== "out").map((p) => [String(p.providerAthleteId), p.expectedMinutes]));
    const m1 = pick(g01), m3 = pick(g03);
    const tid = String(g01[side]?.providerTeamId);
    for (const a of box.players ?? []) {
      if (String(a.providerTeamId) !== tid || a.didNotPlay || !(a.minutes > 0)) continue;
      const id = String(a.providerAthleteId);
      if (!m1.has(id) && !m3.has(id)) continue;
      rows.push({ game: String(g01.providerEventId), id, actual: a.minutes, v01: Number.isFinite(m1.get(id)) ? m1.get(id) : null, v03: Number.isFinite(m3.get(id)) ? m3.get(id) : null, tags: tagsOf ? tagsOf(id, tid, t(g01.dateUtc), season) : [] });
    }
  }
  return rows;
}

const r3 = (x) => (Number.isFinite(x) ? Number(x.toFixed(3)) : null);
const paired = (xs) => xs.filter((r) => r.v01 != null && r.v03 != null);
const mae = (xs, k) => (xs.length ? r3(xs.reduce((s, r) => s + Math.abs(r[k] - r.actual), 0) / xs.length) : null);
const games = (xs) => new Set(xs.map((r) => r.game)).size;
/** Game-clustered paired difference |v0.3 − actual| − |v0.1 − actual| (bootstrap.mjs defaults: B 2000, seed 20261020). */
export function pairedDiff(xs) {
  const by = new Map();
  for (const r of paired(xs)) { if (!by.has(r.game)) by.set(r.game, []); by.get(r.game).push(Math.abs(r.v03 - r.actual) - Math.abs(r.v01 - r.actual)); }
  const b = clusterBootstrap([...by.values()]);
  return { n: b.n, games: b.clusters, mean: b.mean, ci95: b.lo == null ? null : [b.lo, b.hi] };
}

/**
 * The single look (protocol §8). `rows` are every confirmatory game's gameRows; `context` adds the rotation-change sets.
 * @param {any[]} rows @param {{ subgroups: string[], postFreezeKeys?: Set<string> }} o
 */
export function scoreProtocol(rows, { subgroups, postFreezeKeys = new Set() }) {
  const prim = paired(rows).filter((r) => r.v01 >= PRIMARY_MIN_EXPECTED && r.v03 >= PRIMARY_MIN_EXPECTED);
  const primary = { n: prim.length, games: games(prim), maeV01: mae(prim, "v01"), maeV03: mae(prim, "v03"), diff: pairedDiff(prim) };
  const coverage = { rows: rows.length, v01: r3(rows.filter((r) => r.v01 != null).length / (rows.length || 1)), v03: r3(rows.filter((r) => r.v03 != null).length / (rows.length || 1)) };
  const slices = Object.fromEntries(subgroups.map((s) => { const xs = paired(rows).filter((r) => r.tags.includes(s)); return [s, { n: xs.length, maeV01: mae(xs, "v01"), maeV03: mae(xs, "v03"), diff: xs.length >= SLICE_MIN_ROWS ? pairedDiff(xs) : null }]; }));
  const pf = paired(rows).filter((r) => postFreezeKeys.has(`${r.game}:${r.id}`) || postFreezeKeys.has(`${r.game}:*`));
  const secondary = { allPlayed: { n: paired(rows).length, maeV01: mae(paired(rows), "v01"), maeV03: mae(paired(rows), "v03"), diff: pairedDiff(rows) }, postFreezeChangeGames: { n: pf.length, diff: pf.length >= SLICE_MIN_ROWS ? pairedDiff(pf) : null } };
  const harm = Object.entries(slices).filter(([, v]) => v.diff?.ci95 && v.diff.ci95[0] > 0).map(([k]) => k);
  const coverageHarm = coverage.v03 < coverage.v01;
  let verdict;
  if (primary.games < MIN_GAMES || primary.n < MIN_PLAYER_GAMES) verdict = VERDICTS.INSUFFICIENT_N;
  else if (primary.diff.ci95 && primary.diff.ci95[0] > 0) verdict = VERDICTS.REJECT;
  else if (harm.length || coverageHarm) verdict = VERDICTS.REJECT;
  else if (primary.diff.ci95 && primary.diff.ci95[1] < 0 && primary.maeV03 <= MINUTES_MAE_BAR) verdict = VERDICTS.PROMOTE_CANDIDATE;
  else verdict = VERDICTS.INCONCLUSIVE;
  return { primary, coverage, slices, secondary, noHarm: { slicesSignificantlyWorse: harm, coverageWorse: coverageHarm }, verdict, note: "PROMOTE_CANDIDATE is an input to a founder decision, never a promotion." };
}
