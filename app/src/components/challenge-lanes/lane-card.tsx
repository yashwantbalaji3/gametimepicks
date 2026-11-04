/* ONE CHALLENGE LANE (BBM V2, SPEC rev 2 §5–6): the website twin of the lane's X graphic, presenting the engine's
   laneDisplay (the same fold the graphics use). Same visual language: product + lane chip, STEP k OF N hero, the lit ladder (completed / active / failed /
   upcoming, milestones under each rung), start / tracked / goal boxes, pace and distance to target, leg cards with team
   marks and MODEL WIN PROBABILITY, the money row (payout never a number before the price-source decision), then the
   lane's whole story, its runs and its graphics. The ladder lights up once on load; prefers-reduced-motion stills it. */
import type { CSSProperties } from "react";

export type LaneLeg = {
  n: number; legId: string; gameId: string; game: string; market: string | null; prop: boolean;
  selection: string; teamAbbr: string | null; team: { name: string | null; color: string; ink: string | null } | null;
  matchup: string | null; time: string | null; projectionLabel: string; projection: string | null; flags: string[]; outcome: string | null;
  price: { odds: string | null; line: number | string | null; book: string | null; captured: string | null } | null;
  snapshotId?: string | null;
};
export type LanePrice = { method: string; estimate: boolean; combinedLabel: string; combined: string; decimal?: number | null; book: string | null; stake: string | null; payout: string | null; profit: string | null; captured: string | null; requiredMultiple?: number | null; belowPace?: boolean | null; verification?: string | null; verificationNote?: string | null; snapshotSha256?: string | null };
export type LaneDay = {
  date: string; step: number; internalStatus: string | null; statusText: string; tone: string; reason: string | null; staked: boolean;
  legs: LaneLeg[]; hasCard: boolean; modelCardResult: string | null; stepOutcome: string | null; result: string | null; price: LanePrice | null;
};
export type LaneView = {
  laneId: string; product: string; letter: string; name: string; runId: string | null; runNumber: number; startedAt: string | null;
  step: number | null; steps: number; stepText: string | null; maxLegs: number | null; cleared: number; status: string; statusLabel: string; statusGlyph: string; tone: string;
  internalStatus: string | null; note: string | null;
  base: string | null; target: string | null; tracked: string | null; toTarget: string | null; wager: string | null; wagerNote: string | null;
  potentialPayout: string; potentialProfit: string; pace: { state: string; text: string } | null; label: string; sourceSha256: string | null; verification?: string | null; verificationNote?: string | null;
  rungs: Array<{ step: number; state: string; milestone: string | null }>;
  current: LaneDay | null;
  story: LaneDay[];
  graphics: Array<{ date: string; step: number; packageId: string | null; imageSha256: string | null; imagePath: string | null; approved: boolean; postUrl: string | null; postedAt: string | null }>;
  runs: Array<{ runId: string; number: number; started: string | null; status: string; stepsWon: number; current: boolean }>;
};

const RUNG_TEXT: Record<string, string> = { completed: "won", active: "current", failed: "lost", upcoming: "to come" };
const OUTCOME_TEXT: Record<string, string> = { WIN: "Won", LOSS: "Lost", VOID: "Void", PUSH: "Push" };

function LegCard({ l }: { l: LaneLeg }) {
  const style = l.team ? ({ "--cl-team": l.team.color, "--cl-team-ink": l.team.ink ?? "var(--vault-text)" } as CSSProperties) : undefined;
  return (
    <li className={`cl-leg${l.team ? " cl-leg--team" : ""}`} style={style} data-lane-leg={l.gameId} data-leg-outcome={l.outcome ?? "open"}>
      <span className="cl-leg-n" aria-hidden>{l.n}</span>
      <div className="cl-leg-main">
        <span className="cl-leg-name">{l.team?.name ?? l.selection}</span>
        <span className="cl-leg-meta">
          {l.teamAbbr ? <span className="cl-team-chip">{l.teamAbbr}</span> : null}
          <span>{[l.matchup, l.time].filter(Boolean).join(" · ")}</span>
        </span>
        {l.price ? (
          <span className="cl-leg-odds" data-leg-odds="">
            <span className="cl-odds-chip">{l.price.odds}</span>
            {l.price.line != null ? <span>line {l.price.line}</span> : null}
            {l.price.book ? <span>{l.price.book}</span> : null}
          </span>
        ) : null}
        {l.flags.length ? <span className="cl-leg-flag"><span className="cl-flag-chip">Flag</span> {l.flags.join(" ")}</span> : null}
      </div>
      <div className="cl-leg-side">
        <span className="cl-label cl-label--accent">{l.projectionLabel}</span>
        <span className="cl-leg-pct">{l.projection ?? "—"}</span>
        <span className={`cl-outcome cl-outcome--${(l.outcome ?? "open").toLowerCase()}`}>{l.outcome ? OUTCOME_TEXT[l.outcome] ?? l.outcome : l.prop ? "" : "to win"}</span>
      </div>
    </li>
  );
}

