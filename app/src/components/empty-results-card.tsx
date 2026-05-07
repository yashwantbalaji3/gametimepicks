/**
 * EmptyResultsCard — Phase 8.
 *
 * Polished empty state for the /results page when nothing has been
 * settled yet. Explains how to populate it with a one-step path
 * (edit override → run settle_results) so the empty state itself
 * teaches the user how to advance.
 */
export default function EmptyResultsCard() {
  return (
    <div
      className="rounded-[3px] p-8 sm:p-10"
      style={{
        border: "1px dashed var(--vault-border)",
        background: "var(--vault-panel)",
      }}
    >
      <div className="text-center">
        <div
          className="font-mono text-[10px] tracking-[0.18em] uppercase mb-4"
          style={{ color: "var(--vault-gold)" }}
        >
          no settled slates yet
        </div>
        <h2
          className="font-display text-[20px] sm:text-[24px] font-semibold tracking-tight"
          style={{ color: "var(--vault-text)" }}
        >
          Results will appear after a slate is settled.
        </h2>
        <p
          className="mt-3 mx-auto max-w-md text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          To settle a completed slate, fill in the manual override file with
          verified final stats from NBA.com, then run the settlement script.
        </p>
      </div>

      <div
        className="mt-6 sm:mt-8 mx-auto max-w-md rounded-[2px] p-4"
        style={{
          background: "var(--vault-panel-elevated)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2"
          style={{ color: "var(--vault-text-faint)" }}
        >
          one-step path
        </div>
        <ol
          className="font-mono text-[11px] leading-[1.7] tabular space-y-1"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <li>
            <span style={{ color: "var(--vault-gold)" }}>1.</span> edit{" "}
            <code style={{ color: "var(--vault-text)" }}>
              pipeline/overrides/results_overrides.json
            </code>
          </li>
          <li>
            <span style={{ color: "var(--vault-gold)" }}>2.</span> run{" "}
            <code style={{ color: "var(--vault-text)" }}>
              python -m pipeline.settle_results --date 2026-05-05 --manual-only
            </code>
          </li>
          <li>
            <span style={{ color: "var(--vault-gold)" }}>3.</span> rebuild &
            redeploy the site
          </li>
        </ol>
      </div>
    </div>
  );
}
