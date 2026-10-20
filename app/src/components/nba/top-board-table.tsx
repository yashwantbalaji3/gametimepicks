"use client";
/**
 * NBA Top Boards — one mobile-first TABLE over every frozen board row (all markets), PRIVATE preview only.
 *
 * The rows are the row view model (lib/sports/nba/top-board-rows.mjs), built on the server from the frozen day file.
 * The client only filters and re-sorts the display; it never re-ranks a board (each row keeps its frozen rank),
 * never computes a probability, a side, an edge or an EV, and never reads a projection against a line. Every price
 * column shows exactly what the view model carries — today "No authorized NBA price" with its reason code.
 *
 * Layout: the controls stack on a phone; the table keeps its columns and scrolls INSIDE its own container (the page
 * never scrolls sideways at 320 px). Explicit states: no document, a market not on this freeze, a market not
 * modelled, an empty board, and filters that match nothing.
 *
 * Only /preview/nba/boards renders this (guardInternalRoute + pruned from the export); nothing public imports it
 * (top-board-route-gating.test.mjs).
 */
import { useId, useMemo, useState } from "react";

import { etStamp } from "@/lib/et-stamp.mjs";
import { filterOptions, filterRowViews, sortRowViews } from "@/lib/sports/nba/top-board-rows.mjs";

export interface PriceCell { value: unknown; state: string; reasonCode: string | null; display: string }
export interface BoardRowViewT {
  rowId: string;
  rank: number;
  edition: number | null;
  player: { name: string | null; providerAthleteId: string | null; team: { abbr: string | null; name: string | null; providerTeamId: string | null } | null };
  game: { eventId: string; opponent: { abbr: string | null } | null; homeAway: "home" | "away" | null; tipoffUtc: string | null; etDate: string | null };
  market: { key: string; label: string; stat: string | null; basis: string; basisText: string | null; components: string[] | null };
  projection: { value: number | null; metric: string; metricLabel: string; p50: number | null; mean: number | null; p10: number | null; p90: number | null; family: string | null; modelVersion: string | null; role: string; playRate: number | null };
  price: Record<"sportsbook" | "line" | "side" | "modelProbability" | "odds" | "edge", PriceCell>;
  priceExplanation: string | null;
  updated: { forecastFrozenAt: string | null; forecastGeneratedAt: string | null; oddsCapturedAt: string | null; oddsCapturedAtReason: string | null };
  injuryStatus: string | null;
  flags: string[];
  sortKeys: Record<string, string | number | null>;
}
export interface MarketStateT { key: string; label: string; basis: string; state: string; rows: number; text: string | null }
export interface BoardTableModelT { date: string | null; family: string | null; schema: string | null; modelVersion: string | null; rows: BoardRowViewT[]; markets: MarketStateT[]; priced: boolean }

const PRICE_COLUMNS: { key: keyof BoardRowViewT["price"]; label: string }[] = [
  { key: "sportsbook", label: "Sportsbook" },
  { key: "line", label: "Line" },
  { key: "side", label: "Over / Under" },
  { key: "modelProbability", label: "Model probability" },
  { key: "odds", label: "Odds" },
  { key: "edge", label: "Edge / EV" },
];

const STATE_WORDS: Record<string, string> = {
  RANKED: "ranked",
  EMPTY: "empty board",
  NOT_IN_THIS_FREEZE: "not on this freeze",
  NOT_MODELLED: "not modelled",
  NO_DATA: "no data",
};

