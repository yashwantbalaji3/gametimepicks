/**
 * MlbFlagshipSections — the MLB landing's information architecture, surfaced at the top of /mlb so a
 * user immediately sees the four sections: A) Homer Nukes (top-5 HR), B) MLB Props Board, C) Premium
 * Plays (top edges), D) Game Explorer. Homer Nukes + Diamond Specials are the flagship products and
 * link to their own pages; the Props Board + Premium Plays are data-gated and honestly explain that
 * they post once real MLB markets are live. Server component; never fabricates picks.
 */
import Link from "next/link";
import HomerNukesBoard from "@/components/mlb/homer-nukes-board";
import MlbPropsBoard, { type BoardProp } from "@/components/mlb/props-board";
import PlayerAvatar from "@/components/ui/player-avatar";
import type { HomerNukesResult } from "@/lib/mlb/homer-nukes";

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedPct = (a: number) => Math.round((1 / dec(a)) * 100);

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

function PremiumPlays({ props }: { props: BoardProp[] }) {
  // Top 10 by market-implied probability across the slate (max 2 per player), one clean list.
  const seen = new Map<string, number>();
  const ranked = [...props].sort((a, b) => impliedPct(b.americanOdds) - impliedPct(a.americanOdds));
  const top: BoardProp[] = [];
  for (const p of ranked) {
    const n = seen.get(p.player) ?? 0; if (n >= 2) continue; seen.set(p.player, n + 1);
    top.push(p); if (top.length >= 10) break;
  }
  return (
    <ol className="flex flex-col gap-1.5 list-none">
      {top.map((p, i) => (
        <li key={`${p.player}:${p.market}:${i}`} className="rounded-[10px] px-3 py-2 flex items-center gap-2.5 min-w-0" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-display tabular shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 12, fontWeight: 800, width: 14 }}>{i + 1}</span>
          <PlayerAvatar name={p.player} size={20} />
          <span className="min-w-0 flex-1"><span className="block break-words font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{p.player}</span><span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{p.marketLabel}{p.point != null ? ` ${p.point}` : ""} · {p.matchup}</span></span>
          <span className="shrink-0 text-right"><span className="block font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 12 }}>{p.americanOdds > 0 ? "+" : ""}{p.americanOdds}</span><span className="block font-mono" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>{impliedPct(p.americanOdds)}% mkt</span></span>
        </li>
      ))}
    </ol>
  );
}

export default function MlbFlagshipSections({ homer, props }: { homer: HomerNukesResult; props: BoardProp[] }) {
  const live = props.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>MLB — today&rsquo;s best plays</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Homer Nukes · Props Board · Premium Plays · Game Explorer — paper-only</span>
      </div>

      {/* A — Homer Nukes (flagship). */}
      <SectionCard tag="Section A · Flagship" title="Today's Top 5 Homer Nukes" sub="The five highest-rated home-run plays of the day.">
        <HomerNukesBoard board={homer} />
        <Link href="/homer-nukes" className="self-start font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10.5 }}>Open Homer Nukes →</Link>
      </SectionCard>

      {/* B — Props Board (real, filterable). */}
      <SectionCard tag="Section B" title="MLB Props Board" sub="Filter by market · game · player search; sort by market % or odds. HR · Hits · Bases · Runs · Pitchers.">
        {live ? <MlbPropsBoard props={props} /> : <GatedSlot label="Props board posts when MLB markets are live" note={GATE_NOTE} />}
      </SectionCard>

      {/* C — Premium Plays (real top-10). */}
      <SectionCard tag="Section C" title="Premium Plays — top 10 market %" sub="The slate's likeliest plays by de-vigged market probability (model edge online when the model layer is wired).">
        {live ? <PremiumPlays props={props} /> : <GatedSlot label="Premium plays post when MLB markets are live" note={GATE_NOTE} />}
      </SectionCard>

      {/* D — Game Explorer (links into the existing board below). */}
      <SectionCard tag="Section D" title="Game Explorer" sub="Every MLB game — game picks, player props, pitcher props, team props.">
        <GatedSlot label={live ? "Browse the full game-by-game board in the tabs below" : "The slate's games appear once posted"} note={live ? "The per-game board, projections and suggested cards are in the tabs below." : "Browse the full game-by-game board in the tabs below once the MLB schedule + markets post."} />
      </SectionCard>
    </div>
  );
}
