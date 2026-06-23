/**
 * MlbFlagshipSections — the MLB landing's information architecture, surfaced at the top of /mlb so a
 * user immediately sees the four sections: A) Homer Nukes (top-5 HR), B) MLB Props Board, C) Premium
 * Plays (top edges), D) Game Explorer. Homer Nukes + Diamond Specials are the flagship products and
 * link to their own pages; the Props Board + Premium Plays are data-gated and honestly explain that
 * they post once real MLB markets are live. Server component; never fabricates picks.
 */
import Link from "next/link";
import HomerNukesBoard from "@/components/mlb/homer-nukes-board";
import type { HomerNukesResult } from "@/lib/mlb/homer-nukes";

function SectionCard({ tag, title, sub, children }: { tag: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[14px] p-4 flex flex-col gap-2.5" style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)" }}>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9 }}>{tag}</span>
        <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{title}</h3>
        <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</span>
      </div>
      {children}
    </section>
  );
}

function GatedSlot({ label, note }: { label: string; note: string }) {
  return (
    <div className="rounded-[10px] px-3.5 py-4 text-center" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-rule)" }}>
      <p className="font-semibold" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{label}</p>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>{note}</p>
    </div>
  );
}

const GATE_NOTE = "Today's MLB board has not been posted yet — waiting on the sportsbooks. This section fills in automatically the moment real MLB markets post; no fabricated picks in the meantime.";

export default function MlbFlagshipSections({ homer }: { homer: HomerNukesResult }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>MLB — today&rsquo;s best plays</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Homer Nukes · Props Board · Premium Plays · Game Explorer — paper-only</span>
      </div>

      {/* A — Homer Nukes (flagship). */}
      <SectionCard tag="Section A · Flagship" title="Today's Top 5 Homer Nukes" sub="The five highest-rated home-run plays of the day, by Homer Score.">
        <HomerNukesBoard board={homer} />
        <Link href="/homer-nukes" className="self-start font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>Open Homer Nukes →</Link>
      </SectionCard>

      {/* B — Props Board (data-gated). */}
      <SectionCard tag="Section B" title="MLB Props Board" sub="Sortable, filterable grid — Hits · Bases · Runs · Pitchers · HR, with model %, fair odds, edge and provider.">
        <GatedSlot label="Props board posts when MLB markets are live" note={GATE_NOTE} />
      </SectionCard>

      {/* C — Premium Plays (data-gated). */}
      <SectionCard tag="Section C" title="Premium Plays — top 10 edges" sub="Only the highest-edge MLB plays of the day, with provider + confidence.">
        <GatedSlot label="Premium edges post when MLB markets are live" note={GATE_NOTE} />
      </SectionCard>

      {/* D — Game Explorer (links into the existing board below). */}
      <SectionCard tag="Section D" title="Game Explorer" sub="Every MLB game — game picks, player props, pitcher props, team props.">
        <GatedSlot label="The slate's games appear in the board below once posted" note="Browse the full game-by-game board in the tabs below. It populates when the MLB schedule + markets are posted for the day." />
      </SectionCard>
    </div>
  );
}
