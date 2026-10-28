/**
 * SOCIAL GRAPHICS V2 · VERIFIED VIEW-MODELS — what the nfl-social@2 templates may show, built only from GameTimePicks
 * records at one pinned data commit. Prototype (founder review pending); not wired into the daily queue.
 *
 * Founder content decision (2026-10-28): social graphics show the final score, the official pregame predicted winner and
 * its win probability, the top three anytime-touchdown candidates, and those candidates' graded results. They do NOT show
 * projected scores, projected totals or ranges (those stay on the site and in the evidence). Misses are never hidden.
 *
 *   pregameWinner   Format A  the latest frozen version before `now` (recap/freeze-verifier.mjs); labelled as the latest
 *                             published pregame forecast, never as the forecast of record
 *   touchdowns      Format B  top three of the event's published anytime-TD population, by probability:
 *                             mode "pregame" — the player board at the commit (participation from its injury capture);
 *                             mode "record"  — the Forecast Ledger's forecasts of record (published before kickoff)
 *   postgame        Format C  integrity-gated recap facts (recap/fact-bundle-nfl.mjs) + the TD record section
 *
 * Every model carries `evidence` (file@commit + sha256 + ids) for the Command Center, never for the graphic.
 */
import { createHash } from "node:crypto";
import { nflTeamColor } from "../../app/src/lib/simulation-theater/nfl-team-colors.mjs";
import { candidateFor } from "./pipeline.mjs";
import { runIntegrityGate } from "./integrity-gate.mjs";
import { buildFactBundle, claimOf, etDisplay } from "./fact-bundle-nfl.mjs";
import { nflVersions, siteForecast } from "./freeze-verifier.mjs";

export const SOCIAL_V2_SPEC = "nfl-social@2";
const LEDGER = "data/internal/forecast-ledger/v1/nfl.jsonl";
const BOARD = (id) => `app/public/data/nfl/player-board/${id}.json`;
const sha = (s) => createHash("sha256").update(s).digest("hex");
/** The site's own formatter (app/src/app/nfl/game/[eventId]/page.tsx and friends): a post shows what the site shows. */
const pct = (p) => `${(p * 100).toFixed(1)}%`;
/** Participation states that keep a player off a "top three" graphic; QUESTIONABLE is shown, flagged, and needs review. */
const EXCLUDED = new Set(["OUT", "DOUBTFUL", "INACTIVE", "IR", "SUSPENDED", "PUP", "NOT_ON_ROSTER", "RELEASED"]);
const ET = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", ...opts });
const kickoffLine = (iso) => `${ET({ weekday: "short", month: "short", day: "numeric" }).format(new Date(iso))} · ${ET({ hour: "numeric", minute: "2-digit" }).format(new Date(iso))} ET`;

/**
 * The winner label (founder 2026-10-28): "Predicted Winner" when the published side is at least 50%; "Most Likely Winner"
 * when it is under 50% but still the single most likely outcome (above the opponent AND the tie share); null when the
 * published side is not the top outcome — then no graphic is made. The probability itself is never altered.
 */
export function winnerLabelOf({ side, home, away, tieMass }) {
  const p = side === "home" ? home : away;
  const other = side === "home" ? away : home;
  if (![p, other].every(Number.isFinite)) return null;
  if (p >= 0.5) return "Predicted Winner";
  return p > other && p > (Number.isFinite(tieMass) ? tieMass : 0) ? "Most Likely Winner" : null;
}

/** A team as the graphic shows it: verified colours (nfl-team-colors.mjs, evidence-backed) and its own name. */
export function teamOf(abbr, name) {
  const c = nflTeamColor(abbr);
  if (!c) throw new Error(`no verified colour record for ${abbr}`);
  const words = String(name).split(" ");
  // primary + ink for the team's own slab; accent (the record's vivid colour — Steelers gold, not black) for the light
  return { abbr, name, city: words.slice(0, -1).join(" "), nickname: words.at(-1), color: c.primary, ink: c.ink, accent: c.accent };
}

