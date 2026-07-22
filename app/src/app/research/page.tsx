import type { Metadata } from "next";
import SportOverviewHero from "@/components/sport-overview-hero";

export const metadata: Metadata = {
  title: "Research Engine · Public Beta — GameTimePicks",
  description:
    "The GameTimePicks research engine: automated pregame data capture, a settlement pipeline, observation-quality validation, and a benchmark framework — building a long-term, leakage-safe MLB dataset. Public beta.",
  openGraph: {
    title: "GameTimePicks Research Engine — Public Beta",
    description: "Simulation-powered sports analytics. Automated pregame capture · settlement · quality validation · benchmark framework. Building the dataset.",
    type: "website",
  },
};

const MILESTONES: { done: boolean; title: string; body: string }[] = [
  { done: true, title: "Automated pregame data capture", body: "Every day, leakage-safe pregame features are captured for the MLB slate — starters, lineups, bullpen, matchup, park, team form, and more — each timestamped strictly before first pitch." },
  { done: true, title: "Settlement pipeline", body: "Official box scores from the MLB Stats API are joined to the pregame snapshots after games finalize, producing a clean, labeled research record." },
  { done: true, title: "Observation quality validation", body: "An automated quality gate checks every observation for stable IDs, correct outcomes, timestamp integrity, and no leakage before anything enters the dataset." },
  { done: true, title: "Benchmark framework", body: "A market-baseline benchmark is in place to evaluate any future model out-of-sample — always compared against the market first, never assumed better." },
  { done: false, title: "Next milestone: 30 qualifying MLB observation dates", body: "The dataset grows one finalized, market-covered slate at a time. We are building a long-term historical foundation so that any future model can be evaluated honestly." },
];

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-[760px] px-4 sm:px-6 py-10">
      <SportOverviewHero
        eyebrow="Research engine · public beta"
        sport="Building the dataset."
        tagline="simulation-powered · research-backed · paper-only"
        statusKind="neutral"
        statusLabel="Public Beta"
        accent="gold"
        ctas={[
          { href: "/simulate", label: "Explore simulations", primary: true },
          { href: "/methodology", label: "How it works" },
        ]}
        framing="GameTimePicks is a simulation-powered sports analytics platform. Behind the public 10,000-run game simulations, an automated research engine is quietly building a long-term, leakage-safe historical dataset — so that any future model can be evaluated against the market, honestly and out-of-sample."
      />

      <div className="mt-8 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[12px] font-medium bg-[var(--surface-2)] text-[var(--text-mute)]">Simulation-powered analytics</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[12px] font-medium bg-[var(--surface-2)] text-[var(--text-mute)]">10,000-run game simulations</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[12px] font-medium bg-[var(--surface-2)] text-[var(--text-mute)]">Market comparison</span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[4px] text-[12px] font-medium bg-[var(--surface-2)] text-[var(--text-mute)]">Public beta</span>
      </div>

      <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-wide text-[var(--text-mute)]">Research milestones</h2>
      <ol className="mt-4 space-y-4">
        {MILESTONES.map((m) => (
          <li key={m.title} className="flex gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--surface-1)] p-4">
            <span
              aria-hidden
              className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full text-[13px] font-bold ${m.done ? "bg-[var(--surface-2)] text-[var(--accent, #F23645)]" : "border border-dashed border-[var(--border)] text-[var(--text-mute)]"}`}
            >
              {m.done ? "✓" : "→"}
            </span>
            <div>
              <div className="text-[15px] font-semibold text-[var(--text)]">{m.title}</div>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-mute)]">{m.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-[13px] leading-relaxed text-[var(--text-mute)]">
        Everything here is <strong>paper-only and educational</strong>. The public simulator is deterministic — the same 10,000-run result for every user — and is offered as an analytics tool for exploring probabilities and comparing them to the market, not as betting advice or a claim of superiority. The science continues in the background while the product is in public beta.
      </p>
    </div>
  );
}
