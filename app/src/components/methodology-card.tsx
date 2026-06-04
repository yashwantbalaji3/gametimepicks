/**
 * MethodologyCard — calm, factual explainer that lives on /results
 * between the per-date settled-slip sections and the projection-level
 * audit pointer.
 *
 * What this card does:
 *   - Names the three concrete things that happen after every slate:
 *     settlement, projection audit, signal review.
 *   - Explains why a single slate never changes the model on its own
 *     — the audit policy needs confirming days, and the
 *     DailyAuditBanner above already exposes the current state of
 *     that policy.
 *   - Calls out what is NOT included in the public hit rate (Build
 *     Your Own slips) and what is informational only (Bankroll Plan,
 *     single-game NBA cards).
 *
 * Honesty constraints (matched to the user's PR 5 spec):
 *   - Does NOT say "the model learned" — until an audit policy is
 *     consumed, every signal is informational only.
 *   - Does NOT use banned betting copy.
 *   - Does NOT use "safe" or "safety" in user-facing copy.
 *   - Does NOT claim improvement that isn't measured.
 *   - Does NOT reintroduce the May 26 replay or any pre-era hit rate.
 *
 * Pure presentation. No data fetches; no fabricated content.
 */

export default function MethodologyCard() {
  return (
    <section
      aria-label="Methodology and learning loop"
      className="rounded-[10px] p-5 sm:p-6 flex flex-col gap-4"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--gtp-card-border)",
      }}
    >
      <header className="flex flex-col gap-1">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-text-mute)", fontSize: 12 }}
        >
          Methodology · audit trail
        </span>
        <h2
          className="font-display tracking-tight"
          style={{
            color: "var(--vault-text)",
            fontSize: "clamp(20px, 3vw, 24px)",
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          How the model improves over time.
        </h2>
      </header>

      <p
        className="text-[13.5px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 680 }}
      >
        Three things happen after every slate. The first two are
        automatic. The third is a slow loop — by design.
      </p>

      <ol className="flex flex-col gap-4">
        <Step
          number={1}
          title="Settlement"
          body="Once games finish, every saved slip is graded against final stats. Wins, losses, pushes, and pending are recorded by the nightly settler. We never edit outcomes by hand and we never use a slate's final results to alter that slate's pre-game suggestions."
        />
        <Step
          number={2}
          title="Daily projection audit"
          body="Per-prop accuracy is compared to the model's pre-game projection on every settled lean. Per-sport audits live at /results/nba and /results/mlb. The raw audit JSON is in the repo so it's auditable end-to-end."
        />
        <Step
          number={3}
          title="Signal review"
          body="Underperforming markets, tiers, or matchup shapes get flagged via the audit policy you can see in the banner above. A signal has to repeat across a configured window of confirming days before it can affect the optimizer. One slate never changes the model on its own."
        />
      </ol>

      {/* PR `docs/methodology-recent-learnings` (2026-05-29) — short
         "what changed recently" block. Plain English, no
         overclaiming, no "the model learned" framing. */}
      <div
        className="rounded-[8px] p-4 flex flex-col gap-2"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px dashed var(--vault-border)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          What changed recently
        </span>
        <ul
          className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed list-none p-0 m-0"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <li>
            <strong style={{ color: "var(--vault-text)" }}>
              We found a grading blind spot.
            </strong>{" "}
            Hits + Runs + RBIs props used to come back unresolved
            because the MLB grader didn&apos;t know how to read them.
            They now grade off the box score the same way Hits and
            Total Bases do.
          </li>
          <li>
            <strong style={{ color: "var(--vault-text)" }}>
              We track public risk sections separately.
            </strong>{" "}
            Low / Medium / High / Longshot get their own results row.
            The hit rate you see on Results matches what you saw on
            Parlay Lab the day before, not a re-bucketing.
          </li>
          <li>
            <strong style={{ color: "var(--vault-text)" }}>
              We still need a sample before any model behavior moves.
            </strong>{" "}
            Every Learning Signals row says exactly how many more
            decisive slips it needs before its gate can fire.
            Confirmed signals stay operator-gated and aren&apos;t
            consumed automatically.
          </li>
        </ul>
      </div>

      <div
        className="rounded-[8px] p-4 flex flex-col gap-2"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px dashed var(--vault-border)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Learning roadmap
        </span>
        <p
          className="text-[12.5px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          What happens next: audit signals are tracked first,
          reviewed internally second, and only then considered for the
          optimizer. Advanced ML ideas are on the roadmap, but not
          active until they beat the current rules in out-of-time
          tests. Full sequence —{" "}
          <a
            href="https://github.com/yashwantbalaji3/gametimepicks/blob/main/docs/MODEL_LEARNING_ROADMAP_2026-05-28.md"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--vault-gold-bright)",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            MODEL_LEARNING_ROADMAP_2026-05-28.md
          </a>
          .
        </p>
      </div>

      <div
        className="rounded-[8px] p-4 flex flex-col gap-2"
        style={{
          background: "var(--gtp-card-sunken)",
          border: "1px dashed var(--vault-border)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          What we explicitly don&apos;t claim
        </span>
        <ul
          className="flex flex-col gap-1.5 text-[12.5px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <Bullet>
            We do <strong style={{ color: "var(--vault-text)" }}>not</strong> call
            this a learning model. Until an audit signal is explicitly consumed
            by the optimizer, every flag in the banner above is informational
            only.
          </Bullet>
          <Bullet>
            Custom parlays from <em>Build Your Own</em> are not included in
            the public hit rate. They&apos;re exploratory.
          </Bullet>
          <Bullet>
            <em>Bankroll Plan</em> is an educational allocation planner — not
            financial advice.
          </Bullet>
          <Bullet>
            Single-game NBA cards on the Parlay Lab are labeled higher
            variance because every leg shares one matchup. That label is the
            framing, not a hedge.
          </Bullet>
        </ul>
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  body,
}: {
  number: number;
  title: string;
  body: string;
}) {
  return (
    <li className="grid grid-cols-[32px_1fr] gap-3 items-start">
      <span
        aria-hidden
        className="inline-flex items-center justify-center font-display tabular shrink-0"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          background: "var(--gtp-card-sunken)",
          color: "var(--vault-gold-bright)",
          border: "1px solid var(--gtp-card-border)",
          fontSize: 13,
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        {number}
      </span>
      <div className="flex flex-col gap-1 min-w-0">
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{ color: "var(--vault-text)", fontSize: 11 }}
        >
          {title}
        </span>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {body}
        </p>
      </div>
    </li>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[12px_1fr] gap-2 items-start">
      <span
        aria-hidden
        style={{
          color: "var(--vault-text-faint)",
          fontSize: 11,
          lineHeight: 1.4,
        }}
      >
        ·
      </span>
      <span>{children}</span>
    </li>
  );
}
