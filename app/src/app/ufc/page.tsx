/**
 * /ufc — UFC command center (FAIL-CLOSED, data-gated).
 *
 * Honest framing: UFC publishes NO projections or parlays until odds, fighter
 * stats, results grading, and a backtest are all connected. This page reads the
 * real readiness artifact (app/public/data/ufc/readiness-latest.json, produced by
 * pipeline.ufc.build_readiness) and renders a polished data-readiness ladder +
 * gated empty states. No fake picks, no odds-only claims, no banned copy.
 */
import fs from "node:fs";
import path from "node:path";

export const metadata = {
  title: "UFC · GameTime Picks",
  description:
    "UFC V1 moneyline projections + suggested moneyline parlays from real schedule, sportsbook lines, and fighter stats. Validation in progress; props (method/distance/round) not offered yet. Educational analytics, no guarantees.",
};

type Readiness = {
  scheduleReady: boolean;
  oddsReady: boolean;
  fighterStatsReady: boolean;
  gradingReady: boolean;
  backtestReady: boolean;
  projectionsReady: boolean;
  parlayReady: boolean;
  publicLevel: string;
  blockers: string[];
  publicMessage: string;
};

function loadReadiness(): Readiness {
  const p = path.join(process.cwd(), "public", "data", "ufc", "readiness-latest.json");
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as Readiness;
  } catch {
    // Fail-closed default if the artifact is missing.
    return {
      scheduleReady: false, oddsReady: false, fighterStatsReady: false,
      gradingReady: false, backtestReady: false, projectionsReady: false,
      parlayReady: false, publicLevel: "schedule-only", blockers: ["readiness artifact unavailable"],
      publicMessage: "UFC coverage is being built.",
    };
  }
}

type OddsSide = { name: string; price: number; impliedProbability: number };
type OddsBout = { eventId?: string; commenceTime?: string; fighters: string[]; bookmaker?: string; lastUpdate?: string; sides: OddsSide[] };
type OddsArtifact = { oddsReady: boolean; generatedAt?: string; bouts: OddsBout[] };

function loadOdds(): OddsArtifact {
  const p = path.join(process.cwd(), "public", "data", "ufc", "odds-latest.json");
  try {
    const a = JSON.parse(fs.readFileSync(p, "utf-8"));
    return { oddsReady: Boolean(a.oddsReady), generatedAt: a.generatedAt, bouts: Array.isArray(a.bouts) ? a.bouts : [] };
  } catch {
    return { oddsReady: false, bouts: [] };
  }
}

type OpsStatus = {
  currentStage: number; currentStageName: string;
  cleanGradedRows: number; targetRowsForPublicMoneyline: number;
  latestPregameSnapshotAt?: string; latestResultsRefreshAt?: string;
  publicPicksVisible: boolean; blockers: string[];
  nextCard?: { eventName?: string; eventDate?: string };
};

function loadOps(): OpsStatus | null {
  const p = path.join(process.cwd(), "public", "data", "ufc", "ops-status-latest.json");
  try { return JSON.parse(fs.readFileSync(p, "utf-8")) as OpsStatus; } catch { return null; }
}

type V1Projection = { fighter: string; opponent: string; oddsPrice: number; marketImpliedProbability: number; modelProbability: number; label: string };
type V1Projections = { moneylineV1Ready: boolean; moneylineValidated: boolean; validationStatus?: string; eventName?: string; generatedAt?: string; disclaimer?: string; projections: V1Projection[] };
type V1Card = { riskLabel: string; legs: { fighter: string; modelProbability: number }[]; modelCombinedProbability?: number };
type V1Parlays = { parlayV1Ready: boolean; parlayValidated: boolean; cards: V1Card[]; disclaimer?: string };

function loadJSONUfc<T>(name: string): T | null {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "ufc", name), "utf-8")) as T; } catch { return null; }
}

const fmtAmerican = (p: number) => (p > 0 ? `+${p}` : `${p}`);
const fmtDate = (iso?: string) => {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }); } catch { return iso; }
};

const LAYERS: { key: keyof Readiness; label: string; detail: string }[] = [
  { key: "scheduleReady", label: "Schedule", detail: "Event cards + fighters (free ESPN MMA)" },
  { key: "oddsReady", label: "Odds", detail: "Sportsbook moneyline lines (The Odds API MMA)" },
  { key: "fighterStatsReady", label: "Fighter stats", detail: "Records, striking, takedowns, finish rates (UFCStats-derived, GPL-3.0)" },
  { key: "gradingReady", label: "Results grading", detail: "Moneyline grading vs settled fights (UFCStats-derived results)" },
  { key: "backtestReady", label: "Backtest", detail: "Logging pregame odds snapshots now; calibration needs ~150 completed clean fights" },
];

