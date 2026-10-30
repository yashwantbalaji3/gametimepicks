/**
 * Simulation Theater · NFL player box score of ONE simulated run (server-safe: no hooks; also used in the island dialog).
 *
 * Every number is lib/simulation-theater/nfl-run-box-score.mjs `nflRunBoxScore(run)` for the run on screen, folded from
 * that run's own play log and reconciled exactly to its team totals and final score at build time
 * (lib/sports/nfl/sim-v2/player-run.mjs). Titled "Box score · Simulated scenario (hypothetical)": these are one
 * simulated game's lines, never official numbers and never a forecast. Without a verified box the section says
 * "Player box score unavailable for this run" with the reason, and prints no player numbers.
 *
 * Layout: one block per team (away, home), each with Passing / Rushing / Receiving tables (caption, column and row
 * headers), a team line and the touchdown scorers. Columns are few and narrow so a 360 px phone shows them without
 * horizontal scrolling; the scroll region is a fallback for long names.
 */
import { ACCOUNTING_RULES, DEF_ST_NAME, RUN_BOX_TITLE, RUN_BOX_UNAVAILABLE } from "@/lib/simulation-theater/nfl-run-box-score.mjs";

type Side = "away" | "home";
type Row = { id: string; name: string; position: string | null; [k: string]: number | string | null };
type TeamLine = Record<string, number>;
export type RunPlayerBoxSide = { abbr: string; passing: Row[]; rushing: Row[]; receiving: Row[]; tdScorers: Row[]; turnovers: Row[]; team: TeamLine };
export type RunPlayerBoxData = { version: string; title: string; runIndex: number | null; final: { home: number; away: number; overtime: boolean }; away: RunPlayerBoxSide; home: RunPlayerBoxSide };
export type RunBoxRefusal = { code: string; reason: string } | null;

const SIDES: Side[] = ["away", "home"];
const who = (r: Row) => (r.position ? `${r.name} · ${r.position}` : r.name);

function Section({ caption, cols, rows, cells, idBase }: { caption: string; cols: string[]; rows: Row[]; cells: (r: Row) => (string | number)[]; idBase: string }) {
  if (!rows.length) return null;
  return (
    <table className="strb-table" data-strb-section={idBase}>
      <caption className="strb-cap">{caption}</caption>
      <thead><tr><th scope="col">Player</th>{cols.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} data-strb-player={r.id}>
            <th scope="row">{who(r)}</th>
            {cells(r).map((v, i) => <td key={i}>{v}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TeamBlock({ box, side }: { box: RunPlayerBoxData; side: Side }) {
  const s = box[side];
  const t = s.team;
  const abbr = s.abbr;
  const td = s.tdScorers.map((r) => `${r.id === "DEF_ST" ? DEF_ST_NAME : r.name}${Number(r.tds) > 1 ? ` ×${r.tds}` : ""}`).join(", ");
  return (
    <div className="strb-team" data-strb-team={side}>
      <h4 className="strb-h">{abbr} <span className="strb-pts" data-strb-points={side}>{t.points}</span></h4>
      <Section idBase="passing" caption={`${abbr} passing`} cols={["C/ATT", "YDS", "TD", "INT"]} rows={s.passing} cells={(r) => [`${r.cmp}/${r.passAtt}`, r.passYds as number, r.passTd as number, r.int as number]} />
      <Section idBase="rushing" caption={`${abbr} rushing`} cols={["CAR", "YDS", "TD", "FUM"]} rows={s.rushing} cells={(r) => [r.rushAtt as number, r.rushYds as number, r.rushTd as number, r.fumLost as number]} />
      <Section idBase="receiving" caption={`${abbr} receiving`} cols={["REC/TGT", "YDS", "TD"]} rows={s.receiving} cells={(r) => [`${r.rec}/${r.targets}`, r.recYds as number, r.recTd as number]} />
      <p className="strb-line" data-strb-team-line={side}>
        <b>Team</b> · passing {t.cmp}/{t.passAtt}, {t.passYds} yds gross · sacked {t.sacks}–{t.sackYds} · net passing {t.netPassYds} · rushing {t.rushAtt}–{t.rushYds}
        {" "}· turnovers {t.turnovers} ({t.int} INT, {t.fumLost} fumbles lost) · FG {t.fgMade}/{t.fgAtt} · XP {t.xpMade}/{t.xpAtt} · 2-pt {t.twoMade}/{t.twoAtt}
        {t.defTd ? ` · defense / special teams TD ${t.defTd}` : ""}{t.safeties ? ` · safeties ${t.safeties}` : ""}
      </p>
      <p className="strb-line" data-strb-td={side}><b>Touchdowns</b> · {td || "none"}</p>
    </div>
  );
}

export default function RunPlayerBox({ box, refusal = null, runIndex }: { box: RunPlayerBoxData | null; refusal?: RunBoxRefusal; runIndex: number }) {
  if (!box) {
    return (
      <div className="strb" data-strb="" data-strb-state="unavailable" data-strb-error={refusal?.code ?? "UNAVAILABLE"}>
        <h4 className="strb-h">{RUN_BOX_UNAVAILABLE}</h4>
        <p className="stbx-note">No player numbers are shown rather than estimated ones: {refusal?.reason ?? "this run's player lines were not derived"}.</p>
      </div>
    );
  }
  return (
    <div className="strb" data-strb="" data-strb-state="ready" data-strb-run={runIndex} data-strb-version={box.version}>
      <h4 className="strb-title">{RUN_BOX_TITLE} · players · run #{runIndex.toLocaleString("en-US")}</h4>
      <p className="stbx-note">One simulated game&apos;s player lines, reconciled exactly to its team totals and final score. Not a forecast and not actual game statistics.</p>
      <div className="strb-grid">{SIDES.map((s) => <TeamBlock key={s} box={box} side={s} />)}</div>
      <details className="strb-rules">
        <summary>How plays are counted</summary>
        <ul>{ACCOUNTING_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </details>
    </div>
  );
}
