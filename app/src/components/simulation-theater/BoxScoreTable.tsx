/**
 * Simulation Theater V2 · projected box score, the parts that need no JavaScript (server-safe: no hooks).
 *
 * Every number comes from lib/simulation-theater/box-score.mjs `nflBoxScore(sample, manifest)` for ONE representative
 * run of the receipt of record; nothing is computed here. NOT_MODELED categories render the words "Not modeled by this
 * engine" and their reason — never a zero, never a blank.
 *
 * Used by:
 *   BoxScoreStatic  the server-rendered two-team table (the no-JavaScript fallback) on the public section
 *                   (PublicTheaterSection, next to the drive table) and on the dev route;
 *   BoxScorePanel   the island's dialog (team tabs), which reuses the header, line score, rows and provenance below.
 * Loaded only through Theater imports, so with GTP_NFL_THEATER_PUBLIC off none of it is in the public export.
 */
import EtTime from "@/components/ui/et-time";
import type { Side } from "./FieldScene";
import type { TheaterManifest, TheaterSample } from "./types";
import {
  BOX_SCORE_TITLE, BOX_SCORE_WATERMARK, CATEGORY_GROUPS, NOT_MODELED_TEXT, STATUS_HELP, STATUS_LABEL, safeNflBoxScore,
} from "@/lib/simulation-theater/box-score.mjs";

export type BoxStatus = "MODELED" | "DERIVED" | "NOT_MODELED";
export type BoxCell = { value: number | null; display: string };
export type BoxCategory = { id: string; group: string; label: string; status: BoxStatus; note: string | null; reason: string | null; away: BoxCell; home: BoxCell };
export type BoxScore = {
  version: string;
  watermark: string;
  header: {
    label: string; matchup: string; teams: Record<Side, { abbr: string; name: string | null }>;
    final: Record<Side, number>; overtime: boolean; winner: Side | null; scoreLine: string;
    runIndex: number; runCount: number | null; kind: string; kindLabel: string;
    engine: string; engineVersion: string | null; receiptId: string; receiptFile: string | null; receiptHash: string | null; generatedAt: string | null;
  };
  provenance: string;
  periods: { status: BoxStatus; note: string; columns: string[]; away: number[]; home: number[]; total: Record<Side, number> };
  composition: Record<Side, string>;
  categories: BoxCategory[];
  players: { id: string; label: string; status: BoxStatus; reason: string }[];
  invariants: { id: string; ok: boolean; detail: string }[];
};

const SIDES: Side[] = ["away", "home"];

