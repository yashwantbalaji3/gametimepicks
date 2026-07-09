"use client";
/**
 * WcSimulationRunner — the gated Generate flow for a Soccer / World Cup game.
 *
 * Mirrors the MLB simulator's gate (idle → revealing → done, postReveal shown ONLY in `done`) but
 * for a MARKET-IMPLIED dashboard: there is NO 10,000-run claim. Pre-click shows the matchup + a
 * "Generate Market Dashboard" CTA + LOCKED module previews (labels only). The reveal is a soccer-
 * specific staged pass (pitch + flags + a checklist over SIMULATION_MIN_DURATION_MS), then the
 * dashboard (Game Center + report) is revealed. No probabilities/totals leak before Generate.
 *
 * Reduced-motion: the ball animation rests; the stage checklist still advances. Deterministic —
 * every user sees the same precomputed dashboard.
 */
import { useState, useCallback, useRef, useEffect } from "react";

import FlagBadge from "@/components/flag-badge";
import { SIMULATION_MIN_DURATION_MS } from "./simulation-animation";

const WC_STAGES = [
  "Reading de-vigged market prices",
  "Building the 90-minute match result",
  "Checking totals & both-teams-to-score",
  "Double chance & draw-no-bet",
  "Market dashboard ready",
];

interface Props {
  homeTeam: string;
  awayTeam: string;
  homeCode: string;
  awayCode: string;
  stageLabel?: string | null;
  kickoff?: string | null;
  supportedMarkets: string[];
  /** Rendered ONLY in the done phase — the Game Center + WC report. */
  postReveal: React.ReactNode;
}

