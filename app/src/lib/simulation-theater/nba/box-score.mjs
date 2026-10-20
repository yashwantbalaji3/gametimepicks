/**
 * NBA SIMULATION THEATER · PROJECTED FINAL BOX SCORE (Lane A-NBA, 2026-10-20). Pure: no I/O, no browser APIs.
 * Client-safe: imported by the dev-route island, so it names no engine id, artifact or data path (the client-graph test
 * in nba-theater.test.mjs scans it) and it does NOT import validate-sample.mjs — every check below is its own.
 *
 * WHAT IT IS. nbaBoxScore(sample, manifest) turns ONE representative sample (one real draw of the engine, chosen by the
 * sample's selection rule) into a box score: header, quarter-by-quarter (with OT), per-team player rows, team totals and
 * leaders. kind is "selected-run-sample". It is never a median box score and never an actual game's statistics:
 *
 *   "selected-run-sample"  built here: every number is the selected run's own game total, nothing averaged or scaled.
 *   "per-player-median"    NOT built. The artifact's per-player quantiles are marginal and conditional on playing
 *                          (minutes > 0), so a column of medians does not sum to any team score: it is not a box score.
 *   "actual"               NEVER built here. A box score of a real game comes from results, not from a simulation.
 *
 * COLUMNS. Only fields the engine writes on every player of the sample: MIN, PTS, REB, AST, 3PM, 3PA, 2PM, FTM (each
 * tagged MODELED). A column whose field is absent from any player is dropped and listed as not in this sample. Nothing is
 * synthesized: no FGA / FG% / FTA / OREB-DREB / STL / BLK / TOV / PF / +/- and no starter flag (NOT_MODELED below).
 *
 * ROWS. A simulated player with 0 minutes in this run is status "dnp" — its stat values are null, never 0 — so a DNP is
 * distinct from a player who played and scored 0. A rostered player the engine did not simulate at all (ruled Out, or no
 * usable history; manifest.rosterNotSimulated) is status "not-simulated" with its reason.
 *
 * INVARIANTS (fail closed: any failure → { ok: false, errors, box: null }, and the UI shows "Box score unavailable"):
 *   KIND_NOT_BUILT / KIND_ACTUAL_NEVER / KIND_UNKNOWN  a kind other than "selected-run-sample"
 *   SAMPLE_INVALID      the adapter's own validation of the sample failed
 *   MALFORMED           final, periods, players or teams missing
 *   FIELD_MISSING       a player lacks name, minutes or pts
 *   NEGATIVE_OR_NONINT  a score or counting stat is negative or not an integer
 *   DUPLICATE_PLAYER    the same athlete twice on one side
 *   OT_COUNT            periods are not Q1..Q4, OT1..OTn with n = overtimePeriods
 *   PERIOD_SUM          Σ quarter (+OT) scores ≠ final
 *   TIED_FINAL          the final is tied
 *   PLAYER_PTS_SUM      Σ player points ≠ the team's final score
 *   TEAM_BLOCK          Σ player <stat> ≠ the sample's own team block for that stat
 *   PTS_FORMULA         pts ≠ 3·3PM + 2·2PM + FTM (when those columns exist)
 *   THREES_GT_PTS       3·3PM > pts
 *   THREE_PM_GT_PA      3PM > 3PA (when 3PA exists)
 *   MINUTES_RESOLUTION  a minutes value is not at the 0.01 serialization step
 *   MINUTES_SUM         Σ team minutes ≠ 240 + 25·OT EXACTLY (summed in integer hundredths: no tolerance)
 *   MINUTES_RANGE       a player outside 0 ≤ min ≤ 48 + 5·OT
 *   DNP_WITH_STATS      0 minutes with a non-zero stat
 */
export const NBA_BOX_SCORE_SCHEMA = "nba-box-score@1";
export const BOX_SCORE_KINDS = Object.freeze({ SAMPLE: "selected-run-sample", MEDIAN: "per-player-median", ACTUAL: "actual" });
/** Shown on every box score, in this exact text (and a planted copy is an export-boundary leak). */
export const NBA_BOX_WATERMARK = "PROJECTED · SIMULATED · NOT ACTUAL GAME STATISTICS · PRIVATE CANDIDATE MODEL";
export const MODELED = "MODELED";
export const OT_TEAM_MINUTES = 25; // 5 players × 5 minutes per OT period
export const REGULATION_TEAM_MINUTES = 240;

