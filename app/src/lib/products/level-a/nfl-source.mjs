/**
 * LEVEL A · THE NFL READER (founder decision 2026-11-10, Parlay Lab V3 decision 1:
 * ~/gtp-evidence/nov10-founder-parlay-v3-decisions.md, sha256 70bb6a2c4b68057f9e9743c93b0cde1f7815d56a401da375352a20045141dda2).
 *
 * One ForecastSelection per game on the schedule for the product day, read ONLY through nflOfficialOfRecord (no
 * rebuilding): the forecast's own published side and its win probability for that side, copied, with the forecast id,
 * model version, generation stamp and official snapshot id. Team, side and probability equal the game page exactly
 * (the probability is the same number; its text is win-chance-text.mjs, which the game page prints).
 *
 * GATES (each a code the leg contract refuses with, shown as unavailable research with a short reason):
 *   FORECAST_MISSING     no LIVE forecast of record for the game (archived / none)
 *   FORECAST_INVALID     no published side, win chances outside (0,1), or home + away + tie mass ≠ 1
 *   KICKOFF_UNVERIFIED   the schedule capture is older than SCHEDULE_MAX_AGE_MS, the game is not STATUS_SCHEDULED, or
 *                        its kickoff differs from the forecast's
 *   QB_BLIND / TEAM_INPUTS_UNKNOWN   eligibility.mjs gameEligibility (R5)
 *   QB_UNVERIFIED        either team's expected starting QB (depth-chart QB1, depth-chart.mjs, ≤ QB_CHART_MAX_AGE_MS old)
 *                        is not resolved, or resolveEligibility(starter: true) is not ELIGIBLE and featurable.
 *                        The bound is NOT new: QB_CHART_MAX_AGE_MS (board-roster-integrity.mjs) is the existing 3-day
 *                        depth-chart staleness bound of §12.1 (docs/HANDOFF_2026-10-01_SESSION_4_NFL_ROSTER_USAGE.md), the
 *                        same bound the player boards and team-input coherence use. The chart is refreshed by
 *                        nfl-event-window on game days and the day before, so it is at most a day old at any kickoff.
 * Pure: every source is an argument. loadNflSelections reads the committed files.
 */
import fs from "node:fs";
import path from "node:path";
import { nflOfficialOfRecord } from "../../sports/nfl/official-of-record.mjs";
import { indexDepthCharts, depthChartAsOf } from "../../sports/nfl/depth-chart.mjs";
import { QB_CHART_MAX_AGE_MS } from "../../sports/nfl/board-roster-integrity.mjs";
import { resolveEligibility, gameEligibility, featurable } from "../../availability/eligibility.mjs";
import { nflWinPct, NFL_FORECAST_LABEL } from "../../sports/nfl/win-chance-text.mjs";

export const NFL_LEVEL_A_SOURCE = "nfl-level-a-source@1";
export const SCHEDULE_MAX_AGE_MS = 24 * 3600 * 1000;
const ms = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? t : null; };
const isP = (x) => typeof x === "number" && x > 0 && x < 1;
const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const etDay = (iso) => (ms(iso) == null ? null : ET_DAY.format(new Date(ms(iso))));

/** The expected starting QB of one team, resolved under eligibility@1, or the reason it is not. */
export function qbCheck({ team, providerTeamId, depthIndex, injuries, roster, now }) {
  const chart = depthIndex ? depthChartAsOf(depthIndex, team, now, QB_CHART_MAX_AGE_MS) : null;
  if (!chart || chart.state !== "RESOLVED" || !chart.starter) return { ok: false, team, reason: `QB1 ${chart?.state ?? "NO_DEPTH_CHART"}`, qb: null, eligibility: null };
  const e = resolveEligibility({ sport: "nfl", playerId: chart.starter.playerId, teamId: providerTeamId ?? null, asOf: now, injuries, roster, starter: true });
  const ok = featurable(e);
  return { ok, team, reason: ok ? null : `QB1 ${e.state}${e.reasons.length ? ` (${e.reasons.join(", ")})` : ""}`, qb: { playerId: String(chart.starter.playerId), chartAt: chart.snapshotAt }, eligibility: { state: e.state, reasons: e.reasons, flags: e.flags, sources: e.sources, contractVersion: e.contractVersion } };
}

/**
 * @param {{ schedule: { generatedAt: string, rows: object[] } | null, offOf: (eventId: string) => object|null,
 *   depthIndex: object|null, injuries: object|null, roster: object|null, now: string, productDay: string }} a
 */
