"use client";
/**
 * NBA Top 10 player board — one frozen edition, four category tabs (Points · Rebounds · Assists · 3PM).
 *
 * PRIVATE TODAY. NBA is HISTORICAL_ONLY (sport-capability-registry) and the preregistration (§6–§8) allows no public
 * NBA forecast until the forward-shadow bars are met, so the only route that renders this is the internal preview
 * /preview/nba/boards (guardInternalRoute + pruned from the export). The component is written to the public-copy bar
 * so that, IF the founder later approves an experimental public state, it is a flag change: `NBA_TOP_BOARD_PUBLIC_STATE`
 * below plus wiring one route. Nothing public imports it today (guarded by top-board-route-gating.test.mjs).
 *
 * What it shows is exactly what was frozen: the client never re-ranks a board (the sort controls reorder the display
 * and keep each row's frozen rank on it), never fills it to ten, and never shows a line, odds, an edge or an
 * over/under probability — none exists. Every row says "No market line — model projection only".
 */
import { useId, useMemo, useState } from "react";

import { useRovingTabs } from "@/components/a11y/use-roving-tabs";
import TeamLogo from "@/components/team-logo";
import { etStamp } from "@/lib/et-stamp.mjs";

/** The public switch. "OFF" = private preview only. Changing it requires founder approval AND a route; see header. */
export const NBA_TOP_BOARD_PUBLIC_STATE: "OFF" | "EXPERIMENTAL" = "OFF";

export interface TopBoardTeam { name: string | null; abbr: string | null; espnAbbr: string | null; providerTeamId: string | null }
export interface TopBoardRow {
  rank: number;
  rowId: string;
  category: string;
  stat: string;
  player: { name: string | null; providerAthleteId: string };
  team: TopBoardTeam | null;
  opponent: TopBoardTeam | null;
  homeAway: "home" | "away";
  eventId: string;
  tipoffUtc: string;
  projection: { p50: number; mean: number };
  range: { p10: number; p25?: number; p75?: number; p90: number };
  /** Share of simulated draws in which he played (families with conditional quantiles, e.g. v1); null otherwise. */
  playRate: number | null;
  quantileConditioning: "CONDITIONAL_ON_PLAYING" | "AS_SIMULATED";
  expectedMinutes: number | null;
  minutesSd: number | null;
  injuryStatus: string | null;
  marketLine: null;
  marketOdds: null;
  edge: null;
  marketReason: string;
  confidence: null;
  confidenceReason: string;
  updated: { inputAsOf: string | null; generatedAt: string | null };
  modelVersion: string | null;
  family: string;
  receipt: { forecastSha256: string; gamePayloadSha256: string | null };
  flags: string[];
  sortKeys: { projection: number; expectedMinutes: number | null; p90: number };
}
export interface TopBoardCategory {
  category: string;
  label: string;
  stat: string;
  rows: TopBoardRow[];
  eligibleCount: number;
  shownCount: number;
  withheld: { count: number; byPrimaryReason: Record<string, number> };
  emptyReason: string | null;
}
export interface TopBoardEdition {
  edition: number;
  frozenAt: string;
  source: { sha256: string; artifactGeneratedAt: string | null; modelVersion: string | null };
  gamesOnBoard: number;
  games: { eventId: string; state: string; home: TopBoardTeam | null; away: TopBoardTeam | null }[];
  boards: Record<string, TopBoardCategory>;
}
export interface TopBoardMeta {
  date: string;
  family: string;
  modelVersion: string | null;
  minExpectedMinutes: number;
  maxMinutesCv: number;
  minPlayRate: number;
  maxRows: number;
}

type SortKey = "rank" | "expectedMinutes" | "p90";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "Projection" },
  { key: "expectedMinutes", label: "Expected minutes" },
  { key: "p90", label: "High end (90th)" },
];

