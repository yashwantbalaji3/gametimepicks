/* ONE CHALLENGE LANE (BBM V2, SPEC §4–5): the same facts as the lane's X graphic, from the engine's public projection.
   STEP k OF N, the ladder meter (completed / active / failed / upcoming rungs), the starting, tracked and target
   bankrolls kept visually distinct, the money block (payout and profit never print a number until founder decision
   P1), the day's frozen legs with MODEL PROJECTION and results, the day-by-day history, and the graphic history.
   Renders only what the accepted file says. */
export type LaneLeg = {
  legId: string; gameId: string; game: string; selection: string; teamAbbr: string | null;
  projectionLabel: string; projection: string | null; flags: string[]; outcome: string | null;
};
export type LaneDay = {
  date: string; step: number; status: string | null; statusText: string; reason: string | null; staked: boolean;
  card: { legs: LaneLeg[] } | null; modelCardResult: string | null; stepOutcome: string | null;
};
export type LaneView = {
  laneId: string; product: string; letter: string; name: string; runId: string | null; runNumber: number; startedAt: string | null;
  step: number | null; steps: number; status: string; statusLabel: string; statusGlyph: string; note: string | null;
  base: string | null; target: string | null; tracked: string | null; wager: string | null;
  potentialPayout: string; potentialProfit: string; label: string;
  rungs: Array<{ step: number; state: string }>;
  today: LaneDay | null;
  history: LaneDay[];
  graphics: Array<{ date: string; step: number; packageId: string | null; imageSha256: string | null; imagePath: string | null; approved: boolean; postUrl: string | null; postedAt: string | null }>;
  earlierRuns: Array<{ runId: string; startedAt: string | null; status: string }>;
};

const RUNG_TEXT: Record<string, string> = { completed: "won", active: "current", failed: "lost", upcoming: "to come" };
const OUTCOME_TEXT: Record<string, string> = { WIN: "Won", LOSS: "Lost", VOID: "Void", PUSH: "Push" };

