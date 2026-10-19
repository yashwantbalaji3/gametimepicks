/**
 * NBA OPENING-NIGHT ACCEPTANCE (NBA-2026-OPENING · NBA-12) — PURE, read-only, no I/O.
 *
 * One function turns the committed artifacts (schedule capture, roster capture, injuries snapshot, each family's
 * forecast file for the date, the finals record) and an instant into a list of checks, each
 *   { id, area, subject, state: PASS | FAIL | PENDING | NOT_APPLICABLE, detail, evidence }.
 * PENDING means "not due yet at `now`" (a forecast before its window, a final before tip + grace), never a soft
 * pass: the report's verdict is READY only when nothing FAILs, and COMPLETE only when nothing is PENDING either.
 *
 * Nothing here decides what is public. The public guard (P1) only checks that the built /nba page still says
 * what the registry allows (schedule and finals, no forecast) — the preregistration keeps NBA HISTORICAL_ONLY.
 */

export const ACCEPTANCE_VERSION = "nba-opening-acceptance@1";
export const STATES = Object.freeze({ PASS: "PASS", FAIL: "FAIL", PENDING: "PENDING", NOT_APPLICABLE: "NOT_APPLICABLE" });

/** The three opening-night games as announced (ESPN ids from the scoreboard, season 2027 type 2). */
export const OPENING_NIGHT_2026 = Object.freeze([
  Object.freeze({ providerEventId: "401909088", away: "BOS", home: "DET", dateUtc: "2026-10-20T19:00Z" }),
  Object.freeze({ providerEventId: "401909089", away: "PHI", home: "NY", dateUtc: "2026-10-20T23:00Z" }),
  Object.freeze({ providerEventId: "401909090", away: "OKC", home: "SA", dateUtc: "2026-10-21T01:30Z" }),
]);

/** Forecast families the window builds (v1 only when its directory exists — it is a candidate, never assumed). */
export const FAMILY_DIRS = Object.freeze({ "v0": "experimental", "v0.1": "experimental-v0.1", "v0.2": "experimental-v0.2", "v1": "experimental-v1" });
export const FORECAST_HORIZON_HOURS = 8;
/** A forecast still missing this long after its window opened is a FAIL, not PENDING (hourly cron + watchdog ticks). */
export const FORECAST_GRACE_HOURS = 3;
/** nba-results-refresh is hourly (+ 00–07Z dense); a final is expected this long after tip. */
export const FINAL_EXPECTED_AFTER_TIP_HOURS = 4;
export const ROSTER_MAX_AGE_HOURS = 48;
export const ROSTER_SIZE = Object.freeze({ min: 13, max: 18 });
/** Plausible team-score medians. A 0 (the v0.2 cold-start failure) or a runaway value FAILs. */
export const SANE_TEAM_P50 = Object.freeze({ min: 80, max: 150 });
export const MIN_PLAYERS_PER_SIDE = 7;

const H = 3600000;
const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / H;
const check = (id, area, subject, state, detail, evidence = null) => ({ id, area, subject, state, detail, evidence });

