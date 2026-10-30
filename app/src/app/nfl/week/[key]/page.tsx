/**
 * /nfl/week/[key] — the SHAREABLE week route (P248 · Release C). PUBLIC.
 *
 * One page per official (seasonType, week) period that actually has data — the canonical week
 * register is the shared event read model plus the weekly-boards artifacts the production
 * pipeline writes per period. Nothing is invented for future weeks: a period earns a route by
 * having a committed forecast set, and prev/next links render only when that neighbor exists.
 * Key format `${seasonType}-${paddedWeek}` matches the weekly-boards per-period files.
 */
import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import SectionHeader from "@/components/section-header";
import TeamLogo from "@/components/team-logo";
import { withRouteMetadata } from "@/lib/seo/route-metadata";
import { availableWeekKeys } from "@/lib/sports/nfl/week-keys";
import { weekGames } from "@/lib/sports/nfl/week-games";
import PredictionBoard from "@/components/prediction/prediction-board";
import { presentWeeklyBoard, presentTopBoard, type TopBoard } from "@/lib/prediction-presentation/nfl";
import EtTime from "@/components/ui/et-time";
import { dailyFor, etDateOfKickoff, pregameScope, rankingMethodText } from "@/lib/sports/nfl/top-boards.mjs";
import { plainCodes } from "@/lib/uiux/plain-codes.mjs";
import { estimateLabel } from "@/lib/sports/nfl/family-publication.mjs";

const read = (rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data", rel), "utf8")); } catch { return null; }
};

type BoardRow = { playerId: string; name: string; team: string; opponent: string; providerEventId: string; kickoffUtc: string; participation: string; value: number; median?: number; p10?: number; p90?: number; probability?: number; pricingState?: string };
type WeeklyBoards = {
  generatedAt: string; period: { seasonType: number; week: number };
  scope: { kind: string; eventsIncluded: number; eventsDroppedAfterKickoff: number };
  model?: { id?: string; version?: number | string; launchState?: string } | null;
  boards: Array<{ id: string; family: string; title: string; state: string; reason?: string; caveat?: string; topN: number; rows?: BoardRow[] }>;
  /* Founder Top boards (2026-10-29, lib/sports/nfl/top-boards.mjs). Absent on weeks built before it. */
  topBoards?: { weekly: TopScope; daily: Array<TopScope & { etDate: string }>; fullWeek?: FullWeekScope };
};
type TopScope = { scope: { kind: string; eventsIncluded: number; eventsDroppedAfterKickoff: number }; boards: TopBoard[] };
/* founder P0 2026-10-30: every game of the week, started ones from their frozen pre-kickoff boards (rows `completed`) */
type FullWeekScope = { scope: { kind: string; eventsIncluded: number; eventsCompleted: number; completedEvents: string[] }; boards: TopBoard[] };

/**
 * The five Top boards of one scope (weekly or today), in the V3 PredictionBoard layout (header row, identity line with
 * its Matchup/Start keys). Rows and order are the artifact's; digits come from the one formatter (presentTopBoard), so
 * they match the hub and every game page. A not-qualified family prints its readiness line, never a ranking.
 */
function TopBoardsList({ artifact, scope, completed }: { artifact: WeeklyBoards; scope: { boards: TopBoard[] }; completed?: Set<string> }) {
  return (
    <div className="flex flex-col gap-5">
      {scope.boards.map((b) => {
        const rows = presentTopBoard(artifact, b);
        return rows.length ? (
          <div key={b.id} data-top-board={b.family} data-board-state={b.state}>
            <h3 style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>{b.title}</h3>
            {/* An estimate board says so once, with its failed bar's caveat (the one label every surface prints). */}
            {b.state === "ESTIMATE" && b.estimate ? (
              <p data-estimate={b.family} style={{ margin: "0 0 2px", fontSize: 11, color: "var(--vault-text-mute)" }}>
                <strong>{b.estimate.label}</strong>{b.estimate.caveat ? ` · ${b.estimate.caveat.charAt(0).toUpperCase()}${b.estimate.caveat.slice(1)}` : ""}
              </p>
            ) : null}
            <p data-ranking-method={b.family} style={{ margin: "0 0 4px", fontSize: 11, color: "var(--vault-text-faint)" }}>{rankingMethodText(b)}</p>
            <PredictionBoard predictions={rows} gameHref={(p) => `/nfl/game/${p.game.providerEventId}/`} />
            {completed?.size && (b.rows ?? []).some((r) => completed.has(String(r.providerEventId))) ? (
              <p data-completed-rows={b.family} style={{ margin: "4px 0 0", fontSize: 11, color: "var(--vault-text-faint)" }}>
                Completed: {(b.rows ?? []).filter((r) => completed.has(String(r.providerEventId))).map((r) => `${r.name} (${r.team})`).join(", ")} — pre-kickoff projection, frozen at kickoff.
              </p>
            ) : null}
          </div>
        ) : (
          <p key={b.id} data-readiness={b.family} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720, border: "1px dashed var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
            {b.readiness?.text ?? `${b.label ?? b.title}: not yet published`}
          </p>
        );
      })}
    </div>
  );
}