/** Reason codes in the reader's words (no raw codes reach the page). */
export const WITHHELD_WORDS: Record<string, string> = {
  MISSING_ATHLETE_ID: "No player id to grade against",
  AVAILABILITY_OUT: "Ruled out",
  INJURY_DESIGNATION: "Listed on the injury report (incl. day-to-day)",
  INSUFFICIENT_HISTORY: "Too few recent games",
  NULL_MINUTES: "No minutes estimate",
  AVAILABILITY_UNVERIFIED: "Availability not confirmed",
  TEAM_POOL_FALLBACK_RATES: "Rates borrowed from the team average",
  LOW_EXPECTED_MINUTES: "Expected minutes below the floor",
  LOW_PLAY_RATE: "Model gives a real chance he does not play",
  MINUTES_TOO_UNCERTAIN: "Minutes estimate too uncertain",
  MISSING_DISTRIBUTION: "Projection range incomplete",
};
const GAME_WORDS: Record<string, string> = {
  GAME_STARTED_AT_FREEZE: "had already tipped at the freeze",
  FORECAST_AFTER_FREEZE: "forecast written after the freeze",
  RECEIPT_BROKEN: "forecast failed its integrity check",
  FAMILY_MISMATCH: "forecast from a different model family",
  ON_EARLIER_EDITION: "on an earlier freeze",
};

const CSS = `
.tb-root{color:var(--vault-text);min-width:0}
.tb-note{border:1px solid var(--vault-border);background:var(--vault-panel);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;color:var(--vault-text-mute)}
.tb-note strong{color:var(--vault-text)}
.tb-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:14px 0 10px}
.tb-tabs{display:flex;flex-wrap:wrap;gap:6px}
.tb-tab,.tb-sort{font:inherit;font-size:13px;padding:6px 12px;border-radius:999px;border:1px solid var(--vault-border);background:transparent;color:var(--vault-text-mute);cursor:pointer;min-height:36px}
.tb-tab[aria-selected="true"],.tb-sort[aria-pressed="true"]{border-color:var(--vault-gold-bright);color:var(--vault-text);background:var(--vault-gold-dim)}
.tb-tab:focus-visible,.tb-sort:focus-visible,.tb-root summary:focus-visible{outline:2px solid var(--vault-gold-bright);outline-offset:2px}
.tb-sortgroup{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--vault-text-faint)}
.tb-list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.tb-card{border:1px solid var(--vault-border);background:var(--vault-panel);border-radius:12px;padding:12px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px;align-items:start;min-width:0}
.tb-rank{font-family:var(--font-mono);font-size:13px;color:var(--vault-text-faint);min-width:28px;text-align:center;padding-top:6px}
.tb-main{min-width:0;display:grid;gap:8px}
.tb-head{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between}
.tb-who{display:flex;gap:10px;align-items:center;min-width:0}
.tb-name{font-weight:600;font-size:15px;overflow-wrap:anywhere}
.tb-sub{font-size:12px;color:var(--vault-text-mute)}
.tb-proj{text-align:right}
.tb-proj b{font-family:var(--font-mono);font-size:22px;color:var(--vault-text)}
.tb-proj span{display:block;font-size:11px;color:var(--vault-text-faint)}
.tb-range{position:relative;height:10px;border-radius:999px;background:var(--vault-panel-elevated);border:1px solid var(--vault-border)}
.tb-range i{position:absolute;top:0;bottom:0;border-radius:999px;background:var(--vault-gold-dim);border:1px solid var(--vault-gold-bright)}
.tb-range em{position:absolute;top:-3px;bottom:-3px;width:3px;margin-left:-1px;border-radius:2px;background:var(--vault-text)}
.tb-rangelabel{display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:11px;color:var(--vault-text-faint)}
.tb-chips{display:flex;flex-wrap:wrap;gap:6px}
.tb-chip{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--vault-border);color:var(--vault-text-mute)}
.tb-chip[data-tone="warn"]{border-color:var(--vault-warn);color:var(--vault-warn)}
.tb-empty{border:1px dashed var(--vault-border-strong);border-radius:12px;padding:18px;font-size:14px;color:var(--vault-text-mute)}
.tb-root details{border-top:1px solid var(--vault-border);padding:10px 0;font-size:13px;color:var(--vault-text-mute);line-height:1.55}
.tb-root summary{cursor:pointer;color:var(--vault-text);font-weight:600}
.tb-root dl{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;margin:8px 0 0}
.tb-root dd{margin:0;font-family:var(--font-mono);text-align:right}
@media (max-width:480px){.tb-card{grid-template-columns:minmax(0,1fr)}.tb-rank{text-align:left;padding:0}.tb-proj{text-align:left}}
`;

