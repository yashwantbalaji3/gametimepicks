/**
 * MlbFlagshipSections — the MLB landing IA, surfaced at the top of /mlb in sportsbook order:
 *   1) Market favourites  — shortest de-vigged prices (the BOOK's ranking, labelled as such)
 *   3) Best Player Props  — the full filterable batter props board
 *   4) Pitcher Props      — the full filterable pitcher props board (K / outs / ER)
 *   5) Game Explorer      — every MLB game as a collapsible card
 *
 * A sticky quick-jump nav (MlbQuickJump) scroll-spies the five anchored sections. Honest: market-implied
 * % only (model %/edge come online when the model layer is wired). All data is the real ingested slate;
 * an empty slate shows data-gated states. Server component; never fabricates picks.
 */
import Link from "next/link";
import MlbPropsBoard, { type BoardProp } from "@/components/mlb/props-board";
import GameExplorer, { type ExplorerGame } from "@/components/mlb/game-explorer";
import MlbQuickJump from "@/components/mlb/mlb-quick-jump";
import PlayerAvatar from "@/components/ui/player-avatar";
import TeamLogo from "@/components/team-logo";
import TeamMarketsBox, { type TeamMarketRow } from "@/components/mlb/team-markets-box";
import HomerNukesBoardSection from "@/components/mlb/homer-nukes-board";
import type { HomerNukesBoard } from "@/lib/mlb/homer-nukes-board";

const dec = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const impliedPct = (a: number) => Math.round((1 / dec(a)) * 100);

function SectionCard({ id, tag, title, sub, children }: { id: string; tag: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-[14px] p-4 flex flex-col gap-2.5 scroll-mt-[60px]" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)", border: "1px solid var(--vault-border)" }}>
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
    <div className="rounded-[10px] px-3.5 py-4 text-center" style={{ background: "color-mix(in srgb, var(--vault-wash-base) 1.5%, transparent)", border: "1px dashed var(--vault-rule)" }}>
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
        <li key={`${p.player}:${p.market}:${i}`} className="rounded-[10px] px-3 py-2 flex items-center gap-2.5 min-w-0" style={{ background: "color-mix(in srgb, var(--vault-bg) 45%, transparent)", border: "1px solid var(--vault-rule)" }}>
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

export default function MlbFlagshipSections({ props, games, teamRows, homerBoard, simHref }: {
  props: BoardProp[];
  games: ExplorerGame[];
  teamRows: readonly TeamMarketRow[];
  homerBoard: HomerNukesBoard | null;
  simHref: string | null;
}) {
  const live = props.length > 0;
  const batter = props.filter((p) => p.group !== "pitchers");
  const pitchers = props.filter((p) => p.group === "pitchers");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>MLB — today&rsquo;s board</h2>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Home runs · batters · pitchers · teams · games — paper-only</span>
      </div>

      <MlbQuickJump />

      {/*
       * RENAMED, because the old title was a claim this section does not support.
       *
       * It was "Today's featured MLB plays" with the subtitle "the slate's likeliest plays by
       * de-vigged market probability" — which is to say, the sportsbook's biggest favourites, sorted.
       * There is no model content in it at all. Calling that our FEATURED PLAYS, at the top of the
       * MLB hub, presented the book's own opinion as the house read.
       *
       * The content is genuinely useful (short prices are where the market is most confident), so it
       * stays — under a name that says whose opinion it is. The model's own read now leads the page
       * as Homer Nukes.
       */}
      {/*
       * THE SHAPE OF THE PAGE.
       *
       * These sections used to stack: four full-width cards, each a tall scrolling board, so reaching
       * pitcher props meant paging past a hundred batter rows and the model's own read sat below the
       * sportsbook's. The order encoded no priority and the width bought nothing — the boards are
       * narrow lists inside a wide card.
       *
       * Now: the model's own board leads at full width, the three MARKET views sit beside each other
       * as peers (they answer different questions, none is a follow-on from another), and the
       * full-game simulation closes as its own destination. One screen, three columns, no scrolling
       * to discover that a section exists.
       */}
      {homerBoard ? <HomerNukesBoardSection board={homerBoard} /> : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
        <SectionCard id="mlb-player-props" tag="Batters" title="Batter props" sub="Hits · total bases · hits+runs+RBIs, filterable.">
          {batter.length ? <MlbPropsBoard props={batter} dense initialRows={10} /> : <GatedSlot label="Batter props post when MLB markets are live" />}
        </SectionCard>

        <SectionCard id="mlb-pitcher-props" tag="Pitchers" title="Pitcher props" sub="Strikeouts · outs recorded · earned runs, same filters.">
          {pitchers.length ? <MlbPropsBoard props={pitchers} dense initialRows={10} /> : <GatedSlot label="Pitcher props post when MLB markets are live" />}
        </SectionCard>

        <SectionCard id="mlb-team-props" tag="Teams" title="Team markets" sub="Win probability, run line and total for every game — de-vigged.">
          <TeamMarketsBox rows={teamRows} />
        </SectionCard>
      </div>

      <SectionCard id="mlb-featured" tag="Market favourites" title="Where the sportsbook is most confident" sub="Shortest prices on the slate, de-vigged. This is the market's ranking, not ours — our model's read is the Homer Nukes board above.">
        {live ? <TopList props={props} n={6} /> : <GatedSlot label="Market favourites post when MLB markets are live" />}
      </SectionCard>

      <SectionCard id="mlb-game-explorer" tag="Games" title="Game Explorer" sub="Every game on the slate — tap a card for first pitch, featured props & pitchers on the board.">
        {games.length ? <GameExplorer games={games} props={props} /> : <GatedSlot label="The slate's games appear once posted" />}
      </SectionCard>

      {/* The simulation is the deepest thing on this page, so it closes it as a destination of its
          own rather than being one link among many inside a game card. */}
      {simHref ? (
        <a href={simHref} className="gtp-sim-cta group flex items-center gap-4 rounded-[14px] px-4 py-4 no-underline"
          style={{ border: "1px solid var(--sport-theme-rule)", background: "var(--sport-theme-wash)" }}>
          <span aria-hidden className="shrink-0" style={{ fontSize: 26 }}>⚾</span>
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--sport-theme-ink)", fontSize: 9 }}>
              Full-game simulation
            </span>
            <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 800 }}>
              Run a game 10,000 times
            </span>
            <span style={{ color: "var(--vault-text-mute)", fontSize: 11.5 }}>
              Score distribution, win probability and every player market for one matchup.
            </span>
          </span>
          <span aria-hidden className="ml-auto shrink-0 font-mono" style={{ color: "var(--sport-theme-ink)", fontSize: 15 }}>→</span>
        </a>
      ) : null}
    </div>
  );
}
