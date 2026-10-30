/**
 * Player-prop model-versus-line table / cards + legend + compact summary — sport-agnostic, SERVER component (no state,
 * no "use client"; nothing here may reach a client bundle: prop-line-switch-off.test.mjs). It prints a view built by
 * lib/odds/prop-line-view.mjs from a sport adapter; it computes nothing itself (the rounding policy lives there).
 *
 * Every row, scannable left to right (ten cells, always in this order — the header row names them ONCE):
 *   PRIMARY    PLAYER | MARKET | MODEL | BOOK LINE | DIRECTION | DIFFERENCE
 *   SECONDARY  SPORTSBOOK | OVER PRICE | UNDER PRICE | QUOTED AT (ET)        (smaller, muted)
 * A row that is not COMPARED has one STATUS cell in place of DIRECTION + DIFFERENCE (nine cells).
 * Direction is a word + a shape + a colour token (▲ OVER green, ▼ UNDER red, = NEUTRAL grey) — colour is never the only
 * signal. A row in a STATE (stale, captured after cutoff, not matched, unavailable, unsupported, suspended) shows a dashed
 * grey chip with the state's label — never a direction, never a difference, never a zero; the state's one plain sentence
 * is printed ONCE per section under the table (data-prop-line-states), not once per row. The engineering reason code is
 * a data attribute only (data-prop-line-reason).
 * DIRECTION_WITHHELD ("Comparison not shown" — the family's forecast is not direction-qualified, lib/odds/prop-line-view.mjs
 * direction gate): the model and the line print as normal text with the book, prices and quote time, beside the grey chip
 * — no badge, no colour, no difference; the founder's sentence is in the section's state list.
 *
 * PAGE WEIGHT (2026-10-29: a 97-row game panel was ~1.3 KB of HTML per row, then duplicated in the RSC payload): a row is
 * bare role="row" / role="cell" divs — no per-row class, inline style, label or sentence. Styling hangs off the row's
 * data attributes (data-prop-line = state, data-prop-line-side = OVER / UNDER / NEUTRAL) and the cell's position; the
 * card labels ("Model", "Line", …) and the direction shape are CSS generated content, written once in the stylesheet
 * below (with empty alt text, so a screen reader hears the column header, not the label twice). Budget pinned by
 * prop-line-weight.test.mjs.
 *
 * Layout (one markup, CSS container queries on the section's own width, so a narrow panel gets cards too):
 *   < 560 px   stacked compact cards: name, market, then a Model · Line · Direction · Difference row, then the
 *              sportsbook / prices and the time; the header row is visually hidden (still announced);
 *   560–879    a two-line table row (primary columns; secondary under the market .. difference columns);
 *   ≥ 880      one aligned table row with all ten columns.
 * Numeric columns are tabular and right-aligned; long names wrap inside their cell; text ≥ 12 px; no horizontal page
 * overflow at 390 / 430 / 768 / 1440. Tooltips (title) only explain a column — they never repeat a number.
 *
 * Gate: `display.public` (the sport's switch, e.g. NBA_LINE_DISPLAY). False → every export here renders NOTHING (null),
 * so a page that includes it is byte-identical to the page without it (display not authorized = projection-only).
 */
import React from "react";

