/**
 * Player-prop model-versus-line rows + legend — sport-agnostic, SERVER component (no state, no "use client"; nothing
 * here may reach a client bundle: prop-line-client-graph.test.mjs). It prints a view built by lib/odds/prop-line-view.mjs
 * from a sport adapter; it computes nothing itself.
 *
 * Every row: player + market · Model · Line · OVER / UNDER / NEUTRAL (word + shape + colour token — colour is never
 * the only signal) · signed difference · sportsbook · Over and Under prices ("—" when not posted) · quote time (ET).
 * STALE / UNAVAILABLE / UNSUPPORTED rows are uncoloured and say why. Screen readers hear one sentence per row
 * ("Over, model 36.0 vs line 29.5, plus 6.5. …"); the visual parts are aria-hidden so nothing is read twice.
 *
 * Gate: `display.public` (the sport's switch, e.g. NBA_LINE_DISPLAY). False → renders NOTHING (null), so a page that
 * includes this section is byte-identical to the page without it.
 *
 * Layout: flex-wrap only (no media query) — at 390 px each row stacks into name / numbers / book lines; text ≥ 12 px;
 * nothing here is interactive, so there is no tap target to size.
 */
import React from "react";

type Price = { value: number | null; text: string; spoken: string };
export type PropLineViewRow = {
  key: string | null; state: "COMPARED" | "STALE" | "UNAVAILABLE" | "UNSUPPORTED"; side: "OVER" | "UNDER" | "NEUTRAL" | null; color: string;
  player: { name: string; team: string | null }; market: { label: string }; projection: { text: string };
  line: { text: string } | null; difference: { text: string } | null; book: { label: string } | null;
  overPrice: Price | null; underPrice: Price | null; quotedAt: { text: string } | null;
  statusText: string; reasonText: string | null; spoken: string;
};
export type PropLineLegendText = Record<"over" | "under" | "neutral" | "difference" | "stale" | "unavailable" | "unsupported" | "prices" | "caveat", string>;
export type PropLineViewModel = { sport: string; maxAgeHours: number; legend: PropLineLegendText; rows: PropLineViewRow[]; counts: { compared: number; stale: number; unavailable: number; unsupported: number } };
type Display = { public: boolean };

const TEXT = { color: "var(--vault-text)" } as const;
const MUTE = { color: "var(--vault-text-mute)" } as const;
const GLYPH: Record<string, string> = { OVER: "▲", UNDER: "▼", NEUTRAL: "=" };

function Badge({ row }: { row: PropLineViewRow }) {
  const compared = row.state === "COMPARED";
  return (
    <span
      data-prop-line-side={row.side ?? row.state}
      style={{ color: row.color, border: `1px ${compared ? "solid" : "dashed"} ${row.color}`, borderRadius: 4, padding: "0 6px", fontWeight: 700, fontSize: 12, letterSpacing: "0.04em", whiteSpace: "nowrap" }}
    >
      {compared ? <>{GLYPH[row.side!]} {row.side}</> : row.statusText.toUpperCase()}
    </span>
  );
}

export function PropLineRow({ row }: { row: PropLineViewRow }) {
  const compared = row.state === "COMPARED";
  return (
    <li data-prop-line={row.state} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px", padding: "10px 0", borderTop: "1px solid var(--vault-border)" }}>
      <span className="sr-only">{row.spoken}</span>
      <div aria-hidden="true" style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ ...TEXT, fontSize: 14, fontWeight: 600 }}>{row.player.name}{row.player.team ? <span style={{ ...MUTE, fontWeight: 400 }}> · {row.player.team}</span> : null}</div>
        <div style={{ ...MUTE, fontSize: 12 }}>{row.market.label}</div>
      </div>
      <div aria-hidden="true" style={{ flex: "1 1 220px", display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 12px", fontSize: 13, ...TEXT }}>
        <span><span style={MUTE}>Model</span> <strong>{row.projection.text}</strong></span>
        {row.line ? <span><span style={MUTE}>Line</span> <strong>{row.line.text}</strong></span> : null}
        <Badge row={row} />
        {compared && row.difference ? <strong style={{ color: row.color }} data-prop-line-diff="">{row.difference.text}</strong> : null}
      </div>
      {row.book ? (
        <div aria-hidden="true" style={{ flex: "1 1 100%", fontSize: 12, ...MUTE }}>
          <span style={TEXT}>{row.book.label}</span> · Over {row.overPrice?.text ?? "—"} · Under {row.underPrice?.text ?? "—"} · Quoted {row.quotedAt?.text ?? "—"}
          {compared ? null : " · not compared"}
        </div>
      ) : null}
      {!compared && row.reasonText ? <div aria-hidden="true" style={{ flex: "1 1 100%", fontSize: 12, ...MUTE }}>{row.reasonText}</div> : null}
    </li>
  );
}

