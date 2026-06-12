/**
 * /ufc — UFC hub as a uniform tabbed SportShell (matches /world-cup + /mlb + /nba).
 *
 * Tabs: Overview · Fight Card · Projections · Suggested Cards · Results · Methodology. Moneyline-
 * only scope: V1 moneyline projections carry REAL sportsbook odds (shared ProjectionCard);
 * suggested cards are model-probability only → no payout (shared SuggestedCard, "no market odds").
 * FAIL-CLOSED: nothing publishes until the readiness gates pass. No fake odds/props; no banned copy.
 */
import fs from "node:fs";
import { getSportIdentity } from "@/lib/sport-identity";
import path from "node:path";

import {
  normalizeUfcProjections,
  normalizeUfcCards,
} from "@/lib/normalize";
import SectionHeader from "@/components/section-header";
import SportOverviewHero from "@/components/sport-overview-hero";
import SportShell, { type ShellTab } from "@/components/ui/sport-shell";
import SuggestedCard from "@/components/ui/suggested-card";
import ProjectionCard from "@/components/ui/projection-card";
import StatusChip from "@/components/ui/status-chip";

export const metadata = {
  title: "UFC · GameTime Picks",
  description:
    "UFC V1 moneyline projections + suggested moneyline parlays from real schedule, sportsbook lines, and fighter stats. Moneyline-only; props not offered yet. Educational, paper-only.",
};

