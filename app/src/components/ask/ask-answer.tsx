"use client";

/**
 * ONE ASK ANSWER (Session 3) — the verified text first, then the owner's own fields as cards, then what to open next,
 * with provenance behind a disclosure.
 *
 * Founder review of Production: a correct forecast answer was one bordered box of dense prose, the matchup restated in
 * every bullet, "Used: GameTime clock · GameTime Forecast" competing with the answer, and two identical "Open the MLB
 * game report" actions. The fix is structure, not new truth:
 *
 *   • The VERIFIED TEXT is always rendered, unchanged (readableAnswer is display clean-up only).
 *   • A typed card (forecast / live / results day / team comparison) renders the server's `display` — a projection of
 *     the same tool envelopes the evidence was written from (lib/ask/display.mjs). Nothing here computes a value.
 *   • Anything else — no display, an unknown kind, a malformed one — is the GENERIC answer, which is the Session 2
 *     rendering. A typed card is progressive enhancement; it never gates or replaces an answer (answer-view.mjs).
 *   • Each game's action lives on its own card, so three games give three distinguishable actions, and the chips under
 *     the answer drop any href a card already shows.
 *
 * Links: a card's href came from the evidence's own link list (display.mjs checks it), exactly like the chips — no
 * text the model wrote becomes an anchor (§98).
 */
import type { ReactNode } from "react";

import CdnTeamLogo from "@/components/team-logo";
import {
  answerRenderer,
  asOfEt,
  dayLabel,
  enumLabel,
  gradeBadge,
  kickoffEt,
  laneBadge,
  liveStateLabel,
  plural,
  remainingLinks,
  resultsHeading,
  sourceNames,
} from "@/lib/ask/answer-view.mjs";
import { listItemOf, readableAnswer } from "@/lib/ask/readable-answer.mjs";
import { ASK_SOURCE_LABEL } from "@/lib/ask/source-labels.mjs";

type LinkRef = { id: string; label: string; href: string };

/* ── display shapes (lib/ask/display.mjs) ── */
type ProbRow = { label: string; value: string | null; share: number };
type Market = { label: string | null; pick: string | null; line: number | null; modelProbability: string | null; marketImpliedProbability: string | null; confidence: string | null };
type ForecastGame = {
  sport: string | null; matchup: string; away: string | null; home: string | null; awayName: string | null; homeName: string | null;
  date: string | null; startUtc: string | null; experimental: boolean;
  winProbability: ProbRow[] | null;
  projectedScore: { away: string | null; awayScore: number; home: string | null; homeScore: number } | null;
  expectedGoals: number | null; over25: string | null;
  markets: Market[]; paused: Array<{ label: string | null; reason: string | null }>; notes: string[];
  players: Array<{ name: string; team: string | null; label: string; median: number; p10: number | null; p90: number | null }>;
  href: string | null;
};
type ForecastsDisplay = { kind: "forecasts"; dateApplied: string | null; totalMatched: number | null; returned: number; games: ForecastGame[] };
type LiveGame = { away: string | null; home: string | null; awayScore: number | null; homeScore: number | null; period: string | null; state: string | null; stateDetail: string | null };
type LiveDisplay = { kind: "live"; sport: string | null; total: number | null; liveCount: number | null; preCount: number | null; finalCount: number | null; fetchedAt: string | null; games: LiveGame[]; more: number; note: string; href: string | null };
type ResultsDayDisplay = {
  kind: "resultsDay"; date: string; isYesterday: boolean;
  sports: Array<{ sport: string; games: Array<{ title: string | null; final: string | null; calls: Array<{ market: string | null; pick: string | null; grade: string }> }>; more: number; propsGraded: number }>;
  lanes: Array<{ product: string | null; lane: string | null; result: string; legs: Array<{ selection: string | null; matchup: string | null; official: string | null; result: string }> }>;
  sportsWithout: string[]; note: string; href: string | null;
};
type TeamCompareDisplay = { kind: "teamCompare"; sport: string | null; a: string; b: string; rows: Array<{ label: string; a: number | string | null; b: number | string | null; note: string | null }>; note: string; href: string | null };
export type AnswerDisplay = ForecastsDisplay | LiveDisplay | ResultsDayDisplay | TeamCompareDisplay | Record<string, unknown>;

