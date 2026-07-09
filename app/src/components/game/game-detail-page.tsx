/**
 * GameDetailPage — one fixture, presented like a premium betting-analytics card (paper-only):
 *   Hero → Model spotlight (top team pick · top player model pick · best lower-variance + higher-return
 *   card) → Suggested parlays (prominent) → Player model picks (full inventory secondary) → Team props
 *   → Markets. Tabbed (SportShell), mobile-first, shared kit only. All real data — honest empty states
 *   where a market/prop/card isn't offered; never fabricated.
 */
import Link from "next/link";
import type { PublicGameDetail } from "@/lib/game-detail";
import type { PublicProjection } from "@/lib/normalize";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import MlbGameLabReport from "@/components/game/mlb-game-lab-report";
import GameSimulationRunner from "@/components/game/game-simulation-runner";
import MlbGameCenter from "@/components/game/mlb-game-center";
import WcGameCenter from "@/components/game/wc-game-center";
import WcSimulationRunner from "@/components/game/wc-simulation-runner";
import WcGameLabReport from "@/components/game/wc-game-lab-report";
import PostRevealTabs, { type PostRevealTab } from "@/components/game/post-reveal-tabs";
import {
  MethodologyPanel,
  MlbDistributionsPanel,
  ScorersPanel,
  SoccerComingSoonRoadmap,
} from "@/components/game/game-dashboard-panels";
import TeamMark from "@/components/ui/team-mark";
import CompetitionBadge from "@/components/ui/competition-badge";
import { getSportIdentity } from "@/lib/sport-identity";
import { teamByName } from "@/lib/data-world-cup";
import SectionHeader from "@/components/section-header";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import PlayerPropsExplorer from "@/components/ui/player-props-explorer";
import PlayerPropCard from "@/components/ui/player-prop-card";
import PlayerAvatar from "@/components/ui/player-avatar";
import StatusChip from "@/components/ui/status-chip";
import { ParlayCard } from "@/components/parlays/parlays-explorer";
import type { GameSpecificCards } from "@/lib/world-cup/game-specific-cards";
import type { SuggestedParlayCard } from "@/lib/parlays/ui-loader";
import { worldCupPlayerModelPicks, isLimitedDataProps } from "@/lib/world-cup/player-model-picks";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { buildKnockoutContexts, type KnockoutContext } from "@/lib/world-cup/knockout-intelligence";
import { confidenceLabel, expectedGameScript } from "@/lib/world-cup/wc-editorial";
import { gameScriptForFixture } from "@/lib/world-cup/game-script";
import GameScriptCard from "@/components/world-cup/game-script-card";
import path from "node:path";
import {
  buildTeamModelPickRows,
  buildPlayerPropTables,
  type ModelPickRow,
  type PlayerPropTable,
} from "@/lib/world-cup/game-model-picks";

import { RISK_LABELS } from "@/lib/parlays/risk-taxonomy";
const RISK_LABEL: Record<string, string> = RISK_LABELS;
const RISK_ORDER = ["low", "medium", "high", "longshot"] as const;
const STATUS_LABEL: Record<string, string> = { live: "Live", pending: "Pending", unavailable: "Market unavailable", model_only: "Model only" };
const MODEL_PICKS_N = 8;
/** Max model-qualified picks surfaced per player market in the by-market view. */
const MAX_PER_MARKET = 3;

const american = (o?: number | null) => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);
const pct = (n?: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/** A compact spotlight tile — the single strongest read of a kind, with a "where to find the rest" hint. */
function SpotlightTile({ eyebrow, title, sub, meta, accent, foot }: {
  eyebrow: string; title: string; sub?: string; meta?: React.ReactNode; accent?: string; foot?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(26, 16, 11,0.6)", border: `1px solid ${accent ?? "var(--vault-border)"}` }}>
      <span className="font-mono uppercase tracking-[0.13em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>{eyebrow}</span>
      <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 16, fontWeight: 700, lineHeight: 1.1 }}>{title}</span>
      {sub ? <span style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>{sub}</span> : null}
      {meta ? <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{meta}</span> : null}
      {foot ? <span className="mt-0.5 font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{foot}</span> : null}
    </div>
  );
}

function EmptyTile({ eyebrow, note }: { eyebrow: string; note: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(255,255,255,0.015)", border: "1px dashed var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.13em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{eyebrow}</span>
      <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>{note}</span>
    </div>
  );
}

/** One model-qualified player pick, rendered compactly with a full (wrapping) player name. */
function MarketPickRow({ p }: { p: PublicProjection }) {
  const name = p.player?.name ?? "—";
  return (
    <div className="flex items-center gap-2.5 rounded-[8px] px-3 py-2.5 min-w-0" style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--vault-rule)" }}>
      <PlayerAvatar name={name} photo={p.player?.photo} size={30} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-display tracking-tight break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{name}</span>
        <span className="font-mono break-words leading-tight" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>
          {p.pickLabel}{p.line != null ? ` ${p.line}` : ""} · market {pct(p.marketProbability)}{p.bookmaker ? ` · ${p.bookmaker}` : ""}
        </span>
      </div>
      <span className="font-mono shrink-0" style={{ color: "var(--vault-gold-bright)", fontSize: 12 }}>{american(p.americanOdds)}</span>
    </div>
  );
}

/** A labelled market section showing up to MAX_PER_MARKET model-qualified picks (or an honest empty state). */
function MarketSection({ label, picks }: { label: string; picks: PublicProjection[] }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>{label}</div>
      {picks.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {picks.map((p) => <MarketPickRow key={p.id} p={p} />)}
        </div>
      ) : (
        <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>No model-qualified pick</span>
      )}
    </div>
  );
}

