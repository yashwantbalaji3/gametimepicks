"use client";

/**
 * Phase 16 — ParlayBuilderClient.
 *
 * Build mode of /parlay-lab. The user picks a date, optionally selects
 * specific players or games or markets, picks a risk profile, and the
 * builder generates candidate parlays from REAL slate leans.
 *
 * Design contract:
 *   - Every leg is sourced from a real PropLean. No fabrication.
 *   - "Educational analysis" framing throughout. No betting advice.
 *   - Same-game correlation always surfaced.
 *   - Missing odds → combined-odds field shows "—" not a fake number.
 *   - When the slate has no eligible leans for the chosen profile, the
 *     UI says so honestly and suggests a looser profile.
 *
 * This component does NOT fetch. All slate data flows in via props from
 * the server-rendered page wrapper.
 */
import { useState, useMemo } from "react";
import type { PropLean } from "@/lib/types";
import {
  buildParlayCandidates,
  uniquePlayersFromLeans,
  uniqueGamesFromLeans,
  type RiskProfile,
  type BuilderMode,
  type ParlayCandidate,
  type PlayerOption,
  type GameOption,
} from "@/lib/parlay-builder";

interface DateOption {
  date: string;
  label: string;
}

interface Props {
  allLeans: PropLean[];
  datesAvailable: DateOption[];
}

const RISK_DESCRIPTIONS: Record<RiskProfile, string> = {
  conservative: "High-confidence model leans · valid recent10 · 1 leg per game",
  balanced: "Model leans w/ moderate edge · up to 2 legs per game",
  aggressive: "Wider edge tolerance · higher uncertainty · up to 3 legs per game",
};

const MARKET_LIST: ("PTS" | "REB" | "AST")[] = ["PTS", "REB", "AST"];

