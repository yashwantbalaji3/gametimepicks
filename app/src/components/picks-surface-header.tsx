/**
 * PicksSurfaceHeader — the shared, sportsbook-style slate header for pick surfaces.
 *
 * Gives the Parlay Lab (/picks) and the custom builder (/build) the same premium slate header
 * the sport hubs get from SportOverviewHero, so every pick surface reads as one product: lava top
 * accent, eyebrow, title, a status pill, scannable count chips, a paper-only note, and a primary CTA.
 *
 * Server-component friendly (no client hooks). All values are passed in — never fabricated.
 */
import Link from "next/link";

export type PicksSurfaceStatus = "pregame" | "live" | "settled" | "review" | "data_pending";

export interface PicksSurfaceHeaderProps {
  title: string;
  eyebrow?: string;
  slateDate?: string; // ISO YYYY-MM-DD
  status?: PicksSurfaceStatus;
  counts?: {
    games?: number;
    projections?: number;
    playerProps?: number;
    suggestedCards?: number;
    specials?: number;
    eligibleLegs?: number;
    active?: number;
    pending?: number;
    settled?: number;
  };
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
  note?: string;
}

const STATUS_META: Record<PicksSurfaceStatus, { label: string; color: string; bg: string }> = {
  pregame: { label: "Pregame slate", color: "var(--vault-gold-bright)", bg: "var(--vault-gold-dim)" },
  live: { label: "Slate in progress", color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)" },
  settled: { label: "Slate settled", color: "var(--vault-success)", bg: "rgba(110,231,168,0.12)" },
  review: { label: "Review", color: "var(--vault-success)", bg: "rgba(110,231,168,0.10)" },
  data_pending: { label: "Data pending", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.04)" },
};

const COUNT_LABELS: Array<[keyof NonNullable<PicksSurfaceHeaderProps["counts"]>, string]> = [
  ["games", "Games"],
  ["projections", "Projections"],
  ["playerProps", "Player props"],
  ["suggestedCards", "Suggested cards"],
  ["specials", "Specials"],
  ["eligibleLegs", "Eligible legs"],
  ["active", "Active"],
  ["pending", "Pending"],
  ["settled", "Settled"],
];

function fmtSlate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export default function PicksSurfaceHeader({
  title, eyebrow, slateDate, status = "pregame", counts, primaryAction, secondaryAction, note,
}: PicksSurfaceHeaderProps) {
  const s = STATUS_META[status];
  const slateLabel = fmtSlate(slateDate);
  const chips = counts ? COUNT_LABELS.filter(([k]) => typeof counts[k] === "number") : [];

  return (
    <section
      className="gtp-fade-up relative overflow-hidden rounded-2xl px-5 py-5 sm:px-6"
      aria-label={`${title} header`}
      style={{
        borderTop: "2px solid var(--gtp-bank-heat)",
        border: "1px solid var(--vault-border)",
        background:
          "radial-gradient(120% 140% at 0% 0%, rgba(225,29,42,0.10) 0%, transparent 55%)," +
          "linear-gradient(135deg, rgba(26,20,14,0.92) 0%, rgba(26,16,11,0.55) 72%)",
      }}
    >
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10 }}>
          {eyebrow ?? "Parlay Lab"}{slateLabel ? ` · ${slateLabel}` : ""}
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.08em]"
          style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}`, fontSize: 9.5 }}
        >
          <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: s.color }} />
          {s.label}
        </span>
      </div>

      <h1 className="relative mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 26, fontWeight: 800, lineHeight: 1.05 }}>
        {title}
      </h1>

      {note ? (
        <p className="relative mt-1.5 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 720 }}>{note}</p>
      ) : null}

      {chips.length > 0 ? (
        <div className="relative mt-3 flex flex-wrap gap-2">
          {chips.map(([k, label]) => (
            <span key={k} className="inline-flex items-baseline gap-1.5 rounded-[8px] px-2.5 py-1.5"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
              <span className="font-mono font-bold tabular" style={{ color: "var(--vault-text)", fontSize: 14 }}>{counts![k]}</span>
              <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{label}</span>
            </span>
          ))}
        </div>
      ) : null}

      {(primaryAction || secondaryAction) ? (
        <div className="relative mt-4 flex flex-wrap gap-2.5">
          {primaryAction ? (
            <Link href={primaryAction.href} className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.1em]"
              style={{ background: "var(--gtp-bank-heat)", color: "#170f0a", fontWeight: 700, fontSize: 11, textDecoration: "none" }}>
              {primaryAction.label}
            </Link>
          ) : null}
          {secondaryAction ? (
            <Link href={secondaryAction.href} className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.1em]"
              style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>
      ) : null}

      <p className="relative mt-3 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>
        Paper-only · educational · not betting advice
      </p>
    </section>
  );
}
