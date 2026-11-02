"use client";
/**
 * RESULTS DAY EXPLORER (Results V2 pilot) — the /results/day shell.
 *
 * Fetches `index.json` on mount and one day file when a reader selects it, so the page itself carries no results data.
 * Game view and player view are two client filters over the same rows. Counts come from the day file's `families`,
 * printed per market and never added up: the only pooled figure this page could print is one the contract forbids.
 *
 * Three things stay apart on screen: the model's side against the captured reference (never called a result of a bet),
 * forecast accuracy, and missing measurements. Nothing on a pilot day is an official betting result, so no such word is
 * printed. The side is shown without the reference, because no price or market figure is in the file.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MARKET_LABELS, MEASUREMENT, REASON, REASON_WORDS, SIDE_RESULT } from "@/lib/results/v2/contract.mjs";

const BASE = "/data/results/v2";
const SPORTS = [{ id: "nfl", label: "NFL" }, { id: "nba", label: "NBA" }] as const;
const PLAYER_PAGE = 40;
const SIDE_LABEL = "Model side vs captured line (not a betting result)";
/* Every NBA row carries one of these, and every compared NFL row the other, and the page already says both. */
const QUIET = new Set<string>([REASON.SIDE_COMPARED, REASON.EXPERIMENTAL_LANE]);

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
.rd .tag.hit{color:var(--vault-gold-bright);border-color:var(--vault-gold-bright)}
.rd .tag.miss{color:var(--vault-text)}
.rd .tag.gap{border-style:dashed;color:var(--vault-text)}
.rd .warn{border:1px solid var(--vault-border-strong);border-radius:10px;padding:10px 12px;margin-top:12px;font-size:12.5px;line-height:1.55;color:var(--vault-text-mute)}
.rd .warn b{color:var(--vault-text)}
@media(max-width:480px){.rd th,.rd td{padding-left:4px;padding-right:4px}.rd td small{font-size:10.5px}}
.rd a.l{color:var(--gtp-bank-heat);font-weight:600;min-height:44px;display:inline-flex;align-items:center}
`;

type Row = {
  subject: string; playerId: string; team: string; market: string; predictionKind: "MEDIAN" | "PROBABILITY";
  prediction: number; actual: number | string | null; absoluteError: number | null; measurement: string;
  modelSide: "OVER" | "UNDER" | null; sideResult: string | null; claim: string; reason: string;
};
type Game = {
  eventId: string; start: string; cutoff: string; matchup: string;
  final: { state: string; score: { away: number; home: number }; officialSide?: string; winner?: string; sideResult?: string | null };
  snapshot: { servedFrom: string; settledFrom: string; generatedAt: string; sourceVersion: string; validationStatus: string; evidence: string };
  rows: Row[];
};
type Family = {
  market: string; rows: number; measured: number; noMeasurement: number; pending: number; void: number; withModelSide: number;
  sideCorrect: number; sideIncorrect: number; sidePush: number; noSide: number; sideCompared: number; sideCorrectRate: number | null;
  errorRows: number; meanAbsoluteError: number | null;
};
type Day = {
  sport: string; date: string; label?: string; validation?: string; counts: { games: number; players: number; rows: number };
  officialSide?: { correct: number; incorrect: number; push: number; noSide: number; compared: number };
  families: Family[]; games: Game[];
  provenance: { evidence: string; validationStatus: string; surveyCommit: string; note: string; sourceFiles: { forecast: string; settlement: string; finals: string[] } };
};
type IndexDay = { sport: string; date: string; games: number; players: number; rows: number; json: string; csv: string };

const ET_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
const ET_INSTANT = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const DAY = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" });
const dayLabel = (ymd: string) => DAY.format(new Date(`${ymd}T12:00:00Z`));
const marketLabel = (m: string) => (MARKET_LABELS as Record<string, string>)[m] ?? m;
const prediction = (r: Row) => (r.predictionKind === "PROBABILITY" ? `${(r.prediction * 100).toFixed(1)}%` : String(r.prediction));
const SIDE_WORD: Record<string, string> = { CORRECT: "Side correct", INCORRECT: "Side incorrect", PUSH: "Landed on it", NO_SIDE: "No side" };

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

function Result({ row }: { row: Row }) {
  const missing = row.measurement !== MEASUREMENT.MEASURED;
  const word = row.measurement === MEASUREMENT.PENDING ? "Pending" : row.measurement === MEASUREMENT.VOID ? "Void"
    : row.measurement === MEASUREMENT.NO_MEASUREMENT ? "No measurement" : row.sideResult ? SIDE_WORD[row.sideResult] : "Not compared";
  const kind = missing ? " gap" : row.sideResult === SIDE_RESULT.CORRECT ? " hit" : row.sideResult === SIDE_RESULT.INCORRECT ? " miss" : "";
  return (
    <>
      <span className={`tag${kind}`}>{word}</span>
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
            <th scope="col">Side check</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.playerId}|${r.market}`}>
              <td>
                {first === "player" ? <>{r.subject}<small>{r.team} · {marketLabel(r.market)}</small></> : marketLabel(r.market)}
              </td>
              <td className="num">{prediction(r)}{r.modelSide ? <small>{r.modelSide}</small> : null}</td>
              <td className="num">{r.actual ?? "—"}</td>
              <td className="num">{r.absoluteError ?? "—"}</td>
              <td><Result row={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GameCard({ game, market }: { game: Game; market: string }) {
  const [open, setOpen] = useState(false);
  const rows = market === "all" ? game.rows : game.rows.filter((r) => r.market === market);
  const { away, home } = game.final.score;
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <strong>{game.matchup}</strong>
        <span className="sub">Final {away}–{home}</span>
        {game.final.officialSide ? <span className="sub">Official side {game.final.officialSide}: {SIDE_WORD[game.final.sideResult ?? ""] ?? "not compared"}</span> : null}
        <span className="sub">{ET_TIME.format(new Date(game.start))} ET · {rows.length} {rows.length === 1 ? "row" : "rows"}</span>
      </summary>
      {/* Rows mount on open: a full NBA slate would otherwise put 1,659 table rows in the DOM of a phone. */}
      {open ? (
        <>
          <Rows rows={rows} first="player" />
          <p className="prov">
            Frozen {ET_INSTANT.format(new Date(game.snapshot.generatedAt))} ET, before the {ET_INSTANT.format(new Date(game.cutoff))} ET start · {game.snapshot.evidence} · {game.snapshot.validationStatus}<br />
            Prediction: {game.snapshot.servedFrom}<br />Result: {game.snapshot.settledFrom}<br />Version: {game.snapshot.sourceVersion}
          </p>
        </>
      ) : null}
    </details>
  );
}

