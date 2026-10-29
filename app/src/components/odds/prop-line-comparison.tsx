/**
 * Player-prop model-versus-line table / cards + legend + compact summary — sport-agnostic, SERVER component (no state,
 * no "use client"; nothing here may reach a client bundle: prop-line-switch-off.test.mjs). It prints a view built by
 * lib/odds/prop-line-view.mjs from a sport adapter; it computes nothing itself (the rounding policy lives there).
 *
 * Every row, scannable left to right:
 *   PRIMARY    PLAYER | MARKET | MODEL | BOOK LINE | DIRECTION | DIFFERENCE
 *   SECONDARY  SPORTSBOOK | OVER PRICE | UNDER PRICE | QUOTED AT (ET)        (smaller, muted)
 * Direction is a word + a shape + a colour token (▲ OVER green, ▼ UNDER red, = NEUTRAL grey) — colour is never the only
 * signal. A row in a STATE (stale, captured after cutoff, not matched, unavailable, unsupported, suspended) shows a dashed
 * grey chip with the state's label and one plain sentence — never a direction, never a difference, never a zero. The
 * engineering reason code is a data attribute only (data-prop-line-reason).
 * DIRECTION_WITHHELD ("Comparison not shown" — the family's forecast is not direction-qualified, lib/odds/prop-line-view.mjs
 * direction gate): the model and the line print as normal text with the book, prices and quote time, beside the grey chip
 * and the founder's sentence — no badge, no colour, no difference.
 *
 * Layout (one markup, CSS container queries on the section's own width, so a narrow panel gets cards too):
 *   < 560 px   stacked compact cards: name / market, then a Model · Line · Direction · Difference row, then the
 *              sportsbook / prices / time line;
 *   560–879    a two-line table row (primary columns; secondary under the market .. difference columns);
 *   ≥ 880      one aligned table row with all ten columns.
 * Numeric columns are tabular and right-aligned; long names wrap inside their cell; text ≥ 12 px; no horizontal page
 * overflow at 390 / 430 / 768 / 1440 (evidence: gtp-evidence/odds-ui/v2). Tooltips (title) only explain a column — they
 * never repeat a number.
 *
 * Gate: `display.public` (the sport's switch, e.g. NBA_LINE_DISPLAY). False → every export here renders NOTHING (null),
 * so a page that includes it is byte-identical to the page without it (display not authorized = projection-only).
 */
import React from "react";
import Link from "next/link";

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

/* Container-query layout. Tokens only (no literal colour, no fallback inside var()); every font ≥ 12 px. */
const CSS = `
.plc{container-type:inline-size;min-width:0}
.plc-t{display:flex;flex-direction:column;min-width:0}
.plc-r{display:grid;column-gap:12px;row-gap:4px;padding:10px 0;border-top:1px solid var(--vault-border);align-items:baseline;min-width:0;font-size:13px;color:var(--vault-text);
grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(92px,1.3fr) minmax(0,1fr);
grid-template-areas:"player player player player" "market market market market" "model line dir diff" "sec sec sec sec" "why why why why"}
.plc-h{display:none}
.plc-c{min-width:0}
.plc-player{grid-area:player;font-size:14px;font-weight:600;overflow-wrap:anywhere}
.plc-team{color:var(--vault-text-mute);font-weight:400}
.plc-market{grid-area:market;font-size:12px;color:var(--vault-text-mute);overflow-wrap:anywhere}
.plc-model{grid-area:model}.plc-line{grid-area:line}.plc-dir{grid-area:dir}.plc-diff{grid-area:diff}
.plc-n{font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.plc-r .plc-n{text-align:left}
.plc-v{font-weight:700}
.plc-st{grid-column:dir-start/diff-end}
.plc-sec{grid-area:sec;display:flex;flex-wrap:wrap;gap:2px 12px;font-size:12px;color:var(--vault-text-mute)}
.plc-book{color:var(--vault-text)}
.plc-why{grid-area:why;font-size:12px;color:var(--vault-text-mute)}
.plc-l{display:block;font-size:12px;font-weight:400;color:var(--vault-text-mute)}
.plc-li{color:var(--vault-text-mute)}
.plc-b{display:inline-block;border-radius:4px;padding:0 6px;font-weight:700;font-size:12px;letter-spacing:0.04em;white-space:nowrap;line-height:1.6}
.plc-chip{display:inline-block;border:1px dashed var(--vault-text-mute);color:var(--vault-text-mute);border-radius:4px;padding:0 6px;font-size:12px;font-weight:600;line-height:1.6}
@container (min-width:560px){
.plc-r,.plc-h{grid-template-columns:minmax(0,1.5fr) minmax(0,1.2fr) 76px 76px 112px 84px;
grid-template-areas:"player market model line dir diff" "player book over under quoted quoted" "player why why why why why"}
.plc-h{display:grid;column-gap:12px;padding:6px 0;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--vault-text-mute);align-items:end}
.plc-h .plc-hs{display:none}
.plc-r .plc-n{text-align:right}
.plc-dir,.plc-h .plc-dir{text-align:left}
.plc-l{display:none}
.plc-sec{display:contents}
.plc-book{grid-area:book;overflow-wrap:anywhere}.plc-over{grid-area:over}.plc-under{grid-area:under}.plc-quoted{grid-area:quoted}
.plc-sec .plc-c{font-size:12px;color:var(--vault-text-mute)}
.plc-sec .plc-book{color:var(--vault-text)}
}
@container (min-width:880px){
.plc-r,.plc-h{grid-template-columns:minmax(0,1.5fr) minmax(0,1.2fr) 64px 84px 112px 92px minmax(0,1fr) 96px 104px minmax(0,1.2fr);
grid-template-areas:"player market model line dir diff book over under quoted" "player why why why why why why why why why"}
.plc-h .plc-hs{display:block}
.plc-li{display:none}
}
`;

