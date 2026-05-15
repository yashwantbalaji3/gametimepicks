/**
 * EmptyResultsCard — premium empty state for /results.
 *
 * Iteration 5: surface upgraded from dashed-border + tiny mono to the
 * casino brand chrome (.vault-deluxe-card + .casino-glow-card) with a
 * polished "what you'll see" preview panel inside. Copy is unchanged
 * — still honest about no settled outcomes existing yet.
 */
export default function EmptyResultsCard() {
  return (
    <div className="vault-deluxe-card casino-glow-card p-6 sm:p-8">
      <div className="text-center">
        <div
          aria-hidden
          className="inline-flex items-center gap-2 mb-4"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.6)",
            }}
          />
          <span
            className="font-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--vault-gold)" }}
          >
            No settled slates yet
          </span>
        </div>
        <h2
          className="font-display font-semibold tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(20px, 3vw, 26px)",
            lineHeight: 1.15,
          }}
        >
          Verified results appear after each slate is reviewed.
        </h2>
        <p
          className="mt-3 mx-auto max-w-xl text-[13px] sm:text-[14px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          When NBA games on a slate are complete, we manually verify final
          stats from the official box scores and grade each lean. Until that
          happens, this page stays honest about having no measured outcomes
          to show.
        </p>
      </div>

      {/* Preview grid — what users will see once results land. Each cell
          reads as a small deluxe panel, not a flat list. */}
      <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PreviewCell
          title="Hit rate"
          body="Settled-slate hit rate, broken down by market and confidence tier."
        />
        <PreviewCell
          title="Wins · losses · pushes"
          body="Per-slate scoring detail and lifetime totals."
        />
        <PreviewCell
          title="Projection error"
          body="Biggest hits, biggest misses, and projection vs. actual error."
        />
        <PreviewCell
          title="Small-sample callouts"
          body="Honest warnings when there isn't enough data to draw conclusions."
        />
      </div>

      <p
        className="mt-6 text-center text-[11px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Sign up below to be notified when the first slates settle.
      </p>
    </div>
  );
}

function PreviewCell({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="px-4 py-4 rounded-[6px]"
      style={{
        background: "rgba(20, 24, 38, 0.55)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.16em] uppercase"
        style={{ color: "var(--vault-gold-bright)" }}
      >
        {title}
      </div>
      <p
        className="mt-1.5 text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
    </div>
  );
}
