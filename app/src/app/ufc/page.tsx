/**
 * /ufc — UFC hub as a uniform tabbed SportShell (matches /world-cup + /mlb + /nba).
 *
 * Tabs: Overview · Fight Card · Projections · Suggested Cards · Results · Methodology. Moneyline-
 * only scope: V1 moneyline projections carry REAL sportsbook odds (shared ProjectionCard);
 * suggested cards are model-probability only → no payout (shared SuggestedCard, "no market odds").
 * FAIL-CLOSED: nothing publishes until the readiness gates pass. No fake odds/props; no banned copy.
 */
import fs from "node:fs";
import CompetitionBadge from "@/components/ui/competition-badge";
import { getSportIdentity } from "@/lib/sport-identity";
import path from "node:path";

import {
  normalizeUfcProjections,
  normalizeUfcCards,
} from "@/lib/normalize";
import SectionHeader from "@/components/section-header";
import SportMethodologyPanel from "@/components/sport-methodology-panel";
import SimulationCoverageMatrix from "@/components/simulation-coverage-matrix";
import SportOverviewHero from "@/components/sport-overview-hero";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import StatusChip from "@/components/ui/status-chip";
import UfcExpandedFightCards from "@/components/ufc/expanded-fight-cards";
import UfcEventResultsRecap, { type UfcSettlement } from "@/components/ufc/event-results-recap";
import MultiSportReportShell from "@/components/game/multi-sport-report-shell";
import { ufcEventToReports } from "@/lib/multi-sport-report/ufc-adapter";
import UfcFightNightHero from "@/components/ufc/ufc-fight-night-hero";
import UfcSimulationAnimation from "@/components/ufc/ufc-simulation-animation";
import UfcPredictionsV2 from "@/components/ufc/ufc-predictions-v2";
import { buildUfcCardPredictions, buildFighterIndex, keyForNames, type EngineOddsBout } from "@/lib/ufc/ufc-prediction-engine";

export const metadata = {
  title: "UFC · GameTime Picks",
  description:
    "UFC V1 moneyline projections + suggested moneyline parlays from real schedule, sportsbook lines, and fighter stats. Moneyline-only; props not offered yet. Educational, paper-only.",
};

type Readiness = {
  scheduleReady: boolean; oddsReady: boolean; fighterStatsReady: boolean; gradingReady: boolean;
  backtestReady: boolean; projectionsReady: boolean; parlayReady: boolean; publicLevel: string;
  blockers: string[]; publicMessage: string;
  propMarketsAvailable?: { h2h?: boolean; method?: boolean; distance?: boolean; rounds?: boolean };
};
type OddsSide = { name: string; price: number; impliedProbability: number };
type OddsBout = { eventId?: string; commenceTime?: string; fighters: string[]; bookmaker?: string; lastUpdate?: string; sides: OddsSide[] };
type OddsArtifact = { oddsReady: boolean; generatedAt?: string; bouts: OddsBout[] };
type OpsStatus = {
  currentStage: number; currentStageName: string; cleanGradedRows: number; targetRowsForPublicMoneyline: number;
  latestPregameSnapshotAt?: string; latestResultsRefreshAt?: string; publicPicksVisible: boolean; blockers: string[];
  nextCard?: { eventName?: string; eventDate?: string };
};
type V1Projection = { fighter: string; opponent: string; oddsPrice: number; marketImpliedProbability: number; modelProbability: number; label: string };
type V1Projections = { moneylineV1Ready: boolean; moneylineValidated: boolean; eventName?: string; generatedAt?: string; projections: V1Projection[] };
type V1Parlays = { parlayV1Ready: boolean; publicReady?: boolean; cards: { riskLabel?: string; legs?: { fighter?: string; modelProbability?: number }[] }[] };

function loadJSONUfc<T>(name: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", name), "utf-8")) as T; } catch { return fallback; }
}

const fmtAmerican = (p: number) => (p > 0 ? `+${p}` : `${p}`);
const fmtDate = (iso?: string) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }); } catch { return iso; }
};

const LAYERS: { key: keyof Readiness; label: string; detail: string }[] = [
  { key: "scheduleReady", label: "Schedule", detail: "Event cards + fighters (free ESPN MMA)" },
  { key: "oddsReady", label: "Odds", detail: "Sportsbook moneyline lines (The Odds API MMA)" },
  { key: "fighterStatsReady", label: "Fighter stats", detail: "Records, striking, takedowns, finish rates" },
  { key: "gradingReady", label: "Results grading", detail: "Moneyline grading vs settled fights" },
  { key: "backtestReady", label: "Backtest", detail: "Calibration needs ~150 completed clean fights" },
];

