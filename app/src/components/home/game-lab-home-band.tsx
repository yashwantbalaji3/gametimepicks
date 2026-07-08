/**
 * GameLabHomeBand — the homepage "multi-sport command center" band. Positions Game Lab as the front-door
 * experience (browse any game → a GameTime Picks model report) and gives MLB + World Cup EQUAL visual
 * weight, above the flagship products. Purely presentational: every game is a real fixture already built
 * by `buildAllGameDetails()` (the same data the /games hub + game-detail pages use) — no fetch, no money,
 * no settlement, no fabrication. A sport with no fixtures today renders an HONEST empty state, never a
 * fabricated slate. Paper-only / educational.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import TeamLogo from "@/components/team-logo";

export interface GameLabHomeGame {
  sport: "mlb" | "world_cup";
  slug: string;
  homeTeam: string;
  awayTeam: string;
  homeCode?: string | null;
  awayCode?: string | null;
  /** True when a Game Lab model report exists for this fixture (drives the CTA label honestly). */
  hasReport: boolean;
}

const URL_SPORT: Record<GameLabHomeGame["sport"], string> = { mlb: "mlb", world_cup: "world-cup" };
const dash = (s: string | null | undefined) => (s && String(s).trim() ? String(s) : "—");

function GameCard({ g }: { g: GameLabHomeGame }) {
  const href = `/games/${URL_SPORT[g.sport]}/${g.slug}`;
  return (
    <Link
      href={href}
      className="vault-glow-hover flex items-center gap-2.5 rounded-[10px] px-3 py-2.5"
      style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
    >
      <span className="flex shrink-0 items-center gap-1">
        {g.sport === "world_cup" ? (
          <>
            {g.awayCode ? <FlagBadge code={g.awayCode} size="sm" ariaLabel={g.awayTeam} /> : null}
            {g.homeCode ? <FlagBadge code={g.homeCode} size="sm" ariaLabel={g.homeTeam} /> : null}
          </>
        ) : (
          <>
            <TeamLogo team={g.awayTeam} sport="mlb" size="sm" />
            <TeamLogo team={g.homeTeam} sport="mlb" size="sm" />
          </>
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--vault-text)" }}>
        {dash(g.awayTeam)} <span style={{ color: "var(--vault-text-faint)" }}>@</span> {dash(g.homeTeam)}
      </span>
      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: g.hasReport ? "var(--vault-gold-bright)" : "var(--vault-text-faint)" }}>
        {g.hasReport ? "Model report →" : "View →"}
      </span>
    </Link>
  );
}

function SportColumn({ label, sport, games, emptyNote }: { label: string; sport: string; games: GameLabHomeGame[]; emptyNote: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 15, fontWeight: 800 }}>{label}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>
          {games.length > 0 ? `${games.length} game${games.length === 1 ? "" : "s"}` : "no slate today"}
        </span>
      </div>
      {games.length > 0 ? (
        <div className="flex flex-col gap-1.5">{games.map((g) => <GameCard key={g.slug} g={g} />)}</div>
      ) : (
        <div className="rounded-[10px] px-3 py-4 text-[12px] leading-snug" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
          <span className="font-semibold" style={{ color: "var(--vault-text)" }}>No active model board today.</span>{" "}
          {emptyNote}
        </div>
      )}
      <Link href={`/${sport}`} className="mt-1 inline-flex font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>
        Open {label} hub →
      </Link>
    </div>
  );
}

export default function GameLabHomeBand({ mlb, wc }: { mlb: GameLabHomeGame[]; wc: GameLabHomeGame[] }) {
  return (
    <section className="mt-6 overflow-hidden rounded-2xl px-5 py-5 sm:px-6" aria-label="Game Lab — multi-sport model reports"
      style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(217,164,65,0.06), rgba(26,16,11,0.25))" }}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--vault-gold-bright)" }}>Simulate</span>
        <span className="inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
          style={{ color: "var(--vault-gold-bright)", background: "rgba(217,164,65,0.08)", border: "1px solid var(--vault-gold-bright)" }}>Paper-only · educational</span>
      </div>
      <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px, 4.2vw, 28px)", fontWeight: 800, lineHeight: 1.06 }}>
        Simulate today&rsquo;s games
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 620 }}>
        Pick a game and run the model simulation — precomputed and deterministic, so everyone sees the same
        result. You get the model&rsquo;s picks, confidence, and the deeper report one scroll down. Paper-only.
      </p>
      <Link href="/simulate" className="vault-press mt-3 inline-flex items-center justify-center rounded-full px-6 font-mono text-[12px] font-bold uppercase tracking-[0.1em]"
        style={{ minHeight: 46, color: "#fff", border: "1px solid var(--vault-gold-bright)", background: "var(--vault-gold-bright)", textDecoration: "none" }}>
        Simulate Today&rsquo;s Games →
      </Link>

      {/* MLB + World Cup, EQUAL weight (two columns on desktop, stacked on mobile). */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SportColumn label="MLB" sport="mlb" games={mlb} emptyNote="Game Lab support returns when today's MLB board is posted." />
        <SportColumn label="World Cup" sport="world-cup" games={wc} emptyNote="Game Lab support returns when the next fixtures have projections." />
      </div>

      <p className="mt-3 font-mono text-[10px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Every tracked product settles to official results · paper-only, no real money.
      </p>
    </section>
  );
}
