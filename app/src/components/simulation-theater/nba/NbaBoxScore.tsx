"use client";
/**
 * NBA Simulation Theater · THREE-LAYER PROJECTED BOX SCORE (dev route only; V2 2026-10-20).
 *
 * Renders lib/simulation-theater/nba/projected-box.mjs nbaProjectedBox() for the selected run. Every column carries its
 * layer, and the layers are never mixed in one cell:
 *   "Official projection"        the official snapshot's per-player median / mean (manifest.representative) — the same
 *                                for every run, a what-if included
 *   "Simulated game — one run"   the selected stored run's whole numbers (box-score.mjs invariants)
 *   "Estimated · not official"   the starter / bench grouping only (ROLE_METHOD)
 *   "Not modelled"               FGA · FTA · STL · BLK · TO, printed as "n/m", never filled in
 * plus the official game line (team scores may be WITHHELD), the "one simulated game is not the median" explanation, the
 * quarter linescore incl. OT, leaders, what is not modelled, and the provenance line. A box score that failed its
 * invariants renders "Box score unavailable" with the codes and no numbers.
 *
 * BoxScoreBody is pure (no hooks) so the tests can render it; NbaBoxScoreDialog owns the sort / view / statistic state
 * and the dialog contract (role=dialog, aria-modal, the shared useDialogFocus: focus in, Tab contained, Escape closes,
 * focus returned). Wide screens get a centred dialog; compact screens a full-height sheet. Tables scroll horizontally
 * inside their own region with the player column sticky; the page itself never scrolls sideways.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useDialogFocus } from "@/components/a11y/use-dialog-focus";
import { NOT_SIMULATED_REASON, fmtBoxMinutes } from "@/lib/simulation-theater/nba/box-score.mjs";
import {
  DEFAULT_LAYER_VIEW, DEFAULT_OFFICIAL_STAT, DEFAULT_PROJECTED_SORT, LAYER, LAYER_LABEL, LAYER_NOTE, NOT_MODELLED_TEXT, REPRESENTATIVE_VS_MEDIAN, ROLE_LABEL,
  ROLE_METHOD, TEAM_SCORE_STATE, WHAT_IF_NOTE, WITHHELD_TEXT, nextProjectedSort, officialLayerKey, sortProjectedRows,
} from "@/lib/simulation-theater/nba/projected-box.mjs";
import { OFFICIAL_BOX_TITLE, WHAT_IF_BANNER, WHAT_IF_BOX_TITLE, fmtExpectation, fmtPct } from "@/lib/simulation-theater/representative-labels.mjs";
import { OfficialComparison } from "../RepresentativeParts";
import type { NbaManifest, NbaPalette, NbaSide } from "./nba-types";
import { teamStyle } from "./nba-parts";
import { TheaterLayer } from "../BottomSheet";
import { NBA_THEATER_VARS } from "./nba-theater-css";

export type Layer = "official" | "simulated" | "estimated" | "not-modelled";
export type LayerView = "both" | "official" | "simulated";
export type OfficialStat = "median" | "mean";
export type BoxSort = { layer: "official" | "simulated"; key: string; dir: "asc" | "desc" };
type Col = { layer: Layer; key: string; label: string; title: string; sortable: boolean; derived?: string | null };
type OffVal = { median: number | null; mean: number | null };
type Row = {
  providerAthleteId: string | null; name: string; side: NbaSide; status: "played" | "dnp" | "not-simulated"; role: "starter" | "bench" | null;
  official: { values: Record<string, OffVal>; playRate: number | null; conditioning: string | null } | null;
  simulated: Record<string, number> | null; reason: string | null; injuryStatus: string | null;
};
type Group = { id: string; label: string; layer: string | null; rows: Row[] };
type TeamBox = {
  side: NbaSide; abbr: string; name: string; groups: Group[]; rolesDerivable: boolean;
  totals: { simulated: Record<string, number>; official: { state: string | null; pts: OffVal | null } };
};
type Leader = { value: number; players: { side: NbaSide; name: string }[] } | null;
type TeamTerm = OffVal | null;
type OfficialGame = {
  state: "AVAILABLE" | "NO_OFFICIAL"; refusal: { code: string; message: string } | null; snapshotId: string | null; modelVersion: string | null; publication?: string | null;
  composition?: string | null; winnerSide: NbaSide | null;
  winProbability: { state: "AVAILABLE" | "WITHHELD"; reason: string | null; home: number | null; away: number | null } | null;
  teamScores: { state: "AVAILABLE" | "WITHHELD"; reason: string | null; away: TeamTerm; home: TeamTerm; margin: TeamTerm; total: TeamTerm } | null;
  playerRanges: string | null;
};
type RunFit = { role: string; distance: number | null; tolerance: number | null; withinTolerance: boolean; rule: string | null; text: string };
type SimBox = {
  header: {
    matchup: string; status: string; runIndex: number; title: string | null; simulations: number | null; engine: string | null; profileVersion: string | null;
    inputAsOf: string | null; seed: string | null; fixture: boolean; final: { home: number; away: number }; overtimePeriods: number; winner: NbaSide;
    away: { abbr: string; name: string }; home: { abbr: string; name: string };
  };
  periods: { period: number; label: string; ot: boolean; home: number; away: number }[];
  leaders: { game: Record<string, Leader>; home: Record<string, Leader>; away: Record<string, Leader> };
  notModeled: { stat: string; why: string }[];
  teamMinutes: number;
  provenance: string;
};
export type NbaProjectedBox = {
  schema: string;
  hypothetical: boolean;
  layers: {
    official: { label: string; note: string; state: string; available: boolean; conditioning: string[]; refusal: { code: string; message: string } | null; unplaced: number };
    simulated: { label: string; note: string; runIndex: number; title: string | null; hypothetical: boolean; invariantsChecked: string[]; source: string; fit: RunFit };
    estimated: { label: string; note: string; fields: string[]; method: { id: string; rule: string; label: string; source: string } };
    notModelled: { label: string; note: string; columns: { label: string; why: string }[] };
  };
  officialGame: OfficialGame;
  columns: Col[];
  teams: Record<NbaSide, TeamBox>;
  sim: SimBox;
  watermark: string;
};
export type NbaBoxResult = { ok: boolean; errors: { code: string; detail: string }[]; box: NbaProjectedBox | null };

const SIDES: NbaSide[] = ["away", "home"];
export const DEFAULT_BOX_SORT: BoxSort = DEFAULT_PROJECTED_SORT as BoxSort;
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US"));
const ariaSort = (sort: BoxSort, c: Col) => (sort.layer === c.layer && sort.key === c.key ? (sort.dir === "desc" ? "descending" : "ascending") : undefined);
const simCell = (k: string, v: number | undefined) => (v == null ? "—" : k === "minutes" ? fmtBoxMinutes(v) : String(v));
const offPick = (v: OffVal | null | undefined, stat: OfficialStat) => (v ? (stat === "mean" ? v.mean : v.median) : null);
const STAT_WORD: Record<OfficialStat, string> = { median: "median", mean: "mean" };
const visibleLayers = (view: LayerView): Layer[] => (view === "official" ? ["official"] : view === "simulated" ? ["simulated", "not-modelled"] : ["official", "simulated", "not-modelled"]);

function NotModelledCell({ col }: { col: Col }) {
  return <td className="nba-px-nm" data-layer="not-modelled" title={col.title}><span aria-hidden="true">n/m</span><span className="st-sr">{NOT_MODELLED_TEXT}</span></td>;
}

function TeamTable({ team, box, palette, sort, onSort, view, stat, idBase }: {
  team: TeamBox; box: NbaProjectedBox; palette: NbaPalette; sort: BoxSort; onSort?: (layer: "official" | "simulated", key: string) => void; view: LayerView; stat: OfficialStat; idBase: string;
}) {
  const show = visibleLayers(view);
  const cols = box.columns.filter((c) => show.includes(c.layer));
  const byLayer = (l: Layer) => cols.filter((c) => c.layer === l);
  const off = byLayer("official");
  const sim = byLayer("simulated");
  const nm = byLayer("not-modelled");
  const roles = team.rolesDerivable;
  const head = `${idBase}-${team.side}-h`;
  const sortCol = cols.find((c) => c.layer === sort.layer && c.key === sort.key);
  const width = 1 + (roles ? 1 : 0) + cols.length;
  const runWord = box.hypothetical ? "hypothetical what-if run" : "simulated run";
  const offTitle = (v: OffVal | undefined) => (v ? `${LAYER_LABEL.official}: median ${fmtExpectation(v.median)} · mean ${fmtExpectation(v.mean)}` : `${LAYER_LABEL.official}: none for this player`);
  const sortBtn = (c: Col) => (
    <button type="button" className="nba-bx-sort" title={`${c.title} · ${LAYER_LABEL[c.layer]}`} onClick={onSort && c.sortable ? () => onSort(c.layer as "official" | "simulated", c.key) : undefined}>
      {c.label}
      <span className="nba-bx-arrow" aria-hidden="true">{sort.layer === c.layer && sort.key === c.key ? (sort.dir === "desc" ? "▼" : "▲") : ""}</span>
      <span className="st-sr">, {LAYER_LABEL[c.layer]}, sort by {c.title.toLowerCase()}</span>
    </button>
  );
  return (
    <section className="nba-bx-team" aria-labelledby={head} data-nba-boxscore-team={team.side}>
      <h3 id={head} className="nba-bx-teamhead">
        <span className={`nba-chip-team${palette[team.side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, team.side)}>{team.abbr}</span>
        <span className="nba-bx-teamname">{team.name}</span>
        <span className="nba-bx-teampts" title={`${LAYER_LABEL.simulated}: final`}>{box.sim.header.final[team.side]}</span>
      </h3>
      <div className="nba-bx-scroll" role="region" aria-labelledby={head} tabIndex={0}>
        <table className="nba-bx-table nba-px-table" data-nba-px-view={view}>
          <caption className="st-sr">
            {team.name}: {off.length ? `${LAYER_LABEL.official} (${STAT_WORD[stat]}) and ` : ""}{LAYER_LABEL.simulated} — {runWord} #{box.sim.header.runIndex}{sortCol ? `, sorted by ${LAYER_LABEL[sortCol.layer]} ${sortCol.title.toLowerCase()} ${sort.dir === "desc" ? "descending" : "ascending"}` : ""}.
          </caption>
          <thead>
            <tr className="nba-px-layerrow">
              <td className="nba-bx-name nba-px-corner" colSpan={roles ? 2 : 1} />
              {off.length ? <th scope="colgroup" colSpan={off.length} className="nba-px-layerhead" data-layer="official">{LAYER_LABEL.official} · {STAT_WORD[stat]}</th> : null}
              {sim.length ? <th scope="colgroup" colSpan={sim.length} className="nba-px-layerhead" data-layer="simulated">{LAYER_LABEL.simulated}{box.hypothetical ? " · what-if" : ""}</th> : null}
              {nm.length ? <th scope="colgroup" colSpan={nm.length} className="nba-px-layerhead" data-layer="not-modelled">{LAYER_LABEL["not-modelled"]}</th> : null}
            </tr>
            <tr>
              <th scope="col" className="nba-bx-name">Player</th>
              {roles ? <th scope="col" className="nba-px-role" data-layer="estimated" title={`${LAYER_LABEL.estimated}: ${box.layers.estimated.method.rule}`}>Role <span className="nba-px-est">est.</span></th> : null}
              {cols.map((c) => (
                <th key={`${c.layer}-${c.key}`} scope="col" aria-sort={c.sortable ? ariaSort(sort, c) : undefined} data-layer={c.layer} data-modeled={c.layer === "simulated" ? "MODELED" : undefined}
                  className={[sort.layer === c.layer && sort.key === c.key ? "is-sorted" : "", c.layer === "official" && c === off[0] ? "is-first" : "", c.layer === "simulated" && c === sim[0] ? "is-first" : ""].filter(Boolean).join(" ") || undefined}>
                  {c.sortable ? sortBtn(c) : <abbr className="nba-px-nmhead" title={c.title}>{c.label}</abbr>}
                </th>
              ))}
            </tr>
          </thead>
          {team.groups.map((g) => {
            const rows = sortProjectedRows(g.rows, { ...sort, stat }) as Row[];
            return (
              <tbody key={g.id} data-nba-px-group={g.id}>
                <tr className="nba-px-grouprow">
                  <th scope="rowgroup" colSpan={width} data-layer={g.layer ?? undefined}><span className="nba-px-grouplabel">{g.label}{g.layer === LAYER.ESTIMATED ? <span className="nba-px-est"> · {ROLE_METHOD.label}</span> : null}</span></th>
                </tr>
                {rows.map((r) => (
                  <tr key={r.providerAthleteId ?? r.name} className={r.status === "dnp" ? "is-dnp" : r.status === "not-simulated" ? "is-ns" : undefined} data-status={r.status} data-role={r.role ?? undefined}>
                    <th scope="row" className="nba-bx-name">
                      <span className="nba-bx-pname">{r.name}</span>
                      {off.length && r.official?.playRate != null && r.official.conditioning === "CONDITIONAL_ON_PLAYING" ? <span className="st-offexp">plays in {fmtPct(r.official.playRate)} of simulated games</span> : null}
                    </th>
                    {roles ? <td className="nba-px-role" data-layer="estimated">{r.role ? ROLE_LABEL[r.role] : "—"}</td> : null}
                    {off.map((c) => {
                      const v = r.official?.values?.[c.key];
                      const x = offPick(v, stat);
                      return <td key={`o-${c.key}`} className={`nba-px-off${c === off[0] ? " is-first" : ""}`} data-layer="official" data-nba-official={c.key} title={offTitle(v)}>{x == null ? <><span aria-hidden="true">—</span><span className="st-sr">no official projection</span></> : fmtExpectation(x)}</td>;
                    })}
                    {sim.length ? (
                      r.status === "played" && r.simulated ? (
                        sim.map((c) => <td key={`s-${c.key}`} className={[c.key === "pts" ? "is-pts" : "", c === sim[0] ? "is-first" : ""].filter(Boolean).join(" ") || undefined} data-layer="simulated">{simCell(c.key, r.simulated![c.key])}</td>)
                      ) : r.status === "dnp" ? (
                        <td colSpan={sim.length} className="nba-bx-dnp is-first" data-layer="simulated"><abbr title="Did not play: 0 modeled minutes in this run">DNP</abbr> · 0 modeled minutes in this run</td>
                      ) : (
                        <td colSpan={sim.length} className="nba-bx-dnp is-first" data-layer="simulated">Not simulated · {NOT_SIMULATED_REASON[r.reason as keyof typeof NOT_SIMULATED_REASON] ?? r.reason}{r.injuryStatus && r.reason !== "out" ? ` (${r.injuryStatus})` : ""}</td>
                      )
                    ) : null}
                    {nm.map((c) => <NotModelledCell key={`n-${c.key}`} col={c} />)}
                  </tr>
                ))}
              </tbody>
            );
          })}
          <tfoot>
            <tr>
              <th scope="row" className="nba-bx-name">Team</th>
              {roles ? <td className="nba-px-role" /> : null}
              {off.map((c) => {
                if (c.key !== "pts") return <td key={`o-${c.key}`} className={`nba-px-off${c === off[0] ? " is-first" : ""}`} data-layer="official"><span aria-hidden="true">—</span><span className="st-sr">player projections are not summed into a team total</span></td>;
                const t = team.totals.official;
                const x = offPick(t.pts, stat);
                return (
                  <td key="o-pts" className={`nba-px-off${c === off[0] ? " is-first" : ""}`} data-layer="official" data-nba-official-team={t.state ?? "none"}>
                    {t.state === TEAM_SCORE_STATE.WITHHELD ? <span className="nba-px-withheld">{WITHHELD_TEXT}</span> : x == null ? "—" : fmtExpectation(x)}
                  </td>
                );
              })}
              {sim.map((c) => <td key={`s-${c.key}`} className={[c.key === "pts" ? "is-pts" : "", c === sim[0] ? "is-first" : ""].filter(Boolean).join(" ") || undefined} data-layer="simulated">{simCell(c.key, team.totals.simulated[c.key])}</td>)}
              {nm.map((c) => <NotModelledCell key={`n-${c.key}`} col={c} />)}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function LeaderCell({ l, box }: { l: Leader; box: NbaProjectedBox }) {
  if (!l) return <>—</>;
  return <><b>{l.value}</b> <span className="nba-lead-name">{l.players.map((p) => `${p.name} (${box.teams[p.side].abbr})`).join(", ")}</span></>;
}

/** The official game line (layer "official"): side, win probability, team score — or "Withheld". Same for every run. */
function OfficialGameLine({ game, box, idBase }: { game: OfficialGame; box: NbaProjectedBox; idBase: string }) {
  const h = box.sim.header;
  if (game.state !== "AVAILABLE") {
    return (
      <section className="nba-px-official is-none" data-layer="official" data-nba-px-official="none" aria-labelledby={`${idBase}-og`}>
        <h3 id={`${idBase}-og`} className="nba-h3">{LAYER_LABEL.official} · game</h3>
        <p className="nba-fine">No official forecast for this game{game.refusal ? ` (${game.refusal.code})` : ""}: every number below is the simulated game only.</p>
      </section>
    );
  }
  const ts = game.teamScores;
  const term = (t: TeamTerm) => (t ? `${fmtExpectation(t.mean)} (median ${fmtExpectation(t.median)})` : "—");
  return (
    <section className="nba-px-official" data-layer="official" data-nba-px-official="" aria-labelledby={`${idBase}-og`}>
      <h3 id={`${idBase}-og`} className="nba-h3">{LAYER_LABEL.official} · game</h3>
      <dl className="nba-facts nba-px-facts">
        <div><dt>Favoured</dt><dd data-nba-px-favoured="">{game.winnerSide ? h[game.winnerSide].abbr : "—"}</dd></div>
        {game.winProbability?.state === TEAM_SCORE_STATE.WITHHELD ? (
          <div className="is-wide"><dt>Win probability</dt><dd data-nba-px-winprob="WITHHELD"><b className="nba-px-withheld">{WITHHELD_TEXT}</b> · {game.winProbability.reason}</dd></div>
        ) : game.winProbability ? (
          <div><dt>Win probability</dt><dd data-nba-px-winprob="AVAILABLE">{h.away.abbr} {fmtPct(game.winProbability.away)} · {h.home.abbr} {fmtPct(game.winProbability.home)}</dd></div>
        ) : null}
        {ts?.state === TEAM_SCORE_STATE.WITHHELD ? (
          <div className="is-wide"><dt>Official team score</dt><dd data-nba-px-teamscore="WITHHELD"><b className="nba-px-withheld">{WITHHELD_TEXT}</b> · {ts.reason}</dd></div>
        ) : ts ? (
          <>
            <div><dt>{h.away.abbr} points</dt><dd data-nba-px-teamscore="AVAILABLE">{term(ts.away)}</dd></div>
            <div><dt>{h.home.abbr} points</dt><dd>{term(ts.home)}</dd></div>
            <div><dt>Margin ({h.home.abbr} − {h.away.abbr})</dt><dd>{term(ts.margin)}</dd></div>
            <div><dt>Total</dt><dd>{term(ts.total)}</dd></div>
          </>
        ) : null}
      </dl>
      {game.playerRanges ? <p className="nba-fine" data-nba-px-ranges="">Player ranges: {game.playerRanges}</p> : null}
      <p className="nba-fine">{LAYER_NOTE.official} The same for every run below{game.composition ? ` · ${game.composition}` : ""}{game.modelVersion ? ` · side ${game.modelVersion}` : ""}{game.publication === "PRIVATE" ? " · private" : ""}.</p>
    </section>
  );
}

