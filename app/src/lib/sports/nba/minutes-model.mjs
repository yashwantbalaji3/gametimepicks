/**
 * NBA expected-minutes model (NBA readiness track N2) — PURE, deterministic, no I/O.
 * NBA PRESEASON — EXPERIMENTAL · dataClass PRIVATE_RESEARCH · productEligible: false.
 *
 * Expected minutes is a FIRST-CLASS model with its own error tracking (graded separately from
 * production in the experimental ledger). For one team and one as-of instant it reads the
 * box-score corpus and answers, per player who appeared for that team:
 *
 *   expectedMinutes  mean minutes over the trailing-10 team games (basis "trailing10"), falling
 *                    back to the player's whole most-recent season (basis "season"), else
 *                    "insufficient" (fewer than 3 appearances anywhere in the season window)
 *   starterRate      share of the player's appearances (in the same window) as a starter
 *   rates            per-minute pts / reb / ast / threePm over the same window — null when
 *                    gamesUsed < 3 (a two-game rate is noise wearing a decimal point)
 *
 * NEVER ZERO-FILL: `didNotPlay` rows and null-minute rows are EXCLUDED from every mean and
 * counted separately (dnpCount, nullMinutesCount). A player whose every row is a DNP has
 * expectedMinutes null, not 0.
 *
 * POPULATIONS ARE SEPARATE: `population` selects preseason (phase 1) or regular (phase !== 1)
 * box scores. A preseason forecast is built from preseason minutes; the two are never pooled.
 *
 * Availability comes ONLY from the injuries feed passed in: an entry whose status contains "Out"
 * marks the player "out" with expectedMinutes null. No feed → "unknown" for everyone (unknown is
 * not "active").
 */

export const MINUTES_MODEL_VERSION = "nba-minutes-model-v0";
export const TRAILING_N = 10;
export const MIN_GAMES_FOR_RATES = 3;
export const STAT_KEYS = Object.freeze(["pts", "reb", "ast", "threePm"]);

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const sampleSd = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};
const r3 = (x) => (x == null ? null : Number(x.toFixed(3)));

/** Availability from the injuries feed: "out" when status contains "Out" (case-insensitive). */
export function availabilityFromInjuries(injuries, teamProviderId, providerAthleteId) {
  if (!Array.isArray(injuries)) return { availability: "unknown", injuryStatus: null };
  const hit = injuries.find((e) => String(e?.athleteId) === String(providerAthleteId) && (e?.providerTeamId == null || String(e.providerTeamId) === String(teamProviderId)));
  if (!hit) return { availability: "active", injuryStatus: null };
  const status = typeof hit.status === "string" ? hit.status : null;
  return { availability: /out/i.test(status ?? "") ? "out" : "active", injuryStatus: status };
}

/** Team games (box-score docs) for one team in one population, strictly before asOf, newest first. */
export function teamGames(boxscores, teamProviderId, asOfDateUtc, population = "regular") {
  const cutoff = Date.parse(asOfDateUtc);
  const wantPre = population === "preseason";
  return (Array.isArray(boxscores) ? boxscores : [])
    .filter((d) => d?.boxscoreAvailable && typeof d.dateUtc === "string" && Date.parse(d.dateUtc) < cutoff)
    .filter((d) => (d.phase === 1) === wantPre)
    .filter((d) => (d.teams ?? []).some((t) => String(t.providerTeamId) === String(teamProviderId)))
    .sort((a, b) => Date.parse(b.dateUtc) - Date.parse(a.dateUtc) || String(b.providerEventId).localeCompare(String(a.providerEventId)));
}

function summarise(appearances) {
  const mins = appearances.map((a) => a.minutes);
  const out = {
    expectedMinutes: r3(mean(mins)),
    minutesSd: r3(sampleSd(mins)),
    starterRate: appearances.length ? r3(appearances.filter((a) => a.starter).length / appearances.length) : null,
    gamesUsed: appearances.length,
    rates: null,
    rateSd: null,
  };
  if (appearances.length >= MIN_GAMES_FOR_RATES) {
    out.rates = {}; out.rateSd = {};
    for (const k of STAT_KEYS) {
      const rows = appearances.filter((a) => Number.isInteger(a[k]) && a.minutes > 0);
      if (rows.length < MIN_GAMES_FOR_RATES) { out.rates[k] = null; out.rateSd[k] = null; continue; }
      const totalStat = rows.reduce((s, a) => s + a[k], 0);
      const totalMin = rows.reduce((s, a) => s + a.minutes, 0);
      out.rates[k] = r3(totalStat / totalMin); // minutes-weighted rate
      out.rateSd[k] = r3(sampleSd(rows.map((a) => a[k] / a.minutes)));
    }
  }
  return out;
}

