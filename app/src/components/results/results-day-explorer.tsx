"use client";
/**
 * RESULTS DAY EXPLORER (Results V2 pilot): the /results/day shell.
 *
 * Fetches `index.json` on mount, a small day summary when a reader selects a date, and one game's rows only when that game
 * (or a player in it) is opened, so a phone never downloads a whole slate. Counts come from the summary's `families`,
 * printed per market and never added up.
 *
 * Three things stay apart on screen: the model's side against the captured reference (day totals per market only, never
 * per row, with counts and a 95% Wilson interval and never a bare rate), forecast accuracy, and missing measurements.
 * Nothing on a pilot day is an official betting result. Only days whose evidence the emit step publishes are listed; a
 * backfill never is, so the index may be empty and the page then says so.
 */
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { MARKET_LABELS, MEASUREMENT, REASON, REASON_WORDS } from "@/lib/results/v2/contract.mjs";

const BASE = "/data/results/v2";
const SPORTS = [{ id: "nfl", label: "NFL" }, { id: "nba", label: "NBA" }] as const;
const PLAYER_PAGE = 40;
const SIDE_LABEL = "Model side vs captured line, day totals only (not a betting result)";
/* Every NBA row carries one of these, and every side-counted NFL row the other, and the page already says both. */
const QUIET = new Set<string>([REASON.SIDE_AGGREGATE_ONLY, REASON.EXPERIMENTAL_LANE]);
const NONE = "n/a";

const CSS = `
.rd h1{font-size:26px;margin:0;color:var(--vault-text)}
.rd h2{font-size:18px;margin:0 0 8px;color:var(--vault-text)}
.rd .lede{margin:6px 0 0;max-width:720px;font-size:13.5px;line-height:1.6;color:var(--vault-text-mute)}
.rd .note{margin:8px 0 0;max-width:760px;font-size:12.5px;line-height:1.6;color:var(--vault-text-mute)}
.rd section{margin-top:24px}
.rd .ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px}
.rd .lbl{width:100%;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint)}
.rd .btn{min-height:44px;min-width:44px;padding:0 14px;border-radius:8px;border:1px solid var(--vault-border-strong);background:var(--gtp-card);color:var(--vault-text);font-size:13px;cursor:pointer}
.rd .btn[aria-pressed="true"]{border-color:var(--gtp-bank-heat);color:var(--gtp-bank-heat);font-weight:600}
.rd select,.rd input{min-height:44px;padding:0 10px;border-radius:8px;border:1px solid var(--vault-border-strong);background:var(--gtp-card);color:var(--vault-text);font-size:16px;max-width:100%}
.rd input{width:100%;max-width:320px}
.rd .fams{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.rd .fam{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;background:var(--gtp-card)}
.rd .fam b{display:block;font-size:13.5px;color:var(--vault-text)}
.rd .fam .rec{font-size:16px;font-weight:600;color:var(--vault-text);margin-top:2px}
.rd .fam span{display:block;font-size:11.5px;line-height:1.5;color:var(--vault-text-mute)}
.rd .fam span.sec{margin-top:8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--vault-text-faint)}
.rd .fam strong{color:var(--vault-text)}
.rd details{border:1px solid var(--vault-border);border-radius:10px;margin-top:8px;background:var(--gtp-card)}
.rd summary{min-height:44px;padding:10px 12px;cursor:pointer;font-size:13.5px;color:var(--vault-text);display:flex;flex-wrap:wrap;gap:2px 10px;align-items:center}
.rd summary .sub{font-size:12px;color:var(--vault-text-mute)}
.rd .prov{padding:0 12px 8px;font-size:11.5px;line-height:1.6;color:var(--vault-text-faint);overflow-wrap:anywhere}
.rd .scroll{overflow-x:auto;padding:0 4px 8px}
.rd table{width:100%;border-collapse:collapse}
.rd th{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--vault-text-faint)}
.rd td{padding:7px 8px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:top;color:var(--vault-text)}
.rd td small{display:block;font-size:11px;line-height:1.45;color:var(--vault-text-mute)}
.rd .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.rd th.num{white-space:normal}
.rd .tag{display:inline-block;padding:1px 6px;border-radius:5px;font-size:11px;font-weight:600;border:1px solid var(--vault-border-strong);color:var(--vault-text-mute)}
.rd .tag.gap{border-style:dashed;color:var(--vault-text)}
.rd .warn{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;margin-top:12px;font-size:12.5px;line-height:1.55;color:var(--vault-text-mute)}
.rd .warn b{color:var(--vault-text)}
@media(max-width:480px){.rd th,.rd td{padding-left:4px;padding-right:4px}.rd td small{font-size:10.5px}}
.rd a.l{color:var(--gtp-bank-heat);font-weight:600;min-height:44px;display:inline-flex;align-items:center}
`;