export function PropLineLegend({ legend, display }: { legend: PropLineLegendText; display: Display }) {
  if (!display.public) return null;
  const sw = (color: string, glyph: string) => <span aria-hidden="true" style={{ color, fontWeight: 700 }}>{glyph}</span>;
  return (
    <ul data-prop-line-legend="" className="m-0" style={{ ...MUTE, fontSize: 12, lineHeight: 1.6, paddingLeft: 0, listStyle: "none" }}>
      <li>{sw("var(--vault-success)", GLYPH.OVER)} {legend.over}</li>
      <li>{sw("var(--vault-danger)", GLYPH.UNDER)} {legend.under}</li>
      <li>{sw("var(--vault-text-mute)", GLYPH.NEUTRAL)} {legend.neutral}</li>
      <li>{legend.difference}</li>
      <li>{legend.stale}</li>
      <li>{legend.unavailable}</li>
      <li>{legend.unsupported}</li>
      <li>{legend.prices}</li>
      <li style={TEXT}>{legend.caveat}</li>
    </ul>
  );
}

/**
 * The whole section: heading, coverage line, rows, legend. `withoutLine` counts the projections with no captured line
 * (shown on the board as projections only).
 */
export default function PropLineComparison({ view, display, heading = "Model vs. sportsbook line", id = "prop-lines", withoutLine = 0, notes }: {
  view: PropLineViewModel | null; display: Display; heading?: string; id?: string; withoutLine?: number;
  /** Source notes printed under the legend when rows are shown (provider attribution, book availability). Omitted → nothing. */
  notes?: string[];
}) {
  if (!display.public) return null;
  const rows = view?.rows ?? [];
  const c = view?.counts;
  return (
    <section id={id} aria-labelledby={`${id}-h`} data-prop-lines={view?.sport ?? "none"} className="flex flex-col gap-2" style={{ minWidth: 0 }}>
      <h2 id={`${id}-h`} className="m-0 font-display" style={{ ...TEXT, fontSize: 17, fontWeight: 700 }}>{heading}</h2>
      {rows.length ? (
        <p className="m-0" style={{ ...MUTE, fontSize: 12 }}>
          {c!.compared} compared · {c!.stale} stale · {c!.unavailable} unavailable · {c!.unsupported} unsupported
          {withoutLine ? ` · ${withoutLine} projections have no captured line and show the projection only` : ""}
        </p>
      ) : (
        <p className="m-0" role="status" style={{ ...TEXT, fontSize: 13 }}>Sportsbook lines: Unavailable. No verified sportsbook line is published for these projections.</p>
      )}
      {rows.length ? <ul className="m-0" style={{ listStyle: "none", padding: 0 }}>{rows.map((r, i) => <PropLineRow key={r.key ?? i} row={r} />)}</ul> : null}
      {rows.length && view ? <PropLineLegend legend={view.legend} display={display} /> : null}
      {rows.length && notes?.length ? <p data-prop-line-notes="" className="m-0" style={{ ...MUTE, fontSize: 12 }}>{notes.join(" ")}</p> : null}
    </section>
  );
}
