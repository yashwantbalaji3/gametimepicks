/**
 * Persistent banner above the nav.
 * Reminds the user this is an educational analytics project, not betting advice.
 */
export default function DisclaimerBanner() {
  return (
    <div className="relative z-20 border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-[1280px] px-6 py-2 flex items-center gap-3 text-[11px] tracking-wide uppercase font-mono text-[var(--text-faint)]">
        <span className="hidden sm:inline-flex items-center gap-2">
          <span className="live-dot" />
          Educational analytics
        </span>
        <span className="sm:hidden inline-flex items-center gap-2">
          <span className="live-dot" />
          Educational
        </span>
        <span className="text-[var(--border-strong)]">/</span>
        <span className="truncate">
          Not betting advice. For modeling and research purposes only.
        </span>
      </div>
    </div>
  );
}