const dash = (spoken: string) => <><span aria-hidden="true">—</span><span className="sr-only">{spoken}</span></>;

function Direction({ row }: { row: PropLineViewRow }) {
  if (row.state !== "COMPARED" || !row.side) {
    return <span className="plc-chip" data-prop-line-side={row.state}>{row.statusText}</span>;
  }
  const c = SIDE_COLOR[row.side];
  return (
    <span className="plc-b" data-prop-line-side={row.side} style={{ color: c, border: `1px solid ${c}` }}>
      <span aria-hidden="true">{GLYPH[row.side]}</span> {row.side}
    </span>
  );
}

/** One row (a card below 560 px, a table row above). */
export function PropLineRow({ row }: { row: PropLineViewRow }) {
  const compared = row.state === "COMPARED";
  const withheld = row.state === "DIRECTION_WITHHELD";
  const lineMuted = !compared && !withheld && row.line;
  return (
    <div role="row" className="plc-r" data-prop-line={row.state} data-prop-line-reason={row.reason ?? undefined}>
      <div role="cell" className="plc-c plc-player">{row.player.name}{row.player.team ? <span className="plc-team"> · {row.player.team}</span> : null}</div>
      <div role="cell" className="plc-c plc-market">{row.market.label}</div>
      <div role="cell" className="plc-c plc-model plc-n"><span className="plc-l">Model</span><span className="plc-v">{row.projection.text}</span></div>
      <div role="cell" className="plc-c plc-line plc-n">
        <span className="plc-l">Line</span>
        {row.line ? <span className={lineMuted ? undefined : "plc-v"} style={lineMuted ? MUTE : undefined}>{row.line.text}</span> : dash("no line")}
      </div>
      {compared ? (
        <>
          <div role="cell" className="plc-c plc-dir"><span className="plc-l">Direction</span><Direction row={row} /></div>
          <div role="cell" className="plc-c plc-diff plc-n">
            <span className="plc-l">Difference</span>
            <span className="plc-v" style={{ color: row.color }} data-prop-line-diff="">{row.difference?.text ?? "—"}</span>
          </div>
        </>
      ) : (
        <div role="cell" className="plc-c plc-dir plc-st"><span className="plc-l">Status</span><Direction row={row} /></div>
      )}
      {row.book ? (
        <div role="none" className="plc-sec">
          <div role="cell" className="plc-c plc-book">{row.book.label}</div>
          {row.yesPrice ? (
            <>
              <div role="cell" className="plc-c plc-over plc-n" data-prop-line-yes=""><span>Yes </span>{row.yesPrice.value != null ? row.yesPrice.text : dash("Yes price not posted")}</div>
              <div role="cell" className="plc-c plc-under plc-n">{dash("no Under side: a yes/no market")}</div>
            </>
          ) : (
            <>
              <div role="cell" className="plc-c plc-over plc-n"><span className="plc-li">Over </span>{row.overPrice?.value != null ? row.overPrice.text : dash("Over price not posted")}</div>
              <div role="cell" className="plc-c plc-under plc-n"><span className="plc-li">Under </span>{row.underPrice?.value != null ? row.underPrice.text : dash("Under price not posted")}</div>
            </>
          )}
          <div role="cell" className="plc-c plc-quoted"><span className="plc-li">Quoted </span>{row.quotedAt?.text ?? "—"}{compared || withheld ? null : " · not compared"}</div>
        </div>
      ) : null}
      {!compared && row.reasonText ? <div role="cell" className="plc-c plc-why">{row.reasonText}</div> : null}
    </div>
  );
}