function PlayerCard({ name, team, playerId, rows }: { name: string; team: string; playerId: string; rows: (Row & { matchup: string })[] }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)} data-player={playerId}>
      <summary>
        <strong>{name}</strong>
        <span className="sub">{team} · {rows[0].matchup} · {rows.length} {rows.length === 1 ? "row" : "rows"}</span>
      </summary>
      {open ? <Rows rows={rows} first="market" /> : null}
    </details>
  );
}

function Families({ day }: { day: Day }) {
  return (
    <div className="fams">
      {day.families.map((f) => (
        <div className="fam" key={f.market} data-family={f.market}>
          <b>{marketLabel(f.market)}</b>
          {/* Each block answers one question, and none of them is a betting result. */}
          <span className="sec">{SIDE_LABEL}</span>
          {f.sideCompared ? (
            <>
              <div className="rec">{f.sideCorrect} correct · {f.sideIncorrect} incorrect</div>
              <span>{(f.sideCorrectRate! * 100).toFixed(1)}% correct of {f.sideCompared} compared · {f.sidePush} landed on it · {f.noSide} no side</span>
            </>
          ) : <span>Not compared{f.withModelSide ? ` (${f.withModelSide} rows show a model side)` : ""}</span>}
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
  const [failed, setFailed] = useState(false);
  const [day, setDay] = useState<Day | null>(null);
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
      .catch(() => { if (live) setFailed(true); });
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
  const market = day?.families.some((f) => f.market === q.get("market")) ? q.get("market")! : "all";
  const needle = (q.get("q") ?? "").trim().toLowerCase();

  useEffect(() => {
    if (!entry) { setDay(null); return; }
    let live = true;
    setDay(null);
    fetch(entry.json).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (live) setDay(j); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [entry]);

  const players = useMemo(() => {
    if (!day) return [];
    const by = new Map<string, { name: string; team: string; playerId: string; rows: (Row & { matchup: string })[] }>();
    for (const g of day.games) {
      for (const r of g.rows) {
        if (market !== "all" && r.market !== market) continue;
        if (needle && !r.subject.toLowerCase().includes(needle)) continue;
        const k = `${g.eventId}|${r.playerId}`;
        const p = by.get(k) ?? { name: r.subject, team: r.team, playerId: r.playerId, rows: [] };
        p.rows.push({ ...r, matchup: g.matchup });
        by.set(k, p);
      }
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  }, [day, market, needle]);

  return (
    <div className="rd mx-auto max-w-5xl px-4 py-6">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
        <Link href="/results/" className="l">Results</Link>
      </p>
      <h1>Results by day</h1>
      <p className="lede">
        Each official prediction beside what happened, one sport and one date at a time. Nothing here is an official betting
        result: these pilot days are a backfill, so the model&rsquo;s side is only compared with the captured pregame line, and that line
        is never shown. A missing stat is no measurement, never a zero.
      </p>

      <Toggle label="Sport" value={sport} options={SPORTS} onChange={(id) => write({ sport: id, date: null, market: null, q: null })} />
      <div className="ctl">
        <label className="lbl" htmlFor="rd-date">Date (ET)</label>
        <select id="rd-date" value={entry?.date ?? ""} disabled={!dates.length} onChange={(e) => write({ date: e.target.value, market: null, q: null })}>
          {dates.map((d) => <option key={d.date} value={d.date}>{dayLabel(d.date)}</option>)}
        </select>
      </div>

      {failed ? <p className="warn" role="alert">This day could not be loaded. Nothing is shown rather than a partial record.</p> : null}
      {!failed && (!index || (entry && !day)) ? <p className="note" role="status">Loading…</p> : null}
      {!failed && index && !entry ? <p className="note">No day is published for this sport yet.</p> : null}

      {day && entry ? (
        <>
          {day.label ? (
            <div className="warn" data-experimental>
              <b>{day.label}.</b> {day.validation}. Medians only. Team scores withheld. No player row has a side.
            </div>
          ) : null}

          <section aria-labelledby="rd-summary">
            <h2 id="rd-summary">{dayLabel(day.date)} by market</h2>
            <p className="note">
              {day.counts.games} games · {day.counts.players} players · {day.counts.rows} rows.
              {day.officialSide ? ` Official side correct in ${day.officialSide.correct} of ${day.officialSide.compared} games, against the final. Not a betting result.` : ""}
            </p>
            <div style={{ marginTop: 10 }}><Families day={day} /></div>
          </section>

          <section aria-labelledby="rd-compare">
            <h2 id="rd-compare">Prediction vs actual</h2>
            <Toggle label="View" value={view} options={[{ id: "game", label: "By game" }, { id: "player", label: "By player" }]} onChange={(id) => write({ view: id })} />
            <Toggle
              label="Market" value={market}
              options={[{ id: "all", label: "All" }, ...day.families.map((f) => ({ id: f.market, label: marketLabel(f.market) }))]}
              onChange={(id) => write({ market: id === "all" ? null : id })}
            />
            {view === "game" ? (
              <div style={{ marginTop: 10 }}>{day.games.map((g) => <GameCard key={g.eventId} game={g} market={market} />)}</div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div className="ctl">
                  <label className="lbl" htmlFor="rd-q">Find a player</label>
                  <input id="rd-q" type="search" value={q.get("q") ?? ""} onChange={(e) => write({ q: e.target.value || null })} />
                </div>
                <p className="note" role="status">{players.length} players</p>
                {players.slice(0, limit).map((p) => <PlayerCard key={`${p.rows[0].matchup}|${p.playerId}`} {...p} />)}
                {players.length > limit ? <div className="ctl"><button type="button" className="btn" onClick={() => setLimit((n) => n + PLAYER_PAGE)}>Show more players</button></div> : null}
              </div>
            )}
          </section>

          <section aria-labelledby="rd-records">
            <h2 id="rd-records">Records and provenance</h2>
            <p className="m-0"><a className="l" href={entry.csv} download>Download this day as CSV</a></p>
            <p className="m-0"><a className="l" href={entry.json} download>Download this day as JSON</a></p>
            <p className="note">{day.provenance.note}</p>
            <p className="note">
              Forecast source: {day.provenance.sourceFiles.forecast} · Result source: {day.provenance.sourceFiles.settlement} · Finals: {day.provenance.sourceFiles.finals.join(", ")} · Surveyed at commit {day.provenance.surveyCommit.slice(0, 10)}.
            </p>
            <p className="note">{SIDE_LABEL}: the side comes from the frozen projection and the captured pregame line. The line, its price and its book are not on this page or in these files.</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
