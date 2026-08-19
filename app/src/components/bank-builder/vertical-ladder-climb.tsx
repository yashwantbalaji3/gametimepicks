/**
 * VerticalLadderClimb — the flagship Bank Builder ladder as a PREMIUM VERTICAL CLIMB. Rungs stack
 * bottom→top toward the $10K crown: cleared rungs sit below (green ✓), the current rung glows with the
 * active card's legs attached, upcoming rungs sit above (dimmed). A gradient spine runs the height; the
 * active node pulses. Purely presentational — every figure is read from the `ClimbLane` the page hands it
 * (never fetched/computed/fabricated). All animation is CSS-only and reduced-motion-safe (globals.css
 * guards). Works for the live 5-step lane; a `preview` variant renders the dimmed/dashed 7-step future
 * ladder (no active card) so it can never be confused with live.
 */
import type { ClimbLane, ClimbLeg, ClimbRung } from "./climb-hero";
import FlagBadge from "@/components/flag-badge";
import { PlayerPortrait } from "@/components/entity";
import { wcTeamCodeFromName } from "@/lib/data-world-cup";

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;
const american = (o: number | null | undefined) =>
  o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`;
const dash = (s: string | null | undefined) => (s && String(s).trim() ? String(s) : "—");

const RUNG: Record<ClimbRung["status"], { label: string; color: string; ring: string; fill: string }> = {
  completed: { label: "Cleared", color: "var(--vault-success)", ring: "color-mix(in srgb, var(--vault-accent-mint-deep) 50%, transparent)", fill: "color-mix(in srgb, var(--vault-accent-mint-deep) 12%, transparent)" },
  active:    { label: "You are here", color: "var(--gtp-bank-heat)", ring: "color-mix(in srgb, var(--vault-accent) 60%, transparent)", fill: "var(--gtp-bank-heat-dim)" },
  awaiting:  { label: "Awaiting", color: "var(--vault-gold-bright)", ring: "color-mix(in srgb, var(--vault-crown) 50%, transparent)", fill: "color-mix(in srgb, var(--vault-crown) 10%, transparent)" },
  upcoming:  { label: "Upcoming", color: "var(--vault-text-faint)", ring: "var(--vault-rule)", fill: "color-mix(in srgb, var(--vault-wash-base) 2%, transparent)" },
  stopped:   { label: "Stopped", color: "var(--vault-text-faint)", ring: "var(--vault-rule)", fill: "color-mix(in srgb, var(--vault-wash-base) 2%, transparent)" },
  lost:      { label: "Reset", color: "var(--vault-text-faint)", ring: "var(--vault-rule)", fill: "color-mix(in srgb, var(--vault-wash-base) 2%, transparent)" },
};
const TONE: Record<ClimbLane["statusTone"], string> = {
  active: "var(--gtp-bank-heat)", advanced: "var(--vault-success)", awaiting: "var(--vault-gold-bright)", completed: "var(--vault-gold-bright)",
};

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em]"
      style={{ color, background: "color-mix(in srgb, var(--vault-wash-base) 5%, transparent)", border: `1px solid ${color}` }}>{label}</span>
  );
}

/** A team flag (or player portrait / ⚽ fallback) for a leg — never a broken or fabricated mark. */
function LegAvatar({ leg }: { leg: ClimbLeg }) {
  if (leg.player && String(leg.player).trim()) return <PlayerPortrait name={String(leg.player)} size="xs" />;
  const [home, away] = String(leg.game ?? "").split(/\s+vs\s+/i).map((s) => s.trim());
  const sel = String(leg.selection ?? "");
  const named = [home, away].find((t) => t && sel.toLowerCase().includes(t.toLowerCase()));
  const code = wcTeamCodeFromName(named) ?? wcTeamCodeFromName(sel);
  if (code) return <FlagBadge code={code} size="md" ariaLabel={sel} />;
  const hc = wcTeamCodeFromName(home), ac = wcTeamCodeFromName(away);
  if (hc || ac) return <span className="inline-flex items-center gap-0.5">{hc ? <FlagBadge code={hc} size="md" ariaLabel={home ?? ""} /> : null}{ac ? <FlagBadge code={ac} size="md" ariaLabel={away ?? ""} /> : null}</span>;
  return <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[12px]" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 6%, transparent)", border: "1px solid var(--vault-border)" }} aria-hidden>⚽</span>;
}

const pct = (p: number | null | undefined) => (p == null || !Number.isFinite(p) ? null : `${Math.round(p * 100)}%`);
const cap = (s: string | null | undefined) => (s && String(s).trim() ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "");

function LegRow({ leg }: { leg: ClimbLeg }) {
  // Pick line: "Over 5.5" when the artifact carries side + line (review legs), else nothing extra.
  const sideLine = [cap(leg.side), leg.line != null && Number.isFinite(leg.line) ? String(leg.line) : ""].filter(Boolean).join(" ");
  const sub = [leg.market, sideLine, leg.game].filter((s) => s && String(s).trim()).join(" · ");
  const model = pct(leg.modelProb);
  const market = pct(leg.marketProb);
  const hasRead = model != null || market != null;
  return (
    <li className="flex items-start gap-2.5 rounded-[10px] px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 3%, transparent)", border: "1px solid var(--vault-rule)" }}>
      <span className="mt-0.5 shrink-0"><LegAvatar leg={leg} /></span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>{dash(leg.player ?? leg.selection)}</span>
        <span className="block truncate font-mono text-[10.5px]" style={{ color: "var(--vault-text-mute)" }}>{dash(sub)}</span>
        {hasRead ? (
          <span className="mt-0.5 block font-mono text-[10px]" style={{ color: "var(--vault-text-mute)" }}>
            {model ? <>Model <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{model}</span></> : null}
            {model && market ? " · " : null}
            {market ? <>Market <span style={{ color: "var(--vault-text)", fontWeight: 700 }}>{market}</span></> : null}
          </span>
        ) : null}
        {leg.kickoff ? <span className="block font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>Kickoff {leg.kickoff}</span> : null}
      </div>
      <span className="shrink-0 font-mono text-[13px] font-bold" style={{ color: "var(--vault-gold-bright)" }}>{american(leg.odds)}</span>
    </li>
  );
}

/** One rung on the vertical spine: a node (centered on the rail) + its content. The CURRENT rung (the one
 *  carrying today's card — identified by step, not a status string) is the glowing "you are here" and its
 *  card legs attach to it; rungs below it read cleared, rungs above read upcoming. */
function RungRow({ rung, legs, isCurrent, isReview }: { rung: ClimbRung; legs: ClimbLeg[]; isCurrent: boolean; isReview?: boolean }) {
  // A review card's current rung uses the gold "paper review" palette (never the red live-money heat).
  const REVIEW = { label: "Review · Paper $0", color: "var(--vault-gold-bright)", ring: "color-mix(in srgb, var(--vault-crown) 55%, transparent)", fill: "color-mix(in srgb, var(--vault-crown) 10%, transparent)" };
  const m = isCurrent ? (isReview ? REVIEW : RUNG.active) : RUNG[rung.status];
  const isActive = isCurrent;
  const glow = isReview ? "color-mix(in srgb, var(--vault-crown) 50%, transparent)" : "color-mix(in srgb, var(--vault-accent) 50%, transparent)";
  const isCleared = rung.status === "completed" && !isCurrent;
  return (
    <div className="relative flex gap-3 pb-3 last:pb-0">
      {/* node on the spine */}
      <span className="relative z-[1] mt-0.5 flex shrink-0 items-start" style={{ width: 32 }}>
        <span
          className={`flex items-center justify-center rounded-full font-mono font-bold ${isActive ? "gtp-active-glow climb-rung-pulse" : ""}`}
          style={{
            height: isActive ? 32 : 26, width: isActive ? 32 : 26,
            fontSize: isActive ? 13 : 11, color: m.color, background: m.fill,
            border: `1.5px solid ${m.ring}`,
            ["--gtp-glow" as any]: isActive ? glow : undefined,
          }}
          aria-hidden
        >
          {isCleared ? "✓" : rung.step}
        </span>
      </span>
      {/* content */}
      <div className={`min-w-0 flex-1 rounded-[12px] px-3 py-2.5 ${isActive ? "" : ""}`}
        style={{ background: m.fill, border: `1px solid ${isActive ? m.ring : "var(--vault-rule)"}`,
          boxShadow: isActive ? `0 6px 24px -16px ${m.color}` : "none" }}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display tabular font-bold leading-none" style={{ color: "var(--vault-text)", fontSize: isActive ? 17 : 14 }}>
            {money0(rung.goalTarget)}
          </span>
          <span className="font-mono uppercase tracking-[0.06em]" style={{ color: m.color, fontSize: 8.5 }}>{m.label}</span>
        </div>
        <span className="mt-0.5 block font-mono text-[9px]" style={{ color: "var(--vault-text-faint)" }}>
          Step {rung.step} · from {money0(rung.startTarget)}
        </span>
        {isActive && legs.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5">{legs.map((leg, i) => <LegRow key={i} leg={leg} />)}</ul>
        ) : null}
        {isCleared && rung.cleared ? (
          <details className="mt-2 group">
            <summary className="flex cursor-pointer items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em]" style={{ color: "var(--vault-success)", listStyle: "none" }}>
              <span className="transition-transform group-open:rotate-90" aria-hidden>▸</span>
              How Step {rung.step} cleared · {rung.cleared.date}
            </summary>
            <div className="mt-2 rounded-[10px] px-3 py-2.5" style={{ background: "color-mix(in srgb, var(--vault-accent-mint-deep) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-accent-mint-deep) 25%, transparent)" }}>
              <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-display tabular font-bold" style={{ color: "var(--vault-text)", fontSize: 14 }}>{money(rung.cleared.stake)} → {money(rung.cleared.returned)}</span>
                <span className="font-mono text-[10px]" style={{ color: "var(--vault-success)" }}>WON · {american(rung.cleared.combinedOdds)}</span>
              </div>
              <ul className="flex flex-col gap-1">
                {rung.cleared.legs.map((l, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-[8px] px-2.5 py-1.5" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 2%, transparent)", border: "1px solid var(--vault-rule)" }}>
                    <span aria-hidden style={{ color: "var(--vault-success)", fontSize: 11 }}>✓</span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold" style={{ color: "var(--vault-text)" }}>{l.selection}</span>
                      {l.officialResult ? <span className="block truncate font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>Final · {l.officialResult}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>
                {rung.cleared.settledStatus} from official results{rung.cleared.source ? ` · ${rung.cleared.source}` : ""} · profit {money(rung.cleared.profit)} (rolled into the next step)
              </p>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

export default function VerticalLadderClimb({ lane }: { lane: ClimbLane }) {
  const tone = TONE[lane.statusTone];
  const isActive = lane.hasCard;              // a real money card is placed
  const isReview = !!lane.reviewMode;         // a $0 paper review card whose legs ARE shown
  const showsCard = isActive || isReview;     // either → attach the card's legs to the current rung
  const profit = lane.potentialReturn != null && lane.stake != null && Number.isFinite(lane.potentialReturn) && Number.isFinite(lane.stake)
    ? lane.potentialReturn - lane.stake : null;
  // Climb reads bottom→top: render rungs in DESCENDING step order (crown/high rung first, base last).
  const rungsTopDown = [...lane.rungs].sort((a, b) => b.step - a.step);
  const goalTop = rungsTopDown[0]?.goalTarget ?? null;

  return (
    <div className="flex flex-col rounded-2xl p-4"
      style={{
        background: showsCard ? `linear-gradient(180deg, ${tone}14, color-mix(in srgb, var(--vault-wash-base) 2%, transparent) 46%)` : "color-mix(in srgb, var(--vault-wash-base) 2%, transparent)",
        border: `1px solid ${showsCard ? tone + "55" : "var(--vault-border)"}`, borderTop: `3px solid ${tone}`,
        boxShadow: showsCard ? `0 0 0 1px ${tone}22, 0 10px 34px -20px ${tone}` : "none",
      }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        {/* h2, not h3: these lane cards sit directly under the page's h1 with no intervening
            section heading, so h3 skipped a level (h1 -> h3). Level only; size is set by style. */}
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{lane.label}</h2>
        <Chip label={lane.statusLabel} color={tone} />
      </div>
      <p className="mb-3 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        {[lane.step != null ? `Step ${lane.step} of ${lane.rungs.length}` : "—", lane.cycle != null ? `Cycle ${lane.cycle}` : null].filter(Boolean).join(" · ")}
      </p>

      {/* Vertical climb — crown at top, base at bottom; a gradient spine threads the nodes. */}
      <div className="relative">
        <span className="gtp-progress-rail absolute" style={{ left: 15, top: 10, bottom: 10, width: 2, borderRadius: 2 }} aria-hidden />
        {/* Crown / goal marker */}
        <div className="relative flex items-center gap-3 pb-3">
          <span className="relative z-[1] flex shrink-0 items-center justify-center rounded-full" style={{ width: 32, height: 32, background: "color-mix(in srgb, var(--vault-crown) 14%, transparent)", border: "1.5px solid var(--vault-gold-bright)" }} aria-hidden>🏆</span>
          <span className="font-display tabular font-bold" style={{ color: "var(--vault-gold-bright)", fontSize: 15 }}>
            {money0(goalTop)} <span className="font-mono text-[9px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)" }}>crown</span>
          </span>
        </div>
        {rungsTopDown.map((r) => (
          <RungRow key={r.step} rung={r} legs={lane.legs} isCurrent={showsCard && lane.step != null && r.step === lane.step} isReview={isReview} />
        ))}
      </div>

      {isReview ? (
        /* REVIEW money strip — a paper review card places NOTHING: no stake, no seed at risk, no projected
           profit. We show $0 exposure + the card's combined odds (informational), never a money projection. */
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {([
            ["Exposure", "$0.00", "var(--vault-success)"],
            ["Stake", "$0.00", "var(--vault-text)"],
            ["Combined", american(lane.combinedOdds), "var(--vault-gold-bright)"],
          ] as Array<[string, string, string]>).map(([k, v, c]) => (
            <div key={k} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 4%, transparent)", border: "1px solid var(--vault-rule)" }}>
              <div className="font-mono tabular font-bold leading-tight" style={{ color: c, fontSize: 12.5 }}>{v}</div>
              <div className="mt-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>{k}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Money row */}
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {([
              ["Stake", money(lane.stake), "var(--vault-text)"],
              ["To win", money(lane.potentialReturn), "var(--vault-gold-bright)"],
              ["Profit", profit != null ? `+${money(profit)}` : "—", "var(--vault-success)"],
              ["Seed", money0(isActive ? 100 : null), "var(--gtp-bank-heat)"],
            ] as Array<[string, string, string]>).map(([k, v, c]) => (
              <div key={k} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 4%, transparent)", border: "1px solid var(--vault-rule)" }}>
                <div className="font-mono tabular font-bold leading-tight" style={{ color: c, fontSize: 12.5 }}>{v}</div>
                <div className="mt-0.5 font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>{k}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px]" style={{ color: "var(--vault-text-faint)" }}>
            Combined {american(lane.combinedOdds)}{lane.nextKickoff ? ` · next kickoff ${lane.nextKickoff}` : ""}
          </p>
        </>
      )}

      {isReview ? (
        <div className="mt-2 rounded-[10px] px-3 py-3 text-[12px] leading-snug" style={{ background: "color-mix(in srgb, var(--vault-crown) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-crown) 25%, transparent)", color: "var(--vault-text-mute)" }}>
          <span className="font-semibold" style={{ color: "var(--vault-gold-bright)" }}>Review Mode · paper · $0 placed.</span>{" "}
          {dash(lane.reviewNote) !== "—"
            ? lane.reviewNote
            : "These legs are shown for review only — nothing is placed and no real money is at risk. Deterministic settlement from the official box score."}
        </div>
      ) : !isActive ? (
        <div className="mt-2 rounded-[10px] px-3 py-3 text-[12px] leading-snug" style={{ background: "color-mix(in srgb, var(--vault-crown) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--vault-crown) 25%, transparent)", color: "var(--vault-text-mute)" }}>
          <span className="font-semibold" style={{ color: "var(--vault-gold-bright)" }}>Model pass — holding for a stronger slate.</span>{" "}
          No qualified card today, so the ladder waits rather than force a weak card. A pass protects the seed; the lane re-arms the moment a qualified card appears.
        </div>
      ) : null}
      <p className="mt-2 font-mono text-[9.5px]" style={{ color: "var(--vault-text-faint)" }}>
        {isReview ? "Paper review · $0 placed · nothing is live." : "Paper-only · pending official settlement."}
      </p>
    </div>
  );
}
