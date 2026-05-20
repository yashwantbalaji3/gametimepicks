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
        className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1"
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {entries.map((e) => {
          const isActive = e.date === activeDate;
          // Per-status visual tone: settled = gold authority, live =
          // green energy, lines pending = warm amber dim, upcoming =
          // cool blue. The pill below already carries the same accent;
          // matching the card border ties the two together visually.
          const tone =
            e.status === "settled"
              ? {
                  border: "rgba(240, 199, 94, 0.40)",
                  bgIdle: "rgba(240, 199, 94, 0.06)",
                  labelColor: "var(--vault-gold-bright)",
                }
              : e.status === "live"
                ? {
                    border: "rgba(74, 222, 128, 0.34)",
                    bgIdle: "rgba(74, 222, 128, 0.05)",
                    labelColor: "var(--vault-success)",
                  }
                : e.status === "linesPending"
                  ? {
                      border: "rgba(245, 195, 95, 0.28)",
                      bgIdle: "rgba(7, 11, 26, 0.55)",
                      labelColor: "var(--vault-text)",
                    }
                  : {
                      border: "var(--vault-border)",
                      bgIdle: "rgba(7, 11, 26, 0.55)",
                      labelColor: "var(--vault-text)",
                    };
          return (
            <Link
              key={e.date}
              href={e.href}
              prefetch={false}
              className="shrink-0 flex flex-col gap-1.5 rounded-[8px] px-3.5 py-2.5 transition-all hover:-translate-y-0.5"
              style={{
                background: isActive
                  ? "linear-gradient(155deg, rgba(240, 199, 94, 0.18), rgba(240, 199, 94, 0.04))"
                  : tone.bgIdle,
                border: isActive
                  ? "1px solid rgba(240, 199, 94, 0.55)"
                  : `1px solid ${tone.border}`,
                boxShadow: isActive
                  ? "0 6px 18px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(240, 199, 94, 0.18)"
                  : "none",
                minWidth: 138,
                color: "inherit",
                textDecoration: "none",
              }}
            >
              <span
                className="font-mono uppercase tracking-[0.14em]"
                style={{
                  color: isActive
                    ? "var(--vault-gold-bright)"
                    : tone.labelColor,
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
