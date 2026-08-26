/**
 * EmptyResultsCard — calibration-room empty state for /results.
 *
 * Iteration 6: turn the empty state into a real "calibration room" /
 * "results lab" experience instead of a friendly placeholder. Shows
 * (1) what users will see once games settle, (2) the verification
 * workflow as a timeline, and (3) CTAs back to the live model so the
 * page is a meaningful stop on the user's journey rather than a dead
 * end.
 *
 * Still completely honest about having no settled outcomes yet.
 */
import Link from "next/link";

interface Props {
  /** Latest scored slate date (e.g. "2026-05-15") to link the CTA to. */
  latestScoredDate?: string | null;
}

export default function EmptyResultsCard({ latestScoredDate }: Props) {
  const boardHref = latestScoredDate
    ? `/board?date=${latestScoredDate}`
    : "/board";
  return (
    <div className="vault-deluxe-card casino-glow-card p-6 sm:p-8">
      {/* Eyebrow + heading */}
      <div className="text-center">
        <div
          aria-hidden
          className="inline-flex items-center gap-2 mb-4"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
            }}
          />
          <span
            className="font-mono text-[10px] tracking-[0.18em] uppercase"
            style={{ color: "var(--vault-gold)" }}
          >
            Calibration room · awaiting first settled slate
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
          Verified results appear once a slate is graded.
        </h2>
        <p
          className="mt-3 mx-auto max-w-xl text-[13px] sm:text-[14px] leading-relaxed"
          style={{ color: "var(--vault-text-mute)" }}
        >
          When NBA games on a slate are complete, we manually verify final
          stats from the official box scores and grade each lean. This page
          stays honest about having no measured outcomes until that happens.
        </p>
      </div>

      {/* Workflow timeline — explains how a lean becomes a result. */}
      <div className="mt-7">
        <div
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-center mb-3"
          style={{ color: "var(--vault-text-faint)" }}
        >
          How a lean becomes a result
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-4 gap-3 list-none">
          <TimelineStep
            n="01"
            title="Game completes"
            body="The NBA game ends and the official box score posts to nba.com."
          />
          <TimelineStep
            n="02"
            title="Box score verified"
            body="Final stats are pulled and manually cross-checked against the source."
          />
          <TimelineStep
            n="03"
            title="Projection graded"
            body="Each model lean is settled as a win, loss, or push against the actual outcome."
          />
          <TimelineStep
            n="04"
            title="Calibration updated"
            body="Hit rate, projection error, and confidence calibration refresh on this page."
          />
        </ol>
      </div>

      {/* What will appear here */}
      <div className="mt-7">
        <div
          className="font-mono text-[10px] tracking-[0.16em] uppercase mb-3"
          style={{ color: "var(--vault-text-faint)" }}
        >
          When the first slate settles, you&apos;ll see
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PreviewCell
            title="Hit rate"
            body="Settled-slate hit rate, broken down by market (PTS / REB / AST) and confidence tier."
          />
          <PreviewCell
            title="Wins · losses · pushes"
            body="Per-slate scoring detail and lifetime totals — pushes never inflate the hit rate."
          />
          <PreviewCell
            title="Projection error"
            body="Biggest hits, biggest misses, and projection vs. actual error distribution."
          />
          <PreviewCell
            title="Small-sample callouts"
            body="Honest warnings when there isn't enough data to draw conclusions."
          />
        </div>
      </div>

      {/* CTAs */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={boardHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[4px] font-medium text-[13px] tracking-tight transition-colors"
          style={{
            background: "var(--vault-gold)",
            color: "var(--vault-scrim-cocoa)",
            boxShadow:
              "0 0 0 1px color-mix(in srgb, var(--vault-accent) 45%, transparent), 0 10px 24px -12px color-mix(in srgb, var(--vault-accent) 35%, transparent)",
          }}
        >
          View the live model board
          <span aria-hidden>→</span>
        </Link>
        <Link
          href="/methodology"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[4px] font-medium text-[13px] tracking-tight transition-colors"
          style={{
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-text)",
          }}
        >
          Read the methodology
        </Link>
      </div>

      <p
        className="mt-5 text-center text-[11px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Sign up below to be notified when the first slates settle.
      </p>
    </div>
  );
}

function TimelineStep({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <li
      className="relative px-3.5 py-3.5 rounded-[6px]"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-6 h-6 rounded-full font-mono text-[10px] font-semibold tabular"
          style={{
            background: "var(--vault-gold-dim)",
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-gold-bright)",
            boxShadow: "0 0 10px -3px color-mix(in srgb, var(--vault-accent) 35%, transparent)",
          }}
        >
          {n}
        </span>
        <span
          className="font-display text-[13px] font-semibold tracking-tight"
          style={{ color: "var(--vault-text)" }}
        >
          {title}
        </span>
      </div>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
    </li>
  );
}

function PreviewCell({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="px-4 py-4 rounded-[6px]"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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