function readLedger(src) {
  const raw = src.read(LEDGER);
  if (raw == null) throw new Error(`${LEDGER} missing at ${src.label}`);
  return { rows: raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)), sha256: sha(raw) };
}
const outcomeOf = (r) => {
  const s = r.settlement ?? {};
  if (s.state === "VOID") return "void";
  if (s.state !== "SETTLED" || s.finality !== "CANONICAL") return "pending";
  if (["YES", "SCORED"].includes(s.finalCategory)) return "hit";
  if (["NO", "DID_NOT_SCORE"].includes(s.finalCategory)) return "miss";
  return "unknown";
};

/** Format A. */
export function pregameWinner({ src, eventId, now }) {
  const versions = nflVersions(src, eventId);
  const kickoff = versions.at(-1)?.kickoffUtc;
  if (!kickoff) return { ok: false, reason: `no forecast versions for ${eventId}` };
  const frozen = versions.filter((v) => Date.parse(v.frozenAt) <= Date.parse(now) && Date.parse(v.frozenAt) < Date.parse(kickoff));
  const v = frozen.at(-1);
  if (!v) return { ok: false, reason: "nothing frozen yet" };
  if (!v.numbers.side) return { ok: false, reason: "the frozen version publishes no side" };
  const r = v.receipt;
  const site = siteForecast(src, eventId);
  const away = teamOf(r.away.abbr, r.away.name);
  const home = teamOf(r.home.abbr, r.home.name);
  const fav = v.numbers.side === "home" ? home : away;
  const afterKickoff = Date.parse(now) >= Date.parse(kickoff);
  const wp = r.forecastSummary?.winProbability ?? {};
  const winnerLabel = winnerLabelOf({ side: v.numbers.side, home: wp.home, away: wp.away, tieMass: wp.tieMass });
  if (!winnerLabel) return { ok: false, reason: `the published side (${pct(v.numbers.sideProbability)}) is not the most likely outcome: refusing a winner graphic` };
  return {
    ok: true, format: "pregame-winner", spec: SOCIAL_V2_SPEC, eventId,
    away, home, favoured: v.numbers.side, favouredTeam: fav, winnerLabel,
    winProbability: v.numbers.sideProbability, winProbabilityDisplay: v.numbers.sideProbabilityDisplay,
    week: r.week ?? null, kickoff, kickoffLine: kickoffLine(kickoff), frozenAt: v.frozenAt, frozenLine: etDisplay(v.frozenAt),
    kickoffDay: ET({ weekday: "long" }).format(new Date(kickoff)), kickoffTime: `${ET({ hour: "numeric", minute: "2-digit" }).format(new Date(kickoff))} ET`,
    venue: typeof r.venue === "string" ? r.venue : r.venue?.name ?? null,
    frozenShort: ET({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(v.frozenAt)).replace(" at ", ", "),
    stamp: afterKickoff ? "Final pregame forecast" : "Latest published pregame forecast",
    stampShort: afterKickoff ? "Final pregame version" : "Latest published",
    status: afterKickoff ? "HISTORICAL_SAMPLE" : site && site.numbers.sideProbabilityDisplay === v.numbers.sideProbabilityDisplay ? "MATCHES_SITE" : "SITE_DIFFERS",
    evidence: [{ label: "frozen version", ref: `${v.path}@${src.commit?.slice(0, 12)}`, sha256: v.sha256 }, ...(site ? [{ label: "site file", ref: site.path, sha256: site.sha256 }] : [])],
  };
}

/** Format B. */
/** showResults: draw each candidate's graded result (record mode only); false renders the list exactly as published pregame. */
export function touchdowns({ src, eventId, mode, now = null, showResults = mode === "record" }) {
  let pop = [];
  let meta;
  if (mode === "pregame") {
    const raw = src.read(BOARD(eventId));
    if (raw == null) return { ok: false, reason: `no player board for ${eventId}` };
    const b = JSON.parse(raw);
    if (now && Date.parse(now) >= Date.parse(b.kickoffUtc)) return { ok: false, reason: "kickoff has passed: a pregame touchdown graphic would be stale" };
    const fam = b.families?.anytime_td;
    if (fam?.state !== "PUBLISHED") return { ok: false, reason: `anytime TD is ${fam?.state ?? "missing"} on this board` };
    pop = b.players.filter((p) => p.markets?.anytime_td?.probability != null).map((p) => ({
      name: p.name, team: p.team, participation: p.participation ?? "UNKNOWN", probability: p.markets.anytime_td.probability, id: p.playerId ?? p.name,
    }));
    meta = { kickoff: b.kickoffUtc, week: b.week ?? null, matchup: b.matchup, frozenAt: b.generatedAt, basis: fam.basis, availability: b.availability ?? null,
      evidence: [{ label: "player board", ref: `${BOARD(eventId)}@${src.commit?.slice(0, 12)}`, sha256: sha(raw) }] };
  } else {
    const { rows, sha256 } = readLedger(src);
    const all = rows.filter((r) => r.family === "anytime_td" && String(r.eventId) === String(eventId));
    pop = all.filter((r) => r.publicationStatus === "PUBLISHED" && !r.withdrawal && r.publishedAt && Date.parse(r.publishedAt) < Date.parse(r.eventStart))
      .map((r) => ({ name: r.subjectDisplay, team: r.teamId, participation: "PUBLISHED_PREGAME", probability: r.probability, id: r.forecastId, outcome: outcomeOf(r), publishedAt: r.publishedAt }));
    if (!pop.length) return { ok: false, reason: `no anytime-TD forecast of record published before kickoff for ${eventId}` };
    meta = { kickoff: all[0].eventStart, week: nflVersions(src, eventId).at(-1)?.receipt?.week ?? null, matchup: all[0].matchup, frozenAt: pop.map((p) => p.publishedAt).sort().at(-1),
      evidence: [{ label: "Forecast Ledger", ref: `${LEDGER}@${src.commit?.slice(0, 12)}`, sha256 }], excluded: all.length - pop.length };
  }
  const eligible = pop.filter((p) => !EXCLUDED.has(String(p.participation).toUpperCase()));
  eligible.sort((a, b) => b.probability - a.probability || String(a.id).localeCompare(String(b.id)));
  const top = eligible.slice(0, 3);
  // A tie at the cut means "top three" is not well defined: refuse rather than choose.
  if (eligible.length > 3 && eligible[2].probability === eligible[3].probability) return { ok: false, reason: `tie at rank 3 (${pct(eligible[2].probability)})` };
  if (!top.length) return { ok: false, reason: "no eligible candidate" };
  const [awayAbbr, homeAbbr] = String(meta.matchup).split(" @ ");
  const flags = top.filter((p) => String(p.participation).toUpperCase() === "QUESTIONABLE").map((p) => `${p.name} is QUESTIONABLE`);
  return {
    ok: true, format: "touchdowns", spec: SOCIAL_V2_SPEC, eventId, mode, showResults: mode === "record" && showResults,
    away: teamOf(awayAbbr, awayAbbr), home: teamOf(homeAbbr, homeAbbr),
    kickoff: meta.kickoff, kickoffLine: kickoffLine(meta.kickoff), week: meta.week, frozenAt: meta.frozenAt, frozenLine: etDisplay(meta.frozenAt),
    candidates: top.map((p, i) => {
      const c = nflTeamColor(p.team);
      const parts = String(p.name).split(" ");
      const suffix = /^(Jr\.?|Sr\.?|II|III|IV)$/i.test(parts.at(-1)) ? parts.pop() : null;
      return { rank: i + 1, name: p.name, first: parts.slice(0, -1).join(" "), last: `${parts.at(-1)}${suffix ? ` ${suffix}` : ""}`, team: p.team,
        color: c?.primary ?? "#3A3F4B", ink: c?.ink ?? "#FFFFFF", accent: c?.accent ?? c?.primary ?? "#3A3F4B", probability: p.probability, probabilityDisplay: pct(p.probability),
        participation: p.participation, outcome: p.outcome ?? null, id: p.id };
    }),
    populationSize: pop.length, eligibleSize: eligible.length,
    status: flags.length ? "NEEDS_VERIFICATION" : "READY", reasons: flags,
    basis: meta.basis ?? null, evidence: meta.evidence,
  };
}

/** Format C. */
export function postgame({ src, eventId, label }) {
  const { candidate } = candidateFor(eventId, { src });
  const verdict = runIntegrityGate(candidate);
  if (!verdict.pass) return { ok: false, reason: verdict.refusals.map((r) => `${r.code} ${r.detail}`).join("; ") };
  const { bundle } = buildFactBundle(candidate, { label });
  const d = (k) => claimOf(bundle, k);
  const away = teamOf(bundle.teams.away.abbr, bundle.teams.away.name);
  const home = teamOf(bundle.teams.home.abbr, bundle.teams.home.name);
  const fav = bundle.favouredSide === "home" ? home : away;
  const result = d("result.side").value;
  const wp = candidate.receipt?.forecastSummary?.winProbability ?? {};
  const winnerLabel = winnerLabelOf({ side: bundle.favouredSide, home: wp.home, away: wp.away, tieMass: wp.tieMass });
  if (!winnerLabel) return { ok: false, reason: "the published side was not the most likely outcome: refusing a winner graphic" };
  const td = touchdowns({ src, eventId, mode: "record" });
  let tdSection = null;
  if (td.ok) {
    const decided = td.candidates.filter((c) => c.outcome === "hit" || c.outcome === "miss");
    // Only a fully graded list is summarised as "N of 3"; anything pending/void/unknown is shown as such, never as a miss.
    tdSection = { candidates: td.candidates, hits: decided.filter((c) => c.outcome === "hit").length, decided: decided.length, shown: td.candidates.length,
      complete: decided.length === td.candidates.length, evidence: td.evidence };
  }
  return {
    ok: true, format: "postgame", spec: SOCIAL_V2_SPEC, eventId,
    away, home, finalAway: d("final.away").value, finalHome: d("final.home").value,
    winner: d("final.home").value > d("final.away").value ? "home" : d("final.away").value > d("final.home").value ? "away" : "tie",
    favoured: bundle.favouredSide, favouredTeam: fav, winnerLabel, winProbabilityDisplay: d("favoured.winProbability").display,
    result, frozenLine: d("frozenAt").display, week: bundle.week, td: tdSection, tdUnavailable: td.ok ? null : td.reason,
    evidence: [{ label: "Forecast Ledger", ref: `${bundle.sources.ledger.path}@${src.commit?.slice(0, 12)}`, sha256: bundle.sources.ledger.sha256 },
      { label: "receipt", ref: bundle.sources.receipt.path, sha256: bundle.sources.receipt.sha256 }, ...(td.ok ? td.evidence : [])],
    warnings: verdict.warnings,
  };
}


// ── Top 5 boards (NFL) ─────────────────────────────────────────────────────────────────────────────────────────
export const TOP_BOARDS_DIR = "app/public/data/results/top-boards";
/** Social title and unit per board family; families not on the published board are never drawn. */
export const BOARD_FAMILIES = Object.freeze({
  anytime_td: { title: "Anytime Touchdown", unit: "TD PROBABILITY", isTd: true },
  player_reception_yds: { title: "Receiving Yards", unit: "PROJECTED YDS" },
  player_receptions: { title: "Receptions", unit: "PROJECTED REC" },
  player_rush_yds: { title: "Rushing Yards", unit: "PROJECTED YDS" },
  player_pass_yds: { title: "Passing Yards", unit: "PROJECTED YDS" },
});

/** One family's frozen Top Board, exactly as published (ranks, players, values); held when the family isn't on it. */
export function topBoard({ src, date, family }) {
  const p = `${TOP_BOARDS_DIR}/${date}.json`;
  const raw = src.read(p);
  if (raw == null) return { ok: false, reason: `no frozen Top Board for ${date} at the data commit` };
  const j = JSON.parse(raw);
  const def = BOARD_FAMILIES[family];
  const board = j.boards.find((b) => b.sport === "nfl" && b.propFamily === family);
  if (!board) {
    const why = (j.ineligible ?? []).find((x) => x.propFamily === family);
    return { ok: false, held: true, reason: why ? `${def?.title ?? family} is not on the published board: ${why.state} — ${why.reason}` : `${family} is not on the ${date} board` };
  }
  const rows = board.rows.filter((r) => !EXCLUDED.has(String(r.participation).toUpperCase()));
  if (rows.length !== board.rows.length) return { ok: false, reason: "a published board row is now excluded by participation: hold for review rather than re-rank" };
  const firstKick = j.firstKickoffUtc;
  return {
    ok: true, format: "top5", spec: SOCIAL_V2_SPEC, family, date, isTd: Boolean(def.isTd), title: def.title,
    slateLine: ET({ weekday: "short", month: "short", day: "numeric" }).format(new Date(`${date}T16:00:00Z`)), week: null,
    frozenLine: etDisplay(j.publishedAt), rule: j.rule,
    note: def.isTd ? "Predicted chance to score a TD if he plays · passing TDs don't count · not a guarantee" : "Projected (median) for the game · not a guarantee",
    rows: board.rows.map((r) => {
      const c = nflTeamColor(r.team);
      const v = def.isTd ? pct(r.projection.probability) : String(r.projection.median);
      return { rank: r.rank, name: r.name, team: r.team, opponent: r.opponent, color: c?.primary ?? "#3A3F4B", ink: c?.ink ?? "#FFF", accent: c?.accent ?? "#3A3F4B",
        valueDisplay: v, unit: def.unit, participation: r.participation, kickoffShort: ET({ weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(r.kickoffUtc)), forecastId: r.forecastId };
    }),
    status: rows.some((r) => String(r.participation).toUpperCase() === "QUESTIONABLE") ? "NEEDS_VERIFICATION" : "READY",
    evidence: [{ label: "frozen Top Board", ref: `${p}@${src.commit?.slice(0, 12)}`, sha256: sha(raw) }], firstKickoffUtc: firstKick,
  };
}

// ── NBA ────────────────────────────────────────────────────────────────────────────────────────────────────────
import { nbaTeamColor, bestInk } from "../../app/src/lib/simulation-theater/nba/nba-team-colors.mjs";
import { relLuminance } from "../../app/src/lib/simulation-theater/nfl-team-colors.mjs";
import fs from "node:fs";
import { REPO_ROOT } from "../lib/util.mjs";
const NBA_COLORS = JSON.parse(fs.readFileSync(`${REPO_ROOT}/app/src/lib/simulation-theater/nba/nba-team-colors.json`, "utf8"));
export function nbaTeamOf(abbr, name) {
  const c = nbaTeamColor(NBA_COLORS, abbr);
  if (!c) throw new Error(`no verified NBA colour record for ${abbr}`);
  const words = String(name).split(" ");
  const accent = relLuminance(c.primary) < 0.03 ? c.secondary : c.primary;
  return { abbr, name, city: words.slice(0, -1).join(" "), nickname: words.at(-1), color: c.primary, ink: bestInk(NBA_COLORS, c.primary), accent };
}

/**
 * NBA pregame: the published favoured side only. The lane's Elo probability exists in the receipt but its public
 * display switch is OFF (founder 2026-10-23), so no probability is drawn; team scores are WITHHELD.
 */
export function nbaPregame({ src, eventId, date = "latest" }) {
  const p = `app/public/data/nba/experimental-public/${date}.json`;
  const raw = src.read(p);
  if (raw == null) return { ok: false, reason: `no NBA public lane file ${date}` };
  const j = JSON.parse(raw);
  const g = j.games.find((x) => String(x.providerEventId) === String(eventId));
  if (!g) return { ok: false, reason: `${eventId} not in the ${j.date} lane` };
  if (g.elo?.state !== "FAVOURED") return { ok: false, reason: `no published side (${g.elo?.state})` };
  const away = nbaTeamOf(g.away.abbr, g.away.name);
  const home = nbaTeamOf(g.home.abbr, g.home.name);
  return {
    ok: true, format: "nba-pregame", league: "NBA", spec: SOCIAL_V2_SPEC, eventId, away, home, favouredTeam: g.elo.favoured === home.abbr ? home : away, tipUtc: g.tipUtc,
    tipLine: kickoffLine(g.tipUtc), kickoffLine: kickoffLine(g.tipUtc),
    tipDay: ET({ weekday: "long" }).format(new Date(g.tipUtc)), tipTime: `${ET({ hour: "numeric", minute: "2-digit" }).format(new Date(g.tipUtc))} ET`, frozenShort: ET({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(g.frozenAt)).replace(" at ", ", "),
    evidence: [{ label: "NBA public lane", ref: `${p}@${src.commit?.slice(0, 12)}`, sha256: sha(raw) }],
  };
}

export function nbaFinal({ src, eventId, season = "2026-27" }) {
  const p = `app/public/data/nba/results/finals-${season}.json`;
  const raw = src.read(p);
  const r = raw && JSON.parse(raw).finals.find((x) => String(x.providerEventId) === String(eventId));
  if (!r) return { ok: false, reason: `${eventId} not in the finals record` };
  return {
    ok: true, format: "nba-final", league: "NBA", spec: SOCIAL_V2_SPEC, eventId,
    away: nbaTeamOf(r.away.tricode, r.away.name), home: nbaTeamOf(r.home.tricode, r.home.name), finalAway: r.ftAway, finalHome: r.ftHome,
    winner: r.winnerSide, dateLine: ET({ weekday: "long", month: "short", day: "numeric" }).format(new Date(r.dateUtc)),
    evidence: [{ label: "NBA finals record", ref: `${p}@${src.commit?.slice(0, 12)}`, sha256: sha(raw) }],
  };
}

/**
 * NBA per-game projected stat lines: the lane's published medians for each team, in the lane's own published order
 * (never re-sorted by a statistic — the lane publishes no rankings), up to NBA_LINES_PER_TEAM per team.
 */
export const NBA_LINES_PER_TEAM = 6;
export function nbaPlayers({ src, eventId, date = "latest" }) {
  const p = `app/public/data/nba/experimental-public/${date}.json`;
  const raw = src.read(p);
  if (raw == null) return { ok: false, reason: `no NBA public lane file ${date}` };
  const j = JSON.parse(raw);
  const g = j.games.find((x) => String(x.providerEventId) === String(eventId));
  if (!g) return { ok: false, reason: `${eventId} not in the ${j.date} lane` };
  const one = (x) => (typeof x === "number" ? x.toFixed(1) : null);
  const lines = (arr) => (arr ?? []).filter((x) => !x.injuryStatus || !EXCLUDED.has(String(x.injuryStatus).toUpperCase()))
    .filter((x) => x.medians && one(x.medians.pts) != null).slice(0, NBA_LINES_PER_TEAM)
    .map((x) => ({ name: x.name, pts: one(x.medians.pts), reb: one(x.medians.reb), ast: one(x.medians.ast), id: x.providerAthleteId }));
  const awayPlayers = lines(g.players?.away);
  const homePlayers = lines(g.players?.home);
  if (!awayPlayers.length || !homePlayers.length) return { ok: false, reason: "a team has no published player medians" };
  return {
    ok: true, format: "nba-players", league: "NBA", spec: SOCIAL_V2_SPEC, eventId,
    away: nbaTeamOf(g.away.abbr, g.away.name), home: nbaTeamOf(g.home.abbr, g.home.name), awayPlayers, homePlayers,
    tipLine: kickoffLine(g.tipUtc), kickoffLine: kickoffLine(g.tipUtc), tipUtc: g.tipUtc, laneDate: j.date,
    frozenShort: ET({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(g.frozenAt)).replace(" at ", ", "),
    evidence: [{ label: "NBA public lane", ref: `${p}@${src.commit?.slice(0, 12)}`, sha256: sha(raw) }],
  };
}