/**
 * FULL WEEK (founder P0 2026-10-30): the artifact's `fullWeek` scope — every game of the week ranked together, a game
 * that has kicked off read from its frozen pre-kickoff board and its rows named as completed. A record of the week's
 * pre-kickoff projections, never a pregame ranking; shown beside (never instead of) the pregame boards.
 */
function FullWeekBoards({ artifact, full }: { artifact: WeeklyBoards; full: FullWeekScope }) {
  const completed = new Set((full.scope.completedEvents ?? []).map(String));
  return (
    <details style={{ marginTop: 18 }} data-top-boards-full-week>
      <summary className="font-mono" style={{ cursor: "pointer", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--vault-text-mute)", minHeight: 44 }}>
        Full week · all {full.scope.eventsIncluded} games{full.scope.eventsCompleted ? ` (${full.scope.eventsCompleted} completed, shown with their pre-kickoff projections)` : ""}
      </summary>
      <TopBoardsList artifact={artifact} scope={full} completed={completed} />
    </details>
  );
}

export function generateStaticParams() {
  return availableWeekKeys().map((key) => ({ key }));
}
export const dynamicParams = false;

const phaseLabel = (t: number) => (t === 1 ? "preseason" : t === 3 ? "postseason" : "regular season");
const weekTitle = (key: string) => {
  const [t, w] = key.split("-").map(Number);
  return `Week ${w} · ${phaseLabel(t)}`;
};

export function generateMetadata({ params }: { params: { key: string } }): Metadata {
  return withRouteMetadata(`/nfl/week/${params.key}/`, {
    title: `NFL ${weekTitle(params.key)} — Simulations & Top Boards · GameTime Picks`,
    description: `Pre-kickoff forecasts (each frozen at kickoff), projected scores and the weekly player boards for NFL ${weekTitle(params.key)}. Educational and paper-only.`,
  });
}

const etKickoff = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(iso)) + " ET";

