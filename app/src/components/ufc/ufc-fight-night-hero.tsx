/**
 * UfcFightNightHero — an ORIGINAL octagon/cage fight-night banner for the UFC simulator. Pure inline
 * SVG + CSS with app design tokens: no UFC/brand logos, no fighter photos, no external images. Announces
 * the market-implied simulator honestly — a market read, never a locked-in pick. Server-renderable (no hooks).
 */
function initials(name?: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "—";
}

export default function UfcFightNightHero({
  eventName, eventDate, venue, fightCount, oddsCount, gradedRows, gradedTarget, headliners,
}: {
  eventName: string;
  eventDate?: string;
  venue?: string;
  fightCount: number;
  oddsCount: number;
  gradedRows: number;
  gradedTarget: number;
  headliners?: [string, string] | null;
}) {
  const dateLabel = (() => {
    if (!eventDate) return null;
    try { return new Date(eventDate).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }); }
    catch { return eventDate; }
  })();
  const [a, b] = headliners ?? ["", ""];
  return (
    <section
      className="relative overflow-hidden rounded-[16px] px-5 py-6 sm:px-8 sm:py-8"
      style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(120% 140% at 50% 0%, rgba(242,54,69,0.16) 0%, transparent 55%), linear-gradient(160deg, rgba(18,12,10,0.96) 0%, rgba(26,16,11,0.98) 100%)" }}
      aria-label={`${eventName} — market-implied fight simulator`}
    >
      {/* Cage grid + octagon — original vector art, no brand assets. */}
      <svg aria-hidden viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" style={{ opacity: 0.18 }}>
        <defs>
          <pattern id="ufc-cage" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0H22V22" fill="none" stroke="var(--vault-gold-bright)" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="400" height="200" fill="url(#ufc-cage)" />
        <polygon points="200,26 286,72 286,150 200,196 114,150 114,72" fill="none" stroke="var(--vault-gold-bright)" strokeWidth="1.4" opacity="0.65" />
        <polygon points="200,54 262,86 262,142 200,174 138,142 138,86" fill="none" stroke="var(--vault-gold-bright)" strokeWidth="0.8" opacity="0.4" />
      </svg>

      <div className="relative flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.14em]" style={{ background: "rgba(46,160,102,0.16)", border: "1px solid rgba(46,160,102,0.42)", color: "var(--gtp-success-on-dark, #7ee2a8)", fontSize: 9 }}>
            <span aria-hidden>▶</span> Market-implied preview · not a model
          </span>
          <span className="font-mono uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>UFC Fight Simulator</span>
        </div>

        <div className="flex items-center justify-center gap-4 sm:gap-8">
          <FighterColumn name={a} align="right" />
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="inline-flex items-center justify-center rounded-full font-display" style={{ width: 44, height: 44, border: "1.5px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", fontSize: 13, fontWeight: 800, background: "rgba(242,54,69,0.10)" }}>VS</span>
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>Main event</span>
          </div>
          <FighterColumn name={b} align="left" />
        </div>

        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px,4vw,30px)", fontWeight: 800, lineHeight: 1.05 }}>{eventName}</h1>
          <p className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>
            {[dateLabel, venue].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Chip label={`${fightCount} fights`} />
          <Chip label={`${oddsCount} odds-backed sims`} tone="live" />
          <Chip label={`Validation ${gradedRows}/${gradedTarget}`} tone="gated" />
          <Chip label="Props · provider-needed" />
        </div>
      </div>
    </section>
  );
}

function FighterColumn({ name, align }: { name: string; align: "left" | "right" }) {
  if (!name) return <span className="min-w-0 flex-1" />;
  return (
    <span className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 ${align === "right" ? "sm:items-end" : "sm:items-start"}`}>
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: 46, height: 46, background: "rgba(242,54,69,0.16)", border: "1px solid var(--lava-border-strong, rgba(242,54,69,0.4))", color: "var(--gtp-bank-heat, #f23645)", fontSize: 16, fontWeight: 800 }} role="img" aria-label={name}>
        {initials(name)}
      </span>
      <span className="truncate text-center font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5, maxWidth: 130 }}>{name}</span>
    </span>
  );
}

function Chip({ label, tone }: { label: string; tone?: "live" | "gated" }) {
  const style =
    tone === "live" ? { c: "var(--gtp-success-on-dark, #7ee2a8)", bg: "rgba(46,160,102,0.14)", b: "rgba(46,160,102,0.4)" }
      : tone === "gated" ? { c: "var(--vault-gold-bright)", bg: "rgba(217,164,65,0.12)", b: "rgba(217,164,65,0.4)" }
        : { c: "var(--vault-text-mute)", bg: "rgba(26,16,11,0.6)", b: "var(--vault-rule)" };
  return (
    <span className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.1em]" style={{ color: style.c, background: style.bg, border: `1px solid ${style.b}`, fontSize: 9 }}>{label}</span>
  );
}