type Price = { value: number | null; text: string; spoken: string };
export type PropLineState = "COMPARED" | "STALE" | "AFTER_CUTOFF" | "MISMATCH" | "UNAVAILABLE" | "UNSUPPORTED" | "SUSPENDED" | "NOT_PUBLISHED" | "YES_NO" | "DIRECTION_WITHHELD";
export type PropLineViewRow = {
  key: string | null; state: PropLineState; side: "OVER" | "UNDER" | "NEUTRAL" | null; glyph?: string | null; color: string; reason?: string | null;
  player: { name: string; team: string | null }; market: { label: string }; projection: { text: string };
  line: { text: string } | null; difference: { text: string } | null; book: { label: string } | null;
  overPrice: Price | null; underPrice: Price | null; quotedAt: { text: string } | null;
  /** A yes/no market's one price (state YES_NO only): printed as "Yes +150", never as an Over price. */
  yesPrice?: Price | null;
  statusText: string; reasonText: string | null; spoken: string;
};
export type PropLineLegendText = Record<"over" | "under" | "neutral" | "difference" | "states" | "prices" | "caveat", string> & { withheld?: string };
export type PropLineViewModel = {
  sport: string; maxAgeHours: number; legend: PropLineLegendText; rows: PropLineViewRow[];
  counts: { compared: number; stale: number; afterCutoff: number; mismatch: number; unavailable: number; unsupported: number; suspended: number; notPublished?: number; yesNo?: number; directionWithheld?: number };
  sides?: { OVER: number; UNDER: number; NEUTRAL: number };
  coverage?: { qualified: number; projections: number; text: string | null } | null;
};
type Display = { public: boolean };

const TEXT = { color: "var(--vault-text)" } as const;
const MUTE = { color: "var(--vault-text-mute)" } as const;
const GLYPH: Record<string, string> = { OVER: "▲", UNDER: "▼", NEUTRAL: "=" };
const SIDE_COLOR: Record<string, string> = { OVER: "var(--vault-success)", UNDER: "var(--vault-danger)", NEUTRAL: "var(--vault-text-mute)" };

/** Column tooltips: what the column means, never a number. */
const HELP = {
  model: "Our model's projection for this player in this game.",
  line: "The sportsbook's line for this market, as posted.",
  direction: "Where our projection sits against the sportsbook's line. A comparison, not a recommendation.",
  difference: "Our projection minus the sportsbook's line.",
  quoted: "When the line was captured, in Eastern Time.",
} as const;

/* Cell positions → grid areas. Every row: 1 player · 2 market · 3 model · 4 line · 5 direction (COMPARED) or status
   (spanning direction + difference). COMPARED rows (and the header): 6 difference · 7 book · 8 over · 9 under · 10 quoted.
   Other rows: 6 book · 7 over · 8 under · 9 quoted. */
const R = ".plc-t>[role=row]"; // every row, the header included (grid areas)
const D = ".plc-t>[data-prop-line]"; // data rows
const C = ".plc-t>[data-prop-line=COMPARED]";
const S = ".plc-t>[data-prop-line]:not([data-prop-line=COMPARED])";
const P = `${S}:not([data-prop-line=YES_NO])`; // a state row whose price cells are Over / Under (a yes/no row prints "Yes")
const H = ".plc-t>.plc-h";
const k = (sel: string, n: number) => `${sel}>:nth-child(${n})`;
const AREAS: Array<[string, string]> = [
  [k(R, 1), "p"], [k(R, 2), "m"], [k(R, 3), "mo"], [k(R, 4), "li"],
  [`${k(H, 5)},${k(C, 5)}`, "di"], [`${k(H, 6)},${k(C, 6)}`, "df"], [`${k(H, 7)},${k(C, 7)}`, "bk"], [`${k(H, 8)},${k(C, 8)}`, "ov"], [`${k(H, 9)},${k(C, 9)}`, "un"], [`${k(H, 10)},${k(C, 10)}`, "q"],
  [k(S, 5), "di/di/di/df"], [k(S, 6), "bk"], [k(S, 7), "ov"], [k(S, 8), "un"], [k(S, 9), "q"],
];
/** Generated content with empty alternative text (the second declaration wins where supported; the first is the fallback). */
const gen = (t: string) => `content:"${t}";content:"${t}"/""`;
const NUM = [k(D, 3), k(D, 4), k(C, 6), k(C, 8), k(C, 9), k(S, 7), k(S, 8)].join(",");
const SECONDARY = [k(C, 7), k(C, 8), k(C, 9), k(C, 10), k(S, 6), k(S, 7), k(S, 8), k(S, 9)].join(",");
/** Card / two-line labels, written once here instead of once per row. */
const LABELS: Array<[string, string]> = [[k(D, 3), "Model"], [k(D, 4), "Line"], [k(C, 5), "Direction"], [k(C, 6), "Difference"], [k(S, 5), "Status"]];
const INLINE: Array<[string, string]> = [[`${k(C, 8)},${k(P, 7)}`, "Over "], [`${k(C, 9)},${k(P, 8)}`, "Under "], [`${k(C, 10)},${k(S, 9)}`, "Quoted "]];
const before = (sel: string) => sel.split(",").map((x) => `${x}::before`).join(",");
const SIDES: Array<[string, string, string]> = [["OVER", "var(--vault-success)", "▲ "], ["UNDER", "var(--vault-danger)", "▼ "], ["NEUTRAL", "var(--vault-text-mute)", "= "]];