export default function WcSimulationRunner({
  homeTeam,
  awayTeam,
  homeCode,
  awayCode,
  stageLabel,
  kickoff,
  supportedMarkets,
  postReveal,
}: Props) {
  const [phase, setPhase] = useState<"idle" | "revealing" | "done">("idle");
  const [stage, setStage] = useState(0);
  const timersRef = useRef<number[]>([]);
  useEffect(() => () => timersRef.current.forEach((t) => window.clearTimeout(t)), []);

  const generate = useCallback(() => {
    if (phase !== "idle") return;
    setPhase("revealing");
    setStage(0);
    const per = SIMULATION_MIN_DURATION_MS / WC_STAGES.length;
    for (let i = 1; i < WC_STAGES.length; i += 1) {
      const t = window.setTimeout(() => setStage(i), Math.round(per * i));
      timersRef.current.push(t);
    }
    const done = window.setTimeout(() => {
      setStage(WC_STAGES.length - 1);
      setPhase("done");
    }, SIMULATION_MIN_DURATION_MS);
    timersRef.current.push(done);
  }, [phase]);

  const kickoffLabel = (() => {
    if (!kickoff) return null;
    try {
      return new Date(kickoff).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    } catch {
      return null;
    }
  })();

  const MatchupHero = (
    <div className="flex items-center justify-center gap-4 sm:gap-8 py-2">
      <span className="flex flex-col items-center gap-1.5">
        <FlagBadge code={homeCode} size="xl" />
        <span className="text-[12px] text-center" style={{ color: "var(--vault-text)", maxWidth: 110 }}>{homeTeam}</span>
      </span>
      <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>vs</span>
      <span className="flex flex-col items-center gap-1.5">
        <FlagBadge code={awayCode} size="xl" />
        <span className="text-[12px] text-center" style={{ color: "var(--vault-text)", maxWidth: 110 }}>{awayTeam}</span>
      </span>
    </div>
  );

  if (phase === "done") {
    return <>{postReveal}</>;
  }

  if (phase === "revealing") {
    return (
      <section aria-label="Building market dashboard" aria-live="polite" className="rounded-[14px] px-4 sm:px-6 py-6 flex flex-col items-center gap-5" style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" }}>
        {MatchupHero}
        {/* Soccer pitch reveal — CSS/SVG only, no external assets. Ball rests under reduced-motion. */}
        <div className="w-full max-w-[320px]">
          <svg viewBox="0 0 300 190" className="gtp-wc-pitch" role="img" aria-label="Soccer pitch" style={{ width: "100%", height: "auto" }}>
            <rect x="4" y="4" width="292" height="182" rx="6" fill="none" stroke="var(--vault-rule)" strokeWidth="2" />
            <line x1="150" y1="4" x2="150" y2="186" stroke="var(--vault-rule)" strokeWidth="1.5" />
            <circle cx="150" cy="95" r="30" fill="none" stroke="var(--vault-rule)" strokeWidth="1.5" />
            <rect x="4" y="55" width="34" height="80" fill="none" stroke="var(--vault-rule)" strokeWidth="1.5" />
            <rect x="262" y="55" width="34" height="80" fill="none" stroke="var(--vault-rule)" strokeWidth="1.5" />
            <circle className="gtp-wc-ball" cx="150" cy="95" r="5" fill="var(--vault-gold-bright)" />
          </svg>
        </div>
        <ol className="w-full max-w-[360px] flex flex-col gap-1.5 m-0 p-0" style={{ listStyle: "none" }}>
          {WC_STAGES.map((label, i) => (
            <li key={label} className="flex items-center gap-2 text-[12px]" style={{ color: i <= stage ? "var(--vault-text)" : "var(--vault-text-faint)" }}>
              <span aria-hidden style={{ color: i < stage ? "var(--vault-gold-bright)" : "var(--vault-text-faint)" }}>{i < stage ? "✓" : i === stage ? "•" : "·"}</span>
              {label}
            </li>
          ))}
        </ol>
        <p className="text-[11px] m-0" style={{ color: "var(--vault-text-faint)" }}>
          Building a market-implied dashboard from the de-vigged prices — not a sampled simulation.
        </p>
        <style>{`
          .gtp-wc-ball { animation: gtpWcBall 2.4s ease-in-out infinite; }
          @keyframes gtpWcBall { 0%,100% { transform: translate(-70px,0); } 50% { transform: translate(70px,10px); } }
          @media (prefers-reduced-motion: reduce) { .gtp-wc-ball { animation: none; } }
        `}</style>
      </section>
    );
  }

  // idle — pre-click: matchup + locked previews + CTA. No probabilities/totals shown.
  return (
    <section aria-label="Generate market dashboard" className="rounded-[14px] px-4 sm:px-6 py-6 flex flex-col items-center gap-5" style={{ background: "var(--gtp-card)", border: "1px solid var(--vault-rule)" }}>
      {MatchupHero}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {stageLabel ? (
          <span className="font-mono uppercase tracking-[0.14em] px-2.5 py-1 rounded-full" style={{ color: "var(--vault-text-mute)", border: "1px solid var(--vault-rule)", fontSize: 9.5 }}>{stageLabel}</span>
        ) : null}
        {kickoffLabel ? (
          <span className="font-mono px-2.5 py-1 rounded-full" style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 9.5 }}>Kickoff {kickoffLabel}</span>
        ) : null}
        <span className="font-mono uppercase tracking-[0.12em] px-2.5 py-1 rounded-full" style={{ color: "var(--vault-text-faint)", border: "1px solid var(--vault-rule)", fontSize: 9 }}>Market dashboard ready</span>
      </div>
      <button
        type="button"
        onClick={generate}
        className="vault-press inline-flex items-center justify-center rounded-full px-6 font-mono uppercase tracking-[0.14em]"
        style={{ minHeight: 48, background: "linear-gradient(180deg, var(--vault-gold-bright), #d6a945)", color: "#06091a", fontSize: 13, fontWeight: 600, border: "none" }}
      >
        Generate Market Dashboard
      </button>
      {/* Locked module previews — LABELS ONLY, no data. */}
      <div className="flex flex-wrap items-center justify-center gap-2 max-w-[420px]">
        {supportedMarkets.map((m) => (
          <span key={m} className="font-mono uppercase tracking-[0.1em] px-2.5 py-1 rounded-full flex items-center gap-1" style={{ color: "var(--vault-text-faint)", border: "1px dashed var(--vault-rule)", fontSize: 9 }}>
            <span aria-hidden>🔒</span> {m}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-center m-0" style={{ color: "var(--vault-text-faint)", maxWidth: 420 }}>
        A market-implied dashboard from the de-vigged 90-minute prices — paper-only, educational, not
        betting advice. Extra time and penalties do not count.
      </p>
    </section>
  );
}