function HeaderRow() {
  return (
    <div role="row" className="plc-h">
      <div role="columnheader" style={{ gridArea: "player" }}>Player</div>
      <div role="columnheader" style={{ gridArea: "market" }}>Market</div>
      <div role="columnheader" className="plc-n" style={{ gridArea: "model", textAlign: "right" }} title={HELP.model}>Model</div>
      <div role="columnheader" className="plc-n" style={{ gridArea: "line", textAlign: "right" }} title={HELP.line}>Book line</div>
      <div role="columnheader" className="plc-dir" style={{ gridArea: "dir" }} title={HELP.direction}>Direction</div>
      <div role="columnheader" className="plc-n" style={{ gridArea: "diff", textAlign: "right" }} title={HELP.difference}>Difference</div>
      <div role="columnheader" className="plc-hs" style={{ gridArea: "book" }}>Sportsbook</div>
      <div role="columnheader" className="plc-hs plc-n" style={{ gridArea: "over", textAlign: "right" }}>Over price</div>
      <div role="columnheader" className="plc-hs plc-n" style={{ gridArea: "under", textAlign: "right" }}>Under price</div>
      <div role="columnheader" className="plc-hs" style={{ gridArea: "quoted" }} title={HELP.quoted}>Quoted at (ET)</div>
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

const STATE_COUNT_WORDS: Array<[keyof PropLineViewModel["counts"], string]> = [
  ["stale", "line stale"], ["afterCutoff", "captured after cutoff"], ["mismatch", "line not matched"],
  ["unavailable", "line unavailable"], ["unsupported", "market not supported"], ["suspended", "market suspended"],
  ["notPublished", "official projection not published"], ["yesNo", "yes/no market (not over/under)"],
];
const withheldNote = (c: PropLineViewModel["counts"]) => ((c.directionWithheld ?? 0) > 0 ? ` Direction not shown: ${c.directionWithheld}.` : "");
const notCompared = (c: PropLineViewModel["counts"]) => STATE_COUNT_WORDS.filter(([k]) => (c[k] ?? 0) > 0).map(([k, w]) => `${c[k]} ${w}`);

/**
 * The whole section: heading, coverage line ("N of M projections have a qualified sportsbook line"), the table / cards,
 * the legend. `view` null (or no rows and no coverage) while the switch is on = the provider / source is unavailable.
 */
export default function PropLineComparison({ view, display, heading = "Model vs. sportsbook line", id = "prop-lines", withoutLine = 0, notes }: {
  view: PropLineViewModel | null; display: Display; heading?: string; id?: string;
  /** Legacy count of projections without a line, used only when the view carries no coverage denominator. */
  withoutLine?: number;
  /** Source notes printed under the legend when rows are shown (provider attribution, book availability). Omitted → nothing. */
  notes?: string[];
}) {
  if (!display.public) return null;
  const rows = view?.rows ?? [];
  const c = view?.counts;
  const cov = view?.coverage?.text ?? null;
  const skipped = c ? notCompared(c) : [];
  return (
    <section id={id} aria-labelledby={`${id}-h`} data-prop-lines={view?.sport ?? "none"} className="plc flex flex-col gap-2" style={{ minWidth: 0 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
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
      {rows.length ? (
        <div role="table" aria-label={heading} className="plc-t">
          <HeaderRow />
          {rows.map((r, i) => <PropLineRow key={r.key ?? i} row={r} />)}
        </div>
      ) : null}
      {rows.length && view ? <PropLineLegend legend={view.legend} display={display} show={{ sides: (c?.compared ?? 0) > 0, withheld: (c?.directionWithheld ?? 0) > 0 }} /> : null}
      {rows.length && notes?.length ? <p data-prop-line-notes="" className="m-0" style={{ ...MUTE, fontSize: 12 }}>{notes.join(" ")}</p> : null}
    </section>
  );
}

/**
 * Compact "model vs line" summary for a game card or a slate row: the OVER / UNDER / NEUTRAL counts and the coverage
 * sentence, linking to the full table. Renders NOTHING unless the switch is on AND at least one row is compared — a game
 * without a qualified line shows nothing (never "0 OVER").
 */
export function PropLineSummary({ view, display, href, label = "Model vs. sportsbook line" }: { view: PropLineViewModel | null; display: Display; href?: string | null; label?: string }) {
  if (!display.public || !view || view.counts.compared === 0) return null;
  const sides = (["OVER", "UNDER", "NEUTRAL"] as const).map((s) => [s, view.rows.filter((r) => r.state === "COMPARED" && r.side === s).length] as const).filter(([, n]) => n > 0);
  return (
    <p data-prop-line-summary={view.sport} className="m-0" style={{ ...MUTE, fontSize: 12, lineHeight: 1.6, display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 8px", minWidth: 0 }}>
      <span style={{ ...TEXT, fontWeight: 600 }}>{label}:</span>
      {sides.map(([s, n]) => (
        <span key={s} data-prop-line-side={s} style={{ color: SIDE_COLOR[s], fontWeight: 700, whiteSpace: "nowrap" }}><span aria-hidden="true">{GLYPH[s]}</span> {n} {s}</span>
      ))}
      {view.coverage?.text ? <span>{view.coverage.text}</span> : null}
      {href ? <Link href={href} prefetch={false} className="underline" style={TEXT}>See the lines →</Link> : null}
    </p>
  );
}
