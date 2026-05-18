import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Compact bottom-of-overview disclosure. Replaces the two giant
 * always-visible info panels every sport overview used to render with
 * a single collapsible block — desktop and mobile both feel less
 * text-heavy.
 *
 * Defaults to closed so the overview's projection/schedule content
 * sits above the fold without competing with paragraph copy. Open it
 * and the original two-column information (data inputs + honest
 * framing) renders inside.
 */
export default function OverviewFooterDisclosure({
  inputsLabel,
  inputsBody,
  framingLabel = "Honest framing",
  framingBody,
}: {
  /** Eyebrow for the left column (e.g. "What is wired today"). */
  inputsLabel: string;
  /** Left-column body. */
  inputsBody: ReactNode;
  /** Eyebrow for the right column. Defaults to "Honest framing". */
  framingLabel?: string;
  /** Right-column body. The Responsible Use link is appended for you. */
  framingBody: ReactNode;
}) {
  return (
    <section className="mt-10">
      <details
        className="rounded-[6px] vault-glass overflow-hidden group"
        style={{ color: "var(--vault-text-mute)" }}
      >
        <summary
          className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3"
          style={{
            background: "rgba(7, 11, 26, 0.45)",
            borderBottom: "1px solid var(--vault-rule)",
          }}
        >
          <span
            className="font-mono uppercase tracking-[0.14em]"
            style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
          >
            What is wired · responsible use
          </span>
          <span
            aria-hidden
            className="font-mono transition-transform group-open:rotate-180"
            style={{ color: "var(--vault-text-faint)", fontSize: 12 }}
          >
            ▾
          </span>
        </summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3">
          <div
            className="rounded-[4px] px-4 py-3 text-[12px] leading-relaxed"
            style={{
              background: "rgba(7, 11, 26, 0.35)",
              border: "1px solid var(--vault-rule)",
              color: "var(--vault-text-mute)",
            }}
          >
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              {inputsLabel}
            </div>
            {inputsBody}
          </div>
          <div
            className="rounded-[4px] px-4 py-3 text-[12px] leading-relaxed"
            style={{
              background: "rgba(7, 11, 26, 0.35)",
              border: "1px solid var(--vault-rule)",
              color: "var(--vault-text-mute)",
            }}
          >
            <div
              className="font-mono uppercase tracking-[0.14em] mb-2"
              style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}
            >
              {framingLabel}
            </div>
            {framingBody}{" "}
            See{" "}
            <Link
              href="/responsible-use"
              style={{ color: "var(--vault-gold-bright)" }}
            >
              Responsible Use
            </Link>{" "}
            for helplines.
          </div>
        </div>
      </details>
    </section>
  );
}