/* Container-query layout. Tokens only (no literal colour, no fallback inside var()); every font ≥ 12 px. */
const CSS = `
.plc{container-type:inline-size;min-width:0}
.plc-t{display:flex;flex-direction:column;min-width:0}
${R}{display:grid;column-gap:12px;row-gap:4px;padding:10px 0;align-items:baseline;min-width:0;font-size:13px;color:var(--vault-text);
grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(92px,1.3fr) minmax(0,1fr);
grid-template-areas:"p p p p" "m m m m" "mo li di df" "bk ov un un" "q q q q"}
${D}{border-top:1px solid var(--vault-border)}
${R}>*{min-width:0}
${AREAS.map(([sel, a]) => `${sel}{grid-area:${a}}`).join("\n")}
${H}{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
${k(D, 1)}{font-size:14px;font-weight:600;overflow-wrap:anywhere}
${k(D, 1)} span{color:var(--vault-text-mute);font-weight:400}
${k(D, 2)}{font-size:12px;color:var(--vault-text-mute);overflow-wrap:anywhere}
${NUM}{font-variant-numeric:tabular-nums;white-space:nowrap}
${k(D, 3)},${k(D, 4)},${k(C, 6)}{font-weight:700}
${k(`${S}:not([data-prop-line=DIRECTION_WITHHELD])`, 4)}{font-weight:400;color:var(--vault-text-mute)}
${SECONDARY}{font-size:12px;color:var(--vault-text-mute)}
${k(C, 7)},${k(S, 6)}{color:var(--vault-text);overflow-wrap:anywhere}
${before(LABELS.map(([s]) => s).join(","))}{display:block;font-size:12px;font-weight:400;color:var(--vault-text-mute)}
${[...LABELS, ...INLINE].map(([s, t]) => `${before(s)}{${gen(t)}}`).join("\n")}
${D} b{display:inline-block;border-radius:4px;padding:0 6px;font-weight:700;font-size:12px;letter-spacing:0.04em;white-space:nowrap;line-height:1.6;border:1px solid}
${S} b{border:1px dashed var(--vault-text-mute);color:var(--vault-text-mute);font-weight:600;letter-spacing:0}
${SIDES.map(([s, c, g]) => `${D}[data-prop-line-side=${s}] b,${D}[data-prop-line-side=${s}]>:nth-child(6){color:${c}}\n${D}[data-prop-line-side=${s}] b::before{${gen(g)}}`).join("\n")}
.plc-states{list-style:none;padding-left:0;font-size:12px;line-height:1.6;color:var(--vault-text-mute)}
.plc-states b{display:inline-block;border:1px dashed var(--vault-text-mute);border-radius:4px;padding:0 6px;font-size:12px;font-weight:600;line-height:1.6;margin-right:6px}
@container (min-width:560px){
${R}{grid-template-columns:minmax(0,1.5fr) minmax(0,1.2fr) 76px 76px 112px 84px;
grid-template-areas:"p m mo li di df" "p bk ov un q q"}
${H}{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto;white-space:normal;padding:6px 0;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--vault-text-mute);align-items:end}
${H}>:nth-child(n+7){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}
${NUM},${[3, 4, 6, 8, 9].map((n) => k(H, n)).join(",")}{text-align:right}
${before(LABELS.map(([s]) => s).join(","))}{content:none}
}
@container (min-width:880px){
${R}{grid-template-columns:minmax(0,1.5fr) minmax(0,1.2fr) 64px 84px 112px 92px minmax(0,1fr) 96px 104px minmax(0,1.2fr);
grid-template-areas:"p m mo li di df bk ov un q"}
${H}>:nth-child(n+7){position:static;width:auto;height:auto;overflow:visible;clip:auto;white-space:normal}
${before(INLINE.map(([s]) => s).join(","))}{content:none}
}
`;

