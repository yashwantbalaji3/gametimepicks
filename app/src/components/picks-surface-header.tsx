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
  /** Override the status pill's label while keeping its tone. Used when a derived signature
   *  state carries a more specific truth than the generic status word — e.g. a stale lane is
   *  "Not published today", which says more than "Data pending". */
  statusLabel?: string;
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
  title, eyebrow, slateDate, status = "pregame", counts, primaryAction, secondaryAction, note, statusLabel,
}: PicksSurfaceHeaderProps) {
  const s = STATUS_META[status];
  const slateLabel = fmtSlate(slateDate);
  const chips = counts ? COUNT_LABELS.filter(([k]) => typeof counts[k] === "number") : [];

  // Shares the sport-hub hero's cinematic backdrop (gtp-cinematic-bg-accent + halo + neon rule) so
  // /picks, /build and /moonshot read as the same product family as /world-cup, /mlb, /nba, /ufc.
  const accentColor = "var(--gtp-bank-heat)";
  return (
    <section
      className="gtp-fade-up relative overflow-hidden rounded-[14px] gtp-cinematic-bg-accent gtp-neon-rule"
      aria-label={`${title} header`}
      style={{ padding: "22px 20px 24px", ["--accent-glow"]: "rgba(52, 211, 153, 0.18)", ["--accent-glow-secondary"]: "rgba(52, 211, 153, 0.10)" } as React.CSSProperties}
    >
      <div aria-hidden className="gtp-hero-halo" style={{ background: "radial-gradient(circle at 92% 0%, rgba(52, 211, 153, 0.26), transparent 45%)" }} />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse" style={{ background: accentColor, boxShadow: `0 0 10px ${accentColor}` }} />
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: accentColor, fontSize: 10 }}>
            {eyebrow ?? "Parlay Lab"}{slateLabel ? ` · ${slateLabel}` : ""}
          </span>
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.08em]"
          style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}`, fontSize: 9.5 }}
        >
          <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: s.color }} />
          {statusLabel ?? s.label}
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
