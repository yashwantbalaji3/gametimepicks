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
import type { HomeGameAnswer } from "@/lib/home/game-answers";

export interface FeaturedSimulationsProps {
  /** The capped featured cards from `featuredSimulations()` (already sliced to <=5). */
  featured: FeaturedSimulation[];
  /** Total ready simulations across the slate (>= featured.length). Drives the honest "+N more" line. */
  readyCount: number;
  /**
   * Sprint 015 · Phase 1 — what each simulation CONCLUDED, keyed by slug, from `buildHomeGameAnswers`.
   * Optional: a card with no entry (or with null fields) renders exactly as it did before, so the homepage
   * degrades to "a simulation exists" rather than inventing an answer.
   */
  answers?: Record<string, HomeGameAnswer>;
}

/**
 * The card's sport, as a value the rest of the UI can use.
 *
 * The artifact writes its own keys ("world_cup"), the logo CDN wants ESPN's ("soccer"), and the
 * label wants a human's ("World Cup"). Deriving all three from ONE place is the point: the card
 * previously hardcoded MLB for both the crest and the label, so when NFL simulations started
 * appearing here every NFL game rendered a broken crest from the MLB logo path AND was labelled
 * "MLB" on the homepage — "Las Vegas Raiders @ Houston Texans · MLB". The crest 404 was the visible
 * half; the wrong sport name beside a real matchup was the half that mattered.
 */
const LOGO_SPORT: Record<string, "mlb" | "nfl" | "nba" | "nhl" | "soccer"> = {
  mlb: "mlb", nfl: "nfl", nba: "nba", nhl: "nhl", world_cup: "soccer", epl: "soccer", soccer: "soccer",
};
const SPORT_LABEL: Record<string, string> = {
  mlb: "MLB", nfl: "NFL", nba: "NBA", nhl: "NHL", world_cup: "World Cup", epl: "Premier League", ufc: "UFC",
};
/* An unknown sport gets its own key upper-cased rather than someone else's name — a card that says
   nothing recognisable is honest; a card that says "MLB" over a football game is not. */
const sportLabelFor = (sport: string) => SPORT_LABEL[sport] ?? sport.replace(/_/g, " ").toUpperCase();

/** Crest: the ESPN-CDN TeamLogo per sport; World Cup uses the real provider logo URL (never fabricated). */
function Crest({ team, abbr, logo, isWc, sport }: { team: string; abbr: string | null; logo: string | null; isWc: boolean; sport: string }) {
  // The CDN resolves abbreviations; `team` may be the sim artifact's full display name. Without an
  // abbr the monogram fallback still renders, so nothing looks broken — but nothing 404s either.
  if (!isWc) return <TeamLogo team={abbr ?? team} sport={LOGO_SPORT[sport] ?? "mlb"} size="sm" ariaLabel={`${team} logo`} />;
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={`${team} crest`} width={24} height={24} style={{ borderRadius: 4, objectFit: "contain" }} />;
  }
  return (
    <span aria-hidden className="inline-flex items-center justify-center rounded" style={{ width: 24, height: 24, fontSize: 9, fontWeight: 800, color: "var(--vault-text-mute)", background: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)", border: "1px solid var(--vault-border)" }}>
      {team.slice(0, 3).toUpperCase()}
    </span>
  );
}

function SimCard({ s, answer }: { s: FeaturedSimulation; answer?: HomeGameAnswer }) {
  const away = s.teams?.away?.trim() || "—";
  const home = s.teams?.home?.trim() || "—";
  const isWc = s.sport === "world_cup";
  const sportLabel = sportLabelFor(s.sport);
  return (
    <Link
      href={s.href}
      className="vault-glow-hover vault-press flex flex-col gap-2.5 rounded-[12px] px-3.5 py-3.5"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)", textDecoration: "none", minHeight: 44 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Crest team={away} abbr={s.teamAbbrs?.away ?? null} logo={s.awayLogo} isWc={isWc} sport={s.sport} />
          <span className="truncate text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>
            {away} <span style={{ color: "var(--vault-text-faint)" }}>{isWc ? "vs" : "@"}</span> {home}
          </span>
          <Crest team={home} abbr={s.teamAbbrs?.home ?? null} logo={s.homeLogo} isWc={isWc} sport={s.sport} />
        </span>
        {/* Honest mode badge: an MLB run-sim reads "Simulation Ready"; a WC card reads "Market-implied". */}
        <span
          className="shrink-0 rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.08em]"
          style={s.mode === "market-implied"
            ? { fontSize: 8.5, fontWeight: 700, color: "var(--vault-gold)", background: "color-mix(in srgb, var(--vault-pending) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-pending) 35%, transparent)" }
            : { fontSize: 8.5, fontWeight: 700, color: "var(--vault-success)", background: "var(--vault-success-dim)", border: "1px solid color-mix(in srgb, var(--gtp-success-on-dark) 35%, transparent)" }}
        >
          {s.mode === "market-implied" ? "Market-implied" : "Simulation Ready"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono" style={{ fontSize: 10.5 }}>
        <span style={{ color: "var(--vault-text-faint)" }}>{sportLabel}</span>
        {s.runCountLabel ? <span style={{ color: "var(--vault-text-mute)" }}>{s.runCountLabel}</span> : null}
        {s.pickCount > 0 ? (
          <span style={{ color: "var(--vault-text-mute)" }}>
            <span style={{ color: "var(--vault-text-mute)", fontWeight: 600 }}>{s.pickCount} market{s.pickCount === 1 ? "" : "s"} simulated</span>
          </span>
        ) : null}
      </div>
      {/* ── What the simulation concluded (Sprint 015 · Phase 1). Each line renders only when the canonical
             objects carried it; a card with no answer keeps its original "a simulation exists" shape. ── */}
      {answer?.prediction || answer?.mostLikelyScore || answer?.story ? (
        <div className="flex flex-col gap-1 rounded-[9px] px-2.5 py-2"
          style={{ background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)" }}>
          {answer.prediction ? (
            <span className="text-[12px]" style={{ color: "var(--vault-text)", fontWeight: 700 }}>{answer.prediction}</span>
          ) : null}
          {answer.frequency ? (
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{answer.frequency}</span>
          ) : null}
          {answer.mostLikelyScore ? (
            <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10.5 }}>
              Most likely: {answer.mostLikelyScore}
            </span>
          ) : null}
          {answer.story ? (
            <span style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.45 }}>{answer.story}</span>
          ) : null}
        </div>
      ) : null}

      <span className="mt-auto inline-flex w-fit items-center rounded-full px-3 py-1 font-mono uppercase tracking-[0.1em]"
        style={{ background: "var(--gtp-bank-lava-cta)", color: "var(--vault-on-accent-deep)", fontSize: 9.5, fontWeight: 700 }}>
        Generate Simulation →
      </span>
    </Link>
  );
}

export default function FeaturedSimulationsSection({ featured, readyCount, answers }: FeaturedSimulationsProps) {
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
              <SimCard key={s.slug} s={s} answer={answers?.[s.slug]} />
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
          style={{ background: "var(--vault-wash-faint)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}
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