/** Candidate columns, in display order. A column is shown only if every player row of the sample carries the field. */
export const BOX_COLUMNS = Object.freeze([
  Object.freeze({ key: "minutes", label: "MIN", title: "Minutes", modeled: MODELED, required: true }),
  Object.freeze({ key: "pts", label: "PTS", title: "Points", modeled: MODELED, required: true }),
  Object.freeze({ key: "reb", label: "REB", title: "Rebounds (game total; no offensive/defensive split)", modeled: MODELED }),
  Object.freeze({ key: "ast", label: "AST", title: "Assists", modeled: MODELED }),
  Object.freeze({ key: "threePm", label: "3PM", title: "Three-pointers made", modeled: MODELED }),
  Object.freeze({ key: "threePa", label: "3PA", title: "Three-pointers attempted", modeled: MODELED }),
  Object.freeze({ key: "twoPm", label: "2PM", title: "Two-point field goals made", modeled: MODELED }),
  Object.freeze({ key: "ftm", label: "FTM", title: "Free throws made", modeled: MODELED }),
]);
/** The sort controls the UI offers (every shown column is sortable; these are the ones it must offer). */
export const REQUIRED_SORT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm", "minutes"]);

/** Box-score statistics the engine does not produce; listed on the box score, never filled in. */
export const NOT_MODELED = Object.freeze([
  Object.freeze({ stat: "FGA · FG% · 2PA", why: "only made two-pointers and three-point attempts are simulated; field-goal attempts are never back-filled from points" }),
  Object.freeze({ stat: "FTA · FT%", why: "only made free throws are simulated" }),
  Object.freeze({ stat: "OREB · DREB", why: "rebounds are one game total per player, with no offensive/defensive split" }),
  Object.freeze({ stat: "STL · BLK · TOV · PF", why: "not simulated" }),
  Object.freeze({ stat: "+/−", why: "no lineups or stints are simulated, so no on-court score margin exists" }),
  Object.freeze({ stat: "Starter / bench", why: "the run records no lineup; rows are ordered by modeled minutes, not by a starting five" }),
  Object.freeze({ stat: "Per-quarter player splits", why: "player stats exist only as game totals of the run" }),
]);

const SIDES = Object.freeze(["away", "home"]);
const isInt = (v) => Number.isInteger(v);
const nonNegInt = (v) => isInt(v) && v >= 0;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const hundredths = (m) => Math.round(m * 100);
const atResolution = (m) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-6;
const periodLabel = (n) => (n <= 4 ? `Q${n}` : `OT${n - 4}`);
export const otSuffix = (ot) => (ot > 1 ? `/${ot}OT` : ot === 1 ? "/OT" : "");
export const teamMinutesFor = (ot) => REGULATION_TEAM_MINUTES + OT_TEAM_MINUTES * ot;

/**
 * @param {any} sample    one manifest sample (adapter-nba-sim-v1.mjs), or a raw representativeSamples entry
 * @param {any} manifest  the adapted manifest (teams, modelVersion, inputAsOf, simulations, seed, rosterNotSimulated…)
 * @param {{ kind?: string }} [opts]
 * @returns {{ ok: boolean, errors: {code: string, detail: string}[], box: object|null }}
 */
