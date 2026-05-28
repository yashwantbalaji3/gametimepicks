/**
 * DateStatusHeader — top-of-page banner that makes the active data
 * date obvious and labels its status. Server-renderable.
 *
 * UX intent:
 *   - Big, unambiguous date.
 *   - Relative label chip (Today / Tomorrow / Yesterday / Latest
 *     available / Replay / Custom).
 *   - Compact counts row (games / projections / slips / W-L-pending)
 *     that wraps cleanly on mobile.
 *   - Free-text note slot for one-off context (e.g. "MLB props live
 *     after a paid run").
 *
 * Honesty rules:
 *   - "Today" only fires if `date` matches today in ET.
 *   - Replay/Custom chips visibly contrast with Official.
 *   - No banned copy — caller must supply non-promotional `note`.
 *
 * Lives alongside the existing premium dark theme. No theme flip.
 */
import {
  formatDateForHeader,
  isoDateInET,
  relativeLabel,
  type DateLabel,
} from "@/lib/date-status";

export interface DateStatusHeaderCounts {
  games?: number;
  projections?: number;
  slips?: number;
  wins?: number;
  losses?: number;
  pushes?: number;
  pending?: number;
}

export interface DateStatusHeaderProps {
  /** YYYY-MM-DD — the date the page is currently rendering for. */
  date: string;
  /** Explicit label override (e.g. "replay" / "custom" / "official").
   *  When omitted, the component derives "today"/"tomorrow"/"yesterday"
   *  vs `date` automatically. */
  label?: DateLabel;
  /** Optional pre-eyebrow context (e.g. "Suggested parlays"). */
  context?: string;
  /** Optional counts row. Only non-undefined fields render. */
  counts?: DateStatusHeaderCounts;
  /** Optional one-line note appended below counts. Caller must keep
   *  it factual; no banned copy. */
  note?: string;
}

const _TONE: Record<DateLabel, { color: string; bg: string }> = {
  today: { color: "var(--vault-gold-bright)", bg: "rgba(255,200,80,0.10)" },
  tomorrow: { color: "var(--vault-gold)", bg: "rgba(255,200,80,0.06)" },
  yesterday: { color: "var(--vault-text-mute)", bg: "transparent" },
  "latest-available": { color: "var(--vault-text-mute)", bg: "transparent" },
  replay: { color: "var(--vault-warn)", bg: "rgba(220,150,60,0.10)" },
  official: { color: "var(--vault-success)", bg: "rgba(80,180,120,0.10)" },
  "pending-settlement": { color: "var(--vault-warn)", bg: "rgba(220,150,60,0.08)" },
  custom: { color: "var(--vault-text-mute)", bg: "transparent" },
};

export default function DateStatusHeader({
  date,
  label,
  context,
  counts,
  note,
}: DateStatusHeaderProps) {
  const todayIso = isoDateInET();
  const formatted = formatDateForHeader(date, { nowIsoEt: todayIso });
  // Resolve label: explicit override wins, else derived relative
  // (today/tomorrow/yesterday), else "latest-available".
  const effectiveLabel: DateLabel =
    label ?? formatted.relative ?? "latest-available";
  const tone = _TONE[effectiveLabel];
  const chipText = relativeLabel(effectiveLabel, todayIso, date) ?? "Latest available";

  const chips = buildCountChips(counts);

  return (
    <section
      aria-label={`Date status — ${date}`}
      className="rounded-[8px] p-4 sm:p-5 flex flex-col gap-3"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          {context && (
            <span
              className="font-mono uppercase tracking-[0.18em]"
              style={{ color: "var(--vault-gold)", fontSize: 10 }}
            >
              {context}
            </span>
          )}
          <span
            className="font-display tracking-tight"
            style={{
              color: "var(--vault-text)",
              fontSize: "clamp(22px, 4vw, 30px)",
              fontWeight: 600,
              lineHeight: 1.1,
            }}
          >
            {formatted.pretty}
          </span>
        </div>
        <span
          className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full shrink-0"
          style={{
            color: tone.color,
            border: `1px solid ${tone.color}`,
            background: tone.bg,
            fontSize: 10,
          }}
        >
          {chipText}
        </span>
      </div>

      {chips.length > 0 && (
        <ul
          className="flex flex-wrap gap-2 list-none"
          aria-label="Counts"
        >
          {chips.map((chip) => (
            <li
              key={chip.label}
              className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-[4px]"
              style={{
                background: "rgba(0,0,0,0.35)",
                border: "1px solid var(--vault-rule)",
                color: "var(--vault-text-mute)",
                fontSize: 10,
              }}
            >
              <span style={{ color: "var(--vault-text-faint)" }}>
                {chip.label}
              </span>{" "}
              <span style={{ color: "var(--vault-text)" }}>{chip.value}</span>
            </li>
          ))}
        </ul>
      )}

      {note && (
        <p
          className="text-[12px] leading-snug"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {note}
        </p>
      )}
    </section>
  );
}

function buildCountChips(counts: DateStatusHeaderCounts | undefined) {
  const out: Array<{ label: string; value: string }> = [];
  if (!counts) return out;
  if (typeof counts.games === "number") {
    out.push({ label: "Games", value: String(counts.games) });
  }
  if (typeof counts.projections === "number") {
    out.push({ label: "Projections", value: String(counts.projections) });
  }
  if (typeof counts.slips === "number") {
    out.push({ label: "Slips", value: String(counts.slips) });
  }
  if (typeof counts.wins === "number" || typeof counts.losses === "number") {
    const w = counts.wins ?? 0;
    const l = counts.losses ?? 0;
    const p = counts.pushes ?? 0;
    const pend = counts.pending ?? 0;
    const decisive = w + l;
    const rate = decisive ? (w / decisive) * 100 : null;
    const parts = [`${w}W`, `${l}L`];
    if (p > 0) parts.push(`${p}P`);
    if (pend > 0) parts.push(`${pend} pending`);
    if (rate !== null) parts.push(`${rate.toFixed(1)}%`);
    out.push({ label: "Record", value: parts.join(" · ") });
  }
  return out;
}
