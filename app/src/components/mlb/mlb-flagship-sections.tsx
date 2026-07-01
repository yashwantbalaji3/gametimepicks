/**
 * MlbFlagshipSections — the MLB landing IA, surfaced at the top of /mlb in sportsbook order:
 *   1) Featured Plays    — the slate's likeliest plays by de-vigged market probability
 *   2) Homer Nukes Parlay — the daily 5-leg home-run parlay (flagship)
 *   3) Best Player Props  — the full filterable batter props board
 *   4) Pitcher Props      — the full filterable pitcher props board (K / outs / ER)
 *   5) Game Explorer      — every MLB game as a collapsible card
 *
 * A sticky quick-jump nav (MlbQuickJump) scroll-spies the five anchored sections. Honest: market-implied
 * % only (model %/edge come online when the model layer is wired). All data is the real ingested slate;
 * an empty slate shows data-gated states. Server component; never fabricates picks.
 */
import Link from "next/link";
import HomerNukesBoard from "@/components/mlb/homer-nukes-board";
import MlbPropsBoard, { type BoardProp } from "@/components/mlb/props-board";
import GameExplorer, { type ExplorerGame } from "@/components/mlb/game-explorer";
import MlbQuickJump from "@/components/mlb/mlb-quick-jump";
import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";
import type { HomerNukesResult } from "@/lib/mlb/homer-nukes";

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedPct = (a: number) => Math.round((1 / dec(a)) * 100);

function SectionCard({ id, tag, title, sub, children }: { id: string; tag: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-[14px] p-4 flex flex-col gap-2.5 scroll-mt-[60px]" style={{ background: "rgba(26,16,11,0.5)", border: "1px solid var(--vault-border)" }}>
      <div className="flex flex-col gap-0.5">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 9 }}>{tag}</span>
        <h3 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>{title}</h3>
        <span className="text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</span>
      </div>
      {children}
    </section>
  );
}

const GATE_NOTE = "Today's MLB board has not been posted yet — waiting on the sportsbooks. This section fills in automatically the moment real MLB markets post; no fabricated picks in the meantime.";
function GatedSlot({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] px-3.5 py-4 text-center" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-rule)" }}>
      <p className="font-semibold" style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{label}</p>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>{GATE_NOTE}</p>
    </div>
  );
}

/** A ranked top-N list of props by market-implied probability (max 2 per player). */
function TopList({ props, n }: { props: BoardProp[]; n: number }) {
  const seen = new Map<string, number>();
  const ranked = [...props].sort((a, b) => impliedPct(b.americanOdds) - impliedPct(a.americanOdds));
  const top: BoardProp[] = [];
  for (const p of ranked) {
    const c = seen.get(p.player) ?? 0; if (c >= 2) continue; seen.set(p.player, c + 1);
    top.push(p); if (top.length >= n) break;
  }
  return (
    <ol className="flex flex-col gap-1.5 list-none">
      {top.map((p, i) => (
        <li key={`${p.player}:${p.market}:${i}`} className="rounded-[10px] px-3 py-2 flex items-center gap-2.5 min-w-0" style={{ background: "rgba(12,8,6,0.45)", border: "1px solid var(--vault-rule)" }}>
          <span className="font-display tabular shrink-0" style={{ color: "var(--vault-text-faint)", fontSize: 12, fontWeight: 800, width: 14 }}>{i + 1}</span>
          <span className="relative shrink-0">
            <PlayerAvatar name={p.player} photo={p.photoUrl} size={22} />
            {p.teamAbbr ? <span className="absolute -bottom-1 -right-1"><TeamLogo team={p.teamAbbr} sport="mlb" size="sm" /></span> : null}
          </span>
          <span className="min-w-0 flex-1"><span className="block break-words font-semibold leading-tight" style={{ color: "var(--vault-text)", fontSize: 12.5 }}>{p.player}</span><span className="block font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{p.marketLabel}{p.point != null ? ` ${p.point}` : ""} · {p.matchup}</span></span>
          <span className="shrink-0 text-right"><span className="block font-mono tabular" style={{ color: "var(--vault-text)", fontSize: 12 }}>{p.americanOdds > 0 ? "+" : ""}{p.americanOdds}</span><span className="block font-mono" style={{ color: "var(--gtp-bank-heat)", fontSize: 9.5 }}>{impliedPct(p.americanOdds)}% mkt</span></span>
        </li>
      ))}
    </ol>
  );
}

export default function MlbFlagshipSections({ props, games }: { props: BoardProp[]; games: ExplorerGame[] }) {
  const live = props.length > 0;
  const batter = props.filter((p) => p.group !== "pitchers");
  const pitchers = props.filter((p) => p.group === "pitchers");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>MLB — today&rsquo;s best plays</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Featured · Player props · Pitcher props · Games — paper-only</span>
      </div>

      <MlbQuickJump />

      <SectionCard id="mlb-featured" tag="1 · Featured plays" title="Today's featured MLB plays" sub="The slate's likeliest plays by de-vigged market probability.">
        {live ? <TopList props={props} n={6} /> : <GatedSlot label="Featured plays post when MLB markets are live" />}
      </SectionCard>

      <SectionCard id="mlb-player-props" tag="2 · Player props" title="Best player props" sub="Quick filters by market · game · odds · confidence; sort by probability, price, confidence, team or game.">
        {batter.length ? <MlbPropsBoard props={batter} /> : <GatedSlot label="Player props post when MLB markets are live" />}
      </SectionCard>

      <SectionCard id="mlb-pitcher-props" tag="3 · Pitcher props" title="Pitcher props" sub="Strikeouts · Outs recorded · Earned runs — the same filterable board, pitcher markets.">
        {pitchers.length ? <MlbPropsBoard props={pitchers} /> : <GatedSlot label="Pitcher props post when MLB markets are live" />}
      </SectionCard>

      <SectionCard id="mlb-game-explorer" tag="4 · Games" title="Game Explorer" sub="Every game on the slate — tap a card for first pitch, featured props & pitchers on the board.">
        {games.length ? <GameExplorer games={games} props={props} /> : <GatedSlot label="The slate's games appear once posted" />}
      </SectionCard>
    </div>
  );
}