const num = (x: number | null | undefined, d = 1) => (typeof x === "number" && Number.isFinite(x) ? x.toFixed(d) : "—");

function RangeBar({ row, scaleMax, label }: { row: TopBoardRow; scaleMax: number; label: string }) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / (scaleMax || 1)) * 100))}%`;
  const { p10, p90 } = row.range;
  const text = `${label} projection range: 10th percentile ${num(p10)}, median ${num(row.projection.p50)}, 90th percentile ${num(p90)}`;
  return (
    <div>
      <div className="tb-range" role="img" aria-label={text}>
        <i style={{ left: pct(p10), width: `calc(${pct(p90)} - ${pct(p10)})` }} />
        <em style={{ left: pct(row.projection.p50) }} />
      </div>
      <div className="tb-rangelabel" aria-hidden="true"><span>{num(p10)}</span><span>median {num(row.projection.p50)}</span><span>{num(p90)}</span></div>
    </div>
  );
}

function PlayerCard({ row, label, scaleMax }: { row: TopBoardRow; label: string; scaleMax: number }) {
  const at = row.homeAway === "home" ? "vs" : "@";
  return (
    <li className="tb-card">
      <div className="tb-rank" aria-label={`Frozen rank ${row.rank}`}>#{row.rank}</div>
      <div className="tb-main">
        <div className="tb-head">
          <div className="tb-who">
            <TeamLogo team={row.team?.espnAbbr ?? row.team?.abbr} sport="nba" size="md" ariaLabel={`${row.team?.name ?? row.team?.abbr ?? "Team"} logo`} />
            <div style={{ minWidth: 0 }}>
              <div className="tb-name">{row.player.name ?? "Unnamed player"}</div>
              <div className="tb-sub">{row.team?.abbr ?? "—"} {at} {row.opponent?.abbr ?? "—"} · {etStamp(row.tipoffUtc) ?? "tip time unknown"}</div>
            </div>
          </div>
          <div className="tb-proj">
            <b>{num(row.projection.p50)}</b>
            <span>{label.toLowerCase()} · model median (mean {num(row.projection.mean)})</span>
          </div>
        </div>
        <RangeBar row={row} scaleMax={scaleMax} label={label} />
        <div className="tb-chips">
          <span className="tb-chip">Expected minutes {num(row.expectedMinutes)}</span>
          {typeof row.playRate === "number" ? <span className="tb-chip">Plays in {Math.round(row.playRate * 100)}% of simulations · range if he plays</span> : null}
          {row.injuryStatus ? <span className="tb-chip" data-tone="warn">Injury report: {row.injuryStatus}</span> : null}
          {row.flags.includes("TRADED_HISTORY_OTHER_TEAM") ? <span className="tb-chip" data-tone="warn">History from a previous team</span> : null}
          <span className="tb-chip">No market line — model projection only</span>
          <span className="tb-chip">Confidence not calibrated</span>
        </div>
      </div>
    </li>
  );
}

export default function TopBoard({ edition, meta, initialCategory = "points" }: { edition: TopBoardEdition; meta: TopBoardMeta; initialCategory?: string }) {
  const keys = useMemo(() => Object.keys(edition.boards), [edition.boards]);
  const [active, setActive] = useState(keys.includes(initialCategory) ? initialCategory : keys[0]);
  const [sort, setSort] = useState<SortKey>("rank");
  const idBase = `nba-tb-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const tabs = useRovingTabs<string>({ keys, active, onChange: setActive, idBase });
  const board = edition.boards[active];
  const rows = useMemo(() => {
    const xs = [...(board?.rows ?? [])];
    if (sort === "expectedMinutes") xs.sort((a, b) => (b.sortKeys.expectedMinutes ?? -1) - (a.sortKeys.expectedMinutes ?? -1) || a.rank - b.rank);
    else if (sort === "p90") xs.sort((a, b) => b.sortKeys.p90 - a.sortKeys.p90 || a.rank - b.rank);
    else xs.sort((a, b) => a.rank - b.rank);
    return xs;
  }, [board, sort]);
  const scaleMax = Math.max(1, ...(board?.rows ?? []).map((r) => r.range.p90));
  const offBoard = edition.games.filter((g) => g.state !== "ON_BOARD" && g.state !== "ON_EARLIER_EDITION");

  return (
    <section className="tb-root" aria-label={`NBA top ${meta.maxRows} player boards`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <p className="tb-note">
        <strong>No market line — model projection only.</strong> These are the shadow model&apos;s median projections, frozen
        before tip. No sportsbook line, odds or edge is recorded for the NBA, so nothing here says over or under, and no
        confidence is shown until the preregistered accuracy bars are met.
      </p>

      <div className="tb-bar">
        <div {...tabs.listProps} className="tb-tabs" aria-label="Statistic">
          {keys.map((k) => (
            <button key={k} {...tabs.tabProps(k)} className="tb-tab">{edition.boards[k].label}</button>
          ))}
        </div>
        <div className="tb-sortgroup" role="group" aria-label="Sort the board">
          <span>Sort</span>
          {SORTS.map((s) => (
            <button key={s.key} type="button" className="tb-sort" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</button>
          ))}
        </div>
      </div>

      <div {...tabs.panelProps(active)}>
        {board && rows.length ? (
          <>
            <p className="tb-sub" style={{ margin: "0 0 8px" }}>
              {board.shownCount} of {board.eligibleCount} eligible player{board.eligibleCount === 1 ? "" : "s"} shown
              {board.shownCount < meta.maxRows ? ` — fewer than ${meta.maxRows} passed every rule; the board is never filled` : ""}.
              {sort !== "rank" ? " Display re-sorted; each card keeps its frozen rank." : ""}
            </p>
            <ol className="tb-list">
              {rows.map((r) => <PlayerCard key={r.rowId} row={r} label={board.label} scaleMax={scaleMax} />)}
            </ol>
          </>
        ) : (
          <div className="tb-empty" role="status">
            <strong>No {board?.label ?? ""} board for this freeze.</strong>{" "}
            {board?.emptyReason ?? "No player passed every eligibility rule."}
          </div>
        )}

        {board ? (
          <details>
            <summary>Withheld players ({board.withheld.count})</summary>
            <p style={{ margin: "6px 0 0" }}>Every player considered and not listed, by the first rule that withheld them.</p>
            <dl>
              {Object.entries(board.withheld.byPrimaryReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}><dt>{WITHHELD_WORDS[k] ?? "Other rule"}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {offBoard.length ? <p style={{ margin: "8px 0 0" }}>Games not on this board: {offBoard.map((g) => `${g.away?.abbr ?? "?"} @ ${g.home?.abbr ?? "?"} (${GAME_WORDS[g.state] ?? "excluded"})`).join("; ")}.</p> : null}
          </details>
        ) : null}
      </div>

      <details>
        <summary>How this board is built</summary>
        <p style={{ margin: "6px 0 0" }}>
          Ranked by the model&apos;s median projection (ties: the mean, then the player id). A player is listed only if he is
          not on the injury report at all (day-to-day included), has his own recent-game history and per-minute rates,
          is expected to play at least {meta.minExpectedMinutes} minutes, and his minutes estimate is not too uncertain
          (spread at most {Math.round(meta.maxMinutesCv * 100)}% of the estimate). Games that had tipped when the board
          was frozen are excluded. Where a model&apos;s ranges are conditional on playing, he must play in at least
          {" "}{Math.round(meta.minPlayRate * 100)}% of its simulations. The board holds at most {meta.maxRows} and is never padded.
        </p>
        <p style={{ margin: "6px 0 0" }}>
          The bar shows the 10th to 90th percentile of the model&apos;s simulated outcomes, with the median marked. It is a
          shadow model that has not met its validation bars: treat every number as unvalidated research.
        </p>
        <dl>
          <dt>Date (ET)</dt><dd>{meta.date}</dd>
          <dt>Model</dt><dd>{meta.modelVersion ?? meta.family}</dd>
          <dt>Frozen</dt><dd>{etStamp(edition.frozenAt) ?? edition.frozenAt}</dd>
          <dt>Forecast written</dt><dd>{edition.source.artifactGeneratedAt ? etStamp(edition.source.artifactGeneratedAt) : "—"}</dd>
          <dt>Forecast receipt</dt><dd title={edition.source.sha256}>{edition.source.sha256.slice(0, 12)}</dd>
        </dl>
      </details>
    </section>
  );
}
