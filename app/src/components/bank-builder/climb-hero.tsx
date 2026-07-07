/**
 * ClimbHero — the flagship "live climb" hero for /bank-builder. PURELY PRESENTATIONAL: it takes the
 * real, already-loaded money + ladder figures as props and renders an exciting, plain-English, mobile-
 * first front door. It NEVER fetches, computes money, picks lanes, or fabricates a result/odds — every
 * number is read from the props the page hands it (daily portfolio + public dual-ladder view models +
 * crown summary). Animation is CSS-only and reduced-motion-safe. Paper-only educational.
 *
 * Mobile (≤ md): Lane A / Lane B render as a CSS-only segmented control (hidden radio inputs + :checked
 * siblings — no JS) so only one lane's full ladder + card shows at a time. ≥ md: both lanes side by side.
 */
import Link from "next/link";
import VerticalLadderClimb from "./vertical-ladder-climb";

// ── Prop shapes (all derived on the page from data ALREADY loaded; never recomputed here) ───────────
/** The official settled result of a CLEARED step — read verbatim from the settlement ledger
 *  (daily-summary.json), never fabricated. Powers the expandable "how this step cleared" detail. */
export interface ClimbClearedDetail {
  date: string;              // e.g. "2026-07-06"
  stake: number;             // actual paper stake in ($100)
  returned: number;          // actual paper return out ($174.23)
  profit: number;            // realized profit (0 while rolled/unrealized)
  combinedOdds: number | null;
  settledStatus: string;     // "settled"
  source: string | null;     // "api_football"
  legs: Array<{ selection: string; market: string | null; officialResult: string | null; result: string }>;
}
export interface ClimbRung {
  step: number;              // 1..5
  startTarget: number;       // ladder target stake (e.g. 100)
  goalTarget: number;        // ladder target return (e.g. 200)
  /** Derived on the page from the public dual-ladder view model — never invented here. */
  status: "completed" | "active" | "awaiting" | "stopped" | "lost" | "upcoming";
  /** For a CLEARED step: the actual official settled detail (expandable). Null when unknown. */
  cleared?: ClimbClearedDetail | null;
}
export interface ClimbLeg {
  selection: string;
  market: string;
  odds: number | null;
  kickoff?: string | null;
  game?: string | null;      // matchup
  why?: string | null;       // one-line rationale if present
  player?: string | null;
}
export interface ClimbLane {
  id: "lane-a" | "lane-b";
  label: string;             // "Lane A" / "Lane B"
  name?: string | null;      // lane thesis name if present
  statusLabel: string;       // human chip label ("Active", "Awaiting a qualified card", …)
  statusTone: "active" | "advanced" | "awaiting" | "completed";
  step: number | null;       // current step #
  cycle?: number | null;     // ladder cycle/run # if available
  stake: number | null;
  combinedOdds: number | null;
  potentialReturn: number | null;
  goalTarget: number | null;
  hasCard: boolean;          // false → polished awaiting state
  rungs: ClimbRung[];
  legs: ClimbLeg[];
  nextKickoff?: string | null;
}
export interface ClimbCompletedLadder {
  start: number;
  final: number;
  recordLabel: string;       // e.g. "5–0"
  pathLabel: string;         // e.g. "$100 → $10,376.17"
}
export interface ClimbHeroProps {
  currentBankroll: number;   // dailyPortfolio.activeBankroll
  peakBankroll: number;      // dailyPortfolio.crownBankroll
  openExposure: number;      // dailyPortfolio.openExposure
  recordLabel: string;       // public record, e.g. "15–7"
  lanes: ClimbLane[];        // Lane A, Lane B (already filtered/derived on the page)
  completedLadders: ClimbCompletedLadder[]; // the banked $100 → $10K ladders (real finals)
}

