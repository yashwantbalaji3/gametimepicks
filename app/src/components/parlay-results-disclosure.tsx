/**
 * ParlayResultsDisclosure — honest framing for the Results page.
 *
 * Parlay Lab generates candidate parlays client-side from the board JSON
 * at view time. Historical candidate snapshots are NOT persisted, so we
 * cannot truthfully claim "candidate X hit" for a past slate. This
 * component renders an honest disclosure explaining the gap and what
 * we'd need to ship to make parlay-result tracking real in a future PR.
 *
 * NEVER fabricates parlay outcomes. Pure presentational.
 */
export default function ParlayResultsDisclosure() {
  return (
    <section
      className="mt-10 gtp-parlay-disclosure"
      aria-label="Parlay results disclosure"
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: "var(--vault-warn)",
            boxShadow: "0 0 6px rgba(240, 199, 94, 0.55)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          Parlay results · pending feature
        </span>
      </div>

      <h3
        className="font-display font-semibold tracking-tight"
        style={{ color: "var(--vault-text)", fontSize: 18, lineHeight: 1.2 }}
      >
        Candidate parlays were not persisted for this slate.
      </h3>

      <p
        className="mt-2 text-[13px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}
      >
        Parlay Lab builds candidate slips on-the-fly from each visitor&apos;s
        risk profile and selected players, so the candidates shown to one
        viewer aren&apos;t identical to another&apos;s. We didn&apos;t
        snapshot today&apos;s candidate sets at generation time, which
        means we cannot truthfully report &quot;Candidate #1 hit&quot;
        for past dates without inventing the slip. Future work: persist
        the default-slate candidate snapshots at generation time so each
        graded slate also publishes the parlay leaderboard alongside the
        leg-level hit rate.
      </p>

      <ul
        className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 list-none text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        <li>
          <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
          Today the leg-level grading covers every Over / Under prop the
          model emitted, so users can audit which legs the model called
          correctly even without the parlay overlay.
        </li>
        <li>
          <span style={{ color: "var(--vault-gold-bright)" }}>·</span>{" "}
          A parlay only &quot;hits&quot; if every leg wins — pushes and
          unavailable stats need explicit handling. We&apos;d rather
          report nothing than guess.
        </li>
      </ul>
    </section>
  );
}
