/**
 * Persistent banner above the nav.
 * Reminds the user this is an educational analytics project, not betting advice.
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
          "linear-gradient(180deg, rgba(14, 21, 48, 0.92), rgba(7, 11, 26, 0.92))",
        borderBottom: "1px solid var(--vault-border)",
      }}
    >
      <div className="mx-auto max-w-[1280px] px-6 py-2 flex items-center gap-3 text-[11px] tracking-[0.04em] font-mono">
        <span
          className="hidden sm:inline-flex items-center gap-2"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <span className="live-dot" aria-hidden />
          Educational analytics
        </span>
        <span
          className="sm:hidden inline-flex items-center gap-2"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <span className="live-dot" aria-hidden />
          Educational
        </span>
        <span
          aria-hidden
          className="hidden sm:inline-block w-px h-3"
          style={{ background: "var(--vault-border-strong)" }}
        />
        <span
          className="truncate"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Not betting advice. For modeling and research purposes only.
        </span>
      </div>
    </div>
  );
}