const dash = (spoken: string) => <><span aria-hidden="true">—</span><span className="sr-only">{spoken}</span></>;
const price = (p: Price | null | undefined, spoken: string) => (p?.value != null ? p.text : dash(spoken));

/** One row (a card below 560 px, a table row above): bare cells; see the position map above. */
export function PropLineRow({ row }: { row: PropLineViewRow }) {
  const compared = row.state === "COMPARED" && !!row.side;
  // data-prop-line-side only on a compared row; the reason code only where the state does not already imply it.
  return (
    <div role="row" data-prop-line={row.state} data-prop-line-side={compared ? row.side! : undefined} data-prop-line-reason={row.reason && row.state !== "DIRECTION_WITHHELD" ? row.reason : undefined}>
      <div role="cell">{row.player.name}{row.player.team ? <span>{` · ${row.player.team}`}</span> : null}</div>
      <div role="cell">{row.market.label}</div>
      <div role="cell">{row.projection.text}</div>
      <div role="cell">{row.line ? row.line.text : dash("no line")}</div>
      <div role="cell"><b>{compared ? row.side : row.statusText}</b></div>
      {compared ? <div role="cell">{row.difference?.text ?? "—"}</div> : null}
      {row.book ? (
        <>
          <div role="cell">{row.book.label}</div>
          {row.yesPrice ? (
            <>
              <div role="cell" data-prop-line-yes="">{`Yes ${row.yesPrice.value != null ? row.yesPrice.text : ""}`}{row.yesPrice.value != null ? null : dash("Yes price not posted")}</div>
              <div role="cell">{dash("no Under side: a yes/no market")}</div>
            </>
          ) : (
            <>
              <div role="cell">{price(row.overPrice, "Over price not posted")}</div>
              <div role="cell">{price(row.underPrice, "Under price not posted")}</div>
            </>
          )}
          <div role="cell">{row.quotedAt?.text ?? "—"}</div>
        </>
      ) : null}
    </div>
  );
}

function HeaderRow() {
  return (
    <div role="row" className="plc-h">
      <div role="columnheader">Player</div>
      <div role="columnheader">Market</div>
      <div role="columnheader" title={HELP.model}>Model</div>
      <div role="columnheader" title={HELP.line}>Book line</div>
      <div role="columnheader" title={HELP.direction}>Direction</div>
      <div role="columnheader" title={HELP.difference}>Difference</div>
      <div role="columnheader">Sportsbook</div>
      <div role="columnheader">Over price</div>
      <div role="columnheader">Under price</div>
      <div role="columnheader" title={HELP.quoted}>Quoted at (ET)</div>
    </div>
  );
}