function scheduleChecks(schedule, now) {
  const out = [];
  const rows = Array.isArray(schedule?.rows) ? schedule.rows : [];
  const age = schedule?.generatedAt ? hoursBetween(schedule.generatedAt, now) : null;
  out.push(check("S0", "schedule", "capture freshness", age != null && age >= 0 && age <= 36 ? STATES.PASS : STATES.FAIL,
    age == null ? "schedule capture has no generatedAt" : `captured ${age.toFixed(1)} h before now (≤ 36 h)`, { generatedAt: schedule?.generatedAt ?? null }));
  for (const g of OPENING_NIGHT_2026) {
    const hits = rows.filter((r) => String(r.providerEventId) === g.providerEventId);
    const r = hits[0];
    const problems = [];
    if (hits.length !== 1) problems.push(`${hits.length} rows (expected exactly 1)`);
    if (r) {
      if (r.seasonType !== 2) problems.push(`seasonType ${r.seasonType} (expected 2, regular season)`);
      if (r.dateUtc !== g.dateUtc) problems.push(`dateUtc ${r.dateUtc} (expected ${g.dateUtc})`);
      if (r.home?.abbr !== g.home || r.away?.abbr !== g.away) problems.push(`teams ${r.away?.abbr} @ ${r.home?.abbr} (expected ${g.away} @ ${g.home})`);
    }
    out.push(check("S1", "schedule", `${g.away} @ ${g.home} (${g.providerEventId})`, problems.length ? STATES.FAIL : STATES.PASS,
      problems.length ? problems.join("; ") : `scheduled ${g.dateUtc}, regular season, teams match`, r ? { statusRaw: r.statusRaw, capturedAt: r.capturedAt ?? null } : null));
  }
  const ids = rows.filter((r) => String(r.dateUtc ?? "").startsWith("2026-10-2")).map((r) => String(r.providerEventId));
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  out.push(check("S2", "schedule", "no duplicate events (10-20…10-29)", dupes.length ? STATES.FAIL : STATES.PASS,
    dupes.length ? `duplicate ids: ${dupes.join(", ")}` : `${ids.length} rows, all ids unique`));
  return out;
}

function rosterChecks(rosters, injuries, now) {
  const out = [];
  const asOf = rosters?.asOf ?? rosters?.capturedAt ?? null;
  const age = asOf ? hoursBetween(asOf, now) : null;
  const lastTip = OPENING_NIGHT_2026[OPENING_NIGHT_2026.length - 1].dateUtc;
  // The gate reads the roster at each forecast instant (tip − 8 h at the latest relevant build), not at `now`.
  const ageAtLastBuild = asOf ? hoursBetween(asOf, new Date(Date.parse(lastTip) - FORECAST_HORIZON_HOURS * H).toISOString()) : null;
  out.push(check("R0", "roster", "roster capture age", age == null ? STATES.FAIL : age < 0 ? STATES.FAIL : age <= ROSTER_MAX_AGE_HOURS ? STATES.PASS : STATES.FAIL,
    age == null ? "no roster capture" : `${age.toFixed(1)} h old at now; ${ageAtLastBuild.toFixed(1)} h at the last opening-night build window (gate ${ROSTER_MAX_AGE_HOURS} h; the forecast window re-captures past 30 h)`,
    { asOf, teams: rosters?.teams?.length ?? null }));
  const teams = Array.isArray(rosters?.teams) ? rosters.teams : [];
  out.push(check("R1", "roster", "30 teams captured", teams.length === 30 && teams.every((t) => (t.playerCount ?? t.players?.length ?? 0) > 0) ? STATES.PASS : STATES.FAIL,
    `${teams.length} teams; ${teams.filter((t) => !(t.playerCount ?? t.players?.length)).length} empty/missing`));
  const want = new Set(OPENING_NIGHT_2026.flatMap((g) => [g.home, g.away]));
  for (const abbr of want) {
    const t = teams.find((x) => (x.espnAbbr ?? x.abbr ?? x.abbreviation) === abbr);
    const n = t ? (t.playerCount ?? t.players?.length ?? 0) : 0;
    out.push(check("R2", "roster", `${abbr} roster size`, t && n >= ROSTER_SIZE.min && n <= ROSTER_SIZE.max ? STATES.PASS : STATES.FAIL,
      t ? `${n} players (expected ${ROSTER_SIZE.min}–${ROSTER_SIZE.max})` : "team not in capture"));
  }
  const injAt = injuries?.generatedAt ?? injuries?.sourceAsOf ?? null;
  const injAge = injAt ? hoursBetween(injAt, now) : null;
  out.push(check("R3", "roster", "injuries snapshot present", injAge != null && injAge >= 0 ? STATES.PASS : STATES.FAIL,
    injAge == null ? "no injuries snapshot" : `${injAge.toFixed(1)} h old (each forecast re-captures it at its own instant)`, { generatedAt: injAt }));
  return out;
}

