/* ONE CHALLENGE LANE (BBM V2, SPEC §4–5): the same facts as the lane's X graphic. STEP k OF N, the ladder meter
   (completed / active / failed / upcoming rungs), the starting, tracked and target bankrolls kept visually distinct, the
   money block (payout and profit never print a number until founder decision P1), the frozen legs with MODEL
   PROJECTION and settlement, the settled steps, and the graphic history. Renders only what the verified file says. */
export type LaneLeg = {
  gameId: string; game: string; selection: string; teamAbbr: string | null; market: string | null;
  projectionLabel: string; projection: string | null; flags: string[]; snapshotId: string | null;
  outcome: string | null; settlementSource: string | null;
};
export type LaneView = {
  laneId: string; product: string; letter: string; name: string; runId: string | null; runNumber: number; startedAt: string | null;
  step: number | null; steps: number; status: string; statusLabel: string; statusGlyph: string; note: string | null;
  base: string | null; target: string | null; tracked: string | null; wager: string | null;
  potentialPayout: string; potentialProfit: string; amountsAre: string;
  rungs: Array<{ step: number; state: string }>;
  card: { date: string; step: number; legs: LaneLeg[]; suggestedCardsSha: string | null } | null;
  settledSteps: Array<{ date: string; step: number; outcome: string; legs: LaneLeg[] }>;
  graphics: Array<{ date: string; step: number; packageId: string | null; imageSha: string | null; imagePath: string | null; alt: string | null; postUrl: string | null; postedAt: string | null }>;
  earlierRuns: Array<{ runId: string; startedAt: string | null; events: number }>;
};

const RUNG_TEXT: Record<string, string> = { completed: "won", active: "in play", failed: "lost", upcoming: "to come" };
const OUTCOME_TEXT: Record<string, string> = { WIN: "Won", LOSS: "Lost", VOID: "Void", PUSH: "Push" };

function Legs({ legs }: { legs: LaneLeg[] }) {
  return (
    <ol className="cl-legs">
      {legs.map((l) => (
        <li key={l.gameId} className="cl-leg" data-lane-leg={l.gameId} data-leg-outcome={l.outcome ?? "open"}>
          <div className="cl-leg-main">
            <span className="cl-leg-pick">{l.selection}</span>
            <span className="cl-leg-game">{l.game}</span>
          </div>
          <div className="cl-leg-side">
            <span className="cl-leg-proj"><span className="cl-label">{l.projectionLabel}</span> {l.projection ?? "—"}</span>
            <span className={`cl-outcome cl-outcome--${(l.outcome ?? "open").toLowerCase()}`}>{l.outcome ? OUTCOME_TEXT[l.outcome] ?? l.outcome : "Not settled"}</span>
          </div>
          {l.flags.length ? <p className="cl-leg-flag"><span aria-hidden>⚑</span> {l.flags.join(" ")}</p> : null}
          {l.outcome && l.settlementSource ? <p className="cl-leg-src">Settled from {l.settlementSource}</p> : null}
        </li>
      ))}
    </ol>
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

      {lane.card ? (
        <section className="cl-block" aria-label={`${lane.name} card`}>
          <h4 className="cl-block-title">Step {lane.card.step} card · frozen {lane.card.date}</h4>
          <Legs legs={lane.card.legs} />
        </section>
      ) : null}

      {lane.settledSteps.length ? (
        <section className="cl-block" aria-label={`${lane.name} settlements`}>
          <h4 className="cl-block-title">Settled steps</h4>
          {lane.settledSteps.map((s) => (
            <details key={`${s.date}:${s.step}`} className="cl-settled" data-settled-step={s.step}>
              <summary className="cl-settled-summary"><span>Step {s.step} · {s.date} · <strong>{OUTCOME_TEXT[s.outcome] ?? s.outcome}</strong></span></summary>
              <Legs legs={s.legs} />
            </details>
          ))}
        </section>
      ) : null}

      {lane.graphics.length ? (
        <section className="cl-block" aria-label={`${lane.name} graphic history`}>
          <h4 className="cl-block-title">Graphic history</h4>
          <ol className="cl-graphics">
            {[...lane.graphics].reverse().map((g, i) => (
              <li key={`${g.date}:${g.packageId}:${i}`} className="cl-graphic" data-lane-graphic={g.packageId ?? ""}>
                {g.imagePath ? <img src={g.imagePath} alt={g.alt ?? `${lane.name}, ${g.date}`} width={1080} height={1350} loading="lazy" className="cl-graphic-img" /> : null}
                <span className="cl-graphic-text">
                  <strong>{g.date}</strong> · step {g.step}{g.alt ? ` · ${g.alt}` : ""}
                  {g.postUrl ? <> · <a href={g.postUrl} rel="noopener" target="_blank">Post on X</a></> : <> · not posted</>}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {lane.earlierRuns.length ? (
        <p className="cl-runs">Earlier runs: {lane.earlierRuns.map((r) => r.runId).join(", ")}. Runs are never reset quietly; each restart was founder-approved.</p>
      ) : null}
      <p className="cl-fact">{lane.amountsAre === "documented" ? "Tracked challenge · wager documented" : "Tracked challenge · no real wager placed"}</p>
    </article>
  );
}