export function PropLineLegend({ legend, display, show = { sides: true, withheld: true } }: {
  legend: PropLineLegendText; display: Display;
  /** Which explanations apply: the OVER / UNDER / NEUTRAL lines only when a direction is shown, "Comparison not shown" only
      when a row is withheld. */
  show?: { sides: boolean; withheld: boolean };
}) {
  if (!display.public) return null;
  const sw = (side: string) => <span aria-hidden="true" style={{ color: SIDE_COLOR[side], fontWeight: 700 }}>{GLYPH[side]}</span>;
  return (
    <ul data-prop-line-legend="" className="m-0" style={{ ...MUTE, fontSize: 12, lineHeight: 1.6, paddingLeft: 0, listStyle: "none" }}>
      {show.sides ? (
        <>
          <li>{sw("OVER")} {legend.over}</li>
          <li>{sw("UNDER")} {legend.under}</li>
          <li>{sw("NEUTRAL")} {legend.neutral}</li>
          <li>{legend.difference}</li>
        </>
      ) : null}
      <li>{legend.states}</li>
      <li>{legend.prices}</li>
      {show.withheld && legend.withheld ? <li>{legend.withheld}</li> : null}
      <li style={TEXT}>{legend.caveat}</li>
    </ul>
  );
}

/** Each non-compared state present in the rows, once: its chip label and its one plain sentence (in first-seen order). */
export function PropLineStateNotes({ rows }: { rows: PropLineViewRow[] }) {
  const seen = new Map<string, PropLineViewRow>();
  for (const r of rows) if (r.state !== "COMPARED" && r.reasonText && !seen.has(r.state)) seen.set(r.state, r);
  if (!seen.size) return null;
  return (
    <ul data-prop-line-states="" className="plc-states m-0">
      {[...seen.values()].map((r) => <li key={r.state} data-prop-line-state={r.state}><b>{r.statusText}</b>{r.reasonText}</li>)}
    </ul>
  );
}

const STATE_COUNT_WORDS: Array<[keyof PropLineViewModel["counts"], string]> = [
  ["stale", "line stale"], ["afterCutoff", "captured after cutoff"], ["mismatch", "line not matched"],
  ["unavailable", "line unavailable"], ["unsupported", "market not supported"], ["suspended", "market suspended"],
  ["notPublished", "official projection not published"], ["yesNo", "yes/no market (not over/under)"],
];
const withheldNote = (c: PropLineViewModel["counts"]) => ((c.directionWithheld ?? 0) > 0 ? ` Direction not shown: ${c.directionWithheld}.` : "");
const notCompared = (c: PropLineViewModel["counts"]) => STATE_COUNT_WORDS.filter(([k]) => (c[k] ?? 0) > 0).map(([k, w]) => `${c[k]} ${w}`);

/**
 * The whole section: heading, coverage line ("N of M projections have a qualified sportsbook line"), the table / cards,
 * the state notes, the legend. `view` null (or no rows and no coverage) while the switch is on = the provider / source
 * is unavailable.
 * `children` (a slate page): printed IN PLACE OF the per-player table — e.g. one compact summary per game linking to that
 * game's full table — with the same coverage line above it; the legend's direction lines then follow the slate's counts.
 */
