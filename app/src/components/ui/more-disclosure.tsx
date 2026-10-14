/**
 * MoreDisclosure — the shared progressive-disclosure block (UX System V2, 2026-10-13).
 *
 * The launch audit found pages built as one long stack: /today rendered 21 sections (11,800px on a phone), and 72
 * files hand-rolled their own <details>. This is the one shape for "the essentials stay on the page; the deeper
 * layer is one tap away": a native <details>, so keyboard, screen readers and find-in-page work without script,
 * and everything inside is still server-rendered into the HTML — nothing is hidden from the record, a disclosure
 * is never removed, only folded.
 */
import type { ReactNode } from "react";

import OpenOnHash from "./open-on-hash";

export default function MoreDisclosure({
  title,
  summary,
  children,
  id,
  defaultOpen = false,
  className = "",
}: {
  /** What is inside, in the reader's words ("More from today's slate"). */
  title: string;
  /** One line naming the contents, so a reader knows whether to open it. */
  summary?: string;
  children: ReactNode;
  id?: string;
  defaultOpen?: boolean;
  /** Spacing from the host page's own rhythm (e.g. "mt-8"); the disclosure itself adds none. */
  className?: string;
}) {
  return (
    <details id={id} open={defaultOpen} className={`gtp-more-disclosure rounded-[12px] ${className}`.trim()} style={{ border: "1px solid var(--vault-border)" }}>
      <summary className="gtp-more-disclosure-summary flex items-center justify-between gap-3 px-4 py-3 cursor-pointer select-none">
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 600 }}>{title}</span>
          {summary ? <span style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.45 }}>{summary}</span> : null}
        </span>
        <span aria-hidden className="gtp-more-disclosure-caret" style={{ color: "var(--vault-text-faint)", fontSize: 18 }}>›</span>
      </summary>
      {/* Deep links into folded content still land (open-on-hash.tsx). */}
      <OpenOnHash />
      <div className="flex flex-col gap-7 px-4 pb-5 pt-2">{children}</div>
    </details>
  );
}