type Readiness = {
  scheduleReady: boolean; oddsReady: boolean; fighterStatsReady: boolean; gradingReady: boolean;
  backtestReady: boolean; projectionsReady: boolean; parlayReady: boolean; publicLevel: string;
  blockers: string[]; publicMessage: string;
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
  const v1Parlays = loadJSONUfc<V1Parlays | null>("suggested-parlays-latest.json", null);

  const showV1Proj = Boolean(v1Proj?.moneylineV1Ready && v1Proj.projections?.length);
  const v1Validated = Boolean(v1Proj?.moneylineValidated);
  const ufcProjections = normalizeUfcProjections(v1Proj);
  const ufcCards = normalizeUfcCards(v1Parlays as Parameters<typeof normalizeUfcCards>[0], "");
  const eventName = v1Proj?.eventName ?? ops?.nextCard?.eventName ?? "Next card";
  const bouts = odds.oddsReady ? odds.bouts : [];
  const pct = ops ? Math.min(100, Math.round((ops.cleanGradedRows / Math.max(1, ops.targetRowsForPublicMoneyline)) * 100)) : 0;

  const heroStats = [
    { label: "Next card", value: eventName.length > 22 ? eventName.slice(0, 22) + "…" : eventName, sub: ops?.nextCard?.eventDate ? fmtDate(ops.nextCard.eventDate) : undefined },
    { label: "Moneyline projections", value: String(ufcProjections.length), sub: showV1Proj ? "real odds" : "pending" },
    { label: "Suggested cards", value: String(ufcCards.length), sub: "model-only" },
  ];

  const boutsBoard = (
    <div className="flex flex-col gap-2">
      {bouts.map((b, i) => (
        <div key={b.eventId || i} className="rounded-[8px] px-4 py-3" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono uppercase tracking-[0.12em]" style={{ color: "var(--vault-text-faint)", fontSize: 9 }}>{fmtDate(b.commenceTime)}</span>
            <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{b.bookmaker}</span>
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

  // ─────────────────────────── Tabs ───────────────────────────
  const overviewTab = (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3 flex-wrap rounded-[8px] px-4 py-3" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
        <StatusChip label={showV1Proj ? "Moneyline live" : "Pending"} />
        <span style={{ color: "var(--vault-text)", fontSize: 13 }}>
          {showV1Proj ? `V1 moneyline model is live for ${eventName} — real schedule, sportsbook lines, and fighter stats. Moneyline only; method/distance/round props aren't offered yet.` : "Projections publish once the data gates pass."}
        </span>
      </div>
      {ufcCards.length > 0 && (
        <section>
          <SectionHeader eyebrow={`Suggested cards · ${ufcCards.length}`} title="Suggested moneyline cards" sub="Model-probability cards (no market odds, so no paper payout). Conservative, moneyline-only — no props, no same-fight combos." />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ufcCards.slice(0, 3).map((c) => <SuggestedCard key={c.id} card={c} />)}
          </div>
        </section>
      )}
      {bouts.length > 0 && (
        <section>
          <SectionHeader eyebrow="Fight card · book lines" title={eventName} sub="Real sportsbook moneyline prices with market-implied probability. Book lines, not model picks." />
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
      <SectionHeader eyebrow={`Projections · ${ufcProjections.length} moneyline views`} title={`UFC V1 moneyline projections${v1Validated ? " · validated" : " · validation in progress"}`} sub="Win probability from real schedule, sportsbook lines, and fighter stats vs the market-implied price. Model probability, market probability, and edge on each fighter. Moneyline only — no method/distance/round props." />
      {ufcProjections.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {ufcProjections.map((p) => <ProjectionCard key={p.id} p={p} />)}
        </div>
      ) : (
        <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>Win / method / round projections require a fighter-stat provider, real odds, and a calibrated backtest before anything publishes.</p>
      )}
    </div>
  );

  const cardsTab = (
    <div className="flex flex-col gap-4">
      <SectionHeader eyebrow={`Suggested cards · ${ufcCards.length}`} title="UFC suggested moneyline parlays" sub="Conservative cards built only from moneyline legs — no props, no same-fight combinations. Model-probability only: no market odds, so no paper payout is shown. Educational / paper, not betting advice." />
      {ufcCards.length > 0 ? (
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
      {ops ? (
        <div className="rounded-[8px] px-4 py-4 flex flex-col gap-2" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
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
              <li key={layer.key} className="flex items-start gap-3 rounded-[8px] px-4 py-3" style={{ background: "rgba(7,11,26,0.55)", border: "1px solid var(--vault-border)" }}>
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

  const tabs: ShellTab[] = [
    { key: "overview", label: "Overview", content: overviewTab },
    { key: "fight-card", label: "Fight Card", badge: bouts.length || null, content: fightCardTab },
    { key: "projections", label: "Projections", badge: ufcProjections.length || null, content: projectionsTab },
    { key: "cards", label: "Suggested Cards", badge: ufcCards.length || null, content: cardsTab },
    { key: "results", label: "Results", badge: null, content: resultsTab },
    { key: "methodology", label: "Methodology", badge: null, content: methodologyTab },
  ];

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <SportOverviewHero
        icon={getSportIdentity("ufc").icon}
        iconGradient={getSportIdentity("ufc").gradient}
        iconLabel={getSportIdentity("ufc").ballLabel}
        eyebrow="UFC · moneyline V1"
        sport="UFC"
        tagline="moneyline projections · fight card · validation"
        statusKind={showV1Proj ? "live" : "upcoming"}
        statusLabel={showV1Proj ? "Moneyline live" : "Building coverage"}
        statusCaption={` · ${eventName}`}
        matchupLine={ops?.nextCard?.eventDate ? `Next · ${eventName} · ${fmtDate(ops.nextCard.eventDate)}` : `Next · ${eventName}`}
        stats={heroStats}
        accent="ufc"
        ctas={[
          { href: "/picks", label: "View picks", primary: true },
          { href: "/methodology", label: "How it works" },
        ]}
        framing="UFC V1 publishes moneyline only — win probabilities from real schedule, sportsbook lines, and fighter stats, with a separate validated badge that appears only after a no-leakage backtest. Method, distance, and round props are not offered yet because the current odds feed is moneyline (h2h) only. Educational, paper-only."
      />

      <div className="mt-6">
        <SportShell tabs={tabs} />
      </div>
    </div>
  );
}