/**
 * @param boxscores       array of box-score docs (the corpus, or any subset)
 * @param teamProviderId  ESPN team id (string)
 * @param asOfDateUtc     ISO instant — only games strictly earlier count
 * @param injuries        injuries feed entries[] (null → availability "unknown")
 * @param population      "regular" | "preseason"
 * @param trailingN       window length in TEAM games (default 10)
 */
export function expectedMinutes({ boxscores, teamProviderId, asOfDateUtc, injuries = null, population = "regular", trailingN = TRAILING_N }) {
  if (typeof asOfDateUtc !== "string" || !Number.isFinite(Date.parse(asOfDateUtc))) throw new Error("expectedMinutes: asOfDateUtc (ISO) is required");
  if (population !== "regular" && population !== "preseason") throw new Error(`expectedMinutes: unknown population ${population}`);
  const games = teamGames(boxscores, teamProviderId, asOfDateUtc, population);
  const seasonUsed = games.length ? games[0].season : null;
  const seasonGames = games.filter((g) => g.season === seasonUsed);
  const window = seasonGames.slice(0, trailingN);
  const windowIds = new Set(window.map((g) => String(g.providerEventId)));

  const byPlayer = new Map();
  for (const g of seasonGames) {
    for (const p of g.players ?? []) {
      if (String(p.providerTeamId) !== String(teamProviderId) || p.providerAthleteId == null) continue;
      const id = String(p.providerAthleteId);
      let rec = byPlayer.get(id);
      if (!rec) { rec = { providerAthleteId: id, name: p.name ?? null, appearancesSeason: [], appearancesWindow: [], dnpCount: 0, nullMinutesCount: 0, lastSeenDateUtc: g.dateUtc, dnpReasons: {} }; byPlayer.set(id, rec); }
      if (rec.name == null && p.name) rec.name = p.name;
      if (p.didNotPlay) { rec.dnpCount += 1; if (p.dnpReason) rec.dnpReasons[p.dnpReason] = (rec.dnpReasons[p.dnpReason] ?? 0) + 1; continue; }
      if (!Number.isInteger(p.minutes)) { rec.nullMinutesCount += 1; continue; }
      const app = { minutes: p.minutes, starter: p.starter === true, pts: p.pts, reb: p.reb, ast: p.ast, threePm: p.threePm };
      rec.appearancesSeason.push(app);
      if (windowIds.has(String(g.providerEventId))) rec.appearancesWindow.push(app);
    }
  }

  const rows = [];
  for (const rec of byPlayer.values()) {
    let basis, s;
    if (rec.appearancesWindow.length >= MIN_GAMES_FOR_RATES) { basis = "trailing10"; s = summarise(rec.appearancesWindow); }
    else if (rec.appearancesSeason.length >= MIN_GAMES_FOR_RATES) { basis = "season"; s = summarise(rec.appearancesSeason); }
    else { basis = "insufficient"; s = summarise(rec.appearancesSeason); }
    const avail = availabilityFromInjuries(injuries, teamProviderId, rec.providerAthleteId);
    rows.push({
      providerAthleteId: rec.providerAthleteId,
      name: rec.name,
      expectedMinutes: avail.availability === "out" ? null : s.expectedMinutes,
      minutesSd: avail.availability === "out" ? null : s.minutesSd,
      starterRate: s.starterRate,
      gamesUsed: s.gamesUsed,
      dnpCount: rec.dnpCount,
      nullMinutesCount: rec.nullMinutesCount,
      basis,
      availability: avail.availability,
      injuryStatus: avail.injuryStatus,
      rates: s.rates,
      rateSd: s.rateSd,
      lastSeenDateUtc: rec.lastSeenDateUtc,
    });
  }
  rows.sort((a, b) => (b.expectedMinutes ?? -1) - (a.expectedMinutes ?? -1) || a.providerAthleteId.localeCompare(b.providerAthleteId));

  const known = new Set(rows.map((r) => r.providerAthleteId));
  const unmatchedInjuries = (Array.isArray(injuries) ? injuries : [])
    .filter((e) => String(e?.providerTeamId) === String(teamProviderId) && !known.has(String(e?.athleteId)))
    .map((e) => ({ athleteId: String(e.athleteId), athleteName: e.athleteName ?? null, status: e.status ?? null }));

  return {
    modelVersion: MINUTES_MODEL_VERSION,
    teamProviderId: String(teamProviderId),
    asOfDateUtc,
    population,
    trailingN,
    seasonUsed,
    teamGamesInSeason: seasonGames.length,
    teamGamesInWindow: window.length,
    windowFromDateUtc: window.length ? window[window.length - 1].dateUtc : null,
    windowToDateUtc: window.length ? window[0].dateUtc : null,
    injuriesProvided: Array.isArray(injuries),
    rows,
    unmatchedInjuries,
  };
}