type Row = {
  subject: string; playerId: string; team: string; market: string; predictionKind: "MEDIAN" | "PROBABILITY";
  prediction: number; actual: number | string | null; absoluteError: number | null; measurement: string; claim: string; reason: string;
};
type Interval = { lower: number; upper: number };
type Side = null | { suppressed: true; minimumCompared: number } | { compared: number; correct: number; incorrect: number; wilson95: Interval; indistinguishableFromHalf: boolean };
type DirPlayer = { playerId: string; subject: string; team: string };
type Game = {
  eventId: string; start: string; cutoff: string; matchup: string; rowCount: number; rowsFile: string; players: DirPlayer[];
  final: { state: string; score: { away: number; home: number }; officialSide?: string; winner?: string; sideResult?: string | null };
  snapshot: { generatedAt: string; sourceVersion: string; validationStatus: string; evidence: string };
};
type Family = {
  market: string; rows: number; measured: number; noMeasurement: number; pending: number; void: number; side: Side;
  errorRows: number; meanAbsoluteError: number | null;
};
type Day = {
  sport: string; date: string; label?: string; validation?: string; counts: { games: number; players: number; rows: number };
  officialSide?: Side;
  families: Family[]; games: Game[];
  provenance: { evidence: string; validationStatus: string; surveyCommit: string; note: string };
};
type IndexDay = { sport: string; date: string; games: number; players: number; rows: number; json: string; csv: string };

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_INSTANT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const dayLabel = (ymd: string) => DAY.format(new Date(`${ymd}T12:00:00Z`));
const marketLabel = (m: string) => (MARKET_LABELS as Record<string, string>)[m] ?? m;
const prediction = (r: Row) => (r.predictionKind === "PROBABILITY" ? `${(r.prediction * 100).toFixed(1)}%` : String(r.prediction));
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const GAME_SIDE_WORD: Record<string, string> = { CORRECT: "picked the winner", INCORRECT: "did not pick the winner", PUSH: "tie", NO_SIDE: "no pick" };

/** Counts, the 95% Wilson interval, and the 50% caveat. Never a bare percentage. */
function SideCounts({ side, unit }: { side: Side; unit: string }) {
  if (!side) return <span>Not compared</span>;
  if ("suppressed" in side) return <span>Fewer than {side.minimumCompared} {unit} compared, or one outcome is zero: no count is shown</span>;
  return (
    <span>
      {side.correct} correct, {side.incorrect} incorrect, of {side.compared} {unit}. 95% interval {pct(side.wilson95.lower)} to {pct(side.wilson95.upper)}
      {side.indistinguishableFromHalf ? ": cannot be told apart from 50%." : "."}
    </span>
  );
}

