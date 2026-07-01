/**
 * BankBuilderProposalCard — renders the FRESH DAILY Bank Builder proposal (Lane A survival + Lane B value)
 * when the real ladder is between runs. Display-only: every lane is a $0-placed paper candidate, clearly
 * labelled, so the user always sees the model's daily lanes without any canonical-money mutation.
 */
import Link from "next/link";
import FlagBadge from "@/components/flag-badge";
import OddsPill from "@/components/tickets/odds-pill";
import type { BankBuilderProposal, ProposalLane } from "@/lib/world-cup/bank-builder-proposal";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const CONF: Record<string, string> = { High: "var(--vault-success)", Solid: "var(--vault-gold-bright)", Lean: "#e7b15a" };

function LaneCard({ lane }: { lane: ProposalLane }) {
  const survival = lane.kind === "survival";
  return (
    <div className="rounded-[12px] overflow-hidden flex flex-col" style={{ border: "1px solid var(--vault-rule)", background: "rgba(26,16,11,0.5)", borderLeft: `2px solid ${survival ? "var(--vault-success)" : "var(--vault-gold-bright)"}` }}>
      <div className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13.5 }}>{lane.label}</span>
          <OddsPill odds={lane.combinedOdds} size="md" tone={survival ? "gold" : "lava"} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{money(lane.stake)} <span style={{ color: "var(--vault-text-faint)" }}>→</span> <span style={{ color: "var(--vault-success)" }}>{money(lane.potentialReturn)}</span></span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ border: `1px solid color-mix(in srgb, ${CONF[lane.confidence]} 40%, transparent)`, background: "rgba(255,255,255,0.03)" }}>
            <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8 }}>Conf</span>
            <span className="font-semibold" style={{ color: CONF[lane.confidence], fontSize: 10.5 }}>{lane.confidence}</span>
          </span>
          <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 10 }}>model {Math.round(lane.modelProbability * 100)}%</span>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>$0 placed · paper</span>
        </div>
      </div>
      <div className="px-3 py-2.5 flex flex-col gap-1.5">
        {lane.legs.map((leg, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 min-w-0">
              {leg.homeCode ? <FlagBadge code={leg.homeCode} size="sm" /> : null}
              <span className="font-mono uppercase tracking-[0.06em] rounded px-1 py-0.5" style={{ color: "var(--vault-text-faint)", background: "rgba(255,255,255,0.03)", fontSize: 7.5 }}>{leg.marketLabel}</span>
              <span className="truncate" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{leg.selection}</span>
              <span className="truncate font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{leg.matchup}</span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 9.5 }}>{Math.round(leg.modelProbability * 100)}%</span>
              <OddsPill odds={leg.americanOdds} size="sm" tone={survival ? "gold" : "lava"} />
            </span>
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 flex flex-col gap-1" style={{ borderTop: "1px solid var(--vault-rule)" }}>
        <span className="text-[10px] leading-snug" style={{ color: "var(--vault-text-mute)" }}><span className="font-mono uppercase tracking-[0.1em]" style={{ color: survival ? "var(--vault-success)" : "var(--vault-gold-bright)", fontSize: 8.5 }}>Why this ladder pick · </span>{lane.whyLadderPick}</span>
        <span className="text-[10px] leading-snug" style={{ color: "var(--vault-text-faint)" }}><span aria-hidden style={{ color: "#e7b15a" }}>⚠ Why it could fail · </span>{lane.whyItCouldFail}</span>
      </div>
    </div>
  );
}

export default function BankBuilderProposalCard({ proposal }: { proposal: BankBuilderProposal }) {
  if (!proposal.available || !proposal.lanes.length) return null;
  return (
    <div className="rounded-[14px] px-4 py-4 flex flex-col gap-3" style={{ background: "rgba(26,16,11,0.45)", border: "1px solid var(--vault-gold)", borderLeft: "3px solid var(--vault-gold-bright)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>Fresh daily Bank Builder</span>
        <span className="rounded-full px-2.5 py-0.5 font-mono uppercase tracking-[0.12em]" style={{ fontSize: 8.5, color: "var(--vault-gold-bright)", background: "rgba(217,164,65,0.12)", border: "1px solid color-mix(in srgb, var(--vault-gold-bright) 40%, transparent)" }}>proposal · {proposal.date}</span>
      </div>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{proposal.note}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {proposal.lanes.map((l) => <LaneCard key={l.lane} lane={l} />)}
      </div>
      <Link href="/world-cup/round-of-32" className="self-start font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>See the full knockout board →</Link>
    </div>
  );
}