export interface AnswerMessage {
  text: string;
  links?: LinkRef[];
  sources?: string[];
  followUps?: string[];
  verified?: boolean;
  display?: AnswerDisplay | null;
}

const SOURCE_LABEL: Record<string, string> = ASK_SOURCE_LABEL;
const LOGO_SPORTS = new Set(["mlb", "nfl"]);

export function AssistantAnswer({ message, onFollowUp }: { message: AnswerMessage; onFollowUp: (s: string) => void }) {
  const renderer = answerRenderer(message.display);
  const display = renderer === "generic" ? null : message.display;
  const links = remainingLinks(message.links, display);
  const sources = sourceNames(message.sources, SOURCE_LABEL);

  return (
    <>
      {/* A deterministic fallback is still correct — it IS the evidence — but it reads plainer, so say what it is. */}
      {message.verified === false ? <p className="ask-plain-note">Shown exactly as GameTime&apos;s data returned it</p> : null}
      {/* With a card, the writer's bullet lists repeat it — they fold into a closed disclosure, never deleted. */}
      <div className="ask-text ask-answer-lead">{renderMarkdown(readableAnswer(message.text), { collapseLists: renderer !== "generic" })}</div>

      {renderer === "forecasts" ? <ForecastCards d={display as ForecastsDisplay} /> : null}
      {renderer === "live" ? <LiveCard d={display as LiveDisplay} /> : null}
      {renderer === "resultsDay" ? <ResultsDayCards d={display as ResultsDayDisplay} /> : null}
      {renderer === "teamCompare" ? <TeamCompareCard d={display as TeamCompareDisplay} /> : null}

      {links.length ? (
        <ul className="ask-links" aria-label="Open next">
          {links.map((l) => (
            <li key={l.href}><a className="ask-chip" href={l.href}>{l.label}</a></li>
          ))}
        </ul>
      ) : null}

      {message.followUps?.length ? (
        <div className="ask-followups-wrap">
          <p className="ask-followups-label">Ask next</p>
          <ul className="ask-followups">
            {message.followUps.map((f) => (
              <li key={f}><button type="button" className="ask-followup" onClick={() => onFollowUp(f)}>{f}</button></li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Provenance stays one tap away instead of leading the answer (§20 of the Session 3 brief). */}
      {sources.length ? (
        <details className="ask-sources">
          <summary>Sources</summary>
          <p>Answered from GameTimePicks&apos; own data: {sources.join(" · ")}.</p>
        </details>
      ) : null}
    </>
  );
}

/* ─────────────────────────────  forecasts  ───────────────────────────── */

function ForecastCards({ d }: { d: ForecastsDisplay }) {
  const day = dayLabel(d.dateApplied, { short: true });
  const count = d.totalMatched != null && d.totalMatched > d.returned
    ? `${d.returned} of ${plural(d.totalMatched, "published matchup")}`
    : plural(d.returned, "published matchup");
  return (
    <section className="ask-cards" aria-label="GameTime forecasts">
      <h3 className="ask-cards-head">
        <span>GameTime forecasts{day ? ` · ${day}` : ""}</span>
        <span className="ask-cards-count">{count}</span>
      </h3>
      {d.games.map((g, i) => <ForecastCard key={`${g.matchup}-${i}`} g={g} />)}
    </section>
  );
}

function ForecastCard({ g }: { g: ForecastGame }) {
  const sport = String(g.sport ?? "").toLowerCase();
  const logos = LOGO_SPORTS.has(sport);
  const kick = kickoffEt(g.startUtc);
  return (
    <article className="ask-card" aria-label={`${g.matchup} forecast`}>
      <div className="ask-card-top">
        <p className="ask-card-kicker">{[g.sport, kick].filter(Boolean).join(" · ")}</p>
        {g.experimental ? <span className="ask-tag">Experimental</span> : null}
      </div>
      <h4 className="ask-card-title">
        {logos && g.away ? <CdnTeamLogo team={g.away} sport={sport as "mlb" | "nfl"} size="sm" /> : null}
        <span>{g.matchup}</span>
        {logos && g.home ? <CdnTeamLogo team={g.home} sport={sport as "mlb" | "nfl"} size="sm" /> : null}
      </h4>
      {g.awayName && g.homeName ? <p className="ask-card-sub">{g.awayName} at {g.homeName}</p> : null}

      {g.winProbability ? (
        <div className="ask-block">
          <p className="ask-block-label">Win probability</p>
          <p className="ask-block-value">
            {g.winProbability.map((r, i) => (
              <span key={r.label} className="ask-prob">{i ? <span className="ask-dot" aria-hidden="true"> · </span> : null}{r.label} <strong>{r.value}</strong></span>
            ))}
          </p>
          <div className="ask-split" aria-hidden="true">
            {g.winProbability.map((r, i) => <span key={r.label} className={`ask-split-seg ask-split-seg-${i}`} style={{ width: `${Math.max(0, r.share) * 100}%` }} />)}
          </div>
          {g.markets.length === 0 ? <p className="ask-block-note">A model probability, not a pick — GameTime has not published a separate pick for this game.</p> : null}
        </div>
      ) : null}

      {g.projectedScore ? (
        <div className="ask-block">
          <p className="ask-block-label">Projected score</p>
          <p className="ask-block-value">{g.projectedScore.away} {g.projectedScore.awayScore}, {g.projectedScore.home} {g.projectedScore.homeScore}</p>
        </div>
      ) : null}
      {g.expectedGoals != null ? (
        <div className="ask-block">
          <p className="ask-block-label">Expected goals</p>
          <p className="ask-block-value">{g.expectedGoals}{g.over25 ? <span className="ask-muted"> · over 2.5 goals {g.over25}</span> : null}</p>
        </div>
      ) : null}

      {g.markets.length || g.paused.length ? (
        <ul className="ask-markets">
          {g.markets.map((m, i) => (
            <li key={`m${i}`} className="ask-market">
              <div className="ask-market-head">
                <span className="ask-market-label">{m.label}</span>
                {m.confidence ? <span className="ask-tag ask-tag-soft">{enumLabel(m.confidence)}</span> : null}
              </div>
              <p className="ask-market-pick">
                {m.pick ? <>GameTime pick <strong>{m.pick}</strong>{m.line != null ? <span className="ask-muted"> · line {m.line}</span> : null}</> : "No pick stated"}
              </p>
              {m.modelProbability || m.marketImpliedProbability ? (
                <p className="ask-market-nums">
                  {m.modelProbability ? <span>Model {m.modelProbability}</span> : null}
                  {m.modelProbability && m.marketImpliedProbability ? <span aria-hidden="true"> · </span> : null}
                  {m.marketImpliedProbability ? <span>Market implied {m.marketImpliedProbability}</span> : null}
                </p>
              ) : null}
            </li>
          ))}
          {g.paused.map((p, i) => (
            <li key={`p${i}`} className="ask-market ask-market-paused">
              <div className="ask-market-head">
                <span className="ask-market-label">{p.label}</span>
                <span className="ask-tag ask-tag-paused">Model paused</span>
              </div>
              <p className="ask-market-pick">No published pick</p>
              {p.reason ? <p className="ask-market-reason">{p.reason}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {g.players.length ? (
        <details className="ask-more">
          <summary>Player projections ({g.players.length})</summary>
          <ul className="ask-more-list">
            {g.players.map((p, i) => (
              <li key={i}>
                <strong>{p.name}</strong>{p.team ? ` (${p.team})` : ""} · {p.label}: simulated median {p.median}
                {p.p10 != null && p.p90 != null ? <span className="ask-muted">, 10th–90th percentile {p.p10} to {p.p90}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {g.notes.length ? (
        <details className="ask-more">
          <summary>Model notes</summary>
          <ul className="ask-more-list">{g.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </details>
      ) : null}

      {g.href ? <CardAction href={g.href} label={`Open the ${g.matchup} game report`}>Game report</CardAction> : null}
    </article>
  );
}

/* ─────────────────────────────  live  ───────────────────────────── */

function LiveCard({ d }: { d: LiveDisplay }) {
  const sport = String(d.sport ?? "").toLowerCase();
  const logos = LOGO_SPORTS.has(sport);
  const counts = [
    d.liveCount != null ? `${d.liveCount} in progress` : null,
    d.finalCount != null ? `${d.finalCount} final` : null,
    d.preCount != null ? `${d.preCount} not started` : null,
  ].filter(Boolean).join(" · ");
  return (
    <section className="ask-cards" aria-label="Live games">
      <h3 className="ask-cards-head">
        <span>{d.sport ? `${d.sport} live` : "Live"}</span>
        <span className="ask-cards-count">{[counts, asOfEt(d.fetchedAt)].filter(Boolean).join(" · ")}</span>
      </h3>
      <div className="ask-card">
        {d.games.length ? (
          <ul className="ask-scoreboard">
            {d.games.map((g, i) => (
              <li key={i} className="ask-score">
                <div className="ask-score-teams">
                  <ScoreLine team={g.away} score={g.awayScore} sport={logos ? sport : null} />
                  <ScoreLine team={g.home} score={g.homeScore} sport={logos ? sport : null} />
                </div>
                <span className={`ask-state ask-state-${String(g.state ?? "").toLowerCase()}`}>
                  {liveStateLabel(g.state, g.stateDetail)}{g.period ? ` · ${g.period}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="ask-block-note">No games are on the live feed.</p>}
        {d.more ? <p className="ask-block-note">{plural(d.more, "more game")} on GameTime Live.</p> : null}
        <p className="ask-card-note">{d.note}</p>
        {d.href ? <CardAction href={d.href} label="Open GameTime Live">GameTime Live</CardAction> : null}
      </div>
    </section>
  );
}

function ScoreLine({ team, score, sport }: { team: string | null; score: number | null; sport: string | null }) {
  return (
    <span className="ask-score-line">
      <span className="ask-score-team">
        {sport && team ? <CdnTeamLogo team={team} sport={sport as "mlb" | "nfl"} size="sm" /> : null}
        {team ?? "Team not reported"}
      </span>
      {/* No score is not a zero: a game that has not started shows none. */}
      <span className="ask-score-num">{score ?? ""}</span>
    </span>
  );
}

/* ─────────────────────────────  results day  ───────────────────────────── */

function ResultsDayCards({ d }: { d: ResultsDayDisplay }) {
  return (
    <section className="ask-cards" aria-label="Results">
      <h3 className="ask-cards-head"><span>{resultsHeading(d)}</span></h3>
      <p className="ask-card-note ask-card-note-top">{d.note}</p>
      {d.sports.map((s) => (
        <div key={s.sport} className="ask-card">
          <p className="ask-card-kicker">{s.sport} · {plural(s.games.length + s.more, "graded game")}</p>
          {s.games.map((g, i) => (
            <div key={i} className="ask-result-game">
              <div className="ask-result-head">
                <span className="ask-result-title">{g.title}</span>
                <span className="ask-muted">{g.final ? `Final ${g.final}` : "No final recorded"}</span>
              </div>
              <ul className="ask-calls">
                {g.calls.map((c, j) => (
                  <li key={j} className="ask-call">
                    <span className="ask-call-market">{c.market}</span>
                    <span className="ask-call-pick">{c.pick}</span>
                    <Badge {...gradeBadge(c.grade)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {s.more ? <p className="ask-block-note">{plural(s.more, "more game")} on the Results day page.</p> : null}
          {s.propsGraded ? <p className="ask-card-note">{s.propsGraded} {s.sport} player-prop leans were also graded. They are market-context and listed on the Results day page.</p> : null}
        </div>
      ))}
      {d.lanes.length ? (
        <div className="ask-card">
          <p className="ask-card-kicker">Bank Builder &amp; Moonshot</p>
          <ul className="ask-lanes">
            {d.lanes.map((l, i) => (
              <li key={i} className="ask-lane">
                <div className="ask-lane-head">
                  <span className="ask-result-title">{l.product}{l.lane ? ` · lane ${l.lane}` : ""}</span>
                  <Badge {...laneBadge(l.result)} />
                </div>
                {l.legs.length ? (
                  <ul className="ask-calls">
                    {l.legs.map((g, j) => (
                      <li key={j} className="ask-call">
                        <span className="ask-call-pick">{g.selection ?? "A selection"}{g.matchup ? <span className="ask-muted"> · {g.matchup}</span> : null}{g.official ? <span className="ask-muted"> · official {g.official}</span> : null}</span>
                        <Badge {...laneBadge(g.result)} />
                      </li>
                    ))}
                  </ul>
                ) : <p className="ask-block-note">No legs on its receipt.</p>}
              </li>
            ))}
          </ul>
          {d.lanes.some((l) => l.result === "pending" || l.result === "active") ? <p className="ask-card-note">Pending means not settled yet. It is never a loss.</p> : null}
        </div>
      ) : <p className="ask-block-note">No Bank Builder or Moonshot card was recorded for this day.</p>}
      {d.sportsWithout.length ? <p className="ask-card-note">Nothing was graded for {d.sportsWithout.join(", ")}.</p> : null}
      {d.href ? <CardAction href={d.href} label={`Open the Results day page for ${d.date}`}>Full results day</CardAction> : null}
    </section>
  );
}

/* ─────────────────────────────  team comparison  ───────────────────────────── */

function TeamCompareCard({ d }: { d: TeamCompareDisplay }) {
  return (
    <section className="ask-cards" aria-label="Team comparison">
      <div className="ask-card">
        <table className="ask-compare">
          <caption className="ask-sr">{d.a} compared with {d.b}, recorded results</caption>
          <thead>
            <tr><th scope="col"><span className="ask-sr">Measure</span></th><th scope="col">{d.a}</th><th scope="col">{d.b}</th></tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}{r.note ? <span className="ask-compare-note">{r.note}</span> : null}</th>
                <td>{r.a ?? <span className="ask-muted">Not recorded</span>}</td>
                <td>{r.b ?? <span className="ask-muted">Not recorded</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ask-card-note">{d.note}</p>
        {d.href ? <CardAction href={d.href} label={`Open the full comparison of ${d.a} and ${d.b}`}>Full comparison</CardAction> : null}
      </div>
    </section>
  );
}

/* ─────────────────────────────  pieces  ───────────────────────────── */

/* A grade is a WORD first — the colour only repeats it, so it reads without colour (WCAG 1.4.1). */
function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`ask-badge ask-badge-${tone}`}>{label}</span>;
}

function CardAction({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a className="ask-card-action" href={href} aria-label={label}>
      {children}<span aria-hidden="true">→</span>
    </a>
  );
}

/**
 * A DELIBERATELY SMALL MARKDOWN RENDERER.
 *
 * Paragraphs, list items, `**bold**` and `` `code` ``. That is the whole grammar. There is no link
 * syntax here on purpose: an answer's links arrive as a separate approved list and are rendered as
 * chips, so there is no code path by which text the model wrote becomes an anchor (§98, §99).
 */
export function renderMarkdown(text: string, { collapseLists = false }: { collapseLists?: boolean } = {}) {
  /*
   * A block may mix a lead line with list items ("The model has:\n- PIT 54.4%\n- CLE 42.6%"). The old renderer made a
   * block a list only when EVERY line was an item, so that shape collapsed into one run-on paragraph. Runs of item
   * lines now become a list and the other lines stay paragraphs, in order.
   */
  const out: JSX.Element[] = [];
  /* Session 3 · with a typed card, list blocks are collected here and shown in one closed <details> after the prose. */
  const folded: JSX.Element[] = [];
  let foldedItems = 0;
  String(text ?? "").split(/\n{2,}/).forEach((block, bi) => {
    let para: string[] = [];
    let items: string[] = [];
    const flush = (k: string) => {
      if (para.length) out.push(<p key={`${k}p`} className="ask-md-p">{inline(para.join(" "))}</p>);
      if (items.length) {
        const list = <ul key={`${k}u`} className="ask-md-list">{items.map((l, li) => <li key={li}>{inline(l)}</li>)}</ul>;
        if (collapseLists) { folded.push(list); foldedItems += items.length; } else out.push(list);
      }
      para = []; items = [];
    };
    block.split("\n").forEach((line, li) => {
      const item = listItemOf(line);
      if (item !== null) {
        if (para.length) flush(`${bi}-${li}`);
        items.push(item);
      } else if (line.trim()) {
        if (items.length) flush(`${bi}-${li}`);
        para.push(line.trim());
      }
    });
    flush(`${bi}-end`);
  });
  if (folded.length) {
    out.push(
      <details key="folded" className="ask-more ask-folded">
        <summary>Written breakdown ({foldedItems})</summary>
        {folded}
      </details>,
    );
  }
  return out;
}

function inline(s: string) {
  const parts: Array<string | JSX.Element> = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) parts.push(<strong key={`${m.index}b`}>{token.slice(2, -2)}</strong>);
    else parts.push(<code key={`${m.index}c`} className="ask-md-code">{token.slice(1, -1)}</code>);
    last = m.index + token.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}