export function StatusTag({ status }: { status: BoxStatus }) {
  return (
    <span className={`stbx-status is-${status.toLowerCase()}`} data-stbx-status={status} title={STATUS_HELP[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Watermark() {
  return <p className="stbx-mark" data-stbx-watermark="">{BOX_SCORE_WATERMARK}</p>;
}

export function BoxHeader({ box }: { box: BoxScore }) {
  const h = box.header;
  return (
    <div className="stbx-head">
      <p className="stbx-final">
        <b>{h.label}</b>
        <span className="stbx-score" data-stbx-final="">{h.scoreLine}</span>
      </p>
      <p className="stbx-sub">Run #{h.runIndex.toLocaleString("en-US")} · {h.kindLabel} representative run · totals for the whole simulated game</p>
    </div>
  );
}

export function PeriodTable({ box }: { box: BoxScore }) {
  const p = box.periods;
  const t = box.header.teams;
  return (
    <table className="stbx-line" data-stbx-periods="">
      <caption className="stbx-cap">Scoring by period <StatusTag status={p.status} /> <span className="stbx-note">{p.note}</span></caption>
      <thead>
        <tr><th scope="col"><span className="st-sr">Team</span></th>{p.columns.map((c) => <th key={c} scope="col">{c}</th>)}<th scope="col">T</th></tr>
      </thead>
      <tbody>
        {SIDES.map((s) => (
          <tr key={s} data-stbx-period-side={s}>
            <th scope="row">{t[s].abbr}</th>
            {p[s].map((v, i) => <td key={i}>{v}</td>)}
            <td><b>{p.total[s]}</b></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RowHead({ c }: { c: BoxCategory }) {
  return (
    <th scope="row">
      <span className="stbx-label">{c.label}</span> <StatusTag status={c.status} />
      {c.note ? <span className="stbx-note">{c.note}</span> : null}
      {c.reason ? <span className="stbx-note">Why: {c.reason}</span> : null}
    </th>
  );
}

/** One team's column (the dialog's team tab). */
export function TeamCategoryTable({ box, side, idBase }: { box: BoxScore; side: Side; idBase: string }) {
  const abbr = box.header.teams[side].abbr;
  return (
    <table className="stbx-table is-team" data-stbx-team={side}>
      <caption className="st-sr">{abbr} team totals in simulated run #{box.header.runIndex}, derived from its recorded drives</caption>
      <thead><tr><th scope="col">Category</th><th scope="col" id={`${idBase}-${side}-v`}>{abbr}</th></tr></thead>
      {CATEGORY_GROUPS.map((g) => {
        const rows = box.categories.filter((c) => c.group === g);
        if (!rows.length) return null;
        return (
          <tbody key={g}>
            <tr className="stbx-group"><th scope="colgroup" colSpan={2}>{g}</th></tr>
            {rows.map((c) => (
              <tr key={c.id} data-stbx-cat={c.id} data-stbx-row-status={c.status}>
                <RowHead c={c} />
                <td data-stbx-side={side} className={c.status === "NOT_MODELED" ? "is-nm" : undefined}>{c[side].display}</td>
              </tr>
            ))}
          </tbody>
        );
      })}
    </table>
  );
}

/** Both teams side by side (the server-rendered fallback). */
export function CompareCategoryTable({ box }: { box: BoxScore }) {
  const t = box.header.teams;
  return (
    <table className="stbx-table is-compare" data-stbx-compare="">
      <caption className="st-sr">Team totals of both teams in simulated run #{box.header.runIndex}, derived from its recorded drives</caption>
      <thead><tr><th scope="col">Category</th>{SIDES.map((s) => <th key={s} scope="col">{t[s].abbr}</th>)}</tr></thead>
      {CATEGORY_GROUPS.map((g) => {
        const rows = box.categories.filter((c) => c.group === g);
        if (!rows.length) return null;
        return (
          <tbody key={g}>
            <tr className="stbx-group"><th scope="colgroup" colSpan={3}>{g}</th></tr>
            {rows.map((c) => (
              <tr key={c.id} data-stbx-cat={c.id} data-stbx-row-status={c.status}>
                <RowHead c={c} />
                {c.status === "NOT_MODELED"
                  ? <td colSpan={2} className="is-nm" data-stbx-side="both">{NOT_MODELED_TEXT}</td>
                  : SIDES.map((s) => <td key={s} data-stbx-side={s}>{c[s].display}</td>)}
              </tr>
            ))}
          </tbody>
        );
      })}
    </table>
  );
}

/** Player sections: explicit "Not modeled by this engine" rows, never a zero line. */
export function PlayerSections({ box }: { box: BoxScore }) {
  return (
    <div className="stbx-players" data-stbx-players="">
      <h4 className="stbx-h">Player statistics</h4>
      <ul>
        {box.players.map((p) => (
          <li key={p.id} data-stbx-player={p.id} data-stbx-row-status={p.status}>
            <span className="stbx-label">{p.label}</span> <StatusTag status={p.status} />
            <span className="stbx-nm">{NOT_MODELED_TEXT}</span>
            <span className="stbx-note">Why: {p.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Composition({ box }: { box: BoxScore }) {
  return (
    <p className="stbx-comp" data-stbx-composition="">
      Points check: {SIDES.map((s) => <span key={s}><b>{box.header.teams[s].abbr}</b> {box.composition[s]}</span>)}
    </p>
  );
}

/** The provenance line; the frozen timestamp prints as ET text with the exact ISO value in `datetime` (P246). */
export function Provenance({ box }: { box: BoxScore }) {
  const at = box.header.generatedAt;
  return (
    <p className="stbx-prov" data-stbx-provenance="">
      {box.provenance}
      {at ? <> · receipt frozen <EtTime iso={at} /></> : null}
    </p>
  );
}

/**
 * The server-rendered box score (no JavaScript needed). `box` null ⇒ a truthful unavailable line with the reason.
 */
export function BoxScoreStatic({ box, error }: { box: BoxScore | null; error?: { code: string; reason: string } | null }) {
  if (!box) {
    return (
      <section className="stbx stbx-static" data-stbx-static="" data-stbx-state="unavailable" data-stbx-error={error?.code ?? "UNAVAILABLE"} aria-label={`${BOX_SCORE_TITLE} unavailable`}>
        <h3 className="stbx-title">{BOX_SCORE_TITLE} unavailable</h3>
        <p className="stbx-note">No box score is shown rather than a partial or guessed one: {error?.reason ?? "no valid run"}</p>
      </section>
    );
  }
  return (
    <section className="stbx stbx-static" data-stbx-static="" data-stbx-version={box.version} data-stbx-run={box.header.runIndex} aria-labelledby="stbx-static-h">
      <h3 className="stbx-title" id="stbx-static-h">{BOX_SCORE_TITLE} · run #{box.header.runIndex.toLocaleString("en-US")}</h3>
      <Watermark />
      <BoxHeader box={box} />
      <PeriodTable box={box} />
      <CompareCategoryTable box={box} />
      <PlayerSections box={box} />
      <Composition box={box} />
      <Provenance box={box} />
    </section>
  );
}

/** One run's server-rendered box score: computed here (server side), fail closed to the unavailable line. */
export function BoxScoreForRun({ manifest, sample }: { manifest: TheaterManifest; sample: TheaterSample | null }) {
  if (!sample) return <BoxScoreStatic box={null} error={{ code: "NO_VALID_RUN", reason: "no representative run of this receipt passed validation" }} />;
  const r = safeNflBoxScore(sample, manifest);
  return <BoxScoreStatic box={r.ok ? (r.box as BoxScore) : null} error={r.error} />;
}