// ── Model-pick tables (scannable team-market + player-prop grids) ────────────────────────────────
/** Shared cell styling for the model-pick tables — compact, mobile-readable, vault palette. */
const TH: React.CSSProperties = {
  textAlign: "left", padding: "6px 8px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em",
  textTransform: "uppercase", color: "var(--vault-text-faint)", whiteSpace: "nowrap",
  borderBottom: "1px solid var(--vault-rule)", background: "rgba(26, 16, 11,0.7)", position: "sticky", top: 0,
};
const TD: React.CSSProperties = {
  padding: "6px 8px", fontSize: 11.5, color: "var(--vault-text)", borderBottom: "1px solid var(--vault-rule)",
  verticalAlign: "middle",
};

/** Section 1 — the "Model Picks" team-market table (5 posted markets + 5 honest UNAVAILABLE rows). */
function ModelPicksTable({ rows }: { rows: ModelPickRow[] }) {
  return (
    <div>
      <div className="flex items-center justify-end mb-1.5 sm:hidden">
        <span className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>swipe table sideways →</span>
      </div>
      <div className="overflow-x-auto rounded-[10px]" style={{ border: "1px solid var(--vault-border)", WebkitOverflowScrolling: "touch" }}>
        <table className="w-full border-collapse" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            {["Market", "Pick", "Odds", "Model Probability", "Confidence", "Notes"].map((h) => (
              <th key={h} style={TH}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rowLabel} style={{ background: r.available ? "transparent" : "rgba(255,255,255,0.015)" }}>
              <td style={{ ...TD, fontWeight: 600, color: r.available ? "var(--vault-text)" : "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{r.rowLabel}</td>
              <td style={{ ...TD, color: r.available ? "var(--vault-text)" : "var(--vault-text-faint)" }}>{r.pick}</td>
              <td style={{ ...TD, fontFamily: "var(--font-mono, monospace)", color: r.available ? "var(--vault-gold-bright)" : "var(--vault-text-faint)", whiteSpace: "nowrap" }}>{r.odds}</td>
              <td style={{ ...TD, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{r.prob}</td>
              <td style={{ ...TD, color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{r.confidence}</td>
              <td style={{ ...TD, color: "var(--vault-text-faint)", fontSize: 10.5 }}>{r.note}</td>
            </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Section 2 — one player-prop table (top picks by model probability), or an honest empty row. */
function PlayerPropTableCard({ table }: { table: PlayerPropTable }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{table.title}</div>
        <span className="font-mono sm:hidden" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>swipe →</span>
      </div>
      <div className="overflow-x-auto rounded-[10px]" style={{ border: "1px solid var(--vault-border)", WebkitOverflowScrolling: "touch" }}>
        <table className="w-full border-collapse" style={{ minWidth: 620 }}>
          <thead>
            <tr>
              {["Player", "Team", "Market", "Pick / Line", "Odds", "Model Probability", "Confidence", "Notes"].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length > 0 ? (
              table.rows.map((r, i) => (
                <tr key={`${r.player}-${i}`}>
                  <td style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap" }}>{r.player}</td>
                  <td style={{ ...TD, color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{r.team}</td>
                  <td style={{ ...TD, color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{r.market}</td>
                  <td style={{ ...TD, whiteSpace: "nowrap" }}>{r.pickLine}</td>
                  <td style={{ ...TD, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-gold-bright)", whiteSpace: "nowrap" }}>{r.odds}</td>
                  <td style={{ ...TD, fontFamily: "var(--font-mono, monospace)", color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{r.prob}</td>
                  <td style={{ ...TD, color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{r.confidence}</td>
                  <td style={{ ...TD, color: "var(--vault-text-faint)", fontSize: 10.5 }}>{r.note}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ ...TD, color: "var(--vault-text-faint)", fontStyle: "italic" }}>No odds-backed props offered</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Editorial overlay on game-prop parlay cards (player + team) ──────────────────────────────────
/**
 * The game-prop generator (`game-prop-parlays.ts`) attaches an analyst-voice `editorial` overlay to
 * each card IN ADDITION to the base SuggestedParlayCard fields. The shared `SuggestedParlayCard` type
 * (ui-loader, not editable here) doesn't declare it, so we read it through this narrow extension.
 */
interface GamePropEditorial {
  tierLabel: "Safe" | "Balanced" | "Aggressive";
  narrative: string;
  confidence: "High" | "Solid" | "Lean" | "Speculative";
  volatility: "Low" | "Medium" | "High" | "Extreme";
  correlation: { score: number; direction: "independent" | "positive" | "negative" | "mixed"; summary: string };
}
type EditorialCard = SuggestedParlayCard & { editorial?: GamePropEditorial };

const TIER_ORDER: GamePropEditorial["tierLabel"][] = ["Safe", "Balanced", "Aggressive"];
const TIER_BLURB: Record<GamePropEditorial["tierLabel"], string> = {
  Safe: "Lowest-variance — highest-probability legs, shortest combined price.",
  Balanced: "Moderate payout and survival — a longer combined price for more upside.",
  Aggressive: "Higher-variance — built for payout over hit rate; the legs need the bolder script.",
};
const CONF_TONE: Record<GamePropEditorial["confidence"], string> = {
  High: "var(--vault-success)", Solid: "var(--vault-success)", Lean: "var(--vault-gold-bright)", Speculative: "var(--gtp-bank-heat)",
};
const VOL_TONE: Record<GamePropEditorial["volatility"], string> = {
  Low: "var(--vault-success)", Medium: "var(--vault-gold-bright)", High: "var(--gtp-bank-heat)", Extreme: "var(--gtp-bank-heat)",
};
const CORR_TONE: Record<GamePropEditorial["correlation"]["direction"], string> = {
  independent: "var(--vault-text-faint)", positive: "var(--vault-gold-bright)", negative: "var(--gtp-bank-heat)", mixed: "var(--vault-gold-bright)",
};

/** A small labelled chip used in the editorial strip (confidence / volatility). */
function EditorialChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] px-2 py-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{label}</span>
      <span className="font-mono" style={{ color, fontSize: 11, fontWeight: 600 }}>{value}</span>
    </span>
  );
}

/**
 * A game-prop parlay card with its editorial overlay: a header strip (confidence + volatility),
 * the analyst narrative woven with the expected game script, the real correlation profile
 * (score + direction + summary), then the existing ParlayCard (legs, odds, why/risk, correlation note).
 */
function EditorialParlayCard({ card }: { card: EditorialCard }) {
  const ed = card.editorial;
  if (!ed) return <ParlayCard card={card} />;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5 rounded-t-xl px-3.5 pt-3 pb-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)", borderBottom: "none" }}>
        <div className="flex flex-wrap items-center gap-1.5">
          <EditorialChip label="confidence" value={ed.confidence} color={CONF_TONE[ed.confidence]} />
          <EditorialChip label="volatility" value={ed.volatility} color={VOL_TONE[ed.volatility]} />
          <EditorialChip label="correlation" value={`${ed.correlation.direction} · ${ed.correlation.score.toFixed(2)}`} color={CORR_TONE[ed.correlation.direction]} />
        </div>
        <p className="text-[12px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>{ed.narrative}</p>
        <p className="text-[10.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
          <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8.5 }}>correlation read · </span>{ed.correlation.summary}
        </p>
      </div>
      <div className="-mt-2"><ParlayCard card={card} /></div>
    </div>
  );
}

/** Render game-prop cards grouped by the Safe / Balanced / Aggressive tier label (not the raw risk
 *  bucket). Each tier is emitted only when a real card backs it — empty tiers are skipped honestly. */
function TieredEditorialCards({ cards }: { cards: EditorialCard[] }) {
  return (
    <>
      {TIER_ORDER.map((tier) => {
        const tierCards = cards.filter((c) => c.editorial?.tierLabel === tier);
        if (tierCards.length === 0) return null;
        return (
          <div key={tier} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{tier} · {tierCards.length}</span>
              <span className="text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>{TIER_BLURB[tier]}</span>
            </div>
            {tierCards.map((c) => <EditorialParlayCard key={c.parlayId} card={c} />)}
          </div>
        );
      })}
    </>
  );
}

export default function GameDetailPage({ detail, engineCards, multiGameCards, playerPropParlays, teamPropParlays }: { detail: PublicGameDetail; engineCards?: GameSpecificCards | null; multiGameCards?: GameSpecificCards | null; playerPropParlays?: GameSpecificCards | null; teamPropParlays?: GameSpecificCards | null }) {
  const identity = getSportIdentity(detail.sport);
  const homeCode = detail.sport === "world_cup" && detail.homeTeam ? teamByName(detail.homeTeam)?.code ?? "" : "";
  const awayCode = detail.sport === "world_cup" && detail.awayTeam ? teamByName(detail.awayTeam)?.code ?? "" : "";

  // ── Model spotlight inputs (real data only) ──
  const topProj = [...detail.teamProjections].sort((a, b) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0))[0] ?? null;
  // The spotlight "top player model pick" must be model-qualified (addable window) — never a raw heavy
  // favourite like -5000. Filter to odds-backed props within -500..+400 with a provider before ranking.
  const qualifiedPlayerProps = detail.playerProps.filter(
    (p) => typeof p.americanOdds === "number" && p.americanOdds >= -500 && p.americanOdds <= 400 && !!p.bookmaker,
  );
  const modelPicks = worldCupPlayerModelPicks(qualifiedPlayerProps, MODEL_PICKS_N);
  const topPlayer = modelPicks[0] ?? null;
  // Same model-picks-by-market pattern as the slate table, scoped to this fixture: group the
  // model-qualified props by market and surface up to MAX_PER_MARKET ranked picks per market.
  // Empty markets render an honest "No model-qualified pick" rather than raw inventory.
  const marketGroups = (() => {
    const byMarket = new Map<string, PublicProjection[]>();
    for (const p of qualifiedPlayerProps) {
      const a = byMarket.get(p.marketLabel) ?? [];
      a.push(p);
      byMarket.set(p.marketLabel, a);
    }
    return [...byMarket.entries()]
      .map(([label, props]) => ({ label, picks: worldCupPlayerModelPicks(props, MAX_PER_MARKET) }))
      .filter((g) => g.picks.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  })();
  const limitedData = isLimitedDataProps(detail.playerProps);
  const allCards = engineCards?.cards ?? [];
  const bestLowCard = (engineCards?.byRisk.low ?? [])[0] ?? (engineCards?.byRisk.medium ?? [])[0] ?? null;
  const bestReturnCard = allCards.length
    ? [...allCards].sort((a, b) => (b.combinedOdds ?? -1e9) - (a.combinedOdds ?? -1e9))[0]
    : null;
  const engineTotal = engineCards?.total ?? 0;
  const marketLabels = [...new Set(detail.playerProps.map((p) => p.marketLabel))];

  // ── Model-pick tables (world_cup only): scannable team-market + player-prop grids ──
  // Build the shared knockout context for THIS fixture from the raw projections (filtered to this
  // matchId) so the NOTES column reads from the same brain every product uses. Real data only.
  const knockoutCtx: KnockoutContext | undefined = (() => {
    if (detail.sport !== "world_cup" || !detail.matchId) return undefined;
    const matches = (loadWorldCupProjections()?.matches ?? []).filter((m) => String(m.matchId) === detail.matchId);
    if (matches.length === 0) return undefined;
    return buildKnockoutContexts(matches).get(detail.matchId);
  })();
  const teamPickRows = detail.sport === "world_cup" ? buildTeamModelPickRows(detail.teamProjections, knockoutCtx) : [];
  const playerPropTables = detail.sport === "world_cup" ? buildPlayerPropTables(detail.playerProps) : [];
  const gameScript = knockoutCtx ? expectedGameScript(knockoutCtx) : null;
  const slipReadout = knockoutCtx ? confidenceLabel(knockoutCtx.favProb) : null;
  // The UNIFIED model game script (score lean + total + BTTS + tie-together explanation) — the SAME read
  // the knockout board shows, resolved for this fixture so score/total/BTTS never contradict across pages.
  const unifiedScript =
    detail.sport === "world_cup" && detail.homeTeam && detail.awayTeam
      ? gameScriptForFixture(path.join(process.cwd(), "public", "data"), detail.homeTeam, detail.awayTeam)
      : null;

  // ── Tab: Model picks — Section 1 (team markets) + Section 2 (four player-prop tables) ──
  const modelPicksTab = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <SectionHeader eyebrow="Model Picks" title="Every model pick for this match, at a glance" sub="The posted team markets and player props, model-ranked from the current odds. Markets the books don't price are labelled Unavailable, never faked." />
        {gameScript ? (
          <p className="text-[11.5px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>
            <span className="font-mono uppercase tracking-[0.1em]" style={{ fontSize: 8.5 }}>Expected game script · </span>{gameScript}
            {slipReadout ? <span className="font-mono" style={{ color: "var(--vault-text-mute)" }}> · favorite read: {slipReadout}</span> : null}
          </p>
        ) : null}
        <ModelPicksTable rows={teamPickRows} />
      </div>

      <div className="flex flex-col gap-4">
        <SectionHeader eyebrow="Player model picks" title="Top player props by market" sub="Each market's strongest model reads, ranked by model probability — odds-backed only, capped to stay scannable." />
        {playerPropTables.map((t) => <PlayerPropTableCard key={t.market} table={t} />)}
      </div>

      <p className="text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>Paper-only · educational · not betting advice.</p>
    </div>
  );

  const spotlight = (
    <section className="flex flex-col gap-2.5">
      <SectionHeader eyebrow="Model spotlight" title="The strongest reads for this match" sub="Model-ranked, paper-only — pulled from the current odds and the model gates. Full detail in the tabs below." />
      {unifiedScript ? <GameScriptCard script={unifiedScript} /> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {topProj ? (
          <SpotlightTile eyebrow={`Top team model pick · ${topProj.marketLabel}`} title={topProj.pickLabel}
            meta={`${american(topProj.americanOdds)} · model ${pct(topProj.modelProbability)} · market ${pct(topProj.marketProbability)} · edge ${(topProj.edgePct ?? 0) >= 0 ? "+" : ""}${(topProj.edgePct ?? 0).toFixed(1)}%`}
            accent="rgba(242,54,69,0.35)" foot="Team & game props tab" />
        ) : <EmptyTile eyebrow="Top team model pick" note="No team projection posted for this fixture yet." />}

        {topPlayer ? (
          <div className="flex items-center gap-3 rounded-[12px] px-4 py-3.5" style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid rgba(217,164,65,0.35)" }}>
            <PlayerAvatar name={topPlayer.player?.name ?? "—"} photo={topPlayer.player?.photo} size={40} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-mono uppercase tracking-[0.13em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Top player model pick · {topPlayer.marketLabel}</span>
              <span className="font-display break-words leading-tight" style={{ color: "var(--vault-text)", fontSize: 15.5, fontWeight: 700 }}>{topPlayer.player?.name}</span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{topPlayer.pickLabel}{topPlayer.line != null ? ` ${topPlayer.line}` : ""} · {american(topPlayer.americanOdds)} · market {pct(topPlayer.marketProbability)}{limitedData ? " · limited-data" : ""}</span>
            </div>
          </div>
        ) : <EmptyTile eyebrow="Top player model pick" note="No model-qualified pick for this fixture (raw sportsbook inventory is not shown as a recommendation)." />}

        {bestLowCard ? (
          <SpotlightTile eyebrow={`Best lower-variance card · ${RISK_LABEL[bestLowCard.riskLevel] ?? bestLowCard.riskLevel}`} title={`${bestLowCard.legs.length} legs · ${american(bestLowCard.combinedOdds)}`}
            sub={bestLowCard.whyThisParlay?.[0]} meta={bestLowCard.payoutMultiple ? `${bestLowCard.payoutMultiple.toFixed(2)}x payout · paper` : "paper-only"} foot="Suggested parlays tab" />
        ) : <EmptyTile eyebrow="Best lower-variance card" note="No lower-variance card passed the model gates for this match." />}

        {bestReturnCard ? (
          <SpotlightTile eyebrow={`Best higher-return card · ${RISK_LABEL[bestReturnCard.riskLevel] ?? bestReturnCard.riskLevel}`} title={`${bestReturnCard.legs.length} legs · ${american(bestReturnCard.combinedOdds)}`}
            sub={bestReturnCard.whyThisParlay?.[0]} meta={bestReturnCard.payoutMultiple ? `${bestReturnCard.payoutMultiple.toFixed(2)}x payout · paper` : "paper-only"} foot="Suggested parlays tab" />
        ) : <EmptyTile eyebrow="Best higher-return card" note="No higher-return card passed the model gates for this match." />}
      </div>
      {detail.caveats.length > 0 ? (
        <ul className="mt-1 flex flex-col gap-1">
          {detail.caveats.map((c, i) => <li key={i} className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>· {c}</li>)}
        </ul>
      ) : null}
    </section>
  );

  // ── Tab: Suggested parlays (prominent, by risk) ──
  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Model-built cards · ${engineTotal}`} title="Model-built cards for this match" sub="Paper-only cards generated from current odds and model gates, by risk. Tap any leg for model + market detail." />
      {engineTotal > 0 ? (
        RISK_ORDER.map((lvl) => {
          const cards = engineCards?.byRisk[lvl] ?? [];
          return (
            <div key={lvl} className="flex flex-col gap-2.5">
              <div className="text-[12.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{RISK_LABEL[lvl]} · {cards.length}</div>
              {cards.length > 0
                ? cards.map((c) => <ParlayCard key={c.parlayId} card={c} />)
                : <div className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)", color: "var(--vault-text-faint)" }}>No {RISK_LABEL[lvl].toLowerCase()} card passed the gates for this match.</div>}
            </div>
          );
        })
      ) : (
        <div className="rounded-xl px-4 py-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
          <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No game-specific cards passed the gate for this match{detail.homeTeam ? ` (${detail.homeTeam} vs ${detail.awayTeam})` : ""}. Build your own from this game&apos;s eligible legs, or browse all of today&apos;s cards in the <Link href="/picks" style={{ color: "var(--vault-gold-bright)" }}>Parlay Lab</Link>.</p>
          <Link href={detail.buildUrl} className="mt-2 inline-flex font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>Build from this game →</Link>
        </div>
      )}
      {multiGameCards && multiGameCards.total > 0 ? (
        <div className="flex flex-col gap-2.5">
          <SectionHeader eyebrow={`Across the slate · ${multiGameCards.total}`} title="This game in multi-game cards" sub="Today's World Cup multi-game cards that include this match, by risk. Full set on Parlay Lab." />
          {RISK_ORDER.map((lvl) => {
            const cards = multiGameCards!.byRisk[lvl] ?? [];
            if (cards.length === 0) return null;
            return (
              <div key={`mg-${lvl}`} className="flex flex-col gap-2.5">
                <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--vault-text-faint)" }}>{RISK_LABEL[lvl]} · {cards.length}</div>
                {cards.map((c) => <ParlayCard key={`mg-${c.parlayId}`} card={c} />)}
              </div>
            );
          })}
          <Link href="/parlays?sport=world_cup" className="inline-flex font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11 }}>All World Cup multi-game cards →</Link>
        </div>
      ) : null}
      {detail.suggestedCards.length > 0 ? (
        <div className="flex flex-col gap-3">
          <SectionHeader eyebrow={`Also · ${detail.suggestedCards.length}`} title="Fixture cards" sub="Cards built from this fixture's positive-edge projections." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {detail.suggestedCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </div>
      ) : null}
    </div>
  );

  // ── Tab: Player prop parlays (Safe / Balanced / Aggressive — distinct players, real odds) ──
  const playerPropParlaysTotal = playerPropParlays?.total ?? 0;
  const playerPropParlaysTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Player prop parlays · ${playerPropParlaysTotal}`} title="Player prop parlays for this match" sub="Safe / Balanced / Aggressive — built from this game's posted player props, distinct players per slip, combined odds computed from the real prices. Each card carries a confidence + volatility read and an honest correlation note. Tap any leg for model + market detail." />
      {playerPropParlaysTotal > 0 ? (
        <TieredEditorialCards cards={(playerPropParlays?.cards ?? []) as EditorialCard[]} />
      ) : (
        <div className="rounded-xl px-4 py-4 flex flex-col gap-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
          <span style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 600 }}>No quality parlay available yet</span>
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>Not enough quality player props are posted to build a slip for this match yet — we never pad a parlay with weak legs. Soccer player props post near lineup time; check back closer to kickoff.</p>
        </div>
      )}
    </div>
  );

  // ── Tab: Team prop parlays (Safe / Balanced / Aggressive — same-game, correlated, disclosed) ──
  const teamPropParlaysTotal = teamPropParlays?.total ?? 0;
  const teamPropParlaysTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Team prop parlays · ${teamPropParlaysTotal}`} title="Team prop parlays for this match" sub="Safe / Balanced / Aggressive same-game combos from this fixture's team markets, built around the expected game script. These legs are correlated by nature — every card surfaces its correlation direction + score and never presents them as independent." />
      {teamPropParlaysTotal > 0 ? (
        <TieredEditorialCards cards={(teamPropParlays?.cards ?? []) as EditorialCard[]} />
      ) : (
        <div className="rounded-xl px-4 py-4 flex flex-col gap-1.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px dashed var(--vault-border)" }}>
          <span style={{ color: "var(--vault-text)", fontSize: 13.5, fontWeight: 600 }}>No quality parlay available yet</span>
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>Not enough sensible team markets are posted to build a same-game combo for this match yet. See the Team &amp; game props tab for the individual projections.</p>
        </div>
      )}
    </div>
  );

  // ── Tab: Player props — model picks default, full inventory secondary ──
  const playerPropsTab = (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <SectionHeader eyebrow={`Model player props · ${modelPicks.length}`} title="Model picks by market" sub="Up to 3 model-qualified picks per market — recommended side only, never the full both-sides inventory." />
        {marketLabels.length > 0 ? (
          <p className="text-[11.5px]" style={{ color: "var(--vault-text-faint)" }}>
            Markets posted for this fixture: {marketLabels.join(" · ")}. {limitedData ? "Limited-data — market-implied prices, no independent model edge yet. " : ""}Additional player markets (assists, shots, cards, …) appear here automatically when the books post odds — never shown without real prices.
          </p>
        ) : null}
        {marketGroups.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-5">
            {marketGroups.map((g) => <MarketSection key={g.label} label={g.label} picks={g.picks} />)}
          </div>
        ) : (
          <div className="rounded-[10px] px-4 py-8 text-center flex flex-col items-center gap-1.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-warn)", fontSize: 9.5 }}>Player props pending</span>
            <p style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>No model player picks yet</p>
            <p className="max-w-md" style={{ color: "var(--vault-text-mute)", fontSize: 12, lineHeight: 1.5 }}>Player props will appear when this game enters the active betting window — soccer props post near lineup time. We never show a pick without real posted odds behind it.</p>
          </div>
        )}
      </div>
      {detail.playerProps.length > modelPicks.length ? (
        <details className="rounded-[10px]" style={{ background: "rgba(255,255,255,0.015)", border: "1px solid var(--vault-border)" }}>
          <summary className="cursor-pointer px-4 py-3 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-gold-bright)", fontSize: 11, listStyle: "none" }}>
            View full prop inventory · {detail.playerProps.length} ▾
          </summary>
          <div className="px-3 pb-3 pt-1">
            <PlayerPropsExplorer props={detail.playerProps} />
          </div>
        </details>
      ) : null}
    </div>
  );

  // ── Tab: Team & game props ──
  const projectionsTab = (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow={`Projections · ${detail.teamProjections.length}`} title="Team & game projections" sub="Model probability vs the market price, with edge, for this fixture." />
      {detail.teamProjections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {detail.teamProjections.map((p) => <ProjectionCard key={p.id} p={p} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>This sport is player-prop based — see the Player props tab for this game&apos;s projections.</p>
      )}
    </div>
  );

  // ── Tab: Markets ──
  const marketsTab = (
    <div className="flex flex-col gap-3">
      <SectionHeader eyebrow="Markets" title="What's available for this game" sub="We only show markets a real book is pricing. Pending/unavailable markets are labeled, never faked." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {detail.dataStatus.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-2 rounded-[8px] px-3 py-2.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
            <div className="flex flex-col min-w-0">
              <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              {d.detail ? <span className="font-mono truncate" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{d.detail}</span> : null}
            </div>
            <StatusChip label={STATUS_LABEL[d.status] ?? d.status} />
          </div>
        ))}
      </div>
      <Link href="/learn#sports" className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>How soccer markets work →</Link>
    </div>
  );

  const tabs: ShellTab[] = [
    ...(detail.sport === "world_cup" ? [
      { key: "model-picks", label: "Model picks", badge: teamPickRows.filter((r) => r.available).length + playerPropTables.reduce((n, t) => n + t.rows.length, 0) || null, content: modelPicksTab },
    ] satisfies ShellTab[] : []),
    { key: "cards", label: "Suggested parlays", badge: (engineTotal + detail.suggestedCards.length) || null, content: cardsTab },
    ...(detail.sport === "world_cup" ? [
      { key: "player-prop-parlays", label: "Player prop parlays", badge: playerPropParlaysTotal || null, content: playerPropParlaysTab },
      { key: "team-prop-parlays", label: "Team prop parlays", badge: teamPropParlaysTotal || null, content: teamPropParlaysTab },
    ] satisfies ShellTab[] : []),
    { key: "player-props", label: "Player props", badge: detail.playerProps.length || null, content: playerPropsTab },
    { key: "projections", label: "Team & game props", badge: detail.teamProjections.length || null, content: projectionsTab },
    { key: "markets", label: "Markets", content: marketsTab },
  ];

  // The reusable sections — the dense report, the Model spotlight, and the price-tabs shell. On an MLB-SIM
  // page these are threaded into the simulation runner's `postReveal` (revealed ONLY after the reveal),
  // never rendered as pre-click siblings; on every other page they render directly, unchanged.
  const mlbReport = detail.gameLabMlb ? <div className="mb-5"><MlbGameLabReport view={detail.gameLabMlb} /></div> : null;
  // Market-implied Game Center (win prob / total / run line) — leads the post-reveal
  // dashboard when the game has de-vigged team markets; absent otherwise (no fake modules).
  const gameCenter = detail.gameCenter ? <MlbGameCenter gameCenter={detail.gameCenter} /> : null;
  const tabsShell = <SportShell tabs={tabs} />;

  // ── Overview-led tabbed dashboard (MLB). The whole thing lives inside the runner's postReveal,
  // so it stays behind the pre-click gate. Overview = the market-implied Game Center (the main
  // answer); Player Props is promoted to a top-level tab; the dense report + spotlight + remaining
  // sub-tabs move into Advanced Report; Distributions/Methodology are honest explainer panels. ──
  const mlbDashTabs: PostRevealTab[] = [
    { key: "overview", label: "Overview", content: gameCenter ?? spotlight ?? mlbReport },
    { key: "player-props", label: "Player props", badge: detail.playerProps.length || null, content: playerPropsTab },
    { key: "distributions", label: "Distributions", content: <MlbDistributionsPanel /> },
    { key: "advanced", label: "Advanced report", content: <>{mlbReport}{spotlight}<SportShell tabs={tabs.filter((t) => t.key !== "player-props")} /></> },
    { key: "methodology", label: "Methodology", content: <MethodologyPanel sport="mlb" /> },
  ];

  // ── Gate: an MLB fixture that carries a simulation shows a CLEAN matchup hero (no prices) + the runner
  // ONLY before the click. The dense report, Model spotlight, and price tabs are gated behind Generate. ──
  const isMlbSim = detail.sport === "mlb" && !!detail.gameLabSimulation;

  if (isMlbSim) {
    const sim = detail.gameLabSimulation!;
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
        <div className="mb-2">
          <Link href="/games" className="inline-flex items-center -ml-1 px-1 py-2 font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 40 }}>← All games</Link>
        </div>

        {/* CLEAN matchup hero — always visible, NO posted prices/picks. Large team crests (away @ home),
            title, MLB, date/venue, a Simulation Ready badge, and honest run/pick counts (run count gated). */}
        <section className="relative overflow-hidden rounded-[16px] px-5 sm:px-7 py-6 sm:py-8 mb-5" style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(130% 150% at 0% 0%, rgba(242, 54, 69,0.13) 0%, transparent 52%), radial-gradient(120% 130% at 100% 0%, rgba(217,164,65,0.07) 0%, transparent 55%), linear-gradient(140deg, rgba(20,20,22,0.95) 0%, rgba(10,10,11,0.98) 100%)", boxShadow: "0 22px 56px -30px rgba(0,0,0,0.8)" }}>
          {/* faint field-grid texture (decorative, motion-free) */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: "linear-gradient(rgba(242,54,69,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(242,54,69,0.05) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
              opacity: 0.5,
              maskImage: "radial-gradient(120% 100% at 0% 0%, #000 25%, transparent 80%)",
              WebkitMaskImage: "radial-gradient(120% 100% at 0% 0%, #000 25%, transparent 80%)",
            }}
          />
          <span className="relative flex flex-wrap items-center gap-2">
            <span className="gtp-sport-orb shrink-0" style={{ width: 26, height: 26, fontSize: 14, ["--orb-grad" as string]: identity.gradient }} role="img" aria-label={identity.ballLabel}>{identity.icon}</span>
            <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{detail.date}{detail.venue ? " · " + detail.venue : ""}</span>
            <CompetitionBadge sport={detail.sport} size="sm" />
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.12em]" style={{ background: "rgba(46,160,102,0.14)", border: "1px solid rgba(46,160,102,0.4)", color: "var(--gtp-success-on-dark, #7ee2a8)", fontSize: 9 }}>
              <span aria-hidden>▶</span> Simulation Ready
            </span>
          </span>
          <div className="relative mt-3.5 flex items-center gap-3.5 sm:gap-4 min-w-0">
            {/* Large away @ home crests — each mark framed on a rounded plate so the logos read instantly. */}
            <span className="inline-flex items-center gap-2.5 shrink-0" aria-label={`${detail.awayTeam} at ${detail.homeTeam}`}>
              <span className="inline-flex items-center justify-center rounded-[12px] shrink-0" style={{ width: 58, height: 58, background: "rgba(10,10,11,0.6)", border: "1px solid var(--vault-border)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                <TeamMark name={detail.awayTeam} logoUrl={detail.awayLogo} size="xl" />
              </span>
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 13 }}>@</span>
              <span className="inline-flex items-center justify-center rounded-[12px] shrink-0" style={{ width: 58, height: 58, background: "rgba(10,10,11,0.6)", border: "1px solid var(--vault-border)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                <TeamMark name={detail.homeTeam} logoUrl={detail.homeLogo} size="xl" />
              </span>
            </span>
            <h1 className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: "clamp(23px,4.6vw,34px)", fontWeight: 800, lineHeight: 1.04, letterSpacing: "-0.02em" }}>{detail.title}</h1>
          </div>
          {detail.regulationNote ? <p className="relative mt-1.5 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{detail.regulationNote}</p> : null}
          <div className="relative mt-4 flex flex-wrap items-center gap-2">
            {[
              { k: "Model simulation", v: "precomputed" },
              ...(sim.allowsRunCountClaim && sim.runCount != null ? [{ k: "Runs", v: sim.runCount.toLocaleString() }] : []),
              { k: "Generated picks", v: String(sim.generatedPicks.length) },
            ].map((m) => (
              <span key={m.k} className="inline-flex items-baseline gap-1.5 rounded-full px-3 py-1.5" style={{ background: "rgba(10,10,11,0.5)", border: "1px solid var(--vault-rule)" }}>
                <span className="font-mono uppercase tracking-[0.08em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>{m.k}</span>
                <span className="font-display" style={{ color: "var(--vault-text)", fontSize: 12.5, fontWeight: 700 }}>{m.v}</span>
              </span>
            ))}
          </div>
        </section>

        {/* The simulation runner is the whole experience: idle (generate card + preview pills) → reveal
            (≥10s animation) → done (dashboard + the gated report/spotlight/tabs + post-reveal nav). */}
        <GameSimulationRunner
          view={sim}
          homeLogo={detail.homeLogo}
          awayLogo={detail.awayLogo}
          postReveal={<PostRevealTabs tabs={mlbDashTabs} />}
        />

        {/* Persistent disclosure — visible regardless of phase. */}
        <p className="mt-6 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          Paper-only · educational · not betting advice
        </p>
      </div>
    );
  }

  // ── World Cup market-implied dashboard: a gated Generate flow (no runCount claim). The Game Center
  //    + the existing WC report are handed to the runner's postReveal — revealed ONLY after Generate,
  //    absent from the pre-click DOM (no probability/total leak). ──
  const isWcSim = detail.sport === "world_cup" && !!detail.wcGameCenter;
  if (isWcSim) {
    const gc = detail.wcGameCenter!;
    const supported = [
      gc.matchResult && "Match result",
      gc.doubleChance && "Double chance",
      gc.drawNoBet && "Draw no bet",
      gc.total && "Match total",
      gc.btts && "BTTS",
    ].filter(Boolean) as string[];
    const wcReportEl = detail.gameLabWc ? <div><WcGameLabReport view={detail.gameLabWc} /></div> : null;
    // ── Overview-led tabbed dashboard (Soccer/WC). Entirely inside the runner's postReveal → gated.
    // Overview = the market-implied Match Result Center + expanded markets (the main answer); the dense
    // WC report moves into Advanced Report; Scorers + Coming Soon are honest roadmap panels. ──
    const wcDashTabs: PostRevealTab[] = [
      { key: "overview", label: "Overview", content: <WcGameCenter gameCenter={gc} expanded={detail.wcExpanded} /> },
      { key: "scorers", label: "Scorers", content: <ScorersPanel /> },
      ...(wcReportEl ? [{ key: "advanced", label: "Advanced report", content: wcReportEl }] : []),
      { key: "coming-soon", label: "Coming soon", content: <SoccerComingSoonRoadmap /> },
      { key: "methodology", label: "Methodology", content: <MethodologyPanel sport="world_cup" /> },
    ];
    return (
      <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
        <div className="mb-2">
          <Link href="/games" className="inline-flex items-center -ml-1 px-1 py-2 font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 40 }}>← All games</Link>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{detail.date}{detail.venue ? " · " + detail.venue : ""}</span>
          <CompetitionBadge sport="world_cup" size="sm" />
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.12em]" style={{ background: "rgba(46,160,102,0.14)", border: "1px solid rgba(46,160,102,0.4)", color: "var(--gtp-success-on-dark, #7ee2a8)", fontSize: 9 }}>
            <span aria-hidden>▶</span> Market Dashboard Ready
          </span>
        </div>
        <WcSimulationRunner
          homeTeam={detail.homeTeam ?? gc.homeTeam}
          awayTeam={detail.awayTeam ?? gc.awayTeam}
          homeCode={gc.homeCode}
          awayCode={gc.awayCode}
          stageLabel={gc.stage}
          kickoff={gc.kickoffUtc}
          supportedMarkets={supported}
          postReveal={<PostRevealTabs tabs={wcDashTabs} />}
        />
        <p className="mt-6 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          Paper-only · educational · not betting advice
        </p>
      </div>
    );
  }

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-6 sm:py-10 overflow-x-hidden">
      <div className="mb-2">
        <Link href="/games" className="inline-flex items-center -ml-1 px-1 py-2 font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-text-mute)", fontSize: 10, minHeight: 40 }}>← All games</Link>
      </div>
      {/* Hero / matchup */}
      <section className="relative overflow-hidden rounded-[14px] px-5 py-6 mb-5" style={{ border: "1px solid var(--vault-border-strong)", background: "radial-gradient(120% 150% at 0% 0%, rgba(242, 54, 69,0.10) 0%, transparent 55%), linear-gradient(135deg, rgba(22,30,62,0.94) 0%, rgba(26, 16, 11,0.97) 100%)" }}>
        <span className="flex items-center gap-2">
          <span className="gtp-sport-orb shrink-0" style={{ width: 26, height: 26, fontSize: 14, ["--orb-grad" as string]: identity.gradient }} role="img" aria-label={identity.ballLabel}>{identity.icon}</span>
          <span className="font-mono uppercase tracking-[0.2em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>{detail.date}{detail.venue ? " · " + detail.venue : ""}</span>
          <CompetitionBadge sport={detail.sport} size="sm" />
        </span>
        <div className="mt-1.5 flex items-center gap-3 min-w-0">
          {homeCode || awayCode || detail.homeLogo || detail.awayLogo ? (
            <span className="inline-flex items-center gap-1.5 shrink-0" aria-label={`${detail.homeTeam} versus ${detail.awayTeam}`}>
              <TeamMark name={detail.homeTeam} logoUrl={detail.homeLogo} flagCode={homeCode} size="lg" />
              <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>v</span>
              <TeamMark name={detail.awayTeam} logoUrl={detail.awayLogo} flagCode={awayCode} size="lg" />
            </span>
          ) : null}
          <h1 className="font-display tracking-tight truncate" style={{ color: "var(--vault-text)", fontSize: "clamp(22px,4.5vw,32px)", fontWeight: 700, lineHeight: 1.05 }}>{detail.title}</h1>
        </div>
        {detail.regulationNote ? <p className="mt-1 font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{detail.regulationNote}</p> : null}
        {/* Hero quick reads — the two strongest picks only; full reads (incl. cards) are in the spotlight below. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {topProj ? <span className="rounded-full px-2.5 py-1 font-mono" style={{ background: "rgba(242,54,69,0.12)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5 }}>Top pick · {topProj.pickLabel} {american(topProj.americanOdds)}</span> : null}
          {topPlayer ? <span className="rounded-full px-2.5 py-1 font-mono" style={{ background: "rgba(217,164,65,0.12)", border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 10.5 }}>Top prop · {topPlayer.player?.name} {american(topPlayer.americanOdds)}</span> : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={detail.buildUrl} className="gtp-cta-lava vault-press inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.12em]" style={{ fontSize: 11, fontWeight: 700, textDecoration: "none", minHeight: 42 }}>Build from this game</Link>
          <Link href="/picks" className="vault-press inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 42 }}>Open Parlay Lab</Link>
          <Link href={`/${detail.sport === "world_cup" ? "world-cup" : detail.sport}`} className="vault-press inline-flex items-center rounded-full px-4 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none", minHeight: 42 }}>View {detail.sportLabel}</Link>
        </div>
      </section>

      {/* MLB Game Lab report — the deeper per-game model report (model-vs-market, biggest leans, recent
          form, product-mapping links + honest "not yet simulated" placeholders). Shown directly here for
          an MLB fixture WITHOUT a simulation; an MLB-sim fixture gates it behind Generate (handled above). */}
      {mlbReport}

      {/* World Cup Game Lab report — the prominent per-game odds-only model report (model-vs-market, biggest
          team-market leans, regulation-90 caveats, artifact-proven product links + honest placeholders). */}
      {detail.gameLabWc ? <div className="mb-5"><WcGameLabReport view={detail.gameLabWc} /></div> : null}

      {/* Model spotlight — the strongest reads, above the tabs */}
      <div className="mb-5">{spotlight}</div>

      {tabsShell}

      {/* Persistent disclosure — visible regardless of the active tab. */}
      <p className="mt-6 font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
        Paper-only · educational · not betting advice
      </p>
    </div>
  );
}
