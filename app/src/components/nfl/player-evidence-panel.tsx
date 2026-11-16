/**
 * NFL PLAYER EVIDENCE PANEL (founder 2026-11-15, P2) — server component. For each projected player on a game page:
 * the official projection beside the player's ACTUAL last 5 / last 10 games (dates, opponents, exact stat lines), a
 * small bar chart, the sample and its gaps, and — only while the NFL line display is on — the observed-line state.
 *
 * LINE GATE: every line-related output (the line-state sentence, a hit rate, a line value, a sportsbook name,
 * BOOK_AVAILABILITY_NOTE) follows `display` (default NFL_LINE_DISPLAY, the NflPropLines pattern). While
 * `!display.public` the panel prints the game history, chart, projection band and sample/gap summaries ONLY: no
 * line content and no line wording at all (nfl-prop-lines-switch-off.test.mjs reads the rendered game page). The game
 * page passes the effective gate of its own line section — switch on AND a readable line artifact for the game.
 *
 * It never invents a comparison line: with no sportsbook line captured before kickoff it says so and shows no hit rate.
 * Every hit rate names the line value, the sportsbook and the capture time (ET) — lib/sports/nfl/evidence-line.mjs.
 * The projection beside the history is the game page's own row (gameTabs, via evidence-projections.mjs): "official
 * projection" only for a PUBLISHED family, "estimate" for an ESTIMATE family, "no official projection" otherwise.
 * The projection band on the chart is that row's 80% range — labelled as such, never as a line.
 * Collapsed by default (<details>), no client JavaScript. Styling is one class sheet (EV_CSS), not per-cell inline
 * styles: a full board is ~18 players × 10 games, and inline styles tripled the page payload.
 */
import React from "react";
import { FAMILY_STAT, lineRecord, summary, valueOf } from "@/lib/sports/nfl/player-evidence.mjs";
import { NO_RATE_TEXT, lineCaption, lineView } from "@/lib/sports/nfl/evidence-line.mjs";
import { BOOK_AVAILABILITY_NOTE } from "@/lib/sports/odds/eligible-operators.mjs";
import { NFL_LINE_DISPLAY } from "@/lib/sports/nfl/line-display.mjs";

export type EvidenceEntry = { eventId: string; week: number; date: string; team: string; opponent: string | null; homeAway: "H" | "A"; state: "STAT_LINE" | "NO_STAT_LINE"; stats?: Record<string, number> };
/** One row the game page shows for (player, family) — evidence-projections.mjs. */
export type EvidenceProjection = { value: number; p10: number | null; p90: number | null; kind: string; text: string; range: string | null; estimate: string | null; market: any };
export type EvidencePlayer = { playerId: string; name: string; team: string; markets?: Record<string, unknown> };

/** The order families are shown in; anytime TD last (its history is a yes/no). */
const ORDER = ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "anytime_td"];
const fmt = (v: number | null | undefined, d = 0) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(d));
const shortDate = (iso: string) => { const [, m, d] = iso.split("-"); return `${Number(m)}/${Number(d)}`; };
const r1 = (v: number) => Math.round(v * 10) / 10;

export const EV_CSS = `
.ev-intro{font-size:12.5px;color:var(--vault-text-mute);margin:0 0 8px}
.ev-list{list-style:none;padding:0;margin:0}
.ev-p{border-bottom:1px solid var(--vault-border)}
.ev-p>details>summary{cursor:pointer;padding:8px 2px;font-size:13px;color:var(--vault-text);min-height:44px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ev-team{color:var(--vault-text-faint)}
.ev-recent{color:var(--vault-text-mute);font-size:12px}
.ev-body{padding:0 2px 10px}
.ev-small{font-size:12px;color:var(--vault-warn);margin:4px 0}
.ev-f{padding:8px 0;border-top:1px solid var(--vault-border)}
.ev-fh{font-size:12.5px;color:var(--vault-text);font-weight:600}
.ev-fh span{font-weight:400;color:var(--vault-text-mute)}
.ev-sum{font-size:12px;color:var(--vault-text-mute);margin:4px 0 6px}
.ev-line{font-size:11.5px;color:var(--vault-text-faint);margin-top:4px}
.ev-svg{display:block;max-width:100%}
.ev-band{fill:var(--vault-gold-bright);opacity:.12}
.ev-med{stroke:var(--vault-gold-bright);stroke-dasharray:3 3;stroke-width:1}
.ev-bar{fill:var(--vault-text-mute)}
.ev-ax{font-size:8.5px;fill:var(--vault-text-faint);text-anchor:middle}
.ev-gap{font-size:10px;fill:var(--vault-text-faint);text-anchor:middle}
.ev-scroll{overflow-x:auto}
.ev-t{border-collapse:collapse;font-size:11.5px;margin-top:6px;min-width:360px}
.ev-t th,.ev-t td{padding:2px 6px;text-align:right}
.ev-t th{color:var(--vault-text-faint);font-weight:500}
.ev-t th:nth-child(-n+2),.ev-t td:nth-child(-n+2){text-align:left}
.ev-t tr{color:var(--vault-text-mute)}
.ev-t tr.ev-none{color:var(--vault-text-faint)}
`;