function sidePlayers(fc, side) {
  const p = fc?.players?.[side];
  return Array.isArray(p) ? p : [];
}

function forecastChecks(forecastsByFamily, now) {
  const out = [];
  for (const [family, doc] of Object.entries(forecastsByFamily)) {
    if (doc === undefined) continue; // family directory absent → not armed, not checked
    const games = Array.isArray(doc?.games) ? doc.games : [];
    for (const g of OPENING_NIGHT_2026) {
      const subject = `${family} · ${g.away} @ ${g.home}`;
      const owedFrom = Date.parse(g.dateUtc) - FORECAST_HORIZON_HOURS * H;
      const hit = games.find((x) => String(x.providerEventId) === g.providerEventId);
      if (!hit) {
        const t = Date.parse(now);
        const state = t < owedFrom + FORECAST_GRACE_HOURS * H && t < Date.parse(g.dateUtc) ? STATES.PENDING : STATES.FAIL;
        out.push(check("F1", "forecast", subject, state,
          state === STATES.PENDING ? `owed from ${new Date(owedFrom).toISOString().slice(0, 16)}Z; not built yet` : "no pre-tip forecast — the game can never enter this family's shadow"));
        continue;
      }
      const rc = hit.receipt ?? {};
      const preTip = rc.preTip === true && Date.parse(rc.generatedAt ?? "") < Date.parse(g.dateUtc);
      out.push(check("F1", "forecast", subject, preTip ? STATES.PASS : STATES.FAIL,
        preTip ? `built ${rc.generatedAt}, ${(hoursBetween(rc.generatedAt, g.dateUtc)).toFixed(1)} h before tip` : `receipt not pre-tip (preTip ${rc.preTip}, generatedAt ${rc.generatedAt})`,
        { modelVersion: rc.modelVersion ?? hit.forecast?.modelVersion ?? null, receiptSchema: rc.schema ?? null }));
      const fc = hit.forecast ?? {};
      const h50 = fc.sim?.home?.p50, a50 = fc.sim?.away?.p50;
      const nh = sidePlayers(fc, "home").length, na = sidePlayers(fc, "away").length;
      const problems = [];
      for (const [k, v] of [["home", h50], ["away", a50]]) {
        if (!Number.isFinite(v) || v < SANE_TEAM_P50.min || v > SANE_TEAM_P50.max) problems.push(`${k} p50 ${v}`);
      }
      if (nh < MIN_PLAYERS_PER_SIDE || na < MIN_PLAYERS_PER_SIDE) problems.push(`players ${nh}/${na} (< ${MIN_PLAYERS_PER_SIDE})`);
      out.push(check("F2", "forecast", subject, problems.length ? STATES.FAIL : STATES.PASS,
        problems.length ? `implausible forecast: ${problems.join("; ")}` : `team p50 ${a50}–${h50} (away–home), ${na}/${nh} players`,
        { pHome: fc.sim?.pHome ?? null, eloPHome: fc.elo?.pHome ?? null }));
    }
  }
  return out;
}

