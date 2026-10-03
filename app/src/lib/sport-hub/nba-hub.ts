/**
 * NBA hub adapter (Session 6 · NBA factual shell) — schedule and finals only, no forecast.
 *
 * NBA is `HISTORICAL_ONLY` in the capability registry and no NBA model has cleared its preregistered
 * bars (`docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md`), so this adapter publishes FACTS: who plays,
 * when, the season phase, and — once the finals record holds it — the official final. Every row's `read`
 * is null by construction; there is no code path here that could attach a probability.
 *
 * Owners, never re-derived:
 *   schedule   public/data/nba/schedule/latest.json     (ESPN scoreboard capture, sport-schedules.yml)
 *   finals     public/data/nba/results/finals-<season>.json (write-once finals record, finals-record.mjs)
 * A game that has started but is not in the finals record says "started or final" — never a score, never
 * "final" — because only the record may say a game is over.
 */
import fs from "node:fs";
import path from "node:path";

import { DEFAULT_LABELS, hubStatusWord, type HubGameRow, type SportHubModel } from "./contract";
import { finalFor, nbaSeasonLabel, etDateOf } from "@/lib/sports/nba/finals-record.mjs";
import { espnTeamById } from "@/lib/sports/nba/roster-contract.mjs";

const ET = "America/New_York";
const DAY = 86_400_000;
/** Days ahead the hub lists, and days back it keeps a started game on the page. */
export const NBA_HUB_AHEAD_DAYS = 7;
export const NBA_HUB_BEHIND_DAYS = 3;

export const NBA_NO_FORECAST_NOTE = "No public forecast — model in validation";
export const NBA_PRESEASON_NOTE = "Preseason — no forecast published";

type Side = { abbr?: string | null; name?: string | null; providerTeamId?: string | number | null };
type ScheduleRow = { providerEventId?: string; dateUtc?: string; statusRaw?: string | null; seasonType?: number | null; home?: Side | null; away?: Side | null };
type ScheduleCapture = { generatedAt?: string; rows?: ScheduleRow[] } | null;
type FinalsRecord = { finals?: Array<Record<string, any>>; conflicts?: unknown[] } | null;

/** An NBA side we can name by ESPN team id. Placeholder ("TBD") and exhibition sides keep their text. */
function sideOf(s: Side | null | undefined): { label: string; team: ReturnType<typeof espnTeamById> } | null {
  if (!s) return null;
  const team = s.providerTeamId != null ? espnTeamById(String(s.providerTeamId)) : null;
  const label = team ? team.canonicalTricode : (s.abbr ?? "").trim();
  if (!label || /^tbd$/i.test(label)) return null;
  return { label, team };
}

const startLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: ET })} · `
    + `${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: ET })} ET`;
};
const shortDay = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: ET });

/** Pure builder — every input passed in, so the page and the tests read the same function. */
export function nbaHubFrom({ nowIso, schedule, finals }: { nowIso: string; schedule: ScheduleCapture; finals: FinalsRecord }): SportHubModel {
  const now = Date.parse(nowIso);
  const lo = now - NBA_HUB_BEHIND_DAYS * DAY, hi = now + NBA_HUB_AHEAD_DAYS * DAY;
  let unidentified = 0;
  const rows: HubGameRow[] = [];
  for (const r of schedule?.rows ?? []) {
    const t = Date.parse(r.dateUtc ?? "");
    if (!r.providerEventId || !Number.isFinite(t) || t < lo || t > hi) continue;
    const home = sideOf(r.home), away = sideOf(r.away);
    if (!home || !away) { unidentified++; continue; }    // a "TBD @ TBD" placeholder is not a game yet
    const started = t <= now;
    const fin = finalFor(finals, r.providerEventId);
    const isFinal = fin.state === "FINAL" || fin.state === "FINAL_UNDER_REVIEW";
    const raw = String(r.statusRaw ?? "").toUpperCase();
    const status = isFinal ? "final"
      : /POSTPONED|CANCELED|CANCELLED/.test(raw) ? hubStatusWord("POSTPONED", started)
      : hubStatusWord(started ? "STARTED" : "SCHEDULED", started);
    const preseason = r.seasonType === 1;
    const reportNote = isFinal
      ? `Final · ${away.label} ${fin.ftAway} – ${home.label} ${fin.ftHome}${fin.state === "FINAL_UNDER_REVIEW" ? " (under review)" : ""}`
      : started ? "Final not recorded yet"
      : preseason ? NBA_PRESEASON_NOTE : NBA_NO_FORECAST_NOTE;
    rows.push({
      id: r.providerEventId,
      startUtc: r.dateUtc!,
      startLabel: startLabel(r.dateUtc!),
      matchup: `${away.label} @ ${home.label}${preseason ? " · preseason" : ""}`,
      status,
      started: started || isFinal,
      read: null,
      reportState: "NONE",
      reportHref: null,
      reportNote,
      participants: [away, home].map((s) => ({ name: s.label, logoTeam: s.team ? s.team.espnAbbr : null, logoSport: s.team ? ("nba" as const) : null })),
      separator: "@",
    });
  }
  /*
   * ⚠ A FINAL THE SCHEDULE NO LONGER CARRIES (2026-10-03 audit, G1). The schedule capture's window starts at
   * the capture instant, so a game leaves `schedule/latest.json` on the very run that folds its final into
   * the record — the hub, iterating the schedule alone, could never print a final. Games inside the hub's
   * look-back window are therefore also taken from the FINALS RECORD itself, the only owner allowed to say a
   * game is over. Nothing is inferred: a game neither artifact holds is simply absent.
   */
  const listed = new Set(rows.map((r) => r.id));
  for (const f of finals?.finals ?? []) {
    const t = Date.parse(f.dateUtc ?? "");
    if (!f.providerEventId || listed.has(String(f.providerEventId)) || !Number.isFinite(t) || t < lo || t > now) continue;
    const fin = finalFor(finals, f.providerEventId);
    if (fin.state !== "FINAL" && fin.state !== "FINAL_UNDER_REVIEW") continue;
    const sideLabel = (s: Record<string, any> | null | undefined) => (s?.tricode ?? s?.espnAbbr ?? s?.name ?? null) as string | null;
    const awayLabel = sideLabel(f.away), homeLabel = sideLabel(f.home);
    if (!awayLabel || !homeLabel) { unidentified++; continue; }
    const awayTeam = f.away?.providerTeamId != null ? espnTeamById(String(f.away.providerTeamId)) : null;
    const homeTeam = f.home?.providerTeamId != null ? espnTeamById(String(f.home.providerTeamId)) : null;
    const preseason = f.seasonType === 1;
    rows.push({
      id: String(f.providerEventId),
      startUtc: f.dateUtc,
      startLabel: startLabel(f.dateUtc),
      matchup: `${awayLabel} @ ${homeLabel}${preseason ? " · preseason" : ""}`,
      status: "final",
      started: true,
      read: null,
      reportState: "NONE",
      reportHref: null,
      reportNote: `Final · ${awayLabel} ${fin.ftAway} – ${homeLabel} ${fin.ftHome}${fin.state === "FINAL_UNDER_REVIEW" ? " (under review)" : ""}`,
      participants: [[awayLabel, awayTeam], [homeLabel, homeTeam]].map(([name, team]) => ({ name: name as string, logoTeam: team ? (team as any).espnAbbr : null, logoSport: team ? ("nba" as const) : null })),
      separator: "@",
    });
  }
  rows.sort((a, b) => Date.parse(a.startUtc!) - Date.parse(b.startUtc!));

  const upcoming = rows.filter((r) => !r.started).sort((a, b) => Date.parse(a.startUtc!) - Date.parse(b.startUtc!));
  const next = upcoming[0];
  const nextIsPreseason = next ? next.matchup.endsWith("· preseason") : false;
  const season = nbaSeasonLabel(etDateOf(nowIso)) ?? "";
  return {
    sport: "nba",
    sportLabel: "NBA",
    labels: { ...DEFAULT_LABELS },
    periodLabel: next ? (nextIsPreseason ? `${season} preseason` : `${season} regular season`) : `${season} season`,
    periodRange: `${shortDay(new Date(lo).toISOString())} – ${shortDay(new Date(hi).toISOString())}`,
    freshness: typeof schedule?.generatedAt === "string" ? schedule.generatedAt : null,
    rows,
    present: ["games", "results"],
    emptyReason: `No NBA games in the next ${NBA_HUB_AHEAD_DAYS} days on the published schedule.`,
    identityReconciliation: { unidentifiedScheduleRows: unidentified, laterPeriodRows: 0 },
  };
}

function readJson<T>(rel: string): T | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", rel), "utf8")) as T; } catch { return null; }
}

/** The page's loader: the committed schedule capture and this season's finals record. */
export function nbaHub(nowIso: string): SportHubModel {
  const season = nbaSeasonLabel(etDateOf(nowIso));
  return nbaHubFrom({
    nowIso,
    schedule: readJson<ScheduleCapture>("nba/schedule/latest.json"),
    finals: season ? readJson<FinalsRecord>(`nba/results/finals-${season}.json`) : null,
  });
}
