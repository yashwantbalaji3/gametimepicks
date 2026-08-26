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
            boxShadow: "0 0 4px color-mix(in srgb, var(--vault-accent) 60%, transparent)",
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
                  border: "color-mix(in srgb, var(--vault-accent) 40%, transparent)",
                  bgIdle: "color-mix(in srgb, var(--vault-accent) 6%, transparent)",
                  labelColor: "var(--vault-gold-bright)",
                }
              : e.status === "live"
                ? {
                    border: "color-mix(in srgb, var(--vault-success) 34%, transparent)",
                    bgIdle: "color-mix(in srgb, var(--vault-success) 5%, transparent)",
                    labelColor: "var(--vault-success)",
                  }
                : e.status === "linesPending"
                  ? {
                      border: "color-mix(in srgb, var(--vault-warn-alt) 28%, transparent)",
                      bgIdle: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
                      labelColor: "var(--vault-text)",
                    }
                  : {
                      border: "var(--vault-border)",
                      bgIdle: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
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
                  ? "linear-gradient(155deg, color-mix(in srgb, var(--vault-accent) 18%, transparent), color-mix(in srgb, var(--vault-accent) 4%, transparent))"
                  : tone.bgIdle,
                border: isActive
                  ? "1px solid color-mix(in srgb, var(--vault-accent) 55%, transparent)"
                  : `1px solid ${tone.border}`,
                boxShadow: isActive
                  ? "0 6px 18px color-mix(in srgb, var(--vault-ink-black) 35%, transparent), 0 0 0 1px color-mix(in srgb, var(--vault-accent) 18%, transparent)"
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