export function nflSelectionsFrom({ schedule, offOf, depthIndex, injuries, roster, now, productDay }) {
  const out = [];
  const scheduleFresh = ms(schedule?.generatedAt) != null && ms(now) - ms(schedule.generatedAt) <= SCHEDULE_MAX_AGE_MS;
  for (const row of schedule?.rows ?? []) {
    if (etDay(row.dateUtc) !== productDay) continue;
    const id = String(row.providerEventId);
    const gates = [];
    const off = offOf(id);
    const f = off?.basis === "LIVE" ? off.forecast : null;
    if (!f) gates.push("FORECAST_MISSING");
    const side = String(f?.sideDecision?.publishedSide ?? "").toLowerCase();
    const wp = f?.forecastSummary?.winProbability ?? null;
    const tie = typeof wp?.tieMass === "number" ? wp.tieMass : 0;
    if (f && (!["home", "away"].includes(side) || !isP(wp?.home) || !isP(wp?.away) || Math.abs(wp.home + wp.away + tie - 1) > 0.002)) gates.push("FORECAST_INVALID");
    if (!scheduleFresh || row.statusRaw !== "STATUS_SCHEDULED" || (f && ms(f.kickoffUtc) !== ms(row.dateUtc))) gates.push("KICKOFF_UNVERIFIED");
    const r5 = f ? gameEligibility(f) : null;
    if (r5 && !r5.publishable) gates.push(r5.reasons.includes("R5_QB_BLIND") ? "QB_BLIND" : "TEAM_INPUTS_UNKNOWN");
    const qbs = ["away", "home"].map((t) => qbCheck({ team: row[t]?.abbr, providerTeamId: row[t]?.providerTeamId, depthIndex, injuries, roster, now }));
    if (qbs.some((q) => !q.ok)) gates.push("QB_UNVERIFIED");
    const team = side === "home" ? row.home : side === "away" ? row.away : null;
    const p = f && ["home", "away"].includes(side) ? wp?.[side] ?? null : null;
    out.push({
      sport: "nfl", eventId: id, eventLabel: `${row.away?.abbr} @ ${row.home?.abbr}`, startUtc: row.dateUtc, market: "winner",
      selection: team ? { code: side, label: `${team.abbr} to win` } : null,
      probability: isP(p) ? p : null,
      /* the game page's own label and text (game-hero.tsx prints nflWinPct + " to win"; this is the same number, same dp) */
      ...(isP(p) ? { label: NFL_FORECAST_LABEL, shownPct: nflWinPct(p) } : {}),
      forecast: { owner: "nfl official forecast of record", modelId: f?.model ? `${f.model.id}@v${f.model.version}` : null, stampedAt: f?.generatedAt ?? null,
        ref: `nflOfficialOfRecord:${id}`, basis: off?.basis ?? null, snapshotId: off?.snapshot?.snapshotId ?? null, inputHash: f?.model?.inputHash ?? null },
      gateRefusals: [...new Set(gates)],
      eligibility: { contractVersion: "eligibility@1", r5: r5 ? { publishable: r5.publishable, reasons: r5.reasons } : null,
        quarterbacks: qbs.map((q) => ({ team: q.team, ok: q.ok, reason: q.reason, qb: q.qb, eligibility: q.eligibility })), scheduleAt: schedule?.generatedAt ?? null },
      uncertainty: isP(p) ? { kind: "win-probability", home: wp.home, away: wp.away, tieMass: tie || null, note: "Win chance from the official NFL forecast (10,000 simulated games); a tie after regulation is not assigned to either side." } : null,
      participantStatuses: [],
      settlement: { grader: "nfl-settlement-contract", market: "moneyline", side: ["home", "away"].includes(side) ? side : null },
    });
  }
  return out;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

/** The committed inputs: schedule capture, official forecasts, newest depth-chart capture, eligibility sources. */
export function loadNflSelections({ repoRoot, date, now }) {
  const pub = path.join(repoRoot, "app", "public");
  const dir = path.join(repoRoot, "data", "internal", "research", "nfl", "depth-charts");
  let depthIndex = null;
  try {
    const caps = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson(path.join(dir, f))).filter((d) => d?.snapshots?.length)
      .sort((a, b) => String(a.acquiredAt).localeCompare(String(b.acquiredAt)));
    depthIndex = caps.length ? indexDepthCharts(caps.at(-1)) : null;
  } catch { depthIndex = null; }
  return nflSelectionsFrom({
    schedule: readJson(path.join(pub, "data", "nfl", "schedule", "latest.json")),
    offOf: (id) => nflOfficialOfRecord(pub, id),
    depthIndex,
    injuries: readJson(path.join(repoRoot, "data", "internal", "research", "injuries", "nfl", "latest.json")),
    roster: readJson(path.join(pub, "data", "nfl", "rosters", "latest.json")),
    now, productDay: date,
  });
}