function Legs({ legs }: { legs: LaneLeg[] }) {
  return (
    <ol className="cl-legs">
      {legs.map((l) => (
        <li key={l.legId} className="cl-leg" data-lane-leg={l.gameId} data-leg-outcome={l.outcome ?? "open"}>
          <div className="cl-leg-main">
            <span className="cl-leg-pick">{l.selection}</span>
            <span className="cl-leg-game">{l.game}</span>
          </div>
          <div className="cl-leg-side">
            <span className="cl-leg-proj"><span className="cl-label">{l.projectionLabel}</span> {l.projection ?? "—"}</span>
            <span className={`cl-outcome cl-outcome--${(l.outcome ?? "open").toLowerCase()}`}>{l.outcome ? OUTCOME_TEXT[l.outcome] ?? l.outcome : "Not settled"}</span>
          </div>
          {l.flags.length ? <p className="cl-leg-flag"><span aria-hidden>⚑</span> {l.flags.join(" ")}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/* What the day did to the lane, in one sentence. A card that was never staked cannot move the lane, win or lose. */
function dayResult(d: LaneDay): string | null {
  if (d.stepOutcome) return d.stepOutcome === "WIN" ? `Step ${d.step} won.` : d.stepOutcome === "LOSS" ? `Step ${d.step} lost.` : `Step ${d.step}: ${d.stepOutcome}.`;
  if (d.card && !d.staked && d.modelCardResult && d.modelCardResult !== "PENDING") {
    return `The model card ${d.modelCardResult === "WIN" ? "won" : "lost"}, but it was not staked, so the lane did not move.`;
  }
  return null;
}

function Day({ d, current, laneNote }: { d: LaneDay; current?: boolean; laneNote?: string | null }) {
  const result = dayResult(d);
  const body = (
    <>
      {d.reason && d.reason !== laneNote ? <p className="cl-day-reason">{d.reason}</p> : null}
      {d.card ? <Legs legs={d.card.legs} /> : null}
      {result ? <p className="cl-day-result" data-day-result="">{result}</p> : null}
    </>
  );
  if (current) {
    return (
      <section className="cl-block" aria-label={`Latest day, ${d.date}`} data-lane-day={d.date}>
        <h4 className="cl-block-title">{d.date} · step {d.step} · {d.statusText}</h4>
        {body}
      </section>
    );
  }
  return (
    <details className="cl-settled" data-lane-day={d.date}>
      <summary className="cl-settled-summary"><span>{d.date} · step {d.step} · <strong>{d.statusText}</strong></span></summary>
      <div className="cl-day-body">{body}</div>
    </details>
  );
}

export default function LaneCard({ lane }: { lane: LaneView }) {
  const moon = lane.product === "moonshot";
  const headingId = `lane-${lane.laneId}-h`;
  return (
    <article className={`cl-lane ${moon ? "cl-lane--moonshot" : "cl-lane--bank"}`} aria-labelledby={headingId} data-lane={lane.laneId} data-lane-status={lane.status}>
      <header className="cl-lane-head">
        <h3 id={headingId} className="cl-lane-name">{lane.name}{lane.runId ? <span className="cl-lane-run"> · {lane.runId}</span> : null}</h3>
        <span className={`cl-status cl-status--${lane.status}`} data-lane-status-badge="">
          <span aria-hidden>{lane.statusGlyph}</span> {lane.statusLabel}
        </span>
      </header>

      <p className="cl-step" data-lane-step="">
        {lane.step ? <>STEP {lane.step} <span className="cl-step-of">OF {lane.steps}</span></> : <>{lane.steps} STEPS</>}
      </p>
      {lane.note ? <p className="cl-note">{lane.note}</p> : null}

      <div className="cl-meter" role="img" aria-label={`Ladder: ${lane.rungs.map((r) => `step ${r.step} ${RUNG_TEXT[r.state]}`).join(", ")}`} data-lane-meter="">
        <span className="cl-meter-end cl-meter-end--base"><span className="cl-label">Start</span> {lane.base}</span>
        <ol className="cl-rungs" aria-hidden>
          {lane.rungs.map((r) => (
            <li key={r.step} className={`cl-rung cl-rung--${r.state}`} data-rung-state={r.state}>
              <span className="cl-rung-num">{r.state === "failed" ? "✕" : r.state === "completed" ? "✓" : r.step}</span>
            </li>
          ))}
        </ol>
        <span className="cl-meter-end cl-meter-end--target"><span className="cl-label">Goal</span> {lane.target}</span>
      </div>

      <dl className="cl-money" data-lane-money="">
        <div className="cl-money-cell cl-money--tracked"><dt>Tracked bankroll</dt><dd>{lane.tracked ?? "—"}</dd></div>
        <div className="cl-money-cell"><dt>Wager</dt><dd>{lane.wager ?? "—"}</dd></div>
        <div className="cl-money-cell cl-money--pending"><dt>Potential payout</dt><dd data-lane-unpriced="">{lane.potentialPayout}</dd></div>
        <div className="cl-money-cell cl-money--pending"><dt>Potential profit</dt><dd data-lane-unpriced="">{lane.potentialProfit}</dd></div>
        <div className="cl-money-cell cl-money--goal"><dt>Ladder progress</dt><dd>{lane.step ? `Step ${lane.step} of ${lane.steps} · goal ${lane.target}` : `Goal ${lane.target}`}</dd></div>
      </dl>

      {lane.today ? <Day d={lane.today} current laneNote={lane.note} /> : null}

      {lane.history.length ? (
        <section className="cl-block" aria-label={`${lane.name} history`}>
          <h4 className="cl-block-title">Earlier days</h4>
          {lane.history.map((d) => <Day key={`${d.date}:${d.step}`} d={d} />)}
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

      {lane.earlierRuns.length ? (
        <p className="cl-runs">Earlier runs: {lane.earlierRuns.map((r) => r.runId).join(", ")}. A lane is never reset quietly; each restart was founder-approved.</p>
      ) : null}
      <p className="cl-fact">{lane.label}</p>
    </article>
  );
}
