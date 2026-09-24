/**
 * Persistent banner above the nav.
 * Reminds the user this is an educational analytics project, not betting advice.
 *
 * ONE set of markup at every width (2026-09-24): the strip used to render both the label and the
 * compliance sentence twice, once per breakpoint, with the two sentences identical.
 *
 * PR A: re-skinned to a calm premium chrome strip. The pulsing dot is
 * tinted vault-gold via the .live-dot class so it never reads as a live
 * betting/game indicator. Compliance copy is preserved verbatim.
 */
export default function DisclaimerBanner() {
  return (
    <div
      className="relative z-20"
      style={{
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--vault-scrim-cocoa) 92%, transparent), color-mix(in srgb, var(--vault-scrim-base) 92%, transparent))",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] tracking-[0.04em] font-mono">
        <span
          className="inline-flex items-center gap-2 shrink-0"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <span className="live-dot" aria-hidden />
          Educational analytics
        </span>
        <span
          aria-hidden
          className="inline-block w-px h-3 shrink-0"
          style={{ background: "var(--vault-border-strong)" }}
        />
        {/*
          ONE SET OF MARKUP. This strip used to render the compliance sentence TWICE — a
          `hidden sm:inline` copy and a `sm:hidden` copy — and the comment claimed the second was a
          "mobile-only short version". The two strings were byte-identical, so the split shortened
          nothing and the page simply paid for the sentence twice. Together with the duplicated
          label that was 15 rendered words for 8 words of content, and it pushed the first-viewport
          budget (busiest-state.test.mjs) over its 1,820 ceiling.

          Compliance copy is unchanged and still renders at every width — it is the DUPLICATE that
          is gone, not the sentence.
        */}
        {/*
          ⚠ NOT `truncate`. It was, and at 375px the strip rendered
          "Not betting advice · rese…" — a compliance sentence cut off by an ellipsis. A budget is
          not a reason to clip this line. The strip wraps instead: the sentence is readable in full
          at every width, and wrapping costs no rendered words.
        */}
        <span style={{ color: "var(--vault-text-faint)" }}>
          Not betting advice · research use only.
        </span>
      </div>
    </div>
  );
}
