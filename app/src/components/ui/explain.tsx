import type { ReactNode } from "react";

/**
 * Progressive disclosure for the "why" behind a number.
 *
 * This site owes readers real disclosure — what a model does and does not claim, what was measured,
 * what is refused. That obligation was being met by printing paragraphs above the content, which
 * buried the answer a reader came for and made every page read like speaker notes.
 *
 * The rule this component encodes: the ANSWER is always visible, the EXPLANATION is one click away
 * and never more than a sentence in its collapsed state. Nothing is hidden — a closed disclosure is
 * still in the DOM, still found by search, still read by assistive tech, and the honesty guards that
 * scan rendered text still see it.
 */
export default function Explain({
  label = "Why",
  children,
  tone = "quiet",
}: {
  /** The one-line summary shown when collapsed. Keep it under ~10 words. */
  label?: string;
  children: ReactNode;
  /** "quiet" for a footnote; "notice" when the caveat materially changes how to read the number. */
  tone?: "quiet" | "notice";
}) {
  const accent = tone === "notice" ? "var(--vault-gold)" : "var(--vault-text-faint)";
  return (
    <details className="group" style={{ marginTop: 6 }}>
      <summary
        className="cursor-pointer list-none inline-flex items-center gap-1.5 font-mono"
        style={{ color: accent, fontSize: 10, letterSpacing: "0.04em" }}
      >
        <span
          aria-hidden
          className="transition-transform group-open:rotate-90"
          style={{ display: "inline-block", fontSize: 8 }}
        >
          ▶
        </span>
        {label}
      </summary>
      <div
        className="mt-1.5 pl-3"
        style={{
          borderLeft: `1px solid ${tone === "notice" ? "var(--vault-gold)" : "var(--vault-rule)"}`,
          color: "var(--vault-text-mute)",
          fontSize: 11,
          lineHeight: 1.6,
        }}
      >
        {children}
      </div>
    </details>
  );
}