function Bars({ log, family, band }: { log: EvidenceEntry[]; family: string; band: { p10?: number; p90?: number; median?: number } | null }) {
  const games = [...log.slice(0, 10)].reverse(); // oldest → newest, left to right
  const vals = games.map((e) => valueOf(e, family) as number | null);
  const top = Math.max(1, ...vals.map((v) => v ?? 0), band?.p90 ?? 0);
  const W = 22, GAP = 6, H = 64, width = Math.max(1, games.length * (W + GAP));
  const y = (v: number) => r1(H - (v / top) * H);
  return (
    <svg className="ev-svg" role="img" aria-label={`${FAMILY_STAT[family as keyof typeof FAMILY_STAT].label}, last ${games.length} games, oldest to newest: ${vals.map((v) => (v == null ? "no stat line" : v)).join(", ")}`} viewBox={`0 0 ${width} ${H + 14}`} width={width} height={H + 14}>
      {band?.p10 != null && band?.p90 != null ? <rect className="ev-band" x={0} y={y(band.p90)} width={width} height={Math.max(1, r1(y(band.p10) - y(band.p90)))} /> : null}
      {band?.median != null ? <line className="ev-med" x1={0} x2={width} y1={y(band.median)} y2={y(band.median)} /> : null}
      {games.map((e, i) => {
        const v = vals[i];
        const x = i * (W + GAP);
        return v == null ? <text key={e.eventId} className="ev-gap" x={x + W / 2} y={H - 2}>–</text> : <rect key={e.eventId} className="ev-bar" x={x} y={y(v)} width={W} height={Math.max(1, r1(H - y(v)))} rx={2} />;
      })}
      {games.map((e, i) => <text key={`d${e.eventId}`} className="ev-ax" x={i * (W + GAP) + W / 2} y={H + 11}>{e.opponent ?? ""}</text>)}
    </svg>
  );
}

function FamilyEvidence({ log, family, m, chart, kickoffUtc, lines }: { log: EvidenceEntry[]; family: string; m: EvidenceProjection | null; chart: boolean; kickoffUtc: string | null; lines: boolean }) {
  const f = FAMILY_STAT[family as keyof typeof FAMILY_STAT];
  const isTd = family === "anytime_td";
  const s5 = summary(log, family, 5), s10 = summary(log, family, 10);
  /* the page's own (sanitised) offer slot; an estimate never carries one */
  /* switch off ⇒ the offer slot is never read: no line view, no record against a line */
  const lv = lines ? lineView(m?.market ?? null, kickoffUtc) : null;
  const r5 = lv ? lineRecord(log, family, 5, { line: lv.state === "OBSERVED" ? { line: lv.line, sportsbook: lv.sportsbook, capturedAt: lv.capturedAt } : null }) : null;
  const proj = m ? `${m.text}${isTd ? " chance to score" : ` ${f.unit}`}${m.range && !isTd ? ` (80% range ${m.range})` : ""}` : null;
  const projState = !m ? "NONE" : m.estimate ? "ESTIMATE" : "OFFICIAL";
  const tdGames = (s: ReturnType<typeof summary>) => s.values.filter((v: number | null) => v != null && v > 0).length;
  return (
    <div className="ev-f" data-evidence-family={family} data-projection-state={projState}>
      <div className="ev-fh">{f.label}<span> · {projState === "OFFICIAL" ? <>official projection {proj}</> : projState === "ESTIMATE" ? <>estimate {proj}, not an official projection</> : "no official projection"}</span></div>
      <div className="ev-sum">
        {isTd
          ? <>Scored in {tdGames(s5)} of last {s5.recorded} recorded games{s10.recorded > s5.recorded ? <> · {tdGames(s10)} of last {s10.recorded}</> : null}</>
          : <>Last 5 median {fmt(s5.median, 1)} · last {s10.games} median {fmt(s10.median, 1)} · range {fmt(s10.min)}–{fmt(s10.max)}</>}
        {s10.noStatLine ? <> · {s10.noStatLine} game{s10.noStatLine > 1 ? "s" : ""} with no stat line</> : null}
      </div>
      {chart && !isTd ? <Bars log={log} family={family} band={m ? { p10: m.p10 ?? undefined, p90: m.p90 ?? undefined, median: m.value } : null} /> : null}
      {m?.estimate ? <div className="ev-line">{m.estimate}</div> : null}
      {lv && r5 ? <div className="ev-line" data-line-state={lv.state === "OBSERVED" ? r5.state : lv.state}>
        {lv.state !== "OBSERVED"
          ? NO_RATE_TEXT[lv.state as keyof typeof NO_RATE_TEXT]
          : r5.state === "COMPLETE"
            ? `Last 5 vs today's line ${lineCaption(lv)}: over in ${r5.badge}${r5.pushes ? `, ${r5.pushes} push` : ""}. A past streak is history, not a probability.`
            : `Last 5 vs today's line ${lineCaption(lv)}: ${r5.hits ?? 0} over of ${(r5.games ?? 0) - (r5.missing ?? 0)} recorded games — not a full 5-game record (${r5.state === "SHORT_SAMPLE" ? "fewer than 5 games" : "a game with no stat line"}).`}
        {/* an OBSERVED line names its sportsbook ⇒ the required availability disclosure rides on the same line */}
        {lv.state === "OBSERVED" ? <> <span data-book-availability-note>{BOOK_AVAILABILITY_NOTE}</span></> : null}
      </div> : null}
    </div>
  );
}