export default function UfcPage() {
  const r = loadReadiness();
  const odds = loadOdds();
  const ops = loadOps();
  const v1Proj = loadJSONUfc<V1Projections>("projections-latest.json");
  const v1Parlays = loadJSONUfc<V1Parlays>("suggested-parlays-latest.json");
  const showV1Proj = Boolean(v1Proj?.moneylineV1Ready && v1Proj.projections?.length);
  const showV1Parlays = Boolean(v1Parlays?.parlayV1Ready && v1Parlays.cards?.length);
  const v1Validated = Boolean(v1Proj?.moneylineValidated);
  const pct = ops ? Math.min(100, Math.round((ops.cleanGradedRows / Math.max(1, ops.targetRowsForPublicMoneyline)) * 100)) : 0;
  const pctOdds = (p: number) => `${Math.round(p * 100)}%`;

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          GameTime Picks · UFC
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-50">
          {showV1Proj ? "UFC V1 Moneyline Model" : "UFC coverage is being built"}
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-300">
          Everything here is educational analytics — no wagers and no guarantees.{" "}
          {showV1Proj
            ? "The V1 moneyline model is live from real schedule, sportsbook lines, and fighter stats. Validation is in progress — results are tracked after each card and the validated badge unlocks once the model reaches the backtest threshold. Method/distance/round props are not offered yet (current feed is h2h only)."
            : `${r.publicMessage} No predictions until the data gates pass.`}
        </p>
      </header>

      {/* Data-readiness ladder */}
      <section className="mb-10">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Data readiness
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {LAYERS.map((layer) => {
            const ready = Boolean(r[layer.key]);
            return (
              <li
                key={layer.key}
                className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
              >
                <span
                  className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    ready ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700/40 text-zinc-400"
                  }`}
                  aria-hidden
                >
                  {ready ? "✓" : "•"}
                </span>
                <span className="flex flex-col">
                  <span className="text-[14px] font-semibold text-zinc-100">
                    {layer.label}{" "}
                    <span className={`text-[11px] font-medium ${ready ? "text-emerald-400" : "text-zinc-500"}`}>
                      {ready ? "ready" : "pending"}
                    </span>
                  </span>
                  <span className="text-[12.5px] leading-snug text-zinc-400">{layer.detail}</span>
                </span>
              </li>
            );
          })}
          {/* V1 / validation status — always derived, always last */}
          <li className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:col-span-2">
            <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${showV1Proj ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700/40 text-zinc-400"}`} aria-hidden>
              {showV1Proj ? "✓" : "🔒"}
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold text-zinc-100">
                Moneyline projections &amp; Suggested Parlays{" "}
                <span className={`text-[11px] font-medium ${showV1Proj ? "text-emerald-400" : "text-zinc-500"}`}>
                  {showV1Proj ? "V1 live" : "pending"}
                </span>
              </span>
              <span className="text-[12.5px] leading-snug text-zinc-400">
                {showV1Proj
                  ? `V1 moneyline model is live from real data. Validation ${v1Validated ? "passed" : "in progress"} — the validated badge unlocks at the backtest threshold. Method/distance/round props require a prop-odds provider (current feed is h2h only).`
                  : "Goes live as V1 once odds, fighter stats, and grading are connected; validation tracked separately."}
              </span>
            </span>
          </li>
        </ul>
      </section>

      {/* Live ops status: stage + validation progress (non-pick, honest) */}
      {ops && !ops.publicPicksVisible && (
        <section className="mb-8 rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Model status — {ops.currentStageName}
            </h2>
            {ops.latestPregameSnapshotAt && (
              <span className="text-[11px] text-zinc-500">odds snapshot {fmtDate(ops.latestPregameSnapshotAt)}</span>
            )}
          </div>
          <p className="mb-3 text-[12.5px] leading-relaxed text-zinc-400">
            {showV1Proj
              ? "The V1 moneyline model is live. The separate “validated” badge unlocks after out-of-sample validation reaches threshold — collected one completed card at a time."
              : "The model pipeline is built; projections appear once the data gates pass. Validation collects one completed card at a time."}
          </p>
          <div className="mb-1 flex items-center justify-between text-[12px] text-zinc-300">
            <span>Validation progress</span>
            <span className="tabular-nums text-zinc-400">{ops.cleanGradedRows} / {ops.targetRowsForPublicMoneyline} clean graded fights</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full rounded-full bg-emerald-500/50" style={{ width: `${pct}%` }} aria-hidden />
          </div>
          <p className="mt-3 text-[12px] leading-snug text-zinc-500">
            Props (method / distance / rounds): currently <strong>not offered by the
            sportsbook feed</strong> — a prop-odds provider is being evaluated. Moneyline
            publishes first.
          </p>
        </section>
      )}

      {/* OFFICIAL V1 — moneyline projections (live; validation tracked separately) */}
      {showV1Proj && v1Proj && (
        <section className="mb-10 rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex flex-wrap items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
              <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-sky-300">V1</span>
              UFC V1 Moneyline Projections — {v1Proj.eventName}
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] ${v1Validated ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-700/50 text-zinc-300"}`}>
                {v1Validated ? "validated" : "validation in progress"}
              </span>
            </h2>
            <span className="text-[11px] text-zinc-500">updated {fmtDate(v1Proj.generatedAt)}</span>
          </div>
          <p className="mb-4 text-[12.5px] leading-relaxed text-sky-200/80">
            Official V1 model · <strong>moneyline only</strong> · from real schedule,
            real sportsbook lines, and fighter statistics. Validation is in progress —
            results are tracked after each card and the validated badge unlocks once the
            model reaches the backtest threshold. Educational only, not betting advice.
          </p>
          <ul className="flex flex-col gap-2">
            {v1Proj.projections.map((p, i) => {
              const favorsFighter = p.modelProbability >= 0.5;
              const fav = favorsFighter ? p.fighter : p.opponent;
              const favProb = favorsFighter ? p.modelProbability : 1 - p.modelProbability;
              return (
                <li key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-zinc-100">{p.fighter} <span className="text-zinc-500">vs</span> {p.opponent}</span>
                    <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-300">{p.label}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-zinc-400">
                    <span>Model lean: <strong className="text-zinc-200">{fav}</strong> {pctOdds(favProb)}</span>
                    <span>Market implied: {pctOdds(p.marketImpliedProbability)}</span>
                    <span>Price: {fmtAmerican(p.oddsPrice)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* OFFICIAL V1 — suggested moneyline parlays (conservative, moneyline only) */}
      {showV1Parlays && v1Parlays && (
        <section className="mb-10 rounded-2xl border border-sky-500/30 bg-sky-500/[0.04] p-5">
          <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-200">
            <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-sky-300">V1</span>
            UFC V1 Suggested Moneyline Parlays
            <span className="rounded-md bg-zinc-700/50 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-zinc-300">validation in progress</span>
          </h2>
          <p className="mb-4 text-[12.5px] leading-relaxed text-sky-200/80">
            Conservative cards built only from moneyline legs — no props, no same-fight
            combinations. Validation tracked separately; educational only, not betting
            advice.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {v1Parlays.cards.map((c, i) => (
              <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-[13px] font-semibold text-zinc-100">{c.riskLabel}</span>
                  {typeof c.modelCombinedProbability === "number" && (
                    <span className="text-[11px] text-zinc-400">model combined {pctOdds(c.modelCombinedProbability)}</span>
                  )}
                </div>
                <ul className="flex flex-col gap-1.5">
                  {c.legs.map((l, j) => (
                    <li key={j} className="flex items-center justify-between text-[12.5px] text-zinc-300">
                      <span>{l.fighter}</span>
                      <span className="tabular-nums text-zinc-500">{pctOdds(l.modelProbability)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Model status footnote */}
      <p className="mb-8 max-w-2xl text-[12.5px] leading-relaxed text-zinc-500">
        {showV1Proj
          ? "Model status: the UFC V1 moneyline model is live for real scheduled cards only (never futures). The separate validated badge requires a leakage-safe backtest threshold; method/distance/round props require a prop-odds provider not yet connected."
          : "Model status: the UFC moneyline methodology + feature/model pipeline are built and generating internal projections; the public V1 surface goes live once odds, fighter stats, and grading are connected for a real card — never futures markets."}
      </p>

      {/* Real sportsbook odds board (odds-only, NOT model projections) */}
      {odds.oddsReady && odds.bouts.length > 0 && (
        <section className="mb-10">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              UFC odds board
            </h2>
            <span className="text-[11px] text-zinc-500">
              Sportsbook market lines · updated {fmtDate(odds.generatedAt)}
            </span>
          </div>
          <p className="mb-3 text-[12.5px] leading-relaxed text-zinc-400">
            Real moneyline prices from sportsbooks, with market-implied probability
            (de-vig-free, single-side). These are <strong>book lines, not model
            projections</strong> — our model picks stay locked until fighter stats,
            grading, and a backtest are connected.
          </p>
          <ul className="flex flex-col gap-2">
            {odds.bouts.map((b, i) => (
              <li key={b.eventId || i} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">{fmtDate(b.commenceTime)}</span>
                  <span className="text-[11px] text-zinc-600">{b.bookmaker}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {b.sides.map((s) => (
                    <div key={s.name} className="flex items-center justify-between gap-3">
                      <span className="text-[14px] font-semibold text-zinc-100">{s.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular-nums text-[13px] text-zinc-300">{fmtAmerican(s.price)}</span>
                        <span className="tabular-nums text-[12px] text-zinc-500">
                          {Math.round(s.impliedProbability * 100)}%<span className="ml-1 text-zinc-600">implied</span>
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Honest gated empty states */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-[14px] font-semibold text-zinc-100">Projections</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
            Not available yet. Win / method / round projections require a fighter-stat
            provider, real odds, and a calibrated backtest before anything publishes.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-[14px] font-semibold text-zinc-100">Results</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">
            No graded UFC fights yet. Results appear here only after real fights are
            settled — wins and losses both shown, like every other sport on the site.
          </p>
        </div>
      </section>

      <p className="mt-8 max-w-2xl text-[12px] leading-relaxed text-zinc-500">
        Why the wait: we don&apos;t publish picks from odds or names alone. UFC joins
        the product the same way MLB did — only after the model is graded against real
        outcomes and survives a backtest.
      </p>
    </div>
  );
}
