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
import FlagBadge from "@/components/flag-badge";
import PlayerAvatar from "@/components/ui/player-avatar";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";

// ── Prop shapes (all derived on the page from data ALREADY loaded; never recomputed here) ───────────
export interface ClimbRung {
  step: number;              // 1..5
  startTarget: number;       // ladder target stake (e.g. 100)
  goalTarget: number;        // ladder target return (e.g. 200)
  /** Derived on the page from the public dual-ladder view model — never invented here. */
  status: "completed" | "active" | "awaiting" | "stopped" | "lost" | "upcoming";
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

const RUNG_META: Record<
  ClimbRung["status"],
  { label: string; color: string; bg: string; border: string; pulse?: boolean; fill?: boolean }
> = {
  completed: { label: "Cleared", color: "var(--vault-success)", bg: "rgba(110,231,168,0.12)", border: "rgba(110,231,168,0.4)", fill: true },
  active: { label: "Active", color: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)", border: "rgba(242,54,69,0.4)", pulse: true },
  awaiting: { label: "Awaiting", color: "var(--vault-gold-bright)", bg: "rgba(217,164,65,0.12)", border: "rgba(217,164,65,0.4)" },
  stopped: { label: "Stopped", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.03)", border: "var(--vault-rule)" },
  lost: { label: "Reset", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.03)", border: "var(--vault-rule)" },
  upcoming: { label: "Upcoming", color: "var(--vault-text-faint)", bg: "rgba(255,255,255,0.03)", border: "var(--vault-rule)" },
};

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

/** A single climb rung node — its step, the $start → $goal it climbs, and its status. The ACTIVE rung
 *  ("you are here") is visually dominant (wider, ring-glow); cleared rungs fill green; future rungs sit
 *  muted. This is the ladder's centerpiece, so the current position always reads at a glance. */
function RungNode({ rung }: { rung: ClimbRung }) {
  const m = RUNG_META[rung.status];
  const isCompleted = rung.status === "completed";
  const isActive = rung.status === "active";
  return (
    <div
      className="climb-rung flex shrink-0 flex-col items-center gap-1 rounded-[12px] px-2.5 py-2.5"
      style={{
        minWidth: isActive ? 82 : 66,
        minHeight: 68,
        background: m.fill ? m.bg : "rgba(255,255,255,0.02)",
        border: `1px solid ${m.border}`,
        boxShadow: isActive ? `0 0 0 1px ${m.color}55, 0 6px 22px -14px ${m.color}` : "none",
        transform: isActive ? "scale(1.03)" : "none",
      }}
      data-status={rung.status}
    >
      <span
        className={`flex items-center justify-center rounded-full font-mono font-bold ${m.pulse ? "climb-rung-pulse" : ""}`}
        style={{ height: isActive ? 28 : 22, width: isActive ? 28 : 22, fontSize: isActive ? 13 : 11, color: m.color, background: m.bg, border: `1px solid ${m.border}` }}
        aria-hidden
      >
        {isCompleted ? "✓" : rung.step}
      </span>
      <span className="font-display tabular font-bold leading-none" style={{ color: "var(--vault-text)", fontSize: isActive ? 14 : 12 }}>
        {money0(rung.goalTarget)}
      </span>
      <span className="font-mono leading-none" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>
        from {money0(rung.startTarget)}
      </span>
      <span className="font-mono uppercase tracking-[0.06em] leading-none" style={{ color: m.color, fontSize: 8.5 }}>
        {m.label}
      </span>
    </div>
  );
}

/** The horizontal 5-rung ladder for one lane (scrolls horizontally only if it overflows). */
function RungLadder({ rungs }: { rungs: ClimbRung[] }) {
  return (
    <div className="climb-ladder-scroll -mx-1 overflow-x-auto px-1 pb-1">
      <div
        className="flex items-stretch gap-1.5"
        role="img"
        aria-label={`5-step climb: ${rungs.map((r) => `step ${r.step} ${RUNG_META[r.status].label}`).join(", ")}`}
      >
        {rungs.map((r, i) => (
          <div key={r.step} className="flex items-center gap-1.5">
            <RungNode rung={r} />
            {i < rungs.length - 1 ? (
              <span aria-hidden className="h-px w-2 shrink-0" style={{ background: "var(--vault-rule)" }} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Per-leg avatar — a country flag for a World Cup team/game market, a player portrait for a prop leg.
 *  Both primitives degrade gracefully (unknown code → monogram, no photo → initials, nothing → ⚽ chip),
 *  so a leg can NEVER break the row or fabricate a mark. Mirrors the shared product-lanes-ladder avatar. */
function LegAvatar({ leg }: { leg: ClimbLeg }) {
  if (leg.player && String(leg.player).trim()) return <PlayerAvatar name={leg.player} size={22} />;
  const [home, away] = String(leg.game ?? "").split(/\s+vs\s+/i).map((s) => s.trim());
  // Prefer the SPECIFIC team the selection names ("Argentina to win" → Argentina, "Colombia or Draw" →
  // Colombia) so a single-team pick shows a single flag; fall back to the raw selection code.
  const sel = String(leg.selection ?? "");
  const named = [home, away].find((t) => t && sel.toLowerCase().includes(t.toLowerCase()));
  const selCode = wcTeamCodeFromName(named) ?? wcTeamCodeFromName(sel);
  if (selCode) return <FlagBadge code={selCode} size="md" ariaLabel={leg.selection} />;
  const homeCode = wcTeamCodeFromName(home);
  const awayCode = wcTeamCodeFromName(away);
  if (homeCode || awayCode) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {homeCode ? <FlagBadge code={homeCode} size="md" ariaLabel={home ?? ""} /> : null}
        {awayCode ? <FlagBadge code={awayCode} size="md" ariaLabel={away ?? ""} /> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[12px]"
      style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--vault-border)" }} aria-hidden>⚽</span>
  );
}

/** A single leg row inside a lane card. Every field guarded with "—" — never undefined/NaN. Leads with the
 *  team flag / player portrait so the card reads like a premium ticket, not a text list. */
function LegRow({ leg }: { leg: ClimbLeg }) {
  const sub = [leg.market, leg.game].filter((s) => s && String(s).trim()).join(" · ");
  const meta = [leg.kickoff ? `Kickoff ${leg.kickoff}` : null].filter(Boolean).join(" · ");
  return (
    <li
      className="flex items-start gap-2.5 rounded-[10px] px-3 py-2.5"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--vault-rule)" }}
    >
      <span className="mt-0.5 shrink-0"><LegAvatar leg={leg} /></span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>
          {dash(leg.player ?? leg.selection)}
        </span>
        <span className="block truncate font-mono text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>
          {dash(sub)}
        </span>
        {meta ? (
          <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>
            {meta}
          </span>
        ) : null}
        {leg.why && String(leg.why).trim() ? (
          <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            {leg.why}
          </span>
        ) : null}
      </div>
      <span className="shrink-0 font-mono text-[13px] font-bold" style={{ color: "var(--vault-gold-bright)" }}>
        {american(leg.odds)}
      </span>
    </li>
  );
}

/** The full Lane card (status, money, rung ladder, leg list / awaiting state). */
function LaneCard({ lane }: { lane: ClimbLane }) {
  const tone = TONE_COLOR[lane.statusTone];
  const profit =
    lane.potentialReturn != null && lane.stake != null && Number.isFinite(lane.potentialReturn) && Number.isFinite(lane.stake)
      ? lane.potentialReturn - lane.stake
      : null;
  const stepLabel = lane.step != null ? `Step ${lane.step} of 5` : "—";
  const isActive = lane.hasCard;
  return (
    <div
      className="flex flex-col rounded-2xl p-4"
      style={{
        background: isActive
          ? `linear-gradient(180deg, ${tone}14, rgba(255,255,255,0.02) 42%)`
          : "rgba(255,255,255,0.02)",
        border: `1px solid ${isActive ? tone + "55" : "var(--vault-border)"}`,
        borderTop: `3px solid ${tone}`,
        boxShadow: isActive ? `0 0 0 1px ${tone}22, 0 8px 30px -18px ${tone}` : "none",
      }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
          {lane.label}
        </h3>
        <Chip label={lane.statusLabel} color={tone} />
      </div>
      <p className="mb-2 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        {[stepLabel, lane.cycle != null ? `Cycle ${lane.cycle}` : null, lane.name].filter(Boolean).join(" · ")}
      </p>

      {/* 5-rung climb */}
      <RungLadder rungs={lane.rungs} />

      {/* Money row — Stake / To win / Profit / Goal (each guarded). */}
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {([
          ["Stake", money(lane.stake), "var(--vault-text)"],
          ["To win", money(lane.potentialReturn), "var(--vault-gold-bright)"],
          ["Profit", profit != null ? `+${money(profit)}` : "—", "var(--vault-success)"],
          ["Goal", money0(lane.goalTarget), "var(--vault-text-mute)"],
        ] as Array<[string, string, string]>).map(([k, v, c]) => (
          <div key={k} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
            <div className="font-mono tabular font-bold leading-tight" style={{ color: c, fontSize: 13 }}>{v}</div>
            <div className="mt-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{k}</div>
          </div>
        ))}
      </div>

      {/* Combined odds line. */}
      <p className="mt-2 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        Combined {american(lane.combinedOdds)}
        {lane.nextKickoff ? ` · next kickoff ${lane.nextKickoff}` : ""}
      </p>

      {/* Legs OR a polished awaiting state — never undefined. */}
      {lane.hasCard && lane.legs.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {lane.legs.map((leg, i) => (
            <LegRow key={`${lane.id}:${i}`} leg={leg} />
          ))}
        </ul>
      ) : (
        <div
          className="mt-2 rounded-[10px] px-3 py-3 text-[12px] leading-snug"
          style={{ background: "rgba(217,164,65,0.06)", border: "1px solid rgba(217,164,65,0.25)", color: "var(--vault-text-mute)" }}
        >
          <span className="font-semibold" style={{ color: "var(--vault-gold-bright)" }}>Model pass — holding for a stronger slate.</span>{" "}
          No edge today, so the ladder waits rather than force a weak card. A pass protects the seed; the lane
          re-arms the moment a qualified card appears.
        </div>
      )}
      <p className="mt-2 font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only · pending official settlement.
      </p>
    </div>
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

      {/* 3 + 4 · Lane ladders + cards. Mobile (≤ md): CSS-only tabs (one lane at a time). ≥ md: side by side. */}
      {laneA || laneB ? (
        <div className="climb-lanes mt-4">
          {/* Mobile tabs (hidden radios drive :checked visibility). */}
          <div className="climb-tabs md:hidden">
            {laneA ? <input type="radio" name="climb-lane" id="climb-tab-a" defaultChecked className="climb-tab-input"
                style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }} /> : null}
            {laneB ? <input type="radio" name="climb-lane" id="climb-tab-b" className="climb-tab-input"
                style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }} /> : null}
            <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-full p-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-rule)" }}>
              {laneA ? (
                <label htmlFor="climb-tab-a" className="climb-tab-label flex items-center justify-center rounded-full font-mono text-[11px] font-bold uppercase tracking-[0.08em]" style={{ minHeight: 40, color: "var(--vault-text-mute)", cursor: "pointer" }}>
                  {laneA.label}
                </label>
              ) : null}
              {laneB ? (
                <label htmlFor="climb-tab-b" className="climb-tab-label flex items-center justify-center rounded-full font-mono text-[11px] font-bold uppercase tracking-[0.08em]" style={{ minHeight: 40, color: "var(--vault-text-mute)", cursor: "pointer" }}>
                  {laneB.label}
                </label>
              ) : null}
            </div>
            {laneA ? <div className="climb-pane climb-pane-a">{<LaneCard lane={laneA} />}</div> : null}
            {laneB ? <div className="climb-pane climb-pane-b">{<LaneCard lane={laneB} />}</div> : null}
          </div>

          {/* Desktop: both lanes side by side. */}
          <div className="hidden gap-3 md:grid md:grid-cols-2">
            {laneA ? <LaneCard lane={laneA} /> : null}
            {laneB ? <LaneCard lane={laneB} /> : null}
          </div>
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

      {/* 6 · How to read this (concise honesty) */}
      <div className="mt-3 rounded-2xl px-5 py-4" style={{ border: "1px solid var(--vault-border)", background: "rgba(255,255,255,0.015)" }}>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-faint)" }}>How to read this</span>
        <ul className="mt-2 flex flex-col gap-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
          <li>· Paper-only picks — no real money is placed.</li>
          <li>· A parlay loses if any one leg loses.</li>
          <li>· The model skips weak slates instead of forcing a card.</li>
          <li>· Official results settle the ladder.</li>
          <li>· Track Record shows every receipt.</li>
        </ul>
      </div>
    </section>
  );
}
