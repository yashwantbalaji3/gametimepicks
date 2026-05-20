/**
 * BoardDateRail — horizontal date-picker strip used above board pages.
 *
 * Each pill carries:
 *   - the date label (e.g. "Mon May 18")
 *   - a `StatusPill` showing whether that date is settled / live /
 *     lines pending / upcoming
 *   - link target:
 *       · settled dates → `/results/date/<date>`
 *       · everything else → `/<sport>/board/<date>` (MLB) or
 *         `/<sport>/board` for the active NBA date
 *
 * Pure layout. Caller passes the sorted list of dates + the active
 * date + the per-date status it has already computed; the rail does
 * not derive state itself, so the same component works for NBA, MLB,
 * NHL, and IPL.
 */
import Link from "next/link";

import StatusPill, { type StatusPillKind } from "./status-pill";

export interface BoardDateEntry {
  date: string;
  label: string; // e.g. "Mon May 18"
  status: StatusPillKind;
  /** Optional override label for the status pill in this entry. */
  statusLabel?: string;
  /** href the pill links to. */
  href: string;
}

interface Props {
  entries: BoardDateEntry[];
  /** Currently-rendered date, so the rail can highlight it. */
  activeDate: string;
  /** Title shown above the rail. */
  eyebrow?: string;
}

export default function BoardDateRail({
  entries,
  activeDate,
  eyebrow = "Slate",
}: Props) {
  if (entries.length === 0) return null;
  return (
    <section
      aria-label="Board date picker"
      className="mt-3 reveal"
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          aria-hidden
          className="inline-block w-1 h-1 rounded-full"
          style={{
            background: "var(--vault-gold-bright)",
            boxShadow: "0 0 4px rgba(240, 199, 94, 0.6)",
          }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-gold)", fontSize: 10 }}
        >
          {eyebrow}
        </span>
      </div>
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {entries.map((e) => {
          const isActive = e.date === activeDate;
          return (
            <Link
              key={e.date}
              href={e.href}
              prefetch={false}
              className="shrink-0 flex flex-col gap-1 rounded-[6px] px-3 py-2 transition-colors"
              style={{
                background: isActive
                  ? "rgba(240, 199, 94, 0.10)"
                  : "rgba(7, 11, 26, 0.55)",
                border: isActive
                  ? "1px solid rgba(240, 199, 94, 0.45)"
                  : "1px solid var(--vault-border)",
                minWidth: 134,
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{
                  color: isActive
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text)",
                  fontSize: 11,
                }}
              >
                {e.label}
              </span>
              <span>
                <StatusPill
                  kind={e.status}
                  label={e.statusLabel}
                  hideDot
                />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