const CSS = `
.tbt{color:var(--vault-text);min-width:0;max-width:100%}
.tbt-note{border:1px solid var(--vault-border);background:var(--vault-panel);border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.5;color:var(--vault-text-mute);margin:0 0 12px}
.tbt-note strong{color:var(--vault-text)}
.tbt-markets{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px;padding:0;list-style:none}
.tbt-chip{font-size:12px;padding:3px 9px;border-radius:999px;border:1px solid var(--vault-border);color:var(--vault-text-mute)}
.tbt-chip[data-state="RANKED"]{border-color:var(--vault-gold-bright);color:var(--vault-text)}
.tbt-chip[data-state="NOT_MODELLED"],.tbt-chip[data-state="NOT_IN_THIS_FREEZE"]{border-style:dashed}
.tbt-controls{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;margin:0 0 12px}
@media (min-width:640px){.tbt-controls{grid-template-columns:repeat(3,minmax(0,1fr))}}
.tbt-field{display:grid;gap:4px;min-width:0;font-size:12px;color:var(--vault-text-faint)}
.tbt-field select,.tbt-field input{font:inherit;font-size:14px;min-height:40px;padding:6px 8px;border-radius:8px;border:1px solid var(--vault-border);background:var(--vault-panel);color:var(--vault-text);min-width:0;width:100%;box-sizing:border-box}
.tbt-field select:disabled,.tbt-field input:disabled{opacity:.55;cursor:not-allowed}
.tbt-field small{color:var(--vault-text-faint);font-size:11px;line-height:1.4}
.tbt-sortrow{display:flex;gap:6px;min-width:0}
.tbt-sortrow select{flex:1 1 auto}
.tbt-btn{font:inherit;font-size:13px;min-height:40px;padding:6px 12px;border-radius:8px;border:1px solid var(--vault-border);background:transparent;color:var(--vault-text);cursor:pointer;white-space:nowrap}
.tbt-btn:focus-visible,.tbt-field select:focus-visible,.tbt-field input:focus-visible,.tbt-scroll:focus-visible{outline:2px solid var(--vault-gold-bright);outline-offset:2px}
.tbt-count{font-size:12px;color:var(--vault-text-mute);margin:0 0 6px}
.tbt-scroll{overflow-x:auto;max-width:100%;border:1px solid var(--vault-border);border-radius:10px;-webkit-overflow-scrolling:touch}
.tbt table{border-collapse:collapse;width:max-content;min-width:100%;font-size:13px}
.tbt th,.tbt td{padding:8px 10px;border-bottom:1px solid var(--vault-border);text-align:left;vertical-align:top;min-width:120px;max-width:200px}
.tbt thead th{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--vault-text-faint);background:var(--vault-panel);white-space:nowrap}
.tbt tbody th{font-size:14px;color:var(--vault-text);min-width:150px}
.tbt th.tbt-rank,.tbt td.tbt-rank{min-width:28px}
.tbt td.tbt-num{font-family:var(--font-mono);white-space:nowrap}
.tbt .tbt-sub{display:block;font-size:11px;color:var(--vault-text-faint);margin-top:2px}
.tbt .tbt-np{display:block;color:var(--vault-text-mute);font-size:12px}
.tbt code{font-family:var(--font-mono);font-size:10px;color:var(--vault-text-faint);overflow-wrap:anywhere}
.tbt .tbt-stick{position:sticky;left:0;background:var(--vault-bg, var(--vault-panel));z-index:1;overflow-wrap:anywhere}
@media (max-width:639px){.tbt .tbt-stick{width:112px;min-width:112px;max-width:112px;font-size:13px}}
.tbt-empty{border:1px dashed var(--vault-border-strong);border-radius:12px;padding:16px;font-size:14px;color:var(--vault-text-mute);margin:0 0 12px}
`;

const num = (x: number | null | undefined, d = 1) => (typeof x === "number" && Number.isFinite(x) ? x.toFixed(d) : "—");

function PriceTd({ cell }: { cell: PriceCell }) {
  if (cell.state === "EVALUATED") return <td className="tbt-num">{cell.display}</td>;
  return (
    <td>
      <span className="tbt-np">{cell.display}</span>
      {cell.reasonCode ? <code>{cell.reasonCode}</code> : null}
    </td>
  );
}