export default function NflPlayerEvidencePanel({ players, evidence, projections, kickoffUtc, sourceNote, display = NFL_LINE_DISPLAY }: { players: EvidencePlayer[]; evidence: Record<string, EvidenceEntry[]>; projections: Record<string, Record<string, EvidenceProjection>>; kickoffUtc: string | null; sourceNote: string; display?: { public: boolean } }) {
  /* families shown: the page's projected families for the player; a board player the page projects in nothing keeps his
     board families, each marked "no official projection" (history only, never a hit rate from an unshown line) */
  const famsOf = (p: EvidencePlayer) => { const own = ORDER.filter((k) => projections[p.playerId]?.[k]); return own.length ? own : ORDER.filter((k) => p.markets?.[k]); };
  const rows = players.filter((p) => evidence[p.playerId] && famsOf(p).length);
  if (!rows.length) return null;
  return (
    <div data-testid="nfl-player-evidence">
      <style dangerouslySetInnerHTML={{ __html: EV_CSS }} />
      <p className="ev-intro">
        Each player&apos;s actual games before this kickoff, beside this page&apos;s projection. The chart (for the player's main market) shows real results (– means no stat line: did not play or recorded no stat); the dashed line and shaded band are the model&apos;s median and 80% range. {sourceNote}
      </p>
      <ul className="ev-list">
        {rows.map((p) => {
          const log = evidence[p.playerId];
          const fams = famsOf(p);
          const lead = fams.find((k) => k !== "anytime_td") ?? fams[0];
          const recent = log.slice(0, 5).map((e) => valueOf(e, lead));
          /* columns by role: only the stat groups this player is projected in (TD column always) */
          const qb = fams.includes("player_pass_yds");
          const rec = fams.includes("player_reception_yds") || fams.includes("player_receptions");
          const rush = fams.includes("player_rush_yds");
          const cols = (rec ? 3 : 0) + (rush ? 2 : 0) + 1 + (qb ? 4 : 0);
          return (
            <li key={p.playerId} className="ev-p" data-evidence-player={p.playerId}>
              <details>
                <summary>
                  <b>{p.name}</b><span className="ev-team">{p.team}</span>
                  <span className="ev-recent">
                    {log.length ? <>last {Math.min(5, log.length)} {FAMILY_STAT[lead as keyof typeof FAMILY_STAT].label.toLowerCase()}: {recent.map((v) => (v == null ? "–" : v)).join(" · ")}</> : "no games before this kickoff"}
                  </span>
                </summary>
                <div className="ev-body">
                  {log.length < 5 ? <p className="ev-small">Only {log.length} game{log.length === 1 ? "" : "s"} on record this season — a small sample.</p> : null}
                  {fams.map((k) => <FamilyEvidence key={k} log={log} family={k} m={projections[p.playerId]?.[k] ?? null} chart={k === lead} kickoffUtc={kickoffUtc} lines={display.public} />)}
                  <div className="ev-scroll">
                    <table className="ev-t">
                      <caption className="sr-only">{p.name} game log, most recent first</caption>
                      <thead><tr><th>Wk</th><th>Opp</th>{rec ? <><th>Tgt</th><th>Rec</th><th>Rec yds</th></> : null}{rush ? <><th>Rush</th><th>Rush yds</th></> : null}<th>TD</th>{qb ? <><th>Cmp/Att</th><th>Pass yds</th><th>Pass TD</th><th>INT</th></> : null}</tr></thead>
                      <tbody>
                        {log.map((e) => {
                          const s = e.stats ?? {};
                          const opp = <><td>{e.week} {shortDate(e.date)}</td><td>{e.homeAway === "A" ? "@" : "vs"} {e.opponent ?? "?"}{e.team !== p.team ? ` (${e.team})` : ""}</td></>;
                          if (e.state !== "STAT_LINE") return <tr key={e.eventId} className="ev-none">{opp}<td colSpan={cols}>no stat line</td></tr>;
                          return (
                            <tr key={e.eventId}>{opp}{rec ? <><td>{s.targets ?? 0}</td><td>{s.rec ?? 0}</td><td>{s.recYds ?? 0}</td></> : null}{rush ? <><td>{s.rushAtt ?? 0}</td><td>{s.rushYds ?? 0}</td></> : null}<td>{(s.recTd ?? 0) + (s.rushTd ?? 0)}</td>
                              {qb ? <><td>{s.passCmp ?? 0}/{s.passAtt ?? 0}</td><td>{s.passYds ?? 0}</td><td>{s.passTd ?? 0}</td><td>{s.passInt ?? 0}</td></> : null}</tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
