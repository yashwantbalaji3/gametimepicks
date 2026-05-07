"use client";

/**
 * ParlayLabClient — Phase 12.
 *
 * Interactive paste-and-analyze widget for the /parlay-lab page.
 * Pure client-side: no fetching, no Odds API, no API keys, no scraping.
 * Reads the slate's leans from props and renders verdicts.
 */
import { useState, useMemo } from "react";
import {
  parsePastedBlock,
  analyzeParlay,
  type PastedLeg,
  type ParlayAnalysis,
  type LegAnalysis,
  type MatchVerdict,
} from "@/lib/parlay";
import type { PropLean, ConfidenceTier } from "@/lib/types";

interface DateOption {
  date: string;
  label: string;
}

interface Props {
  allLeans: PropLean[];
  datesAvailable: DateOption[];
}

const PLACEHOLDER_TEXT = `LeBron James Over 25.5 PTS -110
Donovan Mitchell Under 5.5 AST -115
Anthony Davis Over 9.5 REB +120

# Lines starting with # are ignored.
# One leg per line. We match player + market + line.`;

export default function ParlayLabClient({ allLeans, datesAvailable }: Props) {
  const [pastedText, setPastedText] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(
    datesAvailable[0]?.date ?? "",
  );
  const [riskProfile, setRiskProfile] = useState<
    "conservative" | "balanced" | "aggressive"
  >("balanced");

  const dateLeans = useMemo(
    () => allLeans.filter((l) => !selectedDate || l.date === selectedDate),
    [allLeans, selectedDate],
  );

  const parsedLegs: PastedLeg[] = useMemo(
    () => parsePastedBlock(pastedText),
    [pastedText],
  );

  const analysis: ParlayAnalysis | null = useMemo(() => {
    if (parsedLegs.length === 0) return null;
    return analyzeParlay(parsedLegs, dateLeans);
  }, [parsedLegs, dateLeans]);

  const hasNoBoardData = allLeans.length === 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] gap-4">
      {/* Left: input panel */}
      <div
        className="rounded-[3px] p-4 sm:p-5"
        style={{
          background: "var(--vault-panel)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
          style={{ color: "var(--vault-gold)" }}
        >
          1 · select slate
        </div>

        {hasNoBoardData ? (
          <p className="text-[13px] mb-4" style={{ color: "var(--vault-text-mute)" }}>
            No slate data available — the model board is empty for every loaded
            date. Once a board is generated, this lab will activate.
          </p>
        ) : (
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full mb-5 px-3 py-2 rounded-[2px] font-mono text-[12px]"
            style={{
              background: "var(--vault-panel-elevated)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text)",
            }}
          >
            {datesAvailable.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date} — {d.label}
              </option>
            ))}
          </select>
        )}

        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
          style={{ color: "var(--vault-gold)" }}
        >
          2 · risk profile
        </div>

        <div className="grid grid-cols-3 gap-2 mb-5">
          {(["conservative", "balanced", "aggressive"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setRiskProfile(p)}
              className="px-3 py-2 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.15em] transition-colors"
              style={{
                background:
                  riskProfile === p
                    ? "var(--vault-gold-dim)"
                    : "var(--vault-panel-elevated)",
                border: `1px solid ${riskProfile === p ? "var(--vault-border-strong)" : "var(--vault-border)"}`,
                color:
                  riskProfile === p
                    ? "var(--vault-gold-bright)"
                    : "var(--vault-text-mute)",
              }}
            >
              {p}
            </button>
          ))}
        </div>

        <p
          className="text-[11px] leading-relaxed mb-5 font-mono"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {RISK_HELP[riskProfile]}
        </p>

        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
          style={{ color: "var(--vault-gold)" }}
        >
          3 · paste your slip
        </div>

        <textarea
          value={pastedText}
          onChange={(e) => setPastedText(e.target.value)}
          placeholder={PLACEHOLDER_TEXT}
          rows={10}
          className="w-full px-3 py-2 rounded-[2px] font-mono text-[12px] leading-[1.5] resize-y"
          style={{
            background: "var(--vault-panel-elevated)",
            border: "1px solid var(--vault-border)",
            color: "var(--vault-text)",
          }}
          spellCheck={false}
        />

        <p
          className="mt-2 text-[11px] font-mono"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {parsedLegs.length} leg{parsedLegs.length === 1 ? "" : "s"} parsed
          {pastedText.trim() && parsedLegs.length === 0 && (
            <span style={{ color: "var(--vault-warn)" }}>
              {" "}
              · check format
            </span>
          )}
        </p>
      </div>

      {/* Right: analysis panel */}
      <div
        className="rounded-[3px] p-4 sm:p-5"
        style={{
          background: "var(--vault-panel)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div
          className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
          style={{ color: "var(--vault-gold)" }}
        >
          analysis
        </div>

        {analysis === null ? (
          <EmptyAnalysis />
        ) : (
          <FullAnalysis analysis={analysis} riskProfile={riskProfile} />
        )}
      </div>
    </div>
  );
}