function finalsChecks(finals, now) {
  const out = [];
  const rows = Array.isArray(finals?.finals) ? finals.finals : [];
  out.push(check("L0", "results", "finals record season", finals?.season === "2026-27" ? STATES.PASS : STATES.FAIL, `season ${finals?.season ?? "missing"}`));
  for (const g of OPENING_NIGHT_2026) {
    const hit = rows.find((r) => String(r.providerEventId) === g.providerEventId);
    const due = Date.parse(g.dateUtc) + FINAL_EXPECTED_AFTER_TIP_HOURS * H;
    let state;
    if (hit) state = hit.seasonType === 2 ? STATES.PASS : STATES.FAIL;
    else state = Date.parse(now) < due ? STATES.PENDING : STATES.FAIL;
    out.push(check("L1", "results", `${g.away} @ ${g.home} final`, state,
      hit ? `final ${g.away} ${hit.ftAway} – ${g.home} ${hit.ftHome}${hit.seasonType === 2 ? "" : ` (seasonType ${hit.seasonType}!)`}` : state === STATES.PENDING ? `expected by ${new Date(due).toISOString().slice(0, 16)}Z` : "no final recorded (pending is never a loss — but the refresh is late)",
      hit ? { recordedAt: hit.firstRecordedAt ?? hit.recordedAt ?? null } : null));
  }
  const conflicts = (finals?.conflicts ?? []).filter((c) => OPENING_NIGHT_2026.some((g) => String(c.providerEventId) === g.providerEventId));
  out.push(check("L2", "results", "no opening-night finals under review", conflicts.length ? STATES.FAIL : STATES.PASS, conflicts.length ? `${conflicts.length} conflict(s) — surfaced, never overwritten` : "none"));
  return out;
}

/** The built /nba page must still be schedule + finals only (registry HISTORICAL_ONLY). `html` null → not checked. */
function publicChecks(html) {
  if (html == null) return [check("P1", "public", "/nba page guard", STATES.NOT_APPLICABLE, "no built export passed (--out)")];
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  const problems = [];
  if (/\d+(\.\d+)?\s?%/.test(text)) problems.push("a percentage is rendered");
  if (/\b(pick|lean|edge|projection)s?\b/i.test(text) && !/no public forecast/i.test(text)) problems.push("forecast vocabulary without the no-forecast notice");
  return [check("P1", "public", "/nba page guard", problems.length ? STATES.FAIL : STATES.PASS, problems.length ? problems.join("; ") : "schedule/finals only — no probability or pick rendered")];
}

/**
 * @param {object} a
 * @param {string} a.now ISO instant
 * @param {object} a.schedule app/public/data/nba/schedule/latest.json
 * @param {object} a.rosters data/internal/research/nba/rosters/latest.json
 * @param {object|null} a.injuries data/internal/research/injuries/nba/latest.json
 * @param {Record<string, object|null|undefined>} a.forecastsByFamily family → forecast doc for 2026-10-20 (null = dir exists, file missing; undefined = family not armed)
 * @param {object} a.finals app/public/data/nba/results/finals-2026-27.json
 * @param {string|null} [a.nbaHtml] built out/nba/index.html
 */
export function evaluateOpeningNight({ now, schedule, rosters, injuries, forecastsByFamily, finals, nbaHtml = null }) {
  if (!Number.isFinite(Date.parse(now ?? ""))) throw new Error("evaluateOpeningNight: now must be an ISO instant");
  const checks = [
    ...scheduleChecks(schedule, now),
    ...rosterChecks(rosters, injuries, now),
    ...forecastChecks(forecastsByFamily ?? {}, now),
    ...finalsChecks(finals, now),
    ...publicChecks(nbaHtml),
  ];
  const count = (s) => checks.filter((c) => c.state === s).length;
  const summary = { pass: count(STATES.PASS), fail: count(STATES.FAIL), pending: count(STATES.PENDING), notApplicable: count(STATES.NOT_APPLICABLE) };
  const verdict = summary.fail > 0 ? "NOT_READY" : summary.pending > 0 ? "READY_SO_FAR" : "COMPLETE";
  return { version: ACCEPTANCE_VERSION, now, verdict, summary, checks };
}

export function renderMarkdown(report) {
  const lines = [`# NBA opening night — acceptance at ${report.now}`, "", `**Verdict:** ${report.verdict} · ${report.summary.pass} pass · ${report.summary.fail} fail · ${report.summary.pending} pending · ${report.summary.notApplicable} n/a`, "", "| Id | Area | Subject | State | Detail |", "|---|---|---|---|---|"];
  for (const c of report.checks) lines.push(`| ${c.id} | ${c.area} | ${c.subject} | ${c.state} | ${String(c.detail).replace(/\|/g, "\\|")} |`);
  return lines.join("\n") + "\n";
}