/** "One simulated game is not the median" (always shown; a what-if adds that the official columns do not move). */
export function RepresentativeVsMedian({ idBase, hypothetical }: { idBase: string; hypothetical: boolean }) {
  return (
    <section className="nba-px-explain" aria-labelledby={`${idBase}-rvm`} data-nba-px-explain="">
      <h3 id={`${idBase}-rvm`} className="nba-h3">{REPRESENTATIVE_VS_MEDIAN.title}</h3>
      <p className="nba-fine">{REPRESENTATIVE_VS_MEDIAN.lead}</p>
      <ul className="nba-limits">{REPRESENTATIVE_VS_MEDIAN.points.map((p) => <li key={p}>{p}</li>)}</ul>
      {hypothetical ? <p className="nba-px-whatifnote" data-nba-px-whatif-note="">{WHAT_IF_NOTE}</p> : null}
    </section>
  );
}

/** View controls: which layers the tables show, and which official statistic. Native radios (arrow keys, Tab). */
export function BoxControls({ view, onView, stat, onStat, officialAvailable, idBase }: {
  view: LayerView; onView?: (v: LayerView) => void; stat: OfficialStat; onStat?: (s: OfficialStat) => void; officialAvailable: boolean; idBase: string;
}) {
  const views: [LayerView, string][] = [["both", "Both layers"], ["official", LAYER_LABEL.official], ["simulated", LAYER_LABEL.simulated]];
  return (
    <div className="nba-px-controls" data-nba-px-controls="">
      <fieldset className="nba-px-fs">
        <legend>Show columns</legend>
        {views.map(([v, label]) => (
          <label key={v} className="nba-px-radio">
            <input type="radio" name={`${idBase}-view`} value={v} checked={view === v} disabled={v === "official" && !officialAvailable} onChange={() => onView?.(v)} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      {officialAvailable ? (
        <fieldset className="nba-px-fs">
          <legend>Official statistic</legend>
          {(["median", "mean"] as OfficialStat[]).map((s) => (
            <label key={s} className="nba-px-radio">
              <input type="radio" name={`${idBase}-stat`} value={s} checked={stat === s} onChange={() => onStat?.(s)} />
              <span>{s === "median" ? "Median" : "Mean"}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

/** The box score's content (pure). `result` is nbaProjectedBox()'s return value. */
export function BoxScoreBody({ result, palette, sort = DEFAULT_BOX_SORT, onSort, view = DEFAULT_LAYER_VIEW as LayerView, onView, stat = DEFAULT_OFFICIAL_STAT as OfficialStat, onStat, idBase, manifest = null }: {
  result: NbaBoxResult | null; palette: NbaPalette; sort?: BoxSort; onSort?: (layer: "official" | "simulated", key: string) => void;
  view?: LayerView; onView?: (v: LayerView) => void; stat?: OfficialStat; onStat?: (s: OfficialStat) => void; idBase: string;
  /** the manifest with `representative`: the shared official-vs-run comparison (only when the official team score is published) */
  manifest?: NbaManifest | null;
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
  const hypothetical = box.hypothetical;
  const h = box.sim.header;
  const kinds = ["pts", "reb", "ast"].filter((k) => box.sim.leaders.game[k] !== undefined);
  const LABEL: Record<string, string> = { pts: "Top scorer", reb: "Top rebounder", ast: "Top assister" };
  const offAvail = box.layers.official.available;
  const effView: LayerView = !offAvail && view === "official" ? "simulated" : view;
  const showCompare = manifest && box.officialGame.teamScores?.state === TEAM_SCORE_STATE.AVAILABLE;
  return (
    <div className="nba-bx" data-nba-boxscore-kind="selected-run-sample" data-nba-boxscore-role={hypothetical ? "what-if" : "official"} data-nba-official-key={officialLayerKey(box)}>
      {hypothetical ? <p className="st-whatif-banner" data-st-whatif-banner="">{WHAT_IF_BANNER}</p> : null}
      <p className="nba-bx-watermark" role="note" id={`${idBase}-wm`} data-nba-boxscore-watermark="">{box.watermark}</p>
      <div className="nba-bx-summary">
        <span className="nba-card-eyebrow" data-layer="simulated">{LAYER_LABEL.simulated}{hypothetical ? " · what-if · hypothetical" : ""} · {box.layers.simulated.source}</span>
        <p className={`nba-px-fit${box.layers.simulated.fit.withinTolerance ? "" : " is-far"}`} data-nba-px-fit={box.layers.simulated.fit.role} data-within={box.layers.simulated.fit.withinTolerance ? "true" : "false"}>{box.layers.simulated.fit.text}</p>
        <div className="nba-bx-final" role="group" aria-label={`${LAYER_LABEL.simulated}, ${h.status}: ${h.away.abbr} ${h.final.away}, ${h.home.abbr} ${h.final.home}`}>
          {SIDES.map((side) => (
            <div key={side} className={`nba-card-team${h.winner === side ? " is-winner" : ""}${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>
              <span className="nba-card-abbr">{h[side].abbr}</span>
              <span className="nba-card-pts">{h.final[side]}</span>
            </div>
          ))}
        </div>
        <p className="nba-bx-status"><span className="nba-sb-sim">{h.status}</span> {h.matchup} · run #{n(h.runIndex)}{h.simulations ? ` of ${n(h.simulations)}` : ""}{h.title ? ` · ${h.title}` : ""}{h.overtimePeriods ? ` · ${h.overtimePeriods} overtime period${h.overtimePeriods > 1 ? "s" : ""}` : " · no overtime"}</p>
        <dl className="nba-facts nba-bx-facts">
          <div><dt>Box score</dt><dd>One selected simulated run (not a median, not an actual game) beside the official projection</dd></div>
          <div><dt>Engine</dt><dd className="st-mono">{h.engine ?? "—"}{h.profileVersion ? ` · ${h.profileVersion}` : ""}{h.fixture ? " (fixture shape only)" : ""}</dd></div>
          <div><dt>Inputs as of</dt><dd className="st-mono">{h.inputAsOf ?? "—"}</dd></div>
          <div><dt>Seed</dt><dd className="st-mono">{h.seed ?? "—"}</dd></div>
        </dl>
      </div>

      <OfficialGameLine game={box.officialGame} box={box} idBase={idBase} />
      <RepresentativeVsMedian idBase={idBase} hypothetical={hypothetical} />

      <div className="nba-bx-scroll is-linescore" role="region" aria-label={`Quarter-by-quarter · ${LAYER_LABEL.simulated}`} tabIndex={0}>
        <table className="nba-linescore nba-bx-linescore" data-layer="simulated">
          <caption className="st-sr">Points by period of simulated run #{h.runIndex}{h.overtimePeriods ? ", including overtime" : ""}. The official forecast has no quarter scores.</caption>
          <thead><tr><th scope="col"><span className="st-sr">Team</span></th>{box.sim.periods.map((p) => <th key={p.label} scope="col" className={p.ot ? "is-ot" : undefined}>{p.label}</th>)}<th scope="col">T</th></tr></thead>
          <tbody>
            {SIDES.map((side) => (
              <tr key={side} className={h.winner === side ? "is-leader" : undefined}>
                <th scope="row"><span className={`nba-chip-team${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>{h[side].abbr}</span></th>
                {box.sim.periods.map((p) => <td key={p.label}>{p[side]}</td>)}
                <td className="is-total">{h.final[side]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCompare && manifest ? <OfficialComparison manifest={manifest} final={h.final} teams={h} hypothetical={hypothetical} /> : null}

      <BoxControls view={effView} onView={onView} stat={stat} onStat={onStat} officialAvailable={offAvail} idBase={idBase} />
      <ul className="nba-px-legend" aria-label="Column layers" data-nba-px-legend="">
        {offAvail ? <li data-layer="official"><b>{LAYER_LABEL.official}</b> · {LAYER_NOTE.official}{box.layers.official.conditioning.includes("CONDITIONAL_ON_PLAYING") ? " Per game played (conditional on minutes > 0)." : ""}</li> : <li data-layer="official"><b>{LAYER_LABEL.official}</b> · none for this game.</li>}
        <li data-layer="simulated"><b>{LAYER_LABEL.simulated}</b> · {LAYER_NOTE.simulated} MIN to 0.01 (each team sums to exactly {box.sim.teamMinutes}); FGM = 2PM + 3PM. DNP = simulated but 0 minutes in this run (not the same as 0 points).</li>
        {box.layers.estimated.fields.length ? <li data-layer="estimated"><b>{LAYER_LABEL.estimated}</b> · {LAYER_NOTE.estimated}</li> : null}
        <li data-layer="not-modelled"><b>n/m = {NOT_MODELLED_TEXT}</b> · {LAYER_NOTE["not-modelled"]}</li>
      </ul>
      {box.layers.official.unplaced ? <p className="nba-fine">{box.layers.official.unplaced} official player projection{box.layers.official.unplaced > 1 ? "s have" : " has"} no row on this game&apos;s roster and {box.layers.official.unplaced > 1 ? "are" : "is"} not shown.</p> : null}
      <div className="nba-bx-teams">
        {SIDES.map((side) => <TeamTable key={side} team={box.teams[side]} box={box} palette={palette} sort={sort} onSort={onSort} view={effView} stat={stat} idBase={idBase} />)}
      </div>

      <table className="nba-leaders nba-bx-leaders" data-layer="simulated">
        <caption>Leaders in this run (simulated game totals)</caption>
        <thead><tr><th scope="col"><span className="st-sr">Scope</span></th>{kinds.map((k) => <th key={k} scope="col">{LABEL[k]}</th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Game</th>{kinds.map((k) => <td key={k} data-k={k.toUpperCase()}><LeaderCell l={box.sim.leaders.game[k]} box={box} /></td>)}</tr>
          {SIDES.map((side) => (
            <tr key={side}>
              <th scope="row"><span className={`nba-chip-team${palette[side].patterned ? " is-cue" : ""}`} style={teamStyle(palette, side)}>{h[side].abbr}</span></th>
              {kinds.map((k) => <td key={k} data-k={k.toUpperCase()}><LeaderCell l={box.sim.leaders[side][k]} box={box} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="nba-bx-notmodeled" aria-labelledby={`${idBase}-nm`}>
        <h3 id={`${idBase}-nm`} className="nba-h3">Not modeled · not shown</h3>
        <ul className="nba-limits">
          {box.sim.notModeled.map((x) => <li key={x.stat}><b>{x.stat}</b>: {x.why}.</li>)}
        </ul>
      </section>
      <p className="nba-fine nba-bx-prov" data-nba-boxscore-provenance="">{box.sim.provenance} · checked: {box.layers.simulated.invariantsChecked.join(", ")}{box.layers.estimated.fields.length ? ` · role: ${box.layers.estimated.method.id}` : ""}</p>
      <p className="nba-bx-watermark is-foot" aria-hidden="true">{box.watermark}</p>
    </div>
  );
}

/** The dialog / sheet. Owns sort (reset when the run changes), layer view and official statistic (kept across runs). */
export default function NbaBoxScoreDialog({ open, onClose, result, palette, compact, runKey, manifest = null }: {
  open: boolean; onClose: () => void; result: NbaBoxResult | null; palette: NbaPalette; compact: boolean; runKey: string;
  manifest?: NbaManifest | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [sort, setSort] = useState<BoxSort>(DEFAULT_BOX_SORT);
  const [view, setView] = useState<LayerView>(DEFAULT_LAYER_VIEW as LayerView);
  const [stat, setStat] = useState<OfficialStat>(DEFAULT_OFFICIAL_STAT as OfficialStat);
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
  const onSort = useCallback((layer: "official" | "simulated", key: string) => setSort((cur) => nextProjectedSort(cur, layer, key) as BoxSort), []);
  if (!open) return null;
  const h = result?.box?.sim.header;
  const hypothetical = result?.box?.hypothetical ?? false;
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
          <BoxScoreBody result={result} palette={palette} sort={sort} onSort={onSort} view={view} onView={setView} stat={stat} onStat={setStat} idBase={uid} manifest={manifest} />
        </div>
      </div>
    </div>
    </TheaterLayer>
  );
}
