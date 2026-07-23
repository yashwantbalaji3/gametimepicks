/**
 * FeaturedSimulationsSection — Section 3 of `/`. Renders 3–5 sim-ready games straight from the
 * `featuredSimulations()` selector (real ready artifacts ONLY — nothing fabricated). Each card links to
 * the game's own page where "Generate Simulation" lives. When no game is ready it shows an honest
 * unavailable state with a link to /today. Purely presentational: it receives the already-selected
 * `FeaturedSimulation[]` + `readyCount` as props and reads no data. Vault tokens, mobile-first.
 */
import Link from "next/link";
import TeamLogo from "@/components/team-logo";
import type { FeaturedSimulation } from "@/lib/simulate-lobby-featured";

export interface FeaturedSimulationsProps {
  /** The capped featured cards from `featuredSimulations()` (already sliced to <=5). */
  featured: FeaturedSimulation[];
  /** Total ready simulations across the slate (>= featured.length). Drives the honest "+N more" line. */
  readyCount: number;
}

/** Crest: MLB uses the ESPN-CDN TeamLogo; World Cup uses the real provider logo URL (never fabricated). */
function Crest({ team, logo, isWc }: { team: string; logo: string | null; isWc: boolean }) {
  if (!isWc) return <TeamLogo team={team} sport="mlb" size="sm" />;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={`${team} crest`} width={24} height={24} style={{ borderRadius: 4, objectFit: "contain" }} />;
  }
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded" style={{ width: 24, height: 24, fontSize: 9, fontWeight: 800, color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-border)" }}>
      {team.slice(0, 3).toUpperCase()}
    </span>
  );
}

function SimCard({ s }: { s: FeaturedSimulation }) {
  const away = s.teams?.away?.trim() || "—";
  const home = s.teams?.home?.trim() || "—";
  const isWc = s.sport === "world_cup";
  const sportLabel = isWc ? "World Cup" : "MLB";
  return (
    <Link
      href={s.href}
      className="vault-glow-hover vault-press flex flex-col gap-2.5 rounded-[12px] px-3.5 py-3.5"
      style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", textDecoration: "none", minHeight: 44 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Crest team={away} logo={s.awayLogo} isWc={isWc} />
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>
            {away} <span style={{ color: "var(--vault-text-faint)" }}>{isWc ? "vs" : "@"}</span> {home}
          </span>
          <Crest team={home} logo={s.homeLogo} isWc={isWc} />
        </span>
        {/* Honest mode badge: an MLB run-sim reads "Simulation Ready"; a WC card reads "Market-implied". */}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]"
          style={s.mode === "market-implied"
            ? { fontSize: 8.5, fontWeight: 700, color: "var(--vault-gold)", background: "rgba(234,179,8,0.10)", border: "1px solid rgba(234,179,8,0.35)" }
            : { fontSize: 8.5, fontWeight: 700, color: "var(--vault-success)", background: "var(--vault-success-dim)", border: "1px solid rgba(110,231,168,0.35)" }}
        >
          {s.mode === "market-implied" ? "Market-implied" : "Simulation Ready"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono" style={{ fontSize: 10.5 }}>
        <span style={{ color: "var(--vault-text-faint)" }}>{sportLabel}</span>
        {s.runCountLabel ? <span style={{ color: "var(--vault-text-mute)" }}>{s.runCountLabel}</span> : null}
        {s.pickCount > 0 ? (
          <span style={{ color: "var(--vault-text-mute)" }}>
            top lean <span style={{ color: "var(--vault-gold-bright)", fontWeight: 700 }}>+{s.topEdgePct.toFixed(1)}% model gap</span>
          </span>
        ) : null}
      </div>
      <span className="mt-auto inline-flex w-fit items-center rounded-full px-3 py-1 font-mono uppercase tracking-[0.1em]"
        style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 9.5, fontWeight: 700 }}>
        Generate Simulation →
      </span>
    </Link>
  );
}

export default function FeaturedSimulationsSection({ featured, readyCount }: FeaturedSimulationsProps) {
  const hasFeatured = readyCount > 0 && featured.length > 0;
  return (
    <section aria-label="Featured simulations" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>
          Featured simulations
        </h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>
          Paper-only · educational
        </span>
      </div>

      {hasFeatured ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {featured.map((s) => (
              <SimCard key={s.slug} s={s} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {readyCount > featured.length ? (
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
                +{readyCount - featured.length} more simulation-ready below
              </span>
            ) : null}
            <Link href="/simulate" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>
              Open the simulation lobby →
            </Link>
          </div>
        </>
      ) : (
        <div
          className="rounded-[12px] px-4 py-5 text-[13px] leading-snug"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}
        >
          <span className="font-semibold" style={{ color: "var(--vault-text)" }}>No simulation-ready games right now.</span>{" "}
          Simulations return when the next slate&rsquo;s model artifacts are posted.{" "}
          <Link href="/today" className="underline" style={{ color: "var(--vault-gold-bright)" }}>
            See today&rsquo;s picks →
          </Link>
        </div>
      )}
    </section>
  );
}