// ── Formatting (display only) ───────────────────────────────────────────────────────────────────
const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
const american = (o: number | null | undefined) =>
  o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`;
const dash = (s: string | null | undefined) => (s && String(s).trim() ? String(s) : "—");

const TONE_COLOR: Record<ClimbLane["statusTone"], string> = {
  active: "var(--gtp-bank-heat)",
  advanced: "var(--vault-success)",
  awaiting: "var(--vault-gold-bright)",
  completed: "var(--vault-gold-bright)",
};

/** Status chip for a lane (or any pill). */
function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
      style={{ color, background: "rgba(255,255,255,0.05)", border: `1px solid ${color}` }}
    >
      {label}
    </span>
  );
}

export default function ClimbHero({
  currentBankroll,
  peakBankroll,
  openExposure,
  recordLabel,
  lanes,
  completedLadders,
}: ClimbHeroProps) {
  const laneA = lanes.find((l) => l.id === "lane-a") ?? lanes[0] ?? null;
  const laneB = lanes.find((l) => l.id === "lane-b") ?? lanes[1] ?? null;
  // Next kickoff across both lanes (display-only; derived from the legs' kickoff text already in props).
  const nextKickoff =
    [laneA?.nextKickoff, laneB?.nextKickoff].find((k) => k && String(k).trim()) ?? null;

  return (
    <section className="climb-hero gtp-fade-up mb-6 overflow-x-hidden" aria-label="Bank Builder live climb">
      {/* 1 · Plain-English explainer + paper-only badge */}
      <div
        className="relative overflow-hidden rounded-2xl px-5 py-5 sm:px-6"
        style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(242,54,69,0.08), rgba(26,16,11,0.25))" }}
      >
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Chip label="Paper-only · educational" color="var(--vault-gold-bright)" />
        </div>
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: "clamp(20px, 4.4vw, 30px)", fontWeight: 800, lineHeight: 1.06 }}>
          Watch the ladder climb toward $10K
        </h2>
        <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)", maxWidth: 600 }}>
          Bank Builder is a paper-only ladder. Each lane starts at $100 and climbs toward $10K in 5 steps. A step only
          advances after every leg wins.
        </p>
        <p className="mt-1.5 font-mono text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
          paper-only · no real money · each lane independent · a lost step stops that lane · a win rolls the paper return
          into the next step
        </p>
      </div>

      {/* 2 · Current-climb hero — "Where the ladder stands now" */}
      <div className="mt-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)" }}>
          Where the ladder stands now
        </p>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["Current paper bankroll", money(currentBankroll), "var(--risk-low)"],
            ["Peak paper bankroll", money(peakBankroll), "var(--vault-gold-bright)"],
            ["Open exposure (at risk)", money(openExposure), "var(--gtp-bank-heat)"],
          ] as Array<[string, string, string]>).map(([label, value, accent]) => (
            <div
              key={label}
              className="relative flex flex-col gap-1 overflow-hidden rounded-[10px] px-3 py-2.5 min-w-0"
              style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}
            >
              <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
              <span className="font-mono uppercase tracking-[0.12em] truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
                {label}
              </span>
              <span className="font-display tabular truncate" style={{ color: "var(--vault-text)", fontSize: "clamp(16px, 4.6vw, 22px)", fontWeight: 700, lineHeight: 1 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {laneA ? <Chip label={`${laneA.label} · ${laneA.statusLabel}`} color={TONE_COLOR[laneA.statusTone]} /> : null}
          {laneB ? <Chip label={`${laneB.label} · ${laneB.statusLabel}`} color={TONE_COLOR[laneB.statusTone]} /> : null}
          {nextKickoff ? (
            <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
              Next kickoff {nextKickoff}
            </span>
          ) : null}
          <span className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Record {dash(recordLabel)}</span>
        </div>

        <Link
          href="/results"
          className="vault-press mt-3 inline-flex items-center justify-center rounded-full px-5 font-mono text-[11.5px] font-bold uppercase tracking-[0.1em]"
          style={{ minHeight: 44, color: "var(--vault-gold-bright)", border: "1px solid var(--vault-gold-bright)", background: "rgba(217,164,65,0.08)", textDecoration: "none" }}
        >
          Audit Track Record →
        </Link>
      </div>

      {/* 3 + 4 · Lane vertical ladders. Mobile: stacked (Lane A then Lane B). ≥ md: side by side. Each
          ladder is naturally tall + readable, so no horizontal overflow and no cramped text on either. */}
      {laneA || laneB ? (
        <div className="climb-lanes mt-4 flex flex-col gap-3 md:grid md:grid-cols-2 md:items-start">
          {laneA ? <VerticalLadderClimb lane={laneA} /> : null}
          {laneB ? <VerticalLadderClimb lane={laneB} /> : null}
        </div>
      ) : null}

      {/* 5 · Completed-ladder proof (compact) */}
      {completedLadders.length > 0 ? (
        <div
          className="mt-4 rounded-2xl px-5 py-4"
          style={{ border: "1px solid rgba(110,231,168,0.30)", background: "linear-gradient(135deg, rgba(110,231,168,0.07), rgba(26,16,11,0.25))" }}
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-success)" }}>Completed ladders</span>
            <Chip label="Verified · official results" color="var(--vault-success)" />
          </div>
          <div className="flex flex-wrap gap-2">
            {completedLadders.map((l, i) => (
              <span
                key={i}
                className="font-display tabular tracking-tight"
                style={{ color: "var(--vault-text)", fontSize: "clamp(15px, 3.6vw, 19px)", fontWeight: 700 }}
              >
                {money0(l.start)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> {money(l.final)}
                <span className="ml-1.5 font-mono text-[11px]" style={{ color: "var(--vault-success)" }}>{dash(l.recordLabel)}</span>
                {i < completedLadders.length - 1 ? <span className="mx-2" style={{ color: "var(--vault-rule)" }} aria-hidden>·</span> : null}
              </span>
            ))}
          </div>
          <Link href="/results" className="mt-2 inline-flex font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-success)" }}>
            See every receipt →
          </Link>
        </div>
      ) : null}

      {/* 6 · How to read this — COLLAPSED by default (keeps the page simple; expand for the honesty notes) */}
      <details className="mt-3 rounded-2xl px-5 py-4 group" style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.015)" }}>
        <summary className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)", listStyle: "none" }}>
          <span className="transition-transform group-open:rotate-90" aria-hidden>▸</span> How to read this
        </summary>
        <ul className="mt-2 flex flex-col gap-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          <li>· Paper-only picks — no real money is placed.</li>
          <li>· A parlay loses if any one leg loses.</li>
          <li>· The model skips weak slates instead of forcing a card.</li>
          <li>· Official results settle the ladder.</li>
          <li>· Track Record shows every receipt.</li>
        </ul>
      </details>
    </section>
  );
}