export default function NflWeekPage({ params }: { params: { key: string } }) {
  const keys = availableWeekKeys();
  const idx = keys.indexOf(params.key);
  const prev = idx > 0 ? keys[idx - 1] : null;
  const next = idx >= 0 && idx < keys.length - 1 ? keys[idx + 1] : null;
  const wb = read(`nfl/weekly-boards/${params.key}.json`) as WeeklyBoards | null;
  /* P295 + 2026-10-28: the live union (this week, started games from frozen-latest.json) PLUS every game the graded record
     names for this week, read from its frozen pre-kickoff revision — so a week that has rolled over keeps every game
     (lib/sports/nfl/week-games.ts). Listing the union alone left /nfl/week/2-07/ with one game after rollover. */
  const { games: forecasts, unavailable } = weekGames(path.join(process.cwd(), "public", "data"), params.key);

  /* PREGAME ONLY (Track D, 2026-10-29): both scopes are re-checked against the build instant (top-boards.mjs pregameScope) —
     a game that has kicked off since the artifact was generated (Thursday night's) leaves the scope, and a board that
     ranked one of its players is withheld until it is rebuilt, never shown with a started game in a pregame ranking. */
  const nowIso = new Date().toISOString();
  const kickoffOf = (id: string) => forecasts.find((f) => String(f.providerEventId) === id)?.kickoffUtc ?? null;
  const weeklyPregame = wb?.topBoards ? pregameScope(wb.topBoards.weekly, nowIso, kickoffOf) as TopScope | null : null;
  /* Today's ET date at build time: a daily board shows only when this week still has a game today. */
  const todayBoards = wb?.topBoards ? pregameScope(dailyFor(wb.topBoards, etDateOfKickoff(nowIso)), nowIso, kickoffOf) as (TopScope & { etDate: string }) | null : null;
  /* Full week only when at least one game has kicked off (otherwise it equals the pregame weekly boards). */
  const fullWeek = wb?.topBoards?.fullWeek && wb.topBoards.fullWeek.scope.eventsCompleted > 0 ? wb.topBoards.fullWeek : null;

  const td = (extra: Record<string, string | number> = {}) => ({ padding: "7px 9px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, ...extra });

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 flex flex-col gap-8">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="font-display tracking-tight m-0" style={{ color: "var(--vault-text)", fontSize: 26 }}>
          NFL {weekTitle(params.key)}
        </h1>
        <nav aria-label="Week navigation" className="font-mono" style={{ fontSize: 11.5 }}>
          {prev ? <Link href={`/nfl/week/${prev}/`} className="gtp-backlink" style={{ color: "var(--vault-gold)" }}>← {weekTitle(prev)}</Link> : null}
          {prev && next ? <span style={{ color: "var(--vault-text-faint)" }}> · </span> : null}
          {next ? <Link href={`/nfl/week/${next}/`} className="gtp-backlink" style={{ color: "var(--vault-gold)" }}>{weekTitle(next)} →</Link> : null}
          {!prev && !next ? <span style={{ color: "var(--vault-text-faint)" }}>the only captured week so far — neighbors appear when their data exists</span> : null}
        </nav>
        <Link href="/nfl/" className="gtp-hit-44 font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10.5, color: "var(--vault-gold-bright)", marginLeft: "auto" }}>
          NFL hub →
        </Link>
      </div>

      {forecasts.length ? (
        <section aria-labelledby="week-games">
          <SectionHeader eyebrow="Games" title={`${forecasts.length} games`} sub="Pre-kickoff forecasts, each frozen at its kickoff. Scores derive from the median total and margin, so they always add up." />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
              <thead>
                <tr>
                  {["Kickoff (ET)", "Matchup", "Model winner", "Projected score", "Total", ""].map((h) => (
                    <th key={h || "a"} scope="col" style={{ textAlign: "left", padding: "6px 9px", fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {forecasts.map((f) => {
                  const s = f.forecastSummary;
                  const fav = s.winProbability.home >= s.winProbability.away
                    ? { abbr: f.home.abbr, p: s.winProbability.home }
                    : { abbr: f.away.abbr, p: s.winProbability.away };
                  return (
                    <tr key={f.providerEventId}>
                      <td className="font-mono" style={td({ fontSize: 11, whiteSpace: "nowrap", color: "var(--vault-text-mute)" })}>{etKickoff(f.kickoffUtc)}</td>
                      <td style={td({ fontSize: 13 })}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <TeamLogo team={f.away.abbr} sport="nfl" size="sm" ariaLabel={`${f.away.name} logo`} />
                          {f.away.abbr} at
                          <TeamLogo team={f.home.abbr} sport="nfl" size="sm" ariaLabel={`${f.home.name} logo`} />
                          {f.home.abbr}
                        </span>
                      </td>
                      <td className="font-mono" style={td()}>{fav.abbr} {(fav.p * 100).toFixed(1)}%</td>
                      <td className="font-mono" style={td({ whiteSpace: "nowrap" })}>{f.away.abbr} {s.projectedScore.away} — {s.projectedScore.home} {f.home.abbr}</td>
                      <td className="font-mono" style={td()}>{s.total.median} <span style={{ color: "var(--vault-text-faint)" }}>({s.total.p10}–{s.total.p90})</span></td>
                      <td style={td({ whiteSpace: "nowrap" })}>
                        <Link href={`/nfl/game/${f.providerEventId}/`} className="gtp-hit-44 font-mono uppercase tracking-[0.1em]" style={{ fontSize: 10, color: "var(--vault-gold-bright)" }}>View game →</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {unavailable.length ? (
            <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "var(--vault-text-faint)", maxWidth: 720 }}>
              Also played this week, with no committed copy of the forecast revision its grade names, so no numbers are shown:{" "}
              {unavailable.map((g) => g.matchup).join(", ")}.
            </p>
          ) : null}
        </section>
      ) : (
        <p style={{ fontSize: 13, color: "var(--vault-text-mute)" }}>
          No forecast set is committed for this week in the current artifact — the weekly boards below are this period&apos;s frozen record.
        </p>
      )}

      {wb?.topBoards?.weekly && !weeklyPregame ? (
        <section aria-labelledby="week-boards" data-top-boards-closed>
          <SectionHeader eyebrow="Pregame boards closed" title="Top boards" sub="Every game this week has kicked off. The Top boards rank only games still to come, so there is no pregame ranking to show; each game page keeps its frozen pre-kickoff forecast." />
          {fullWeek ? <FullWeekBoards artifact={wb!} full={fullWeek} /> : null}
        </section>
      ) : wb?.topBoards?.weekly && weeklyPregame ? (
        /* Founder Top boards (2026-10-29): five Top-5 boards from the artifact's `topBoards`, the same rows and numbers as
           the hub and each game page. A family that is not publication-qualified shows its readiness, never a ranking. */
        <section aria-labelledby="week-boards">
          <SectionHeader
            eyebrow={weeklyPregame.scope.kind === "REMAINING_EVENTS" ? `${weeklyPregame.scope.eventsIncluded} games left` : "Full week"}
            title="Top boards"
            sub="The official player board's top five per statistic, over games still to kick off only; a list is a maximum, not a quota; a statistic marked Estimate has not yet met its calibration standard and is labelled so; a statistic that has neither says so instead of ranking."
          />
          <TopBoardsList artifact={wb} scope={weeklyPregame} />
          {todayBoards ? (
            <div style={{ marginTop: 18 }} data-top-boards-day={todayBoards.etDate}>
              <h2 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "var(--vault-text)" }}>
                Today · {todayBoards.scope.eventsIncluded} {todayBoards.scope.eventsIncluded === 1 ? "game" : "games"}
              </h2>
              <TopBoardsList artifact={wb} scope={todayBoards} />
            </div>
          ) : null}
          <p className="font-mono" style={{ margin: "10px 0 0", fontSize: 10.5, color: "var(--vault-text-faint)" }}>
            Board stamp <EtTime iso={wb.generatedAt} /> · {weeklyPregame.scope.kind === "FULL_WEEK" ? "full-week edition" : `${weeklyPregame.scope.eventsDroppedAfterKickoff} games dropped after kickoff`}
          </p>
          {fullWeek ? <FullWeekBoards artifact={wb} full={fullWeek} /> : null}
        </section>
      ) : wb?.boards?.length ? (
        <section aria-labelledby="week-boards">
          <SectionHeader
            eyebrow={wb.scope.kind === "REMAINING_EVENTS" ? `${wb.scope.eventsIncluded} games left` : "Full week"}
            title="Weekly top boards"
            sub="One ranking owner; a top-N table is a maximum, not a quota; a statistic that has not cleared its publication standard says so instead of ranking."
          />
          <div className="flex flex-col gap-5">
            {wb.boards.map((b) =>
              /* A PUBLISHED family ranks; an ESTIMATE family ranks under its one label (founder P0 2026-10-30 — weeks 1–7
                 showed these rows; the game page, the hub and the Top boards show them the same way). */
              (b.state === "PUBLISHED" || b.state === "ESTIMATE") && b.rows?.length ? (
                <div key={b.id} data-board-state={b.state}>
                  <h2 style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 700, color: "var(--vault-text)" }}>
                    {b.title}
                  </h2>
                  {b.state === "ESTIMATE" ? (
                    <p data-estimate={b.family} style={{ margin: "0 0 4px", fontSize: 11, color: "var(--vault-text-mute)" }}>
                      <strong>{estimateLabel(b.reason)}</strong>{b.caveat ? ` · ${b.caveat.charAt(0).toUpperCase()}${b.caveat.slice(1)}` : ""}
                    </p>
                  ) : null}
                  <PredictionBoard
                    predictions={presentWeeklyBoard(wb, b)}
                    gameHref={(p) => `/nfl/game/${p.game.providerEventId}/`}
                  />
                </div>
              ) : (
                <p key={b.id} data-readiness={b.family} style={{ margin: 0, fontSize: 11.5, lineHeight: 1.55, color: "var(--vault-text-faint)", maxWidth: 720, border: "1px dashed var(--vault-rule)", borderRadius: 10, padding: "8px 12px" }}>
                  <strong style={{ color: "var(--vault-text-mute)" }}>{b.title.replace(/^Top \d+ · /, "")}:</strong> not yet published{b.reason ? ` — ${plainCodes(b.reason)}` : ""}
                </p>
              ),
            )}
          </div>
          <p className="font-mono" style={{ margin: "10px 0 0", fontSize: 10.5, color: "var(--vault-text-faint)" }}>
            Board stamp <EtTime iso={wb.generatedAt} /> · {wb.scope.kind === "FULL_WEEK" ? "frozen full-week edition" : `${wb.scope.eventsDroppedAfterKickoff} games dropped after kickoff`}
          </p>
        </section>
      ) : null}
    </div>
  );
}
