/**
 * TodayMlbBrief — the executive digest at the top of /today that answers "what should I know about MLB
 * today?" It is the daily-intelligence lead: a slate overview (games / simulations ready / awaiting inputs
 * + last-updated), a factual Simulation Spotlight (the richest-analysis game + its widest simulated range),
 * a short "also worth exploring" list by information quality, and links back to yesterday's recap + the
 * trust/learn explanation.
 *
 * Presentational only: it renders the `DailyBrief` the server page derived via buildDailyBrief(...). Every
 * signal is FACTUAL (market counts + simulated p10–p90 ranges) — never a pick, a model difference, or a predicted winner.
 */
import Link from "next/link";
import MatchupIdentity from "@/components/ui/matchup-identity";
import { formatEtTime } from "@/lib/mlb/public-provenance";
import type { DailyBrief, BriefSpotlightGame } from "@/lib/today/daily-brief";

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function rangeLabel(g: BriefSpotlightGame): string | null {
  if (!g.widestRange || !g.widestRangeMarket) return null;
  return `Widest simulated range — ${g.widestRangeMarket}: ${fmtNum(g.widestRange[0])}–${fmtNum(g.widestRange[1])}`;
}

function AttentionRow({ g }: { g: BriefSpotlightGame }) {
  const range = rangeLabel(g);
  return (
    <Link
      href={g.href}
      aria-label={`${g.teams.away} at ${g.teams.home} — ${g.note}${range ? `. ${range}` : ""}`}
      className="vault-glow-hover vault-press flex items-center justify-between gap-3 rounded-[10px] px-3 py-2"
      style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)", textDecoration: "none" }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <MatchupIdentity homeName={g.teams.home} awayName={g.teams.away} homeLogo={g.homeLogo} awayLogo={g.awayLogo} size="sm" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="truncate font-semibold" style={{ color: "var(--vault-text)", fontSize: 12 }}>{g.teams.away} @ {g.teams.home}</span>
          <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{g.note}</span>
        </div>
      </div>
      <span className="font-mono uppercase tracking-[0.1em] whitespace-nowrap shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}>{g.started ? "Review →" : "Open →"}</span>
    </Link>
  );
}

export default function TodayMlbBrief({ brief, recapHref }: { brief: DailyBrief; recapHref?: string | null }) {
  const { overview, spotlight, attention, lastUpdatedIso, gamesInProgress } = brief;
  if (overview.games === 0) return null; // no slate → the slate header / liveness banner already says so
  const updated = formatEtTime(lastUpdatedIso);
  const spotlightRange = spotlight ? rangeLabel(spotlight) : null;
  return (
    <section aria-label="Today's MLB brief" className="flex flex-col gap-3 rounded-[16px] px-5 py-4" style={{ border: "1px solid var(--vault-border)", background: "rgba(26,16,11,0.6)", borderTop: "2px solid var(--vault-gold-bright)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>Today&rsquo;s MLB brief</h2>
          <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>What to know about MLB today</span>
        </div>
        {updated ? <span className="font-mono whitespace-nowrap" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>Updated {updated}</span> : null}
      </div>

      {/* Slate overview — factual counts from the shared availability contract. */}
      <p className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.4 }}>
        {overview.games} {overview.games === 1 ? "game" : "games"} · {overview.simulationsReady} {overview.simulationsReady === 1 ? "simulation" : "simulations"} ready · {overview.awaitingInputs} awaiting inputs
      </p>

      {/* During games — make returning to a preserved pregame simulation clear, without implying a live prediction. */}
      {gamesInProgress > 0 ? (
        <p style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.3 }}>
          {gamesInProgress} {gamesInProgress === 1 ? "game is" : "games are"} underway — the simulations shown are the preserved pregame reads, not live predictions.
        </p>
      ) : null}

      {/* Simulation spotlight — the richest-analysis game + its widest simulated range (factual, not a pick). */}
      {spotlight ? (
        <div className="flex flex-col gap-2 rounded-[12px] px-3.5 py-3" style={{ background: "rgba(0,0,0,0.25)", border: "1px solid var(--vault-border)" }}>
          <div className="flex items-center gap-2">
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}>Simulation spotlight</span>
            {spotlight.started ? (
              <span className="rounded-full px-2 py-0.5 font-mono uppercase tracking-[0.06em]" style={{ fontSize: 8, color: "var(--vault-text-mute)", background: "rgba(255,255,255,0.06)" }}>In progress</span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <MatchupIdentity homeName={spotlight.teams.home} awayName={spotlight.teams.away} homeLogo={spotlight.homeLogo} awayLogo={spotlight.awayLogo} size="md" />
            <Link
              href={spotlight.href}
              aria-label={`${spotlight.started ? "Review" : "Open"} the ${spotlight.teams.away} at ${spotlight.teams.home} simulation`}
              className="vault-press inline-flex items-center rounded-full px-3.5 whitespace-nowrap"
              style={{ minHeight: 34, fontSize: 10, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none", background: "var(--gtp-bank-lava)", color: "#1A0E06" }}
            >
              {spotlight.actionLabel}
            </Link>
          </div>
          <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{spotlight.teams.away} @ {spotlight.teams.home}</span>
          <span style={{ color: "var(--vault-text-mute)", fontSize: 11, lineHeight: 1.35 }}>
            Richest analysis on the slate — {spotlight.note}.{spotlightRange ? ` ${spotlightRange}.` : ""}
          </span>
        </div>
      ) : (
        <p className="rounded-lg px-3 py-2 text-[11px]" style={{ border: "1px dashed var(--vault-border)", color: "var(--vault-text-mute)" }}>
          No simulation is ready for this slate yet — the brief fills in as simulations generate. Never faked.
        </p>
      )}

      {/* Matchup attention — the next games by information quality (a display order, not a ranking claim). */}
      {attention.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>Also worth exploring</span>
          {attention.map((g) => (
            <AttentionRow key={g.slug} g={g} />
          ))}
        </div>
      ) : null}

      {/* Yesterday connection + trust link. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
        {recapHref ? (
          <Link href={recapHref} className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5, textDecoration: "none" }}>Yesterday&rsquo;s results →</Link>
        ) : null}
        <Link href="/learn" className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5, textDecoration: "none" }}>How simulations &amp; uncertainty work →</Link>
      </div>
    </section>
  );
}