export default function PropLineComparison({ view, display, heading = "Model vs. sportsbook line", id = "prop-lines", withoutLine = 0, notes, children }: {
  view: PropLineViewModel | null; display: Display; heading?: string; id?: string;
  /** Legacy count of projections without a line, used only when the view carries no coverage denominator. */
  withoutLine?: number;
  /** Source notes printed under the legend when rows are shown (provider attribution, book availability). Omitted → nothing. */
  notes?: string[];
  /** Replaces the per-player table (slate pages: per-game summaries). */
  children?: React.ReactNode;
}) {
  if (!display.public) return null;
  const rows = view?.rows ?? [];
  const c = view?.counts;
  const cov = view?.coverage?.text ?? null;
  const skipped = c ? notCompared(c) : [];
  const table = children === undefined;
  return (
    <section id={id} aria-labelledby={`${id}-h`} data-prop-lines={view?.sport ?? "none"} className="plc flex flex-col gap-2" style={{ minWidth: 0 }}>
      {table && rows.length ? <style dangerouslySetInnerHTML={{ __html: CSS }} /> : null}
      <h2 id={`${id}-h`} className="m-0 font-display" style={{ ...TEXT, fontSize: 17, fontWeight: 700 }}>{heading}</h2>
      {rows.length ? (
        <p className="m-0" data-prop-line-coverage="" style={{ ...MUTE, fontSize: 12 }}>
          {cov ? <span style={TEXT}>{cov}.</span> : <>{c!.compared} compared{withoutLine ? ` · ${withoutLine} projections have no sportsbook line and show the projection only` : ""}.</>}
          {skipped.length ? ` Not compared: ${skipped.join(" · ")}.` : ""}
          {withheldNote(c!)}
        </p>
      ) : (
        <p className="m-0" role="status" data-prop-line-section-state={cov ? "NO_LINES" : "PROVIDER_UNAVAILABLE"} style={{ ...TEXT, fontSize: 13 }}>
          {cov ? `${cov}.` : "Sportsbook lines: Unavailable. No verified sportsbook line is published for these projections right now."}
        </p>
      )}
      {rows.length && table ? (
        <div role="table" aria-label={heading} className="plc-t">
          <HeaderRow />
          {rows.map((r, i) => <PropLineRow key={r.key ?? i} row={r} />)}
        </div>
      ) : null}
      {rows.length && !table ? children : null}
      {rows.length && table ? <PropLineStateNotes rows={rows} /> : null}
      {rows.length && view ? <PropLineLegend legend={view.legend} display={display} show={{ sides: (c?.compared ?? 0) > 0, withheld: (c?.directionWithheld ?? 0) > 0 }} /> : null}
      {rows.length && notes?.length ? <p data-prop-line-notes="" className="m-0" style={{ ...MUTE, fontSize: 12 }}>{notes.join(" ")}</p> : null}
    </section>
  );
}

/**
 * One compact line for a game card or a slate row: "Model vs. line: 72 lines · ▲ 21 ▼ 50 = 1 · View lines →", where N is
 * the compared lines (the three counts add up to it). Renders NOTHING unless the switch is on AND at least one row is
 * compared — a game without a qualified line shows nothing (never "▲ 0").
 *
 * PAGE WEIGHT (2026-10-30: 10 games put /nba 12 KiB over budget, ~2.6 KB per game across HTML + RSC): no inline style, no
 * coverage sentence and no legend per card. The look lives ONCE in globals.css (.plc-s), the line is one string (no
 * per-side element, so no per-side colour here: the full table carries it) and the link is a plain anchor. The legend and coverage sit on the section and on /nba/lines/<id>/. The counts' role="img" label gives
 * the direction WORDS to a screen reader, so a shape is never the only signal.
 */
export function PropLineSummary({ view, display, href, label = "Model vs. line" }: { view: PropLineViewModel | null; display: Display; href?: string | null; label?: string }) {
  if (!display.public || !view || view.counts.compared === 0) return null;
  const sides = (["OVER", "UNDER", "NEUTRAL"] as const).map((s) => [s, view.rows.filter((r) => r.state === "COMPARED" && r.side === s).length] as const).filter(([, n]) => n > 0);
  const n = sides.reduce((sum, [, c]) => sum + c, 0);
  const text = `${label}: ${n} ${n === 1 ? "line" : "lines"} · ${sides.map(([s, c]) => `${GLYPH[s]} ${c}`).join(" ")}`;
  const spoken = `${n} ${n === 1 ? "line" : "lines"}: ${sides.map(([s, c]) => `${c} ${s.toLowerCase()}`).join(", ")}`;
  return (
    <p data-prop-line-summary={view.sport} className="plc-s">
      {href ? <>{`${text} · `}<a href={href} aria-label={`View ${spoken}`}>View lines →</a></> : <span role="img" aria-label={spoken}>{text}</span>}
    </p>
  );
}
