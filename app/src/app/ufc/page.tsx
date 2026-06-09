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
    "UFC coverage is being built — schedule available. Model picks publish only after odds, fighter stats, results grading, and backtesting are connected. Educational analytics, no guarantees.",
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

const LAYERS: { key: keyof Readiness; label: string; detail: string }[] = [
  { key: "scheduleReady", label: "Schedule", detail: "Event cards + fighters (free ESPN MMA)" },
  { key: "oddsReady", label: "Odds", detail: "Moneyline / method / rounds — provider not connected yet" },
  { key: "fighterStatsReady", label: "Fighter stats", detail: "Records, striking, takedowns, finish rates — not connected yet" },
  { key: "gradingReady", label: "Results grading", detail: "Winner / method / round settlement — not built yet" },
  { key: "backtestReady", label: "Backtest", detail: "Walk-forward calibration on historical fights — pending" },
];

export default function UfcPage() {
  const r = loadReadiness();

  return (
    <div className="vault-page-shell px-4 sm:px-8 py-8 sm:py-14 overflow-x-hidden">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          GameTime Picks · UFC
        </p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-zinc-50">
          UFC coverage is being built
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-zinc-300">
          {r.publicMessage} Everything here is educational analytics — no wagers, no
          guarantees, and no predictions until the data and backtesting gates pass.
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
          {/* Picks gate — always derived, always last */}
          <li className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 sm:col-span-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-700/40 text-[11px] font-bold text-zinc-400" aria-hidden>
              🔒
            </span>
            <span className="flex flex-col">
              <span className="text-[14px] font-semibold text-zinc-100">
                Model picks &amp; Suggested Parlays{" "}
                <span className="text-[11px] font-medium text-zinc-500">locked</span>
              </span>
              <span className="text-[12.5px] leading-snug text-zinc-400">
                Unlocks only when odds, fighter stats, results grading, and a backtest
                are all connected — not before.
              </span>
            </span>
          </li>
        </ul>
      </section>

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