export function nbaBoxScore(sample, manifest, { kind = BOX_SCORE_KINDS.SAMPLE } = {}) {
  const errors = [];
  const err = (code, detail) => errors.push({ code, detail });
  const out = () => ({ ok: false, errors, box: null });
  if (kind === BOX_SCORE_KINDS.MEDIAN) { err("KIND_NOT_BUILT", "per-player medians are marginal and conditional on playing; they do not sum to a team score, so no median box score is built"); return out(); }
  if (kind === BOX_SCORE_KINDS.ACTUAL) { err("KIND_ACTUAL_NEVER", "a simulation never produces an actual box score"); return out(); }
  if (kind !== BOX_SCORE_KINDS.SAMPLE) { err("KIND_UNKNOWN", `kind ${JSON.stringify(kind)}`); return out(); }
  if (!sample || typeof sample !== "object" || !manifest || typeof manifest !== "object") { err("MALFORMED", "sample or manifest missing"); return out(); }
  if (sample.validation && sample.validation.ok === false) err("SAMPLE_INVALID", (sample.validation.errors ?? []).map((e) => e.code).join(", ") || "validation failed");
  const { final, periods, players, team } = sample;
  const teams = manifest.teams;
  if (!final || !Array.isArray(periods) || !players || !teams?.home || !teams?.away) { err("MALFORMED", "final, periods, players or teams missing"); return out(); }

  // periods (incl. OT) and the final
  const ot = Math.max(0, periods.length - 4);
  if (periods.length < 4 || sample.overtimePeriods !== ot || periods.some((p, i) => p?.period !== i + 1 || p?.label !== periodLabel(i + 1))) {
    err("OT_COUNT", `${periods.length} periods listed (${periods.map((p) => p?.label).join(",")}) vs overtimePeriods ${sample.overtimePeriods}`);
  }
  for (const side of SIDES) {
    if (!nonNegInt(final[side])) err("NEGATIVE_OR_NONINT", `final.${side} = ${final[side]}`);
    for (const p of periods) if (!nonNegInt(p?.[side])) err("NEGATIVE_OR_NONINT", `${p?.label}.${side} = ${p?.[side]}`);
    const sum = periods.reduce((a, p) => a + (Number(p?.[side]) || 0), 0);
    if (sum !== final[side]) err("PERIOD_SUM", `${side}: Σ periods ${sum} ≠ final ${final[side]}`);
  }
  if (isInt(final.home) && final.home === final.away) err("TIED_FINAL", `final ${final.away}–${final.home} is tied`);

  // columns: only fields present on every player of both sides
  const all = SIDES.flatMap((s) => (Array.isArray(players[s]) ? players[s] : []));
  if (!SIDES.every((s) => Array.isArray(players[s]))) { err("MALFORMED", "players.home or players.away missing"); return out(); }
  const columns = BOX_COLUMNS.filter((c) => c.required || (all.length > 0 && all.every((p) => isNum(p?.[c.key]))));
  const absent = BOX_COLUMNS.filter((c) => !columns.includes(c)).map((c) => ({ stat: c.label, why: "not in this sample" }));
  const statKeys = columns.map((c) => c.key).filter((k) => k !== "minutes");
  const has = (k) => statKeys.includes(k);

  const teamMinutes = teamMinutesFor(ot);
  const maxMin = 48 + 5 * ot;
  const sides = {};
  for (const side of SIDES) {
    const ps = players[side];
    const ids = new Set();
    const rows = [];
    let minH = 0;
    for (const p of ps) {
      const who = `${side} ${p?.name ?? p?.providerAthleteId ?? "?"}`;
      if (!p || typeof p.name !== "string" || !isNum(p.minutes) || !isNum(p.pts)) { err("FIELD_MISSING", `${who}: name, minutes or pts missing`); continue; }
      const id = p.providerAthleteId != null ? String(p.providerAthleteId) : null;
      if (id && ids.has(id)) err("DUPLICATE_PLAYER", `${who} (${id}) listed twice`);
      if (id) ids.add(id);
      for (const k of statKeys) if (!nonNegInt(p[k])) err("NEGATIVE_OR_NONINT", `${who}.${k} = ${p[k]}`);
      if (!atResolution(p.minutes)) err("MINUTES_RESOLUTION", `${who}: ${p.minutes} min is not at 0.01`);
      if (p.minutes < 0 || p.minutes > maxMin) err("MINUTES_RANGE", `${who}: ${p.minutes} min outside 0–${maxMin}`);
      if (has("threePm") && 3 * p.threePm > p.pts) err("THREES_GT_PTS", `${who}: 3·${p.threePm} 3PM > ${p.pts} pts`);
      if (has("threePm") && has("threePa") && p.threePm > p.threePa) err("THREE_PM_GT_PA", `${who}: 3PM ${p.threePm} > 3PA ${p.threePa}`);
      if (has("threePm") && has("twoPm") && has("ftm") && 3 * p.threePm + 2 * p.twoPm + p.ftm !== p.pts) err("PTS_FORMULA", `${who}: pts ${p.pts} ≠ 3·${p.threePm} + 2·${p.twoPm} + ${p.ftm}`);
      const dnp = p.minutes === 0;
      if (dnp && statKeys.some((k) => p[k] !== 0)) err("DNP_WITH_STATS", `${who}: 0 minutes but non-zero stats`);
      minH += hundredths(p.minutes);
      const row = { providerAthleteId: id, name: p.name, status: dnp ? "dnp" : "played", modeledMinutes: p.minutes, minutes: dnp ? null : p.minutes };
      for (const k of statKeys) row[k] = dnp ? null : p[k];
      rows.push(row);
    }
    if (minH !== teamMinutes * 100) err("MINUTES_SUM", `${side}: Σ minutes ${(minH / 100).toFixed(2)} ≠ ${teamMinutes} (240 + 25·${ot}), exact`);
    const totals = { minutes: minH / 100 };
    for (const k of statKeys) totals[k] = ps.reduce((a, p) => a + (Number(p?.[k]) || 0), 0);
    if (totals.pts !== final[side]) err("PLAYER_PTS_SUM", `${side}: Σ player pts ${totals.pts} ≠ final ${final[side]}`);
    const block = team?.[side];
    if (block && typeof block === "object") {
      for (const k of statKeys) if (k in block && block[k] !== totals[k]) err("TEAM_BLOCK", `${side}: Σ player ${k} ${totals[k]} ≠ team ${block[k]}`);
    }
    const notSimulated = (manifest.rosterNotSimulated?.[side] ?? [])
      .filter((r) => r && typeof r.name === "string" && !(r.providerAthleteId && ids.has(String(r.providerAthleteId))))
      .map((r) => ({ providerAthleteId: r.providerAthleteId ?? null, name: r.name, status: "not-simulated", reason: r.reason ?? "not-simulated", injuryStatus: r.injuryStatus ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name, "en") || String(a.providerAthleteId).localeCompare(String(b.providerAthleteId)));
    sides[side] = { side, abbr: teams[side].abbr, name: teams[side].name, rows, totals, notSimulated };
  }
  if (errors.length) return out();

  for (const side of SIDES) sides[side].rows = sortBoxRows(sides[side].rows, { key: "minutes", dir: "desc" });
  const winner = final.home > final.away ? "home" : "away";
  const header = {
    eventId: manifest.eventId ?? null,
    matchup: `${teams.away.abbr} @ ${teams.home.abbr}`,
    away: { abbr: teams.away.abbr, name: teams.away.name },
    home: { abbr: teams.home.abbr, name: teams.home.name },
    status: `SIMULATED FINAL${otSuffix(ot)}`,
    runIndex: sample.runIndex,
    label: sample.label ?? null,
    title: sample.title ?? sample.label ?? null,
    selectionRule: sample.selectionRule ?? null,
    simulations: manifest.simulations ?? null,
    engine: manifest.modelVersion ?? null,
    profileVersion: manifest.profileVersion ?? null,
    inputAsOf: manifest.inputAsOf ?? null,
    generatedAt: manifest.generatedAt ?? null,
    seed: manifest.seed ?? null,
    fixture: manifest.fixture === true,
    final: { away: final.away, home: final.home },
    overtimePeriods: ot,
    winner,
  };
  const box = {
    schema: NBA_BOX_SCORE_SCHEMA,
    kind: BOX_SCORE_KINDS.SAMPLE,
    header,
    periods: periods.map((p) => ({ period: p.period, label: p.label, ot: p.period > 4, away: p.away, home: p.home })),
    columns: columns.map((c) => ({ key: c.key, label: c.label, title: c.title, modeled: c.modeled, sortable: true })),
    teams: sides,
    leaders: leadersOf(sides),
    notModeled: [...NOT_MODELED, ...absent],
    teamMinutes,
    invariantsChecked: ["PERIOD_SUM", "PLAYER_PTS_SUM", "TEAM_BLOCK", "MINUTES_SUM", "THREES_GT_PTS", ...(has("threePa") ? ["THREE_PM_GT_PA"] : []), ...(has("twoPm") && has("ftm") ? ["PTS_FORMULA"] : []), "DNP_WITH_STATS", "OT_COUNT"],
    watermark: NBA_BOX_WATERMARK,
    provenance: provenanceLine(sample, manifest),
  };
  return { ok: true, errors: [], box };
}

function provenanceLine(sample, m) {
  const parts = [`Run #${Number(sample.runIndex).toLocaleString("en-US")}${m.simulations ? ` of ${Number(m.simulations).toLocaleString("en-US")}` : ""}${sample.title ? ` (${sample.title})` : ""}`];
  if (m.modelVersion) parts.push(`${m.modelVersion}${m.profileVersion ? ` · ${m.profileVersion}` : ""}`);
  if (m.inputAsOf) parts.push(`inputs as of ${m.inputAsOf}`);
  if (m.seed) parts.push(`seed ${m.seed}`);
  parts.push(m.fixture ? "synthetic test fixture" : m.provenance?.sha256 ? `dev copy sha256 ${String(m.provenance.sha256).slice(0, 8)}… verified` : m.file ? `source ${m.file}` : "source unrecorded");
  return parts.join(" · ");
}

const STATUS_ORDER = { played: 0, dnp: 1 };
/**
 * Deterministic sort. Played rows first, by `key` in `dir` (minutes compared in integer hundredths); ties → more minutes,
 * then more points, then name, then athlete id. DNP rows always follow, by name. Never mutates its input.
 */
export function sortBoxRows(rows, { key = "minutes", dir = "desc" } = {}) {
  const sgn = dir === "asc" ? 1 : -1;
  const v = (r, k) => (k === "minutes" ? hundredths(r.minutes ?? 0) : Number(r[k] ?? 0));
  return [...rows].sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2);
    if (s) return s;
    if (a.status === "played") {
      const d = (v(a, key) - v(b, key)) * sgn;
      if (d) return d;
      const m = v(b, "minutes") - v(a, "minutes");
      if (m) return m;
      const p = v(b, "pts") - v(a, "pts");
      if (p) return p;
    }
    return a.name.localeCompare(b.name, "en") || String(a.providerAthleteId ?? "").localeCompare(String(b.providerAthleteId ?? ""));
  });
}