const RISK_HELP: Record<"conservative" | "balanced" | "aggressive", string> = {
  conservative:
    "Higher confidence + healthy data + same model side. Fewer legs that all align tightly with the model.",
  balanced:
    "Main model lean with reasonable confidence and edge. The default for casual analysis.",
  aggressive:
    "Higher edge or longer odds with more uncertainty. Acceptable risk you understand, not a recommendation.",
};

function EmptyAnalysis() {
  return (
    <div className="py-12 text-center">
      <div
        className="font-mono text-[10px] uppercase tracking-[0.18em] mb-3"
        style={{ color: "var(--vault-text-faint)" }}
      >
        no legs analyzed yet
      </div>
      <p
        className="text-[13px] leading-relaxed max-w-md mx-auto"
        style={{ color: "var(--vault-text-mute)" }}
      >
        Paste a parlay slip on the left to see how each leg compares to our
        model. We'll flag legs that disagree with the model, missing data, and
        same-game correlation risks.
      </p>
    </div>
  );
}

function FullAnalysis({
  analysis,
  riskProfile,
}: {
  analysis: ParlayAnalysis;
  riskProfile: "conservative" | "balanced" | "aggressive";
}) {
  return (
    <div>
      {/* Top summary strip */}
      <div
        className="rounded-[2px] p-3 mb-4"
        style={{
          background: "var(--vault-panel-elevated)",
          border: "1px solid var(--vault-border)",
        }}
      >
        <div className="flex flex-wrap items-baseline gap-3">
          <RiskBadge profile={analysis.riskProfile} />
          <span
            className="font-display text-[15px] font-semibold tracking-tight"
            style={{ color: "var(--vault-text)" }}
          >
            {analysis.summary}
          </span>
        </div>
        {analysis.combinedOddsAmerican !== null && (
          <div
            className="mt-2 font-mono text-[11px]"
            style={{ color: "var(--vault-text-mute)" }}
          >
            combined odds:{" "}
            <span style={{ color: "var(--vault-gold-bright)" }}>
              {analysis.combinedOddsAmerican > 0 ? "+" : ""}
              {analysis.combinedOddsAmerican}
            </span>
            {analysis.combinedImpliedProbability !== null && (
              <>
                {" "}
                · implied{" "}
                {(analysis.combinedImpliedProbability * 100).toFixed(1)}%
                {" "}
                <span style={{ color: "var(--vault-text-faint)" }}>
                  (multiplied; assumes legs are independent — they're not when
                  same game)
                </span>
              </>
            )}
          </div>
        )}
        {analysis.hasSameGameLegs && (
          <div
            className="mt-2 text-[12px]"
            style={{ color: "var(--vault-warn)" }}
          >
            ⚠ Same-game correlation: legs in the same game are not
            independent. The combined probability above overstates how
            "independent" your slip is.
          </div>
        )}
        {/* Profile mismatch hint */}
        {riskProfile !== analysis.riskProfile && (
          <div
            className="mt-2 text-[12px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            You selected <b>{riskProfile}</b>, but this slip looks{" "}
            <b>{analysis.riskProfile}</b>. Adjust legs or switch profile to
            match.
          </div>
        )}
      </div>

      {/* Leg-by-leg breakdown */}
      <div className="space-y-2.5">
        {analysis.legs.map((leg, idx) => (
          <LegRow key={idx} leg={leg} />
        ))}
      </div>
    </div>
  );
}

function RiskBadge({
  profile,
}: {
  profile: "conservative" | "balanced" | "aggressive" | "uncertain";
}) {
  const colorMap = {
    conservative: {
      bg: "var(--vault-gold-dim)",
      fg: "var(--vault-gold-bright)",
      label: "conservative",
    },
    balanced: {
      bg: "var(--vault-panel-elevated)",
      fg: "var(--vault-text)",
      label: "balanced",
    },
    aggressive: {
      bg: "var(--vault-warn-dim)",
      fg: "var(--vault-warn)",
      label: "aggressive",
    },
    uncertain: {
      bg: "var(--vault-panel-elevated)",
      fg: "var(--vault-text-mute)",
      label: "uncertain",
    },
  };
  const c = colorMap[profile];
  return (
    <span
      className="inline-flex items-center px-2 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.18em]"
      style={{
        background: c.bg,
        color: c.fg,
        border: "1px solid var(--vault-border)",
      }}
    >
      {c.label}
    </span>
  );
}