export default function TopBoardTable({ model }: { model: BoardTableModelT | null }) {
  const id = `nba-tbt-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [market, setMarket] = useState("all");
  const [game, setGame] = useState("all");
  const [player, setPlayer] = useState("");
  const [sportsbook, setSportsbook] = useState("all");
  const [minProjection, setMinProjection] = useState("");
  const [minEdge, setMinEdge] = useState("");
  // Default: by market, then each board's frozen rank (a projection sort mixes PRA-sized numbers with 3PM-sized ones).
  const [sort, setSort] = useState("market");
  const [dir, setDir] = useState<"asc" | "desc">("asc");

  const options = useMemo(() => filterOptions(model), [model]);
  const rows: BoardRowViewT[] = useMemo(() => {
    if (!model) return [];
    const minP = minProjection.trim() === "" ? null : Number(minProjection);
    const minE = minEdge.trim() === "" ? null : Number(minEdge) / 100;
    const filtered = filterRowViews(model.rows, {
      market, game, player, sportsbook,
      minProjection: Number.isFinite(minP) ? minP : null,
      minEdge: options.edgeEnabled && Number.isFinite(minE) ? minE : null,
    });
    return sortRowViews(filtered, sort, dir);
  }, [model, market, game, player, sportsbook, minProjection, minEdge, sort, dir, options.edgeEnabled]);

  if (!model) {
    return (
      <section className="tbt" aria-label="NBA board table">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="tbt-empty" role="status"><strong>No board document.</strong> No frozen NBA board file and no committed forecast to replay — nothing to tabulate.</div>
      </section>
    );
  }

  const selectedMarket = model.markets.find((m) => m.key === market) ?? null;
  const reset = () => { setMarket("all"); setGame("all"); setPlayer(""); setSportsbook("all"); setMinProjection(""); setMinEdge(""); };

  return (
    <section className="tbt" aria-label="NBA board table — every market">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {!model.priced ? (
        <p className="tbt-note">
          <strong>No authorized NBA price.</strong> Sportsbook, line, Over/Under, model probability, odds and edge/EV are
          shown as missing on every row (reason code NO_AUTHORIZED_PRICE). A projection above or below a number is never an
          Over or an Under here: only the shared market evaluator decides that, and only with an authorized two-way price.
        </p>
      ) : null}

      <ul className="tbt-markets" aria-label="Markets on this freeze">
        {model.markets.map((m) => (
          <li key={m.key} className="tbt-chip" data-state={m.state} title={m.text ?? undefined}>
            {m.label} · {m.state === "RANKED" ? `${m.rows} row${m.rows === 1 ? "" : "s"}` : STATE_WORDS[m.state] ?? m.state}
          </li>
        ))}
      </ul>

      <div className="tbt-controls">
        <label className="tbt-field" htmlFor={`${id}-market`}>Market
          <select id={`${id}-market`} value={market} onChange={(e) => setMarket(e.target.value)}>
            <option value="all">All markets</option>
            {model.markets.map((m) => <option key={m.key} value={m.key}>{m.label}{m.state === "RANKED" ? "" : ` (${STATE_WORDS[m.state] ?? m.state})`}</option>)}
          </select>
        </label>
        <label className="tbt-field" htmlFor={`${id}-game`}>Game
          <select id={`${id}-game`} value={game} onChange={(e) => setGame(e.target.value)}>
            <option value="all">All games</option>
            {options.games.map((g: { value: string; label: string; tipoffUtc: string | null }) => <option key={g.value} value={g.value}>{g.label}{g.tipoffUtc ? ` · ${etStamp(g.tipoffUtc) ?? ""}` : ""}</option>)}
          </select>
        </label>
        <label className="tbt-field" htmlFor={`${id}-player`}>Player (name or id)
          <input id={`${id}-player`} type="search" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="e.g. Cunningham" autoComplete="off" />
        </label>
        <label className="tbt-field" htmlFor={`${id}-book`}>Sportsbook
          <select id={`${id}-book`} value={sportsbook} onChange={(e) => setSportsbook(e.target.value)} disabled={!options.sportsbookEnabled} aria-describedby={`${id}-book-why`}>
            <option value="all">All sportsbooks</option>
            {options.sportsbooks.map((b: string) => <option key={b} value={b}>{b}</option>)}
          </select>
          {options.sportsbookDisabledReason ? <small id={`${id}-book-why`}>{options.sportsbookDisabledReason}</small> : null}
        </label>
        <label className="tbt-field" htmlFor={`${id}-minp`}>Minimum projection
          <input id={`${id}-minp`} type="number" inputMode="decimal" step="0.5" min="0" value={minProjection} onChange={(e) => setMinProjection(e.target.value)} placeholder="any" />
        </label>
        <label className="tbt-field" htmlFor={`${id}-mine`}>Minimum edge (points)
          <input id={`${id}-mine`} type="number" inputMode="decimal" step="0.5" value={minEdge} onChange={(e) => setMinEdge(e.target.value)} disabled={!options.edgeEnabled} placeholder="any" aria-describedby={`${id}-edge-why`} />
          {options.edgeDisabledReason ? <small id={`${id}-edge-why`}>{options.edgeDisabledReason}</small> : null}
        </label>
        <div className="tbt-field">
          <label htmlFor={`${id}-sort`}>Sort by</label>
          <div className="tbt-sortrow">
            <select id={`${id}-sort`} value={sort} onChange={(e) => { setSort(e.target.value); setDir(e.target.value === "projection" || e.target.value === "edge" ? "desc" : "asc"); }}>
              {options.sorts.map((s: { key: string; label: string; disabled: boolean }) => <option key={s.key} value={s.key} disabled={s.disabled}>{s.label}{s.disabled ? " (no price)" : ""}</option>)}
            </select>
            <button type="button" className="tbt-btn" onClick={() => setDir(dir === "asc" ? "desc" : "asc")} aria-label={`Sort direction: ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.`}>{dir === "asc" ? "↑ asc" : "↓ desc"}</button>
          </div>
        </div>
      </div>

      {selectedMarket && selectedMarket.state !== "RANKED" ? (
        <div className="tbt-empty" role="status"><strong>{selectedMarket.label}: {STATE_WORDS[selectedMarket.state] ?? selectedMarket.state}.</strong> {selectedMarket.text}</div>
      ) : null}

      {rows.length ? (
        <>
          <p className="tbt-count" aria-live="polite">{rows.length} of {model.rows.length} frozen row{model.rows.length === 1 ? "" : "s"} · each row keeps its frozen board rank (#).</p>
          <div className="tbt-scroll" role="region" aria-label="Board rows (scrolls sideways)" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col" className="tbt-stick">Player</th>
                  <th scope="col" className="tbt-rank">#</th>
                  <th scope="col">Game</th>
                  <th scope="col">Market</th>
                  <th scope="col">Model projection</th>
                  {PRICE_COLUMNS.map((c) => <th key={c.key} scope="col">{c.label}</th>)}
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rowId}>
                    <th scope="row" className="tbt-stick" style={{ fontWeight: 600 }}>
                      {r.player.name ?? "Unnamed player"}
                      <span className="tbt-sub">{r.player.team?.abbr ?? "—"} · id {r.player.providerAthleteId ?? "missing"}</span>
                      {r.injuryStatus ? <span className="tbt-sub">Injury report: {r.injuryStatus}</span> : null}
                    </th>
                    <td className="tbt-num tbt-rank">{r.rank}</td>
                    <td>
                      {r.game.homeAway === "home" ? "vs" : "@"} {r.game.opponent?.abbr ?? "—"}
                      <span className="tbt-sub">{r.game.tipoffUtc ? etStamp(r.game.tipoffUtc) ?? r.game.tipoffUtc : "tip time missing"}</span>
                      <span className="tbt-sub">{r.game.etDate ?? "date missing"}</span>
                    </td>
                    <td>
                      {r.market.label}
                      <span className="tbt-sub">{r.market.basis === "JOINT_SIMULATED_SUM" ? `joint sum of ${(r.market.components ?? []).join(" + ")} (same draws)` : "single statistic"}</span>
                    </td>
                    <td className="tbt-num">
                      {num(r.projection.value)}
                      <span className="tbt-sub">{r.projection.metricLabel} · p10–p90 {num(r.projection.p10)}–{num(r.projection.p90)}</span>
                      <span className="tbt-sub">{r.projection.role === "OFFICIAL" ? "official" : "supporting simulation"} · {r.projection.family ?? "family missing"}</span>
                    </td>
                    {PRICE_COLUMNS.map((c) => <PriceTd key={c.key} cell={r.price[c.key]} />)}
                    <td>
                      <span className="tbt-sub" style={{ marginTop: 0 }}>Forecast frozen {r.updated.forecastFrozenAt ? etStamp(r.updated.forecastFrozenAt) ?? r.updated.forecastFrozenAt : "missing"}</span>
                      <span className="tbt-sub">Odds captured {r.updated.oddsCapturedAt ? etStamp(r.updated.oddsCapturedAt) ?? r.updated.oddsCapturedAt : "— none"}</span>
                      {r.updated.oddsCapturedAtReason ? <code>{r.updated.oddsCapturedAtReason}</code> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : model.rows.length ? (
        <div className="tbt-empty" role="status">
          <strong>No rows match these filters.</strong> {selectedMarket && selectedMarket.state !== "RANKED" ? "" : "Widen the filters to see the frozen rows."}{" "}
          <button type="button" className="tbt-btn" onClick={reset}>Clear filters</button>
        </div>
      ) : (
        <div className="tbt-empty" role="status"><strong>No ranked rows on this freeze.</strong> Every board is empty — see each market&apos;s reason above.</div>
      )}
    </section>
  );
}
