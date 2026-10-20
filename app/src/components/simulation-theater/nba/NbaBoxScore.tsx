"use client";
/**
 * NBA Simulation Theater · PROJECTED FINAL BOX SCORE (dev route only; Lane A-NBA 2026-10-20).
 *
 * Renders lib/simulation-theater/nba/box-score.mjs nbaBoxScore() for the selected run: watermark, header (matchup,
 * SIMULATED FINAL, run #, engine, inputs as of, OT), quarter-by-quarter incl. OT, both teams' player tables with
 * sortable MODELED columns, team totals, leaders, the stats that are NOT modelled, and the provenance line. A box score
 * that failed its invariants renders "Box score unavailable" with the codes and no numbers.
 *
 * BoxScoreBody is pure (no hooks) so the tests can render it; NbaBoxScoreDialog owns the sort state and the dialog
 * contract (role=dialog, aria-modal, the shared useDialogFocus: focus in, Tab contained, Escape closes, focus returned).
 * Wide screens get a centred dialog; compact screens a full-height sheet. Tables scroll horizontally with the player
 * name column sticky.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";
import { NBA_BOX_WATERMARK_WHAT_IF, NOT_SIMULATED_REASON, fmtBoxMinutes, nextSort, sortBoxRows } from "@/lib/simulation-theater/nba/box-score.mjs";
import {
  NBA_PLAYER_EXPECTATION_NOTE, OFFICIAL_BOX_TITLE, RECONCILIATION_NOTE, WHAT_IF_BANNER, WHAT_IF_BOX_TITLE, fmtExpectation, fmtPct, playerExpectation,
} from "@/lib/simulation-theater/representative-labels.mjs";
import { OfficialComparison } from "../RepresentativeParts";
import type { NbaManifest, NbaPalette, NbaSide } from "./nba-types";
import { teamStyle } from "./nba-parts";
import { TheaterLayer } from "../BottomSheet";
import { NBA_THEATER_VARS } from "./nba-theater-css";

export type BoxSort = { key: string; dir: "asc" | "desc" };
type Col = { key: string; label: string; title: string; modeled: string; sortable: boolean };
type Row = { providerAthleteId: string | null; name: string; status: "played" | "dnp"; minutes: number | null; [k: string]: unknown };
type NotSim = { providerAthleteId: string | null; name: string; status: "not-simulated"; reason: string; injuryStatus: string | null };
type Leader = { value: number; players: { side: NbaSide; name: string }[] } | null;
type TeamBox = { side: NbaSide; abbr: string; name: string; rows: Row[]; totals: Record<string, number>; notSimulated: NotSim[] };
export type NbaBox = {
  schema: string; kind: string;
  header: {
    matchup: string; status: string; runIndex: number; title: string | null; simulations: number | null; engine: string | null; profileVersion: string | null;
    inputAsOf: string | null; seed: string | null; fixture: boolean; final: { home: number; away: number }; overtimePeriods: number; winner: NbaSide;
    away: { abbr: string; name: string }; home: { abbr: string; name: string };
  };
  periods: { period: number; label: string; ot: boolean; home: number; away: number }[];
  columns: Col[];
  teams: Record<NbaSide, TeamBox>;
  leaders: { game: Record<string, Leader>; home: Record<string, Leader>; away: Record<string, Leader> };
  notModeled: { stat: string; why: string }[];
  teamMinutes: number;
  invariantsChecked: string[];
  watermark: string;
  provenance: string;
};
export type NbaBoxResult = { ok: boolean; errors: { code: string; detail: string }[]; box: NbaBox | null };

const SIDES: NbaSide[] = ["away", "home"];
export const DEFAULT_BOX_SORT: BoxSort = { key: "minutes", dir: "desc" };
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const cell = (k: string, v: unknown) => (k === "minutes" ? fmtBoxMinutes(v as number) : String(v));
const ariaSort = (sort: BoxSort, key: string) => (sort.key === key ? (sort.dir === "desc" ? "descending" : "ascending") : undefined);
/** The families the official receipt carries a per-player expectation for (official-snapshot NBA_PLAYER_FAMILIES). */
const OFFICIAL_FAMILIES = new Set(["pts", "reb", "ast", "threePm"]);
type PlayerExp = { families: Record<string, { expected: number | null; median: number | null }>; playRate: number | null } | null;
const expOf = (manifest: NbaManifest | null | undefined, id: string | null) => (manifest ? (playerExpectation(manifest, id) as PlayerExp) : null);
/** The official average beside a modeled stat (never rounded into the run's whole number). */
function OffExp({ e, k }: { e: PlayerExp; k: string }) {
  const v = OFFICIAL_FAMILIES.has(k) ? e?.families?.[k]?.expected : null;
  return v == null ? null : <span className="st-offexp" data-nba-official-exp={k}><span className="st-sr">official average </span>avg {fmtExpectation(v)}</span>;
}
function TeamTable({ team, box, palette, sort, onSort, idBase, manifest, hypothetical = false }: { team: TeamBox; box: NbaBox; palette: NbaPalette; sort: BoxSort; onSort?: (key: string) => void; idBase: string; manifest?: NbaManifest | null; hypothetical?: boolean }) {
  const rows = sortBoxRows(team.rows, sort) as Row[];
  const cols = box.columns;
  const head = `${idBase}-${team.side}-h`;
  const sortCol = cols.find((c) => c.key === sort.key);
  return (
    <section className="nba-bx-team" aria-labelledby={head} data-nba-boxscore-team={team.side}>
      <h3 id={head} className="nba-bx-teamhead">
        <span className={`nba-chip-team${palette[team.side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, team.side)}>{team.abbr}</span>
        <span className="nba-bx-teamname">{team.name}</span>
        <span className="nba-bx-teampts">{box.header.final[team.side]}</span>
      </h3>
      <div className="nba-bx-scroll" role="region" aria-labelledby={head} tabIndex={0}>
        <table className="nba-bx-table">
          <caption className="st-sr">
            {team.name}, {hypothetical ? "hypothetical what-if player lines" : "projected player lines"} of simulated run #{box.header.runIndex}{sortCol ? `, sorted by ${sortCol.title.toLowerCase()} ${sort.dir === "desc" ? "descending" : "ascending"}` : ""}. Every column is modeled engine output.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="nba-bx-name">Player</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" aria-sort={ariaSort(sort, c.key)} data-modeled={c.modeled} className={sort.key === c.key ? "is-sorted" : undefined}>
                  <button type="button" className="nba-bx-sort" title={`${c.title} · ${c.modeled}`} onClick={onSort ? () => onSort(c.key) : undefined}>
                    {c.label}
                    <span className="nba-bx-arrow" aria-hidden="true">{sort.key === c.key ? (sort.dir === "desc" ? "▼" : "▲") : ""}</span>
                    <span className="st-sr">, sort by {c.title.toLowerCase()}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = expOf(manifest, r.providerAthleteId);
              return (
                <tr key={r.providerAthleteId ?? r.name} className={r.status === "dnp" ? "is-dnp" : undefined} data-status={r.status}>
                  <th scope="row" className="nba-bx-name"><span className="nba-bx-pname">{r.name}</span></th>
                  {r.status === "dnp" ? (
                    <td colSpan={cols.length} className="nba-bx-dnp">
                      <abbr title="Did not play: 0 modeled minutes in this run">DNP</abbr> · 0 modeled minutes in this run
                      {e?.families?.pts?.expected != null ? <span className="st-offexp" data-nba-official-exp="dnp">official average per game played: {fmtExpectation(e.families.pts.expected)} pts{e.playRate != null ? ` · plays in ${fmtPct(e.playRate)} of simulated games` : ""}</span> : null}
                    </td>
                  ) : (
                    cols.map((c) => <td key={c.key} className={c.key === "pts" ? "is-pts" : undefined}>{cell(c.key, r[c.key])}<OffExp e={e} k={c.key} /></td>)
                  )}
                </tr>
              );
            })}
            {team.notSimulated.map((r) => (
              <tr key={`ns-${r.providerAthleteId ?? r.name}`} className="is-ns" data-status="not-simulated">
                <th scope="row" className="nba-bx-name"><span className="nba-bx-pname">{r.name}</span></th>
                <td colSpan={cols.length} className="nba-bx-dnp">Not simulated · {NOT_SIMULATED_REASON[r.reason as keyof typeof NOT_SIMULATED_REASON] ?? r.reason}{r.injuryStatus && r.reason !== "out" ? ` (${r.injuryStatus})` : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="nba-bx-name">Team</th>
              {cols.map((c) => (
                <td key={c.key} className={c.key === "pts" ? "is-pts" : undefined}>
                  {cell(c.key, team.totals[c.key])}
                  {c.key === "pts" && manifest?.representative?.official?.team?.[team.side]?.expected != null
                    ? <span className="st-offexp" data-nba-official-exp="team"><span className="st-sr">official expected points </span>avg {fmtExpectation(manifest.representative.official.team[team.side]!.expected)}</span>
                    : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function LeaderCell({ l, box }: { l: Leader; box: NbaBox }) {
  if (!l) return <>—</>;
  return <><b>{l.value}</b> <span className="nba-lead-name">{l.players.map((p) => `${p.name} (${box.teams[p.side].abbr})`).join(", ")}</span></>;
}

/** The box score's content (pure). `result` is nbaBoxScore()'s return value. */
export function BoxScoreBody({ result, palette, sort = DEFAULT_BOX_SORT, onSort, idBase, manifest = null, hypothetical = false }: {
  result: NbaBoxResult | null; palette: NbaPalette; sort?: BoxSort; onSort?: (key: string) => void; idBase: string;
  /** the manifest with `representative`: official expectations beside the run's numbers */
  manifest?: NbaManifest | null;
  /** a what-if run: hypothetical banner and watermark, never "projected" */
  hypothetical?: boolean;
}) {
  if (!result || !result.ok || !result.box) {
    return (
      <div className="nba-bx-unavailable" role="status" data-nba-boxscore-unavailable="">
        <p><b>Box score unavailable.</b> This run failed a box-score invariant, so no player line is shown.</p>
        {result?.errors?.length ? <ul>{result.errors.slice(0, 8).map((e, i) => <li key={i}><code>{e.code}</code> {e.detail}</li>)}</ul> : null}
      </div>
    );
  }
  const box = result.box;
  const h = box.header;
  const kinds = ["pts", "reb", "ast"].filter((k) => box.leaders.game[k] !== undefined);
  const LABEL: Record<string, string> = { pts: "Top scorer", reb: "Top rebounder", ast: "Top assister" };
  const watermark = hypothetical ? NBA_BOX_WATERMARK_WHAT_IF : box.watermark;
  return (
    <div className="nba-bx" data-nba-boxscore-kind={box.kind} data-nba-boxscore-role={hypothetical ? "what-if" : "official"}>
      {hypothetical ? <p className="st-whatif-banner" data-st-whatif-banner="">{WHAT_IF_BANNER}</p> : null}
      <p className="nba-bx-watermark" role="note" id={`${idBase}-wm`} data-nba-boxscore-watermark="">{watermark}</p>
      <div className="nba-bx-summary">
        <div className="nba-bx-final" role="group" aria-label={`${h.status}: ${h.away.abbr} ${h.final.away}, ${h.home.abbr} ${h.final.home}`}>
          {SIDES.map((side) => (
            <div key={side} className={`nba-card-team${h.winner === side ? " is-winner" : ""}${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>
              <span className="nba-card-abbr">{h[side].abbr}</span>
              <span className="nba-card-pts">{h.final[side]}</span>
            </div>
          ))}
        </div>
        <p className="nba-bx-status"><span className="nba-sb-sim">{h.status}</span> {h.matchup} · run #{n(h.runIndex)}{h.simulations ? ` of ${n(h.simulations)}` : ""}{h.title ? ` · ${h.title}` : ""}{h.overtimePeriods ? ` · ${h.overtimePeriods} overtime period${h.overtimePeriods > 1 ? "s" : ""}` : " · no overtime"}</p>
        <dl className="nba-facts nba-bx-facts">
          <div><dt>Box score</dt><dd>One selected simulated run (not a median, not an actual game)</dd></div>
          <div><dt>Engine</dt><dd className="st-mono">{h.engine ?? "—"}{h.profileVersion ? ` · ${h.profileVersion}` : ""}{h.fixture ? " (fixture shape only)" : ""}</dd></div>
          <div><dt>Inputs as of</dt><dd className="st-mono">{h.inputAsOf ?? "—"}</dd></div>
          <div><dt>Seed</dt><dd className="st-mono">{h.seed ?? "—"}</dd></div>
        </dl>
      </div>

      <div className="nba-bx-scroll is-linescore" role="region" aria-label="Quarter-by-quarter, simulated" tabIndex={0}>
        <table className="nba-linescore nba-bx-linescore">
          <caption className="st-sr">Points by period of simulated run #{h.runIndex}{h.overtimePeriods ? ", including overtime" : ""}</caption>
          <thead><tr><th scope="col"><span className="st-sr">Team</span></th>{box.periods.map((p) => <th key={p.label} scope="col" className={p.ot ? "is-ot" : undefined}>{p.label}</th>)}<th scope="col">T</th></tr></thead>
          <tbody>
            {SIDES.map((side) => (
              <tr key={side} className={h.winner === side ? "is-leader" : undefined}>
                <th scope="row"><span className={`nba-chip-team${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>{h[side].abbr}</span></th>
                {box.periods.map((p) => <td key={p.label}>{p[side]}</td>)}
                <td className="is-total">{h.final[side]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {manifest ? <OfficialComparison manifest={manifest} final={h.final} teams={h} hypothetical={hypothetical} /> : null}

      <p className="nba-fine nba-bx-legend">
        Every column is <b>MODELED</b>: this run&apos;s game totals from the engine. MIN to 0.01 (each team sums to exactly {box.teamMinutes}).
        DNP = simulated but 0 minutes in this run (not the same as 0 points). Rows start by modeled minutes; the run records no starters.
      </p>
      {manifest?.representative?.official ? <p className="nba-fine nba-bx-legend" data-nba-official-note="">{NBA_PLAYER_EXPECTATION_NOTE} {RECONCILIATION_NOTE}</p> : null}
      <div className="nba-bx-teams">
        {SIDES.map((side) => <TeamTable key={side} team={box.teams[side]} box={box} palette={palette} sort={sort} onSort={onSort} idBase={idBase} manifest={manifest} hypothetical={hypothetical} />)}
      </div>

      <table className="nba-leaders nba-bx-leaders">
        <caption>Leaders in this run (game totals)</caption>
        <thead><tr><th scope="col"><span className="st-sr">Scope</span></th>{kinds.map((k) => <th key={k} scope="col">{LABEL[k]}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Game</th>{kinds.map((k) => <td key={k} data-k={k.toUpperCase()}><LeaderCell l={box.leaders.game[k]} box={box} /></td>)}</tr>
          {SIDES.map((side) => (
            <tr key={side}>
              <th scope="row"><span className={`nba-chip-team${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>{h[side].abbr}</span></th>
              {kinds.map((k) => <td key={k} data-k={k.toUpperCase()}><LeaderCell l={box.leaders[side][k]} box={box} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="nba-bx-notmodeled" aria-labelledby={`${idBase}-nm`}>
        <h3 id={`${idBase}-nm`} className="nba-h3">Not modeled · not shown</h3>
        <ul className="nba-limits">
          {box.notModeled.map((x) => <li key={x.stat}><b>{x.stat}</b>: {x.why}.</li>)}
        </ul>
      </section>
      <p className="nba-fine nba-bx-prov" data-nba-boxscore-provenance="">{box.provenance} · checked: {box.invariantsChecked.join(", ")}</p>
      <p className="nba-bx-watermark is-foot" aria-hidden="true">{watermark}</p>
    </div>
  );
}

/** The dialog / sheet. Owns the sort; resets it when the run changes. Body scroll is locked while open. */
export default function NbaBoxScoreDialog({ open, onClose, result, palette, compact, runKey, manifest = null, hypothetical = false }: {
  open: boolean; onClose: () => void; result: NbaBoxResult | null; palette: NbaPalette; compact: boolean; runKey: string;
  manifest?: NbaManifest | null; hypothetical?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [sort, setSort] = useState<BoxSort>(DEFAULT_BOX_SORT);
  const latest = useRef(onClose);
  latest.current = onClose;
  const close = useCallback(() => latest.current(), []);
  useDialogFocus(ref as React.RefObject<HTMLElement>, { onClose: close, active: open });
  useEffect(() => { setSort(DEFAULT_BOX_SORT); }, [runKey]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);
  const onSort = useCallback((key: string) => setSort((cur) => nextSort(cur, key) as BoxSort), []);
  if (!open) return null;
  const h = result?.box?.header;
  // portalled to <body> (TheaterLayer): in place it sat in <main>'s z-10 stacking context, under the site's bottom nav
  return (
    <TheaterLayer vars={NBA_THEATER_VARS} className="nba-root">
    <div className="nba-bx-backdrop" onClick={close}>
      <div
        ref={ref}
        className={`nba-bx-dialog${compact ? " is-sheet" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
        aria-describedby={result?.ok ? `${uid}-wm` : undefined}
        data-nba-boxscore=""
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nba-bx-head">
          <div>
            <span className="nba-card-eyebrow">{h ? `${h.status} · ${h.matchup} · run #${n(h.runIndex)}` : "Simulated"}</span>
            <h2 id={`${uid}-title`} className="nba-bx-title">{hypothetical ? WHAT_IF_BOX_TITLE : OFFICIAL_BOX_TITLE}</h2>
          </div>
          <button type="button" className="st-btn nba-bx-close" onClick={close} aria-keyshortcuts="Escape">Close</button>
        </header>
        <div className="nba-bx-body">
          <BoxScoreBody result={result} palette={palette} sort={sort} onSort={onSort} idBase={uid} manifest={manifest} hypothetical={hypothetical} />
        </div>
      </div>
    </div>
    </TheaterLayer>
  );
}
