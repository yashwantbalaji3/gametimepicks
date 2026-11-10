/* Bank Builder / Moonshot lane status (site slice): the canonical projection's own state, server-rendered. No price. */
type View = {
  laneId: string; slot: string; laneTypeLabel: string | null; runId: string; ruleVersion: string | null; status: string | null; statusText: string | null; rulesText: string | null; statusReason: string | null;
  stepText: string | null; steps: number; stepsWon: number; base: string | null; target: string | null; bankroll: string | null; bankrollNote: string | null;
  history: Array<{ date: string; step: number; result: string | null }>; settled: number; nextCard: string;
  earlierRuns: Array<{ runId: string; status: string; statusText: string; reason: string | null }>; headSha256: string | null; label: string | null;
};
type Entry = { ok: true; view: View } | { ok: false; laneId: string; reason: string };

export default function LaneStatus({ product, lanes }: { product: "bank-builder" | "moonshot"; lanes: Entry[] }) {
  const name = product === "moonshot" ? "Moonshot" : "Bank Builder";
  return (
    <section aria-labelledby="lane-status-h" data-lane-status-section={product} style={{ margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 id="lane-status-h" style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--vault-text)" }}>{name} challenge lanes</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
        {lanes.map((e) => e.ok ? <LaneCard key={e.view.laneId} v={e.view} /> : (
          <article key={e.laneId} data-lane={e.laneId} data-lane-unavailable={e.reason} style={CARD}><p style={{ margin: 0 }}>Lane record not available ({e.reason}).</p></article>
        ))}
      </div>
    </section>
  );
}

const CARD: React.CSSProperties = { border: "1px solid var(--vault-border)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 8, minWidth: 0, color: "var(--vault-text)" };

function LaneCard({ v }: { v: View }) {
  return (
    <article style={CARD} data-lane={v.laneId} data-lane-run={v.runId} data-lane-state={v.status ?? ""} data-chain-head={v.headSha256 ?? ""}>
      <header style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <strong>Lane {v.slot}</strong>
        {v.laneTypeLabel ? <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>{v.laneTypeLabel}</span> : null}
        <span data-lane-status-badge="" style={{ marginLeft: "auto", fontWeight: 800 }}>{v.statusText}</span>
      </header>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }} data-lane-step="">{v.stepText}</p>
      {v.statusReason ? <p style={{ margin: 0, fontSize: 13, color: "var(--vault-text-mute)" }}>{v.statusReason}</p> : null}
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13.5 }}>
        <dt>Steps won</dt><dd style={{ margin: 0 }} data-lane-steps-won="">{v.stepsWon} of {v.steps}</dd>
        <dt>Start → goal</dt><dd style={{ margin: 0 }}>{v.base} → {v.target}</dd>
        <dt>Bankroll</dt><dd style={{ margin: 0 }} data-lane-bankroll="">{v.bankroll ?? v.bankrollNote}</dd>
        <dt>Next card</dt><dd style={{ margin: 0 }} data-lane-next-card="">{v.nextCard}</dd>
      </dl>
      <ol aria-label={`Lane ${v.slot} settled steps`} style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: 6 }}>
        {v.history.map((h) => (
          <li key={`${h.date}-${h.step}`} data-lane-day={h.date} data-lane-day-result={h.result ?? "open"} style={{ fontSize: 12.5, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--vault-border-strong)" }}>
            Step {h.step} · {h.date} · {h.result ?? "not settled"}
          </li>
        ))}
      </ol>
      {v.earlierRuns.length ? <p style={{ margin: 0, fontSize: 12, color: "var(--vault-text-mute)" }} data-lane-earlier-runs="">Earlier runs: {v.earlierRuns.map((r) => `${r.runId} (${r.statusText.toLowerCase()})`).join(", ")}</p> : null}
      <p style={{ margin: 0, fontSize: 11, color: "var(--vault-text-faint)" }}>{v.runId} · {v.rulesText} · {v.label}</p>
    </article>
  );
}