export default function UfcPage() {
  const r = loadJSONUfc<Readiness>("readiness-latest.json", {
    scheduleReady: false, oddsReady: false, fighterStatsReady: false, gradingReady: false, backtestReady: false,
    projectionsReady: false, parlayReady: false, publicLevel: "schedule-only", blockers: [], publicMessage: "UFC coverage is being built.",
  });
  const odds = loadJSONUfc<OddsArtifact>("odds-latest.json", { oddsReady: false, bouts: [] });
  const ops = loadJSONUfc<OpsStatus | null>("ops-status-latest.json", null);
  const v1Proj = loadJSONUfc<V1Projections | null>("projections-latest.json", null);
  const sched = loadJSONUfc<{ venue?: string; fightCount?: number; eventDate?: string; fights?: Array<{ boutId?: string; fighterA?: string; fighterB?: string; weightClass?: string | null }> } | null>("schedule-latest.json", null);
  const v1Parlays = loadJSONUfc<V1Parlays | null>("suggested-parlays-latest.json", null);
  const expanded = loadJSONUfc<{ projections?: unknown[] } | null>("expanded-projections-latest.json", null);
  // STALE-ARTIFACT GUARD: expanded-projections can be generated for a DIFFERENT card. Only surface expanded
  // fights whose fighters are on the CURRENT schedule — never show wrong-card fighters publicly.
  const schedFighterKeys = new Set<string>();
  for (const f of (sched?.fights ?? []) as Array<{ fighterA?: string; fighterB?: string }>) {
    schedFighterKeys.add(keyForNames(f.fighterA, "").split("|")[0]);
    schedFighterKeys.add(keyForNames(f.fighterB, "").split("|")[0]);
  }
  const allExpanded = (expanded?.projections ?? []) as Parameters<typeof UfcExpandedFightCards>[0]["fights"];
  const expandedFights = allExpanded.filter((f) => {
    const names = (f?.fighters ?? []) as string[];
    return names.length >= 2 && names.every((n) => schedFighterKeys.has(keyForNames(n, "").split("|")[0]));
  });
  const settlement = loadJSONUfc<UfcSettlement | null>("results-settled-latest.json", null);

  // STALE GATE: once the latest event is officially settled (status "final"), the fight card / projections
  // are last event's — not an active slate. We stop showing them as active and point to Results until the
  // next card's odds + projections publish. Same signal the active-sports loaders use on /today + /games.
  // Stale/settled ONLY when the settled event IS the current card. A PAST card being final (e.g. last
  // month's event) must not hide a freshly-ingested UPCOMING card (UFC 329) whose odds just published.
  const ufcSettled = settlement?.status === "final" && (settlement.event ?? "") === (v1Proj?.eventName ?? ops?.nextCard?.eventName ?? "");

  const showV1Proj = Boolean(v1Proj?.moneylineV1Ready && v1Proj.projections?.length);
  const v1Validated = Boolean(v1Proj?.moneylineValidated);
  // Model-adjusted UFC output (model probability / edge / model pick / suggested model cards) is GATED from
  // the public page until the moneyline model is validated AND publicPicksVisible flips true. Until then the
  // page shows the MARKET-IMPLIED read only; cleanGradedRows/target drive the honest "why". No fake unlock.
  const modelGated = !v1Validated || !(ops?.publicPicksVisible ?? false);
  const gradedRows = ops?.cleanGradedRows ?? 0;
  const gradedTarget = ops?.targetRowsForPublicMoneyline ?? 150;
  const ufcProjections = normalizeUfcProjections(v1Proj);
  const ufcCards = normalizeUfcCards(v1Parlays as Parameters<typeof normalizeUfcCards>[0], "");
  const eventName = v1Proj?.eventName ?? ops?.nextCard?.eventName ?? "Next card";
  const settledEventName = settlement?.event ?? eventName;
  // Headliner names for the octagon hero — parsed from the real event name ("UFC 329: A vs. B"), never faked.
  const headliners = ((): [string, string] | null => {
    const after = eventName.includes(":") ? eventName.split(":").slice(1).join(":").trim() : eventName;
    const parts = after.split(/\s+vs\.?\s+/i);
    return parts.length === 2 && parts[0] && parts[1] ? [parts[0].trim(), parts[1].trim()] : null;
  })();
  const bouts = odds.oddsReady ? odds.bouts : [];
  const pct = ops ? Math.min(100, Math.round((ops.cleanGradedRows / Math.max(1, ops.targetRowsForPublicMoneyline)) * 100)) : 0;

  const heroStats = ufcSettled
    ? [
        { label: "Latest event", value: settledEventName.length > 20 ? settledEventName.slice(0, 20) + "…" : settledEventName, sub: "settled" },
        { label: "Status", value: "Settled", sub: "see Results" },
        { label: "Next card", value: "Loading soon", sub: undefined },
      ]
    : [
        { label: "Next card", value: eventName.length > 22 ? eventName.slice(0, 22) + "…" : eventName, sub: ops?.nextCard?.eventDate ? fmtDate(ops.nextCard.eventDate) : undefined },
        { label: "Moneyline projections", value: String(ufcProjections.length), sub: showV1Proj ? "real odds" : "pending" },
        { label: "Suggested cards", value: String(ufcCards.length), sub: "model-only" },
      ];

  const boutsBoard = (
    <div className="flex flex-col gap-2">
      {bouts.map((b, i) => (
        <div key={b.eventId || i} className="rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{fmtDate(b.commenceTime)}</span>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{b.bookmaker}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {b.sides.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>{s.name}</span>
                <span className="flex items-center gap-3">
                  <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 13 }}>{fmtAmerican(s.price)}</span>
                  <span className="font-mono tabular" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{Math.round(s.impliedProbability * 100)}% impl</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  // ── Market-implied FreeSim fight reports (the shared MultiSportReportShell). Built from the de-vigged
  //    two-sided moneyline only; model-adjusted picks stay gated while moneylineValidated=false. Skipped
  //    once the card is settled (stale). Nothing fabricated — fights without odds are simply absent. ──
  const fightReports = ufcSettled ? [] : ufcEventToReports(v1Proj, odds as Parameters<typeof ufcEventToReports>[1]);
  // UFC Prediction Engine V1 — one complete read per fight. Moneyline is market-implied (de-vigged real
  // odds); fight type / distance / method are GameTime V1 model reads computed from the real fighter-stats
  // DB where both fighters are present, else "Insufficient data". No fabrication; experimental + gated.
  const fightersDb = loadJSONUfc<{ fighters?: Array<Record<string, unknown>> } | null>("fighters-latest.json", null);
  const oddsIndexV1 = new Map<string, EngineOddsBout>();
  for (const bt of odds.bouts ?? []) {
    const names = bt.sides ? bt.sides.map((s) => s.name) : [];
    if (names.length >= 2) oddsIndexV1.set(keyForNames(names[0], names[1]), bt as EngineOddsBout);
  }
  const engineRows = !ufcSettled && sched?.fights ? buildUfcCardPredictions(sched.fights, oddsIndexV1, buildFighterIndex(fightersDb?.fighters)) : [];
  const predictionTableSection = engineRows.length > 0 ? (
    <UfcPredictionsV2
      rows={engineRows}
      title={`${eventName.includes(":") ? eventName.split(":")[0].trim() : eventName} Predictions`}
      subtitle="Moneyline uses live market-implied probabilities. Fight type, distance, and method are GameTime V1 model reads when enough fighter data exists."
    />
  ) : null;
  const featuredReport = fightReports[0];
  const featuredWp = featuredReport?.simulationOutput.winProbabilities ?? [];
  const featuredRow = featuredReport && featuredWp.length === 2
    ? engineRows.find((r) => keyForNames(r.fighterA, r.fighterB) === keyForNames(featuredWp[0].label, featuredWp[1].label))
    : undefined;
  const featuredAnim = featuredReport && featuredWp.length === 2 ? (
    <UfcSimulationAnimation
      fighterA={featuredWp[0].label} fighterB={featuredWp[1].label}
      probA={featuredWp[0].probability} probB={featuredWp[1].probability}
      oddsA={featuredRow?.moneyline.oddsA ?? null} oddsB={featuredRow?.moneyline.oddsB ?? null}
      fightType={featuredRow?.fightType.source === "model_derived" ? featuredRow.fightType.label : undefined}
      distanceLean={featuredRow?.goesDistance.source === "model_derived" ? featuredRow.goesDistance.lean ?? undefined : undefined}
      methodLean={featuredRow?.method.source === "model_derived" ? featuredRow.method.lean ?? undefined : undefined}
      roundRange={featuredRow?.roundRange.source === "model_derived" ? featuredRow.roundRange.lean ?? undefined : undefined}
      winnerMethod={featuredRow?.display.winnerMethodText}
    />
  ) : null;
  const fightSimsSection = fightReports.length > 0 ? (
    <section className="flex flex-col gap-3">
      <SectionHeader
        eyebrow={`UFC Simulation Center · experimental · ${fightReports.length} fights`}
        title={`${eventName} — market-implied fight reports`}
        sub="Each fight's de-vigged sportsbook moneyline as a FreeSim-style report: Market Snapshot → Simulation Output → Main Read → Top Leans → Key Takeaways → Details. Market-implied simulation — not an independent 10,000-run UFC model. Model-adjusted picks stay gated until validation. Paper-only."
      />
      <div className="rounded-[10px] p-3" style={{ border: "1px solid var(--vault-border-strong)", background: "rgba(26, 16, 11,0.4)" }}>
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Featured fight</span>
        {featuredAnim ? <div className="mt-2">{featuredAnim}</div> : null}
        <div className="mt-2"><MultiSportReportShell report={fightReports[0]} /></div>
      </div>
      {fightReports.slice(1).map((rep) => (
        <details key={rep.eventId} className="rounded-[10px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
            <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{rep.eventName}</span>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>{rep.mainRead.label.replace(/^Market-implied favorite: /, "").replace(/ — no clear market favorite$/, "· pick'em")}</span>
          </summary>
          <div className="mt-3"><MultiSportReportShell report={rep} /></div>
        </details>
      ))}
    </section>
  ) : null;

  // Honest public status strip: market-implied is live now; model-adjusted picks are gated behind real
  // validation (clean graded fights vs threshold). No fake unlock.
  const validationStrip = (
    <div className="flex flex-wrap items-center gap-2 rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
      <span className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.12em]" style={{ background: "rgba(46,160,102,0.14)", border: "1px solid rgba(46,160,102,0.4)", color: "var(--gtp-success-on-dark, #7ee2a8)", fontSize: 9 }}>Public now · market-implied</span>
      <span className="rounded-full px-2.5 py-1 font-mono uppercase tracking-[0.12em]" style={{ background: "rgba(217,164,65,0.12)", border: "1px solid rgba(217,164,65,0.4)", color: "var(--vault-gold-bright)", fontSize: 9 }}>Gated · model-adjusted picks</span>
      <span className="font-mono" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>Validation · {gradedRows} / {gradedTarget} clean graded fights</span>
    </div>
  );
  // Shown wherever model-adjusted output would otherwise render while the model is unvalidated.
  const modelGatedPanel = (
    <div className="rounded-[10px] px-4 py-5 flex flex-col gap-1.5" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
      <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>Model-adjusted picks · validating</span>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        Model-adjusted UFC picks are still validating. We need {gradedTarget} clean graded fights before public model picks unlock — current clean graded rows: <strong style={{ color: "var(--vault-text)" }}>{gradedRows} / {gradedTarget}</strong>. For {eventName}, public predictions are market-implied from real moneyline odds (see the fight simulations).
      </p>
    </div>
  );

  // ─────────────────────────── Tabs ───────────────────────────
  const fightNightHero = (
    <UfcFightNightHero
      eventName={eventName}
      eventDate={sched?.eventDate ?? ops?.nextCard?.eventDate}
      venue={sched?.venue}
      fightCount={sched?.fightCount ?? bouts.length}
      oddsCount={fightReports.length}
      gradedRows={gradedRows}
      gradedTarget={gradedTarget}
      headliners={headliners}
    />
  );

  const overviewTab = (
    <div className="flex flex-col gap-6">
      {fightNightHero}
      <div className="flex items-center gap-3 flex-wrap rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
        <StatusChip label={showV1Proj ? "Market-implied sims live" : "Pending"} />
        <span style={{ color: "var(--vault-text)", fontSize: 13 }}>
          {showV1Proj ? `Market-implied fight simulations are live for ${eventName} — de-vigged real sportsbook moneylines. Model-adjusted picks are still validating before public release. Moneyline only; method/distance/round props aren't offered by the current feed.` : "Projections publish once the data gates pass."}
        </span>
      </div>
      {validationStrip}
      {predictionTableSection}
      {fightSimsSection}
      {ufcCards.length > 0 && !modelGated && (
        <section>
          <SectionHeader eyebrow={`Suggested cards · ${ufcCards.length}`} title="Suggested moneyline cards" sub="Model-probability cards (no market odds, so no paper payout). Conservative, moneyline-only — no props, no same-fight combos." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ufcCards.slice(0, 3).map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </section>
      )}
      {modelGated && ufcCards.length > 0 ? modelGatedPanel : null}
      {bouts.length > 0 && (
        <section>
          <SectionHeader eyebrow="Advanced odds board" title={`${eventName} · raw book lines`} sub="The raw two-sided sportsbook moneyline prices behind the fight simulations above. Book lines, not model picks." />
          {boutsBoard}
        </section>
      )}
    </div>
  );

  const fightCardTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Fight card" title={eventName} sub="Real sportsbook moneyline prices + market-implied probability. These are book lines, not model projections." />
      {bouts.length > 0 ? boutsBoard : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>The fight-card odds board appears once the sportsbook posts moneyline lines for the next event.</p>
      )}
    </div>
  );

  const projectionsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow={`Projections · ${ufcProjections.length} moneyline views`}
        title={modelGated ? "UFC market-implied moneyline reads" : "UFC V1 moneyline projections · validated"}
        sub={modelGated
          ? "De-vigged market-implied win probability from real sportsbook moneyline. Model-adjusted probability and edge are gated until the UFC model is validated (see the status strip). Moneyline only — no method/distance/round props."
          : "Win probability from real schedule, sportsbook lines, and fighter stats vs the market-implied price. Model probability, market probability, and edge on each fighter. Moneyline only — no method/distance/round props."}
      />
      {modelGated ? validationStrip : null}
      {ufcProjections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ufcProjections.map((p) => <ProjectionCard key={p.id} p={p} hideModel={modelGated} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Win / method / round projections require a fighter-stat provider, real odds, and a calibrated backtest before anything publishes.</p>
      )}
    </div>
  );

  const expandedModelReady = expandedFights.some((f) => f.method);
  const marketCoverage: { key: string; label: string; state: "odds-backed" | "model-only" | "unavailable"; detail: string }[] = [
    {
      key: "h2h", label: "Moneyline (h2h)", state: showV1Proj ? "odds-backed" : "unavailable",
      detail: showV1Proj
        ? `${ufcProjections.length} model-reviewed win projections with real sportsbook odds and edge — parlay eligible.`
        : "Awaiting two-sided moneyline lines for the next card.",
    },
    { key: "rounds", label: "Total rounds (Over / Under)", state: r.propMarketsAvailable?.rounds ? "odds-backed" : expandedModelReady ? "model-only" : "unavailable", detail: "No sportsbook odds in the feed (moneyline-only). Shown as a model-only projection in the Expanded Projections tab — for insight, not parlay eligible." },
    { key: "distance", label: "Goes the distance / does not", state: r.propMarketsAvailable?.distance ? "odds-backed" : expandedModelReady ? "model-only" : "unavailable", detail: "No sportsbook odds in the feed (moneyline-only). Shown as a model-only projection in the Expanded Projections tab — for insight, not parlay eligible." },
    { key: "method", label: "Method of victory (KO/TKO · submission · decision)", state: r.propMarketsAvailable?.method ? "odds-backed" : expandedModelReady ? "model-only" : "unavailable", detail: "No sportsbook odds in the feed (moneyline-only). Shown as a model-only projection in the Expanded Projections tab — for insight, not parlay eligible." },
  ];
  const stateStyle = (s: "odds-backed" | "model-only" | "unavailable") =>
    s === "odds-backed" ? { c: "var(--vault-success)", bg: "rgba(110,231,168,0.14)", b: "rgba(110,231,168,0.35)", label: "ODDS-BACKED" }
      : s === "model-only" ? { c: "var(--gtp-bank-heat)", bg: "var(--gtp-bank-heat-dim)", b: "rgba(242, 54, 69,0.32)", label: "MODEL-ONLY" }
        : { c: "var(--vault-text-faint)", bg: "rgba(26, 16, 11,0.6)", b: "var(--vault-rule)", label: "UNAVAILABLE" };
  const marketsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Markets · ${marketCoverage.filter((m) => m.state === "odds-backed").length} odds-backed`} title="UFC market coverage" sub="Moneyline is odds-backed and parlay eligible. The connected MMA feed is moneyline (h2h) only, so total-rounds / goes-the-distance / method-of-victory have no sportsbook odds — they are shown as model-only projections (insight only, never priced into suggested cards). Nothing is fabricated." />
      <div className="flex flex-col gap-2">
        {marketCoverage.map((m) => {
          const st = stateStyle(m.state);
          return (
            <div key={m.key} className="flex items-start gap-3 rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
              <span className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[9.5px] font-bold tracking-[0.1em]" style={{ color: st.c, background: st.bg, border: `1px solid ${st.b}` }}>
                {st.label}
              </span>
              <span className="flex flex-col">
                <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{m.label}</span>
                <span className="font-mono leading-snug" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{m.detail}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Suggested cards · ${ufcCards.length}`} title="UFC suggested moneyline parlays" sub="Conservative cards built only from moneyline legs — no props, no same-fight combinations. Model-probability only: no market odds, so no paper payout is shown. Educational / paper, not betting advice." />
      {modelGated ? (
        modelGatedPanel
      ) : ufcCards.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ufcCards.map((c) => <SuggestedCard key={c.id} card={c} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Suggested cards publish once the V1 moneyline model is live for a real scheduled card.</p>
      )}
    </div>
  );

  const resultsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow="Results" title="UFC track record" sub="Moneyline picks graded against settled fights — wins and losses both shown. The validated badge appears only after a no-leakage backtest threshold is met." />
      {settlement ? <UfcEventResultsRecap s={settlement} /> : ops ? (
        <div className="rounded-[8px] px-4 py-4 flex flex-col gap-2" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>Validation progress</span>
            <span className="font-mono tabular" style={{ color: "var(--vault-text-mute)", fontSize: 11 }}>{ops.cleanGradedRows} / {ops.targetRowsForPublicMoneyline} clean graded fights</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--vault-rule)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--vault-success)" }} aria-hidden />
          </div>
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No graded UFC fights yet — results appear after real fights are settled.</p>
      )}
    </div>
  );

  const methodologyTab = (
    <div className="flex flex-col gap-6">
      <section>
        <SectionHeader eyebrow="Methodology" title="UFC V1 — moneyline only" sub="Educational analytics — not betting advice. The V1 model publishes moneyline only, for real scheduled cards (never futures). Method / distance / round props require a prop-odds provider not yet connected." />
        <ul className="grid gap-2 sm:grid-cols-2">
          {LAYERS.map((layer) => {
            const ready = Boolean(r[layer.key]);
            return (
              <li key={layer.key} className="flex items-start gap-3 rounded-[8px] px-4 py-3" style={{ background: "rgba(26, 16, 11,0.55)", border: "1px solid var(--vault-border)" }}>
                <StatusChip label={ready ? "Live" : "Pending"} />
                <span className="flex flex-col">
                  <span style={{ color: "var(--vault-text)", fontSize: 13, fontWeight: 600 }}>{layer.label}</span>
                  <span className="font-mono leading-snug" style={{ color: "var(--vault-text-faint)", fontSize: 10.5 }}>{layer.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-[12px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        We don&apos;t publish picks from odds or names alone. UFC joins the product the same way MLB did — only after the model is graded against real outcomes and survives a backtest.
      </p>
    </div>
  );

  const expandedTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader
        eyebrow={`Expanded projections · ${expandedFights.length} fights`}
        title="Fight-by-fight breakdown — model-only"
        sub={modelGated
          ? "The moneyline shows the market-implied read only (model probability + edge are gated until validation). Goes-the-distance, total-rounds, and method-of-victory have NO sportsbook odds in the feed, so they are UNVALIDATED model-only projections — insight only, never a pick, never parlay eligible."
          : "Tap a fight for goes-the-distance, total-rounds, and method-of-victory projections derived from real fighter finish/method history. The moneyline leg is odds-backed; the expanded markets have no sportsbook odds in the feed, so they are model-only and NOT parlay eligible — shown for insight, never priced into cards."}
      />
      {modelGated ? validationStrip : null}
      <UfcExpandedFightCards fights={expandedFights} hideModel={modelGated} />
    </div>
  );

  // When the latest event is settled, the active fight-card / projections tabs are stale — replace the
  // Overview with a "next slate loading soon" panel and surface only Results + Methodology alongside it.
  const nextSlateTab = (
    <div className="flex flex-col gap-4">
      <div className="rounded-[12px] px-5 py-6 flex flex-col gap-2" style={{ background: "rgba(26, 16, 11,0.6)", border: "1px solid var(--vault-border-strong)" }}>
        <span className="font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>UFC · next slate loading soon</span>
        <span className="font-display tracking-tight" style={{ color: "var(--vault-text)", fontSize: 19, fontWeight: 700 }}>The previous event has settled</span>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
          {settledEventName} is officially settled — its graded card is in Results. The next UFC card&apos;s
          moneyline projections publish here once the schedule, sportsbook lines, and fighter stats refresh.
          We don&apos;t show last event&apos;s card as if it were active.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <a href="/ufc?tab=results" className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ background: "var(--vault-gold-dim)", border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", fontSize: 11, textDecoration: "none" }}>See settled results →</a>
          <a href="/results" className="vault-press rounded-full px-4 py-2 font-mono uppercase tracking-[0.12em]" style={{ border: "1px solid var(--vault-rule)", color: "var(--vault-text-mute)", fontSize: 11, textDecoration: "none" }}>All results</a>
        </div>
      </div>
      {settlement ? <UfcEventResultsRecap s={settlement} /> : null}
    </div>
  );

  const tabs: ShellTab[] = ufcSettled
    ? [
        { key: "overview", label: "Overview", content: nextSlateTab },
        { key: "results", label: "Results", badge: null, content: resultsTab },
        { key: "methodology", label: "Methodology", badge: null, content: methodologyTab },
      ]
    : [
        { key: "overview", label: "Overview", content: overviewTab },
        { key: "fight-card", label: "Fight Card", badge: bouts.length || null, content: fightCardTab },
        { key: "projections", label: "Projections", badge: ufcProjections.length || null, content: projectionsTab },
        { key: "expanded", label: "Expanded Projections", badge: expandedFights.length || null, content: expandedTab },
        { key: "markets", label: "Markets", badge: null, content: marketsTab },
        { key: "cards", label: "Suggested Cards", badge: ufcCards.length || null, content: cardsTab },
        { key: "results", label: "Results", badge: null, content: resultsTab },
        { key: "methodology", label: "Methodology", badge: null, content: methodologyTab },
      ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <SportOverviewHero
        badge={<CompetitionBadge sport="ufc" size="sm" />}
        icon={getSportIdentity("ufc").icon}
        iconGradient={getSportIdentity("ufc").gradient}
        iconLabel={getSportIdentity("ufc").ballLabel}
        eyebrow="UFC Simulation Center · experimental"
        sport="UFC"
        tagline="market-implied fight simulations · model validating"
        statusKind={ufcSettled ? "upcoming" : showV1Proj ? "live" : "upcoming"}
        statusLabel={ufcSettled ? "Next slate loading soon" : showV1Proj ? "Market-implied sims live" : "Building coverage"}
        statusCaption={ufcSettled ? " · previous event settled" : ` · ${eventName}`}
        matchupLine={ufcSettled ? `Previous event settled · ${settledEventName} → see Results` : ops?.nextCard?.eventDate ? `Next · ${eventName} · ${fmtDate(ops.nextCard.eventDate)}` : `Next · ${eventName}`}
        stats={heroStats}
        accent="ufc"
        ctas={[
          { href: "/picks", label: "View picks", primary: true },
          { href: "/methodology", label: "How it works" },
        ]}
        framing="Market-implied fight simulations are live — each fight's de-vigged sportsbook moneyline as a FreeSim-style report (market snapshot, win probabilities, main read, takeaways). This is a market-implied read, NOT an independent 10,000-run UFC model. Model-adjusted picks stay gated until a no-leakage backtest validates them. Method, distance, and round props aren't offered — the current odds feed is moneyline (h2h) only. Educational, paper-only."
      />

      {/* Experimental methodology + honest per-market coverage — moneyline market-implied; method/distance
          experimental; round/distance odds provider-needed; results review pending. Never product-eligible. */}
      <div className="mt-8 flex flex-col gap-6">
        <SportMethodologyPanel sport="ufc" />
        <SimulationCoverageMatrix sport="ufc" />
      </div>

      <div className="mt-6">
        <SportShell tabs={tabs} />
      </div>
    </div>
  );
}
