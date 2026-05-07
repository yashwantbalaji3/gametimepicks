/**
 * EmptyResultsCard — Phase 14 public rewrite.
 *
 * Public-friendly empty state for the /results page when nothing has
 * been settled yet. Phase 8 originally walked the operator through a
 * three-step terminal workflow (edit JSON / run python / rebuild &
 * redeploy). That copy was visible to public visitors and broke the
 * "no admin runbook on public pages" rule.
 *
 * This rewrite:
 *   - Explains what "results" means in user-friendly language
 *   - Says how a slate becomes a result without naming files or commands
 *   - Lists what users will see once a slate is settled
 *   - Keeps the educational / not-betting-advice framing
 *   - The actual operator runbook lives in docs/QA_CHECKLIST.md
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
          Verified results appear after each slate is reviewed.
        </h2>
        <p
          className="mt-3 mx-auto max-w-md text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          When NBA games on a slate are complete, we manually verify final
          stats from the official box scores and grade each lean. Until that
          happens, this page stays honest about having no measured outcomes
          to show.
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
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
          style={{ color: "var(--vault-text-faint)" }}
        >
          when results land you'll see
        </div>
        <ul
          className="font-mono text-[11px] leading-[1.7] tabular space-y-1.5"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <li>
            <span style={{ color: "var(--vault-gold)" }}>·</span> Hit rate over
            settled slates, broken down by market and confidence tier
          </li>
          <li>
            <span style={{ color: "var(--vault-gold)" }}>·</span> Wins, losses,
            and pushes per slate with the scoring detail
          </li>
          <li>
            <span style={{ color: "var(--vault-gold)" }}>·</span> Biggest hits,
            biggest misses, and projection vs. actual error
          </li>
          <li>
            <span style={{ color: "var(--vault-gold)" }}>·</span> Small-sample
            warnings when there isn't enough data to draw conclusions
          </li>
        </ul>
      </div>

      <p
        className="mt-6 text-center font-mono text-[10px] tracking-[0.18em] uppercase"
        style={{ color: "var(--vault-text-faint)" }}
      >
        sign up below to be notified when results go live
      </p>
    </div>
  );
}