/** The next sort after activating column `key`: the same column flips direction; a new column starts descending. */
export const nextSort = (cur, key) => (cur?.key === key ? { key, dir: cur.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" });

/** Top scorer / rebounder / assister, game-wide and per team, among players who played; ties are all listed (by name). */
function leadersOf(sides) {
  const pick = (rows, k) => {
    const played = rows.filter((r) => r.status === "played" && r[k] != null);
    if (!played.length) return null;
    const best = Math.max(...played.map((r) => r[k]));
    return { value: best, players: played.filter((r) => r[k] === best).map((r) => ({ side: r.side, name: r.name, providerAthleteId: r.providerAthleteId })).sort((a, b) => a.name.localeCompare(b.name, "en")) };
  };
  const tagged = (side) => sides[side].rows.map((r) => ({ ...r, side }));
  const keys = ["pts", "reb", "ast"].filter((k) => sides.home.rows.concat(sides.away.rows).some((r) => k in r));
  const of = (rows) => Object.fromEntries(keys.map((k) => [k, pick(rows, k)]));
  return { game: of([...tagged("away"), ...tagged("home")]), away: of(tagged("away")), home: of(tagged("home")) };
}

/** Display helpers (pure). DNP / not-simulated never render a number. */
export const fmtBoxMinutes = (m) => (m == null ? "" : Number.isInteger(m) ? String(m) : m.toFixed(2));
export const NOT_SIMULATED_REASON = Object.freeze({
  out: "ruled Out on the injury report",
  "insufficient-history": "no usable game history",
  "no-expected-minutes": "no expected minutes",
});
