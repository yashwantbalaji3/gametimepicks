/**
 * DiamondSpecialsBoard — the five daily MLB Diamond Specials (Homer · Hits · Bases · Pitching ·
 * Longshot) at $20 each, or an honest data-gated empty state showing the five category slots when the
 * MLB board isn't posted. Server component; pure presentational. Player portraits degrade to initials;
 * nothing is fabricated.
 */
import Link from "next/link";
import PlayerAvatar from "@/components/ui/player-avatar";
import OddsPill from "@/components/tickets/odds-pill";
import type { DiamondSpecialsResult, DiamondSpecialCard } from "@/lib/mlb/diamond-specials";

const money = (n: number) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function CategorySlot({ category }: { category: string }) {
  return (
    <div className="rounded-[12px] px-3.5 py-3 flex items-center justify-between gap-2" style={{ background: "rgba(94,200,229,0.05)", border: "1px dashed color-mix(in srgb, #5ec8e5 30%, transparent)" }}>
      <span className="font-semibold" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{category}</span>
      <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>awaiting board</span>
    </div>
  );
}

function SpecialCard({ card }: { card: DiamondSpecialCard }) {
  return (
    <div className="rounded-[12px] overflow-hidden flex flex-col" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)", borderLeft: "2px solid #5ec8e5" }}>
      <div className="px-3.5 py-2.5 flex items-center justify-between gap-2" style={{ borderBottom: "1px solid var(--vault-rule)", background: "rgba(255,255,255,0.02)" }}>
        <span className="font-semibold" style={{ color: "var(--vault-text)", fontSize: 13 }}>{card.category}</span>
        <OddsPill odds={card.combinedOdds} size="sm" tone="mute" />
      </div>
      <div className="flex flex-col">
        {card.legs.map((l, i) => (
          <div key={i} className="px-3.5 py-2 flex items-start gap-2 min-w-0" style={{ borderTop: i ? "1px solid var(--vault-rule)" : "none" }}>
            <span className="mt-0.5 shrink-0"><PlayerAvatar name={l.player ?? l.team} photo={l.photoUrl} size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 11.5, fontWeight: 600 }}>{l.selection}</span>
              <span className="block font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{l.matchup} · {l.marketLabel}</span>
            </span>
            <OddsPill odds={l.odds} size="sm" tone="mute" />
          </div>
        ))}
      </div>
      <div className="px-3.5 py-2 font-mono" style={{ borderTop: "1px solid var(--vault-rule)", color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        {money(card.stake)} → {money(card.projectedReturn)} · paper-only
      </div>
    </div>
  );
}

export default function DiamondSpecialsBoard({ board }: { board: DiamondSpecialsResult }) {
  if (!board.available || board.cards.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl px-5 py-7 text-center" style={{ background: "rgba(26,16,11,0.55)", border: "1px solid var(--vault-border)" }}>
          <div aria-hidden style={{ fontSize: 30 }}>💎⚾</div>
          <p className="mt-2 font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700 }}>Today&rsquo;s MLB board has not been posted yet</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>{board.note}</p>
          <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
            <Link href="/mlb" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>MLB board</Link>
            <Link href="/mr-dub" className="vault-press inline-flex rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--gtp-bank-lava)", color: "#1A0E06", fontSize: 11, fontWeight: 700, textDecoration: "none" }}>Mr. Dub portfolio →</Link>
          </div>
        </div>
        {/* The five category slots — what posts here each day. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {board.categories.map((c) => <CategorySlot key={c} category={c} />)}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
      {board.cards.map((c) => <SpecialCard key={c.id} card={c} />)}
    </div>
  );
}