function StoryDay({ d, laneNote, isCurrent }: { d: LaneDay; laneNote: string | null; isCurrent: boolean }) {
  return (
    <li className={`cl-story-day cl-story-day--${d.tone}`} data-lane-day={d.date}>
      <span className="cl-story-dot" aria-hidden />
      <details className="cl-story-fold" open={d.stepOutcome != null || undefined}>
        <summary className="cl-story-summary">
          <span><strong>{d.date}</strong> · step {d.step} · {d.statusText}</span>
        </summary>
        <div className="cl-story-body">
          {d.reason && d.reason !== laneNote ? <p className="cl-day-reason">{d.reason}</p> : null}
          {d.legs.length && isCurrent ? <p className="cl-day-reason">The selections above.</p> : d.legs.length ? <ol className="cl-legs cl-legs--compact">{d.legs.map((l) => <LegCard key={l.legId} l={l} />)}</ol> : null}
          {d.result ? <p className="cl-day-result" data-day-result="">{d.result}</p> : null}
        </div>
      </details>
    </li>
  );
}

export default function LaneCard({ lane }: { lane: LaneView }) {
  const moon = lane.product === "moonshot";
  const headingId = `lane-${lane.laneId}-h`;
  const legs = lane.current?.legs ?? [];
  return (
    <article className={`cl-lane ${moon ? "cl-lane--moonshot" : "cl-lane--bank"} cl-lane--${lane.tone}`} aria-labelledby={headingId} data-lane={lane.laneId} data-lane-status={lane.status}>
      <header className="cl-lane-head">
        <h3 id={headingId} className="cl-lane-title">
          <span className="cl-product">{moon ? "Moonshot" : "Bank Builder"}</span>
          <span className="cl-lane-chip">{lane.name}</span>
          {lane.runId ? <span className="cl-lane-run">{lane.runId}</span> : null}
        </h3>
        <span className="cl-badges">
          <span className={`cl-status cl-status--${lane.tone}`} data-lane-status-badge="">
            <span aria-hidden>{lane.statusGlyph}</span> {lane.statusLabel}
          </span>
          {lane.verification ? (
            <span className="cl-status cl-status--prelim" data-lane-verification={lane.verification}>
              <span aria-hidden>◷</span> {lane.verification}
            </span>
          ) : null}
        </span>
      </header>

      <p className="cl-step" data-lane-step="">
        {lane.step ? <>STEP <span className="cl-step-k">{lane.step}</span> OF {lane.steps}</> : <>{lane.steps} STEPS</>}
      </p>
      <p className="cl-sub">{legs.length ? `${legs.length} legs · ` : ""}{lane.cleared} of {lane.steps} steps cleared</p>
      {lane.note ? <p className="cl-note">{lane.note}</p> : null}

      <div className="cl-ladder" role="img" aria-label={`Ladder: ${lane.rungs.map((r) => `step ${r.step} ${RUNG_TEXT[r.state]}${r.milestone ? `, milestone ${r.milestone}` : ""}`).join("; ")}`} data-lane-meter="">
        <ol className="cl-rungs" aria-hidden>
          {lane.rungs.map((r, i) => (
            <li key={r.step} className={`cl-rung cl-rung--${r.state}`} data-rung-state={r.state} style={{ "--i": i } as CSSProperties}>
              <span className="cl-rung-dot">{r.state === "failed" ? "✕" : r.state === "completed" ? "✓" : r.step}</span>
              <span className="cl-rung-label">Step {r.step}</span>
              {r.milestone ? <span className="cl-rung-milestone">{r.milestone}</span> : null}
            </li>
          ))}
        </ol>
      </div>

      <dl className="cl-bank" data-lane-bank="">
        <div className="cl-bank-box cl-bank--start"><dt>Start</dt><dd>{lane.base}</dd></div>
        <div className="cl-bank-box cl-bank--tracked"><dt>Tracked bankroll · settled</dt><dd className={lane.tracked && !lane.tracked.startsWith("$") ? "cl-bank-pending" : undefined}>{lane.tracked ?? "—"}</dd></div>
        <div className="cl-bank-box cl-bank--goal"><dt>Goal · hypothetical</dt><dd>{lane.target}</dd></div>
      </dl>
      {lane.pace || lane.toTarget ? (
        <p className={`cl-pace cl-pace--${lane.pace?.state ?? "none"}`} data-lane-pace="">
          {[lane.pace?.text, lane.toTarget ? `${lane.toTarget} to the goal` : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {legs.length ? (
        <section className="cl-block" aria-label={`${lane.name} step ${lane.current?.step} selections`}>
          <h4 className="cl-block-title">Step {lane.current?.step} selections · frozen {lane.current?.date}</h4>
          <ol className="cl-legs">{legs.map((l) => <LegCard key={l.legId} l={l} />)}</ol>
          {lane.current?.price ? (
            <p className={`cl-combined${lane.current.price.estimate ? " cl-combined--estimate" : ""}`} data-lane-combined={lane.current.price.method}>
              <span className="cl-label cl-label--accent">{lane.current.price.combinedLabel}</span>
              <strong>{lane.current.price.combined}</strong>
              <span className="cl-combined-src">{[lane.current.price.book, lane.current.price.captured ? `captured ${lane.current.price.captured}` : null, lane.verificationNote].filter(Boolean).join(" · ")}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      <dl className="cl-money" data-lane-money="">
        <div className="cl-money-cell"><dt>Wager</dt><dd>{lane.wager ?? "—"}{lane.wager && lane.wagerNote ? <span className="cl-money-sub">{lane.wagerNote}</span> : null}</dd></div>
        {lane.current?.price?.payout ? (
          <div className="cl-money-cell cl-money--priced" data-lane-priced=""><dt>Potential payout · profit</dt><dd>{lane.potentialPayout}<span className="cl-money-sub">profit {lane.potentialProfit}</span></dd></div>
        ) : (
          <div className="cl-money-cell cl-money--pending"><dt>Potential payout · profit</dt><dd data-lane-unpriced="">{lane.potentialPayout}</dd></div>
        )}
        <div className="cl-money-cell"><dt>Ladder progress</dt><dd>{lane.cleared} of {lane.steps}<span className="cl-money-sub">steps cleared</span></dd></div>
      </dl>
      {lane.current?.price ? (
        <p className="cl-rg" data-lane-rg="">21+ · <a href="/responsible-use/">Gamble responsibly</a></p>
      ) : null}

      {lane.story.length ? (
        <section className="cl-block" aria-label={`${lane.name} story`}>
          <h4 className="cl-block-title">The story so far{lane.startedAt ? ` · started ${lane.startedAt} at ${lane.base}` : ""}</h4>
          <ol className="cl-story">{lane.story.map((d) => <StoryDay key={`${d.date}:${d.step}`} d={d} laneNote={lane.note} isCurrent={lane.current?.date === d.date} />)}</ol>
        </section>
      ) : null}

      {lane.runs.length > 1 ? (
        <section className="cl-block" aria-label={`${lane.name} runs`}>
          <h4 className="cl-block-title">Runs</h4>
          <ol className="cl-runs">
            {lane.runs.map((r) => <li key={r.runId}><strong>{r.runId}</strong> · started {r.started ?? "—"} · {r.stepsWon} won · {r.current ? "current" : r.status}</li>)}
          </ol>
          <p className="cl-day-reason">A lane is never reset quietly: every new run followed a founder-approved restart.</p>
        </section>
      ) : null}

      <section className="cl-block" aria-label={`${lane.name} graphic history`} data-lane-graphics="">
        <h4 className="cl-block-title">Graphic history</h4>
        {lane.graphics.length ? (
          <ol className="cl-graphics">
            {[...lane.graphics].reverse().map((g, i) => (
              <li key={`${g.date}:${g.packageId}:${i}`} className="cl-graphic" data-lane-graphic={g.packageId ?? ""}>
                {g.imagePath ? <img src={g.imagePath} alt={`${lane.name}, ${g.date}, step ${g.step}`} width={1080} height={1350} loading="lazy" className="cl-graphic-img" /> : null}
                <span className="cl-graphic-text">
                  <strong>{g.date}</strong> · step {g.step}{g.packageId ? ` · ${g.packageId}` : ""}
                  {g.postUrl ? <> · <a href={g.postUrl} rel="noopener" target="_blank">Post on X</a></> : g.approved ? " · approved, not posted" : " · not posted"}
                </span>
              </li>
            ))}
          </ol>
        ) : <p className="cl-day-reason">No graphic has been posted for this run yet.</p>}
      </section>

      <p className="cl-fact">{lane.label}</p>
    </article>
  );
}