function Toggle({ label, value, options, onChange }: { label: string; value: string; options: readonly { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <div className="ctl" role="group" aria-label={label}>
      <span className="lbl">{label}</span>
      {options.map((o) => (
        <button key={o.id} type="button" className="btn" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

function Status({ row }: { row: Row }) {
  const word = row.measurement === MEASUREMENT.PENDING ? "Pending" : row.measurement === MEASUREMENT.VOID ? "Void"
    : row.measurement === MEASUREMENT.NO_MEASUREMENT ? "No measurement" : "Measured";
  return (
    <>
      <span className={`tag${row.measurement === MEASUREMENT.MEASURED ? "" : " gap"}`}>{word}</span>
      {QUIET.has(row.reason) ? null : <small>{(REASON_WORDS as Record<string, string>)[row.reason]}</small>}
    </>
  );
}

function Rows({ rows, first }: { rows: Row[]; first: "player" | "market" }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">{first === "player" ? "Player" : "Market"}</th>
            <th scope="col" className="num">Model projection</th>
            <th scope="col" className="num">Actual</th>
            <th scope="col" className="num">Miss</th>
            <th scope="col">Measurement</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.playerId}|${r.market}`}>
              <td>
                {first === "player" ? <>{r.subject}<small>{r.team} · {marketLabel(r.market)}</small></> : marketLabel(r.market)}
              </td>
              <td className="num">{prediction(r)}</td>
              <td className="num">{r.actual ?? NONE}</td>
              <td className="num">{r.absoluteError ?? NONE}</td>
              <td><Status row={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One game's rows, fetched when first needed. Each request clears its own failure, so one bad fetch blanks nothing else. */
function useGameRows(file: string | null) {
  const [state, setState] = useState<{ file: string | null; rows: Row[] | null; failed: boolean }>({ file: null, rows: null, failed: false });
  useEffect(() => {
    if (!file) return;
    let live = true;
    setState({ file, rows: null, failed: false });
    fetch(file).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setState({ file, rows: j.rows, failed: false }); })
      .catch(() => { if (live) setState({ file, rows: null, failed: true }); });
    return () => { live = false; };
  }, [file]);
  return state.file === file ? state : { file, rows: null, failed: false };
}

function Loaded({ state, children }: { state: { rows: Row[] | null; failed: boolean }; children: (rows: Row[]) => ReactNode }) {
  if (state.failed) return <p className="warn" role="alert">These rows could not be loaded. Nothing is shown rather than a partial record.</p>;
  if (!state.rows) return <p className="note" role="status">Loading...</p>;
  return <>{children(state.rows)}</>;
}

function GameCard({ game, market }: { game: Game; market: string }) {
  const [open, setOpen] = useState(false);
  const state = useGameRows(open ? game.rowsFile : null);
  const { away, home } = game.final.score;
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <strong>{game.matchup}</strong>
        <span className="sub">Final {away}-{home}</span>
        {game.final.officialSide ? <span className="sub">Model pick {game.final.officialSide}: {GAME_SIDE_WORD[game.final.sideResult ?? ""] ?? "not compared"}</span> : null}
        <span className="sub">{ET_TIME.format(new Date(game.start))} ET · {game.rowCount} {game.rowCount === 1 ? "row" : "rows"}</span>
      </summary>
      {open ? (
        <>
          <Loaded state={state}>{(rows) => <Rows rows={market === "all" ? rows : rows.filter((r) => r.market === market)} first="player" />}</Loaded>
          <p className="prov">
            Frozen {ET_INSTANT.format(new Date(game.snapshot.generatedAt))} ET, before the {ET_INSTANT.format(new Date(game.cutoff))} ET start · Version: {game.snapshot.sourceVersion}
          </p>
        </>
      ) : null}
    </details>
  );
}

function PlayerCard({ player, game, market }: { player: DirPlayer; game: Game; market: string }) {
  const [open, setOpen] = useState(false);
  const state = useGameRows(open ? game.rowsFile : null);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} data-player={player.playerId}>
      <summary>
        <strong>{player.subject}</strong>
        <span className="sub">{player.team} · {game.matchup}</span>
      </summary>
      {open ? (
        <Loaded state={state}>
          {(rows) => <Rows rows={rows.filter((r) => r.playerId === player.playerId && (market === "all" || r.market === market))} first="market" />}
        </Loaded>
      ) : null}
    </details>
  );
}

function Families({ day }: { day: Day }) {
  return (
    <div className="fams">
      {day.families.map((f) => (
        <div className="fam" key={f.market} data-family={f.market}>
          <b>{marketLabel(f.market)}</b>
          <span className="sec">{SIDE_LABEL}</span>
          <SideCounts side={f.side} unit="rows" />
          <span className="sec">Forecast accuracy</span>
          <span>{f.meanAbsoluteError == null ? "No numeric miss: a yes or no market" : `Average miss ${f.meanAbsoluteError} over ${f.errorRows} measured rows`}</span>
          <span className="sec">Measurement</span>
          <span>{f.rows} rows · {f.measured} measured · <strong>{f.noMeasurement} no measurement</strong></span>
          <span>{f.pending} pending · {f.void} void</span>
        </div>
      ))}
    </div>
  );
}

export default function ResultsDayExplorer() {
  const [search, setSearch] = useState<string | null>(null);
  const [index, setIndex] = useState<IndexDay[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [day, setDay] = useState<{ json: string; doc: Day | null; failed: boolean } | null>(null);
  const [limit, setLimit] = useState(PLAYER_PAGE);

  useEffect(() => {
    setSearch(window.location.search);
    const onPop = () => setSearch(window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    let live = true;
    fetch(`${BASE}/index.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setIndex(j.days); })
      .catch(() => { if (live) setIndexFailed(true); });
    return () => { live = false; };
  }, []);

  const q = useMemo(() => new URLSearchParams(search ?? ""), [search]);
  const write = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    const s = next.toString() ? `?${next}` : "";
    window.history.replaceState(null, "", `${window.location.pathname}${s}`);
    setSearch(s);
    setLimit(PLAYER_PAGE);
  }, []);

  const sport = q.get("sport") === "nba" ? "nba" : "nfl";
  const view = q.get("view") === "player" ? "player" : "game";
  const dates = useMemo(() => (index ?? []).filter((d) => d.sport === sport), [index, sport]);
  const entry = dates.find((d) => d.date === q.get("date")) ?? dates[0] ?? null;
  const json = entry?.json ?? null;

  /* The failure belongs to one request: a new sport or date starts clean, so one failed fetch never blanks the rest. */
  useEffect(() => {
    if (!json) return;
    let live = true;
    setDay({ json, doc: null, failed: false });
    fetch(json).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setDay({ json, doc: j, failed: false }); })
      .catch(() => { if (live) setDay({ json, doc: null, failed: true }); });
    return () => { live = false; };
  }, [json]);

  const current = day && day.json === json ? day : null;
  const doc = current?.doc ?? null;
  const market = doc?.families.some((f) => f.market === q.get("market")) ? q.get("market")! : "all";
  const needle = (q.get("q") ?? "").trim().toLowerCase();

  const players = useMemo(() => {
    if (!doc) return [];
    const out: { player: DirPlayer; game: Game }[] = [];
    for (const g of doc.games) for (const p of g.players) if (!needle || p.subject.toLowerCase().includes(needle)) out.push({ player: p, game: g });
    return out.sort((a, b) => a.player.subject.localeCompare(b.player.subject, "en"));
  }, [doc, needle]);

  return (
    <div className="rd mx-auto max-w-5xl px-4 py-6">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
        <Link href="/results/" className="l">Results</Link>
      </p>
      <h1>Results by day</h1>
      <p className="lede">
        Each official prediction beside what happened, one sport and one date at a time. A day appears here only once its
        predictions are verified as served before the start. Nothing here is an official betting result, and a missing stat is
        no measurement, never a zero.
      </p>

      {indexFailed ? <p className="warn" role="alert">The list of days could not be loaded. Nothing is shown rather than a partial record.</p> : null}
      {!indexFailed && !index ? <p className="note" role="status">Loading...</p> : null}
      {index && index.length === 0 ? (
        <p className="warn" role="status" data-empty>
          <b>No day is published yet.</b> Earlier days were rebuilt from the public history after the fact, which does not show
          they were served before the start, so they are kept private.
        </p>
      ) : null}

      {index && index.length ? (
        <>
          <Toggle label="Sport" value={sport} options={SPORTS} onChange={(id) => write({ sport: id, date: null, market: null, q: null })} />
          <div className="ctl">
            <label className="lbl" htmlFor="rd-date">Date (ET)</label>
            <select id="rd-date" value={entry?.date ?? ""} disabled={!dates.length} onChange={(e) => write({ date: e.target.value, market: null, q: null })}>
              {dates.map((d) => <option key={d.date} value={d.date}>{dayLabel(d.date)}</option>)}
            </select>
          </div>
          {!entry ? <p className="note">No day is published for this sport yet.</p> : null}
          {current?.failed ? <p className="warn" role="alert">This day could not be loaded. Nothing is shown rather than a partial record.</p> : null}
          {entry && !current?.failed && !doc ? <p className="note" role="status">Loading...</p> : null}
        </>
      ) : null}

      {doc && entry ? (
        <>
          {doc.label ? (
            <div className="warn" data-experimental>
              <b>{doc.label}.</b> {(doc.validation ?? "").replace(/\s*\u2014\s*/g, ": ")}. Medians only. Team scores withheld. No player row has a side.
            </div>
          ) : null}

          <section aria-labelledby="rd-summary">
            <h2 id="rd-summary">{dayLabel(doc.date)} by market</h2>
            <p className="note">{doc.counts.games} games · {doc.counts.players} players · {doc.counts.rows} rows.</p>
            {doc.officialSide !== undefined ? (
              <p className="note">Model pick vs the final, per game (not a betting result): <SideCounts side={doc.officialSide} unit="games" /></p>
            ) : null}
            <div style={{ marginTop: 10 }}><Families day={doc} /></div>
          </section>

          <section aria-labelledby="rd-compare">
            <h2 id="rd-compare">Prediction vs actual</h2>
            <Toggle label="View" value={view} options={[{ id: "game", label: "By game" }, { id: "player", label: "By player" }]} onChange={(id) => write({ view: id })} />
            <Toggle
              label="Market" value={market}
              options={[{ id: "all", label: "All" }, ...doc.families.map((f) => ({ id: f.market, label: marketLabel(f.market) }))]}
              onChange={(id) => write({ market: id === "all" ? null : id })}
            />
            {view === "game" ? (
              <div style={{ marginTop: 10 }}>{doc.games.map((g) => <GameCard key={g.eventId} game={g} market={market} />)}</div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div className="ctl">
                  <label className="lbl" htmlFor="rd-q">Find a player</label>
                  <input id="rd-q" type="search" value={q.get("q") ?? ""} onChange={(e) => write({ q: e.target.value || null })} />
                </div>
                <p className="note" role="status">{players.length} players</p>
                {players.slice(0, limit).map((p) => <PlayerCard key={`${p.game.eventId}|${p.player.playerId}`} player={p.player} game={p.game} market={market} />)}
                {players.length > limit ? <div className="ctl"><button type="button" className="btn" onClick={() => setLimit((n) => n + PLAYER_PAGE)}>Show more players</button></div> : null}
              </div>
            )}
          </section>

          <section aria-labelledby="rd-records">
            <h2 id="rd-records">Records and provenance</h2>
            <p className="m-0"><a className="l" href={entry.csv} download>Download this day as CSV</a></p>
            <p className="note">{doc.provenance.note}</p>
            <p className="note">Each game names the frozen forecast version it was compared on and when it was frozen. Surveyed at commit {doc.provenance.surveyCommit.slice(0, 10)}.</p>
            <p className="note">{SIDE_LABEL}: the line, its price and its book are not on this page or in these files, and no row carries a side.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