export default function ParlayBuilderClient({ allLeans, datesAvailable }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(
    datesAvailable[0]?.date ?? "",
  );
  const [mode, setMode] = useState<BuilderMode>("top_props");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("balanced");
  const [selectedPlayerNames, setSelectedPlayerNames] = useState<Set<string>>(
    new Set(),
  );
  const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(
    new Set(MARKET_LIST),
  );

  const dateLeans = useMemo(
    () => allLeans.filter((l) => l.date === selectedDate),
    [allLeans, selectedDate],
  );

  const playerOptions: PlayerOption[] = useMemo(
    () => uniquePlayersFromLeans(dateLeans),
    [dateLeans],
  );
  const gameOptions: GameOption[] = useMemo(
    () => uniqueGamesFromLeans(dateLeans),
    [dateLeans],
  );

  const candidates: ParlayCandidate[] = useMemo(() => {
    if (dateLeans.length === 0) return [];
    return buildParlayCandidates(dateLeans, {
      mode,
      selectedPlayerNames:
        mode === "selected_players" ? [...selectedPlayerNames] : undefined,
      selectedGameIds:
        selectedGameIds.size > 0 ? [...selectedGameIds] : undefined,
      selectedMarkets:
        selectedMarkets.size > 0 && selectedMarkets.size < 3
          ? ([...selectedMarkets] as ("PTS" | "REB" | "AST")[])
          : undefined,
      riskProfile,
      numCandidates: 3,
    });
  }, [
    dateLeans,
    mode,
    selectedPlayerNames,
    selectedGameIds,
    selectedMarkets,
    riskProfile,
  ]);

  const hasNoSlate = allLeans.length === 0 || dateLeans.length === 0;

  function togglePlayer(name: string) {
    setSelectedPlayerNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }
  function toggleGame(gid: string) {
    setSelectedGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });
  }
  function toggleMarket(m: string) {
    setSelectedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[440px_1fr] gap-4">
      {/* Left — control panel */}
      <div
        className="rounded-[3px] p-5 vault-glass"
        style={{ borderRadius: "3px" }}
      >
        <SectionLabel n="1" text="select slate" />
        {datesAvailable.length === 0 ? (
          <p className="text-[13px] mb-4" style={{ color: "var(--vault-text-mute)" }}>
            No slate data available right now. Once a board is generated, this
            builder will activate.
          </p>
        ) : (
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full mb-5 px-3 py-2 rounded-[2px] font-mono text-[12px]"
            style={{
              background: "var(--vault-panel)",
              border: "1px solid var(--vault-border)",
              color: "var(--vault-text)",
            }}
          >
            {datesAvailable.map((d) => (
              <option key={d.date} value={d.date}>
                {d.label}
              </option>
            ))}
          </select>
        )}

        <SectionLabel n="2" text="builder mode" />
        <div className="flex gap-2 mb-5">
          <ModeButton
            active={mode === "top_props"}
            label="Top model props"
            onClick={() => setMode("top_props")}
          />
          <ModeButton
            active={mode === "selected_players"}
            label="Selected players"
            onClick={() => setMode("selected_players")}
          />
        </div>

        <SectionLabel n="3" text="risk profile" />
        <div className="flex flex-col gap-2 mb-5">
          {(["conservative", "balanced", "aggressive"] as RiskProfile[]).map(
            (rp) => (
              <RiskProfileCard
                key={rp}
                rp={rp}
                active={riskProfile === rp}
                onClick={() => setRiskProfile(rp)}
              />
            ),
          )}
        </div>

        {mode === "selected_players" && (
          <>
            <SectionLabel n="4" text="players" />
            {playerOptions.length === 0 ? (
              <p
                className="text-[12px] mb-5"
                style={{ color: "var(--vault-text-faint)" }}
              >
                No players with model leans on this slate.
              </p>
            ) : (
              <div
                className="mb-5 flex flex-wrap gap-1.5"
                style={{ maxHeight: 240, overflowY: "auto" }}
              >
                {playerOptions.map((p) => (
                  <button
                    key={`${p.playerId}_${p.playerName}`}
                    type="button"
                    onClick={() => togglePlayer(p.playerName)}
                    className="px-2.5 py-1 rounded-[2px] font-mono text-[11px] transition-colors"
                    style={{
                      background: selectedPlayerNames.has(p.playerName)
                        ? "var(--vault-gold-dim)"
                        : "var(--vault-panel)",
                      border: `1px solid ${
                        selectedPlayerNames.has(p.playerName)
                          ? "var(--vault-gold)"
                          : "var(--vault-border)"
                      }`,
                      color: "var(--vault-text)",
                    }}
                  >
                    {p.playerName}
                    {p.hasHighConfidence && (
                      <span
                        className="ml-1.5 text-[9px]"
                        style={{ color: "var(--vault-gold-bright)" }}
                      >
                        ★
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {gameOptions.length > 0 && (
          <>
            <SectionLabel
              n={mode === "selected_players" ? "5" : "4"}
              text="games (optional)"
            />
            <div className="mb-5 flex flex-wrap gap-1.5">
              {gameOptions.map((g) => (
                <button
                  key={g.gameId}
                  type="button"
                  onClick={() => toggleGame(g.gameId)}
                  className="px-2.5 py-1 rounded-[2px] font-mono text-[11px] transition-colors"
                  style={{
                    background: selectedGameIds.has(g.gameId)
                      ? "var(--vault-gold-dim)"
                      : "var(--vault-panel)",
                    border: `1px solid ${
                      selectedGameIds.has(g.gameId)
                        ? "var(--vault-gold)"
                        : "var(--vault-border)"
                    }`,
                    color: "var(--vault-text)",
                  }}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </>
        )}

        <SectionLabel
          n={mode === "selected_players" ? "6" : "5"}
          text="markets (optional)"
        />
        <div className="mb-1 flex gap-1.5">
          {MARKET_LIST.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMarket(m)}
              className="px-3 py-1 rounded-[2px] font-mono text-[11px] transition-colors"
              style={{
                background: selectedMarkets.has(m)
                  ? "var(--vault-gold-dim)"
                  : "var(--vault-panel)",
                border: `1px solid ${
                  selectedMarkets.has(m)
                    ? "var(--vault-gold)"
                    : "var(--vault-border)"
                }`,
                color: "var(--vault-text)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <p
          className="mt-4 text-[10px] leading-relaxed"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Educational analysis only. Not betting advice. Combinations are
          generated from real slate leans — no fabricated lines.
        </p>
      </div>

      {/* Right — candidates */}
      <div className="space-y-3">
        {hasNoSlate ? (
          <EmptyState
            heading="No slate to build from"
            body="The selected date has no model leans. Either the slate hasn't been generated yet, or props are unavailable for those games. Try a different date or check back after the next refresh."
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            heading={`No ${riskProfile} candidates on this slate`}
            body={
              riskProfile === "conservative"
                ? "Conservative requires High confidence + valid recent10 across multiple games. Try Balanced or Aggressive for looser filters."
                : riskProfile === "balanced"
                  ? "Balanced requires Medium+ confidence with moderate edge. Try Aggressive for looser filters, or remove some restrictions."
                  : "No combinations met the minimum edge threshold. The model may not have strong leans on this slate."
            }
          />
        ) : (
          candidates.map((c, idx) => (
            <CandidateCard key={idx} candidate={c} index={idx} />
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ n, text }: { n: string; text: string }) {
  return (
    <div
      className="font-mono text-[10px] uppercase tracking-[0.18em] mb-2.5"
      style={{ color: "var(--vault-gold)" }}
    >
      {n} · {text}
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 px-3 py-2 rounded-[2px] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors"
      style={{
        background: active ? "var(--vault-gold-dim)" : "var(--vault-panel)",
        border: `1px solid ${
          active ? "var(--vault-gold)" : "var(--vault-border)"
        }`,
        color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
      }}
    >
      {label}
    </button>
  );
}

function RiskProfileCard({
  rp,
  active,
  onClick,
}: {
  rp: RiskProfile;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left px-3 py-2.5 rounded-[2px] transition-all"
      style={{
        background: active ? "var(--vault-gold-dim)" : "var(--vault-panel)",
        border: `1px solid ${
          active ? "var(--vault-gold)" : "var(--vault-border)"
        }`,
      }}
    >
      <div
        className="font-display text-[13px] font-semibold tracking-tight capitalize"
        style={{
          color: active ? "var(--vault-gold-bright)" : "var(--vault-text)",
        }}
      >
        {rp}
      </div>
      <div
        className="mt-0.5 text-[11px] leading-snug"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {RISK_DESCRIPTIONS[rp]}
      </div>
    </button>
  );
}

function CandidateCard({
  candidate,
  index,
}: {
  candidate: ParlayCandidate;
  index: number;
}) {
  return (
    <div
      className="rounded-[3px] p-4 sm:p-5 vault-glass vault-rise"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-3">
          <div
            className="font-mono text-[10px] uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)" }}
          >
            candidate {index + 1}
          </div>
          <div
            className="font-mono text-[10px] uppercase tracking-[0.15em]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            {candidate.legs.length} legs · {candidate.uniqueGames} game
            {candidate.uniqueGames === 1 ? "" : "s"}
          </div>
        </div>
        <div className="font-mono text-[11px]">
          {candidate.combinedOddsAmerican != null ? (
            <>
              <span style={{ color: "var(--vault-text-faint)" }}>combined </span>
              <span
                className="font-semibold"
                style={{ color: "var(--vault-gold-bright)" }}
              >
                {candidate.combinedOddsAmerican > 0 ? "+" : ""}
                {candidate.combinedOddsAmerican}
              </span>
            </>
          ) : (
            <span style={{ color: "var(--vault-text-faint)" }}>
              odds unavailable
            </span>
          )}
        </div>
      </div>

      {candidate.hasSameGameLegs && (
        <div
          className="mt-3 px-3 py-2 rounded-[2px] text-[11px] leading-snug"
          style={{
            background: "var(--vault-warn-dim)",
            border: "1px solid var(--vault-warn)",
            color: "var(--vault-warn)",
          }}
        >
          ⚠ same-game legs — outcomes may be correlated. Real combined
          probability is typically lower than the implied odds suggest.
        </div>
      )}

      <div className="mt-3 space-y-2">
        {candidate.legs.map((la, i) => {
          const lean = la.matchedLean;
          if (!lean) return null;
          return (
            <div
              key={i}
              className="px-3 py-2 rounded-[2px]"
              style={{
                background: "var(--vault-panel)",
                border: "1px solid var(--vault-border)",
              }}
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <div>
                  <span
                    className="font-display text-[14px] font-semibold tracking-tight"
                    style={{ color: "var(--vault-text)" }}
                  >
                    {lean.playerName}
                  </span>
                  <span
                    className="ml-2 font-mono text-[10px]"
                    style={{ color: "var(--vault-text-faint)" }}
                  >
                    {lean.team} · {lean.team} @ {lean.opponent}
                  </span>
                </div>
                <div className="font-mono text-[11px]">
                  <span style={{ color: "var(--vault-text-mute)" }}>
                    {lean.lean}
                  </span>{" "}
                  <span style={{ color: "var(--vault-gold-bright)" }}>
                    {lean.line}
                  </span>{" "}
                  <span style={{ color: "var(--vault-text-mute)" }}>
                    {lean.market}
                  </span>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px]">
                <span>
                  <span style={{ color: "var(--vault-text-faint)" }}>proj </span>
                  <span style={{ color: "var(--vault-text)" }}>
                    {lean.projection?.toFixed(1) ?? "—"}
                  </span>
                </span>
                <span>
                  <span style={{ color: "var(--vault-text-faint)" }}>edge </span>
                  <span style={{ color: "var(--vault-gold)" }}>
                    {lean.edgePct?.toFixed(1) ?? "—"}%
                  </span>
                </span>
                <span>
                  <span style={{ color: "var(--vault-text-faint)" }}>conf </span>
                  <span
                    style={{
                      color:
                        lean.confidence === "High"
                          ? "var(--vault-gold-bright)"
                          : lean.confidence === "Medium"
                            ? "var(--vault-warn)"
                            : "var(--vault-text-mute)",
                    }}
                  >
                    {lean.confidence}
                  </span>
                </span>
                {!la.hasRecent10 && (
                  <span style={{ color: "var(--vault-warn)" }}>
                    no recent10
                  </span>
                )}
                {!la.hasValidPlayerId && (
                  <span style={{ color: "var(--vault-warn)" }}>
                    pid missing
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="mt-3 text-[11px] leading-snug"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {candidate.rationale}
      </p>
    </div>
  );
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      className="rounded-[3px] p-6 sm:p-8 vault-glass"
      style={{ textAlign: "center" }}
    >
      <div
        className="font-display text-[18px] font-semibold tracking-tight"
        style={{ color: "var(--vault-text)" }}
      >
        {heading}
      </div>
      <p
        className="mt-2 text-[13px] leading-relaxed max-w-md mx-auto"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
    </div>
  );
}