function LegRow({ leg }: { leg: LegAnalysis }) {
  const verdictColor = VERDICT_COLOR[leg.verdict];
  return (
    <div
      className="rounded-[2px] p-3"
      style={{
        background: "var(--vault-panel-elevated)",
        border: `1px solid ${verdictColor.border}`,
      }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="font-mono text-[10px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-[2px]"
          style={{
            background: verdictColor.bg,
            color: verdictColor.fg,
          }}
        >
          {VERDICT_LABEL[leg.verdict]}
        </span>
        <span
          className="font-display font-semibold text-[14px]"
          style={{ color: "var(--vault-text)" }}
        >
          {leg.leg.rawPlayerName}
        </span>
        <span
          className="font-mono text-[12px] tabular"
          style={{ color: "var(--vault-text-mute)" }}
        >
          {leg.leg.market}
          {" "}
          {leg.leg.side === "Over" ? "▲" : "▼"}
          {" "}
          {leg.leg.line}
        </span>
        {typeof leg.leg.oddsAmerican === "number" && (
          <span
            className="font-mono text-[11px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {leg.leg.oddsAmerican > 0 ? "+" : ""}
            {leg.leg.oddsAmerican}
          </span>
        )}
      </div>

      <p
        className="mt-1.5 text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {leg.note}
      </p>

      {leg.matchedLean && (
        <div
          className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tabular"
          style={{ color: "var(--vault-text-faint)" }}
        >
          {typeof leg.modelProjection === "number" && (
            <span>
              proj <span style={{ color: "var(--vault-text)" }}>{leg.modelProjection.toFixed(1)}</span>
            </span>
          )}
          {leg.modelConfidence && (
            <span>
              conf{" "}
              <span style={{ color: confColor(leg.modelConfidence) }}>
                {leg.modelConfidence}
              </span>
            </span>
          )}
          <span>
            recent10{" "}
            <span style={{ color: leg.hasRecent10 ? "var(--vault-gold-bright)" : "var(--vault-warn)" }}>
              {leg.hasRecent10 ? "available" : "missing"}
            </span>
          </span>
          <span>
            playerId{" "}
            <span style={{ color: leg.hasValidPlayerId ? "var(--vault-gold-bright)" : "var(--vault-warn)" }}>
              {leg.hasValidPlayerId ? "valid" : "invalid"}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

const VERDICT_LABEL: Record<MatchVerdict, string> = {
  model_agrees: "model agrees",
  model_opposes: "model opposes",
  model_passes: "model passed",
  no_matching_line: "no matching line",
  no_matching_player: "player not on slate",
  data_quality_warning: "weak data quality",
};

const VERDICT_COLOR: Record<
  MatchVerdict,
  { bg: string; fg: string; border: string }
> = {
  model_agrees: {
    bg: "var(--vault-gold-dim)",
    fg: "var(--vault-gold-bright)",
    border: "var(--vault-border)",
  },
  model_opposes: {
    bg: "var(--vault-warn-dim)",
    fg: "var(--vault-warn)",
    border: "var(--vault-warn)",
  },
  model_passes: {
    bg: "var(--vault-panel-elevated)",
    fg: "var(--vault-text-mute)",
    border: "var(--vault-border)",
  },
  no_matching_line: {
    bg: "var(--vault-panel-elevated)",
    fg: "var(--vault-text-mute)",
    border: "var(--vault-border)",
  },
  no_matching_player: {
    bg: "var(--vault-panel-elevated)",
    fg: "var(--vault-text-mute)",
    border: "var(--vault-border)",
  },
  data_quality_warning: {
    bg: "var(--vault-warn-dim)",
    fg: "var(--vault-warn)",
    border: "var(--vault-border)",
  },
};

function confColor(conf: ConfidenceTier): string {
  switch (conf) {
    case "High":
      return "var(--vault-gold-bright)";
    case "Medium":
      return "var(--vault-warn)";
    case "Low":
      return "var(--vault-text-mute)";
    default:
      return "var(--vault-text-faint)";
  }
}
