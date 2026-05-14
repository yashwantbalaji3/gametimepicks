"use client";

/**
 * Phase 17 — ParlayBuilderClient.
 *
 * Build mode of /parlay-lab. The user picks a date, optionally selects
 * specific players or games or markets, picks a risk profile, and the
 * builder generates candidate parlays from REAL slate leans.
 *
 * Phase 17 changes:
 *   - Defaults to the active slate (today / nearest upcoming) instead of
 *     whichever past date has the most leans.
 *   - When the active slate has no candidate-eligible leans, shows a
 *     dedicated "no current builder" empty state — does NOT silently
 *     drop back to a stale archived date.
 *   - The user can opt into archived dates explicitly via the date
 *     picker; archived dates are clearly labeled "(archived)".
 *   - Builder defaults to "core players only" (top 3 per team). The user
 *     can toggle "include full rotation" to widen the pool.
 *
 * Design contract:
 *   - Every leg is sourced from a real PropLean. No fabrication.
 *   - "Educational analysis" framing throughout. No betting advice.
 *   - Same-game correlation always surfaced.
 *   - Missing odds → combined-odds field shows "—" not a fake number.
 *
 * This component does NOT fetch. All slate data flows in via props.
 */
import { useState, useMemo } from "react";
import type { PropLean, ScheduleGame } from "@/lib/types";
import type { ActiveSlateKind } from "@/lib/active-slate";
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
  isArchived: boolean;
  isActiveDefault: boolean;
}

interface Props {
  allLeans: PropLean[];
  datesAvailable: DateOption[];
  activeSlateKind: ActiveSlateKind;
  activeDate: string | null;
  gamesByGameId: Record<string, ScheduleGame>;
}

const RISK_DESCRIPTIONS: Record<RiskProfile, string> = {
  conservative: "High-confidence model leans · valid recent10 · 1 leg per game",
  balanced: "Model leans w/ moderate edge · up to 2 legs per game",
  aggressive: "Wider edge tolerance · higher uncertainty · up to 3 legs per game",
};

const MARKET_LIST: ("PTS" | "REB" | "AST")[] = ["PTS", "REB", "AST"];

export default function ParlayBuilderClient({
  allLeans,
  datesAvailable,
  activeSlateKind,
  activeDate,
  gamesByGameId,
}: Props) {
  // Phase 17: pick the default date intelligently.
  //   - Prefer the active slate (today / upcoming).
  //   - If active has no leans on disk, prefer the first non-archived date
  //     that's available.
  //   - Only fall back to an archived date if nothing else exists.
  const initialDate = useMemo(() => {
    const activeMatch = datesAvailable.find((d) => d.date === activeDate);
    if (activeMatch) return activeMatch.date;
    const firstNonArchived = datesAvailable.find((d) => !d.isArchived);
    if (firstNonArchived) return firstNonArchived.date;
    return datesAvailable[0]?.date ?? "";
  }, [datesAvailable, activeDate]);

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [mode, setMode] = useState<BuilderMode>("top_props");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("balanced");
  const [includeFullRotation, setIncludeFullRotation] = useState(false);
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

  const isSelectedDateArchived =
    datesAvailable.find((d) => d.date === selectedDate)?.isArchived ?? false;

  const playerOptions: PlayerOption[] = useMemo(
    () =>
      uniquePlayersFromLeans(dateLeans, {
        coreOnly: !includeFullRotation,
        corePlayersPerTeam: 3,
      }),
    [dateLeans, includeFullRotation],
  );
  const gameOptions: GameOption[] = useMemo(
    () => uniqueGamesFromLeans(dateLeans, gamesByGameId),
    [dateLeans, gamesByGameId],
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
      includeBenchPlayers: includeFullRotation,
      corePlayersPerTeam: 3,
    });
  }, [
    dateLeans,
    mode,
    selectedPlayerNames,
    selectedGameIds,
    selectedMarkets,
    riskProfile,
    includeFullRotation,
  ]);

  // Phase 17: detect "no current builder" honestly. When the only
  // available dates are archived AND the active slate kind is no_current
  // / no_data, surface that — don't pretend an old slate is a builder.
  const allDatesAreArchived =
    datesAvailable.length > 0 && datesAvailable.every((d) => d.isArchived);
  const noCurrentBuilder =
    (activeSlateKind === "no_current" || activeSlateKind === "no_data") &&
    allDatesAreArchived;

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
          <>
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded-[2px] font-mono text-[12px]"
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
            {isSelectedDateArchived && (
              <p
                className="mb-3 px-2.5 py-1.5 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{
                  background: "var(--vault-warn-dim)",
                  color: "var(--vault-warn)",
                  border: "1px solid var(--vault-border)",
                }}
              >
                ⚠ archived slate · model leans here are historical, not current
              </p>
            )}
            {!isSelectedDateArchived && (
              <p
                className="mb-3 font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {activeSlateKind === "today"
                  ? "current slate · today's model leans"
                  : "upcoming slate"}
              </p>
            )}
          </>
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

        <SectionLabel n="4" text="player pool" />
        <div className="mb-5">
          <label
            className="flex items-start gap-2 cursor-pointer p-2.5 rounded-[2px] transition-colors"
            style={{
              background: "var(--vault-panel)",
              border: "1px solid var(--vault-border)",
            }}
          >
            <input
              type="checkbox"
              checked={includeFullRotation}
              onChange={(e) => setIncludeFullRotation(e.target.checked)}
              className="mt-1 cursor-pointer"
              style={{ accentColor: "var(--vault-gold)" }}
            />
            <div>
              <div
                className="font-display text-[13px] font-semibold tracking-tight"
                style={{ color: "var(--vault-text)" }}
              >
                Include full rotation
              </div>
              <div
                className="mt-0.5 text-[11px] leading-snug"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {includeFullRotation
                  ? "Bench / role players included. Wider candidate pool."
                  : "Top 3 core players per team only. Bench excluded by default."}
              </div>
            </div>
          </label>
        </div>

        {mode === "selected_players" && (
          <>
            <SectionLabel n="5" text="players" />
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
              n={mode === "selected_players" ? "6" : "5"}
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
          n={mode === "selected_players" ? "7" : "6"}
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
      </div>

      {/* Right — candidates */}
      <div className="space-y-3">
        {noCurrentBuilder ? (
          <EmptyState
            heading="No current slate available"
            body="The next slate hasn't been generated yet. Once today's or tomorrow's model leans land, the builder will activate. Use the date picker on the left to analyze archived slates if you want to see how the builder works on past data."
          />
        ) : hasNoSlate ? (
          <EmptyState
            heading="No model leans on this slate"
            body="The selected date doesn't have model leans yet. Either the slate hasn't been generated, or props are unavailable for those games. Try a different date or check back after the next refresh."
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            heading={`No ${riskProfile} candidates on this slate`}
            body={
              riskProfile === "conservative"
                ? "Conservative requires High confidence + valid recent10 across multiple games. Try Balanced or Aggressive for looser filters, or enable 'include full rotation' for a wider pool."
                : riskProfile === "balanced"
                  ? "Balanced requires Medium+ confidence with moderate edge. Try Aggressive for looser filters, or remove some restrictions."
                  : "No combinations met the minimum edge threshold. The model may not have strong leans on this slate."
            }
          />
        ) : (
          <>
            {!includeFullRotation && (
              <div
                className="rounded-[2px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{
                  background: "var(--vault-gold-dim)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-gold-bright)",
                }}
              >
                ★ focused on top core players per team
              </div>
            )}
            {candidates.map((c, idx) => (
              <CandidateCard key={idx} candidate={c} index={idx} />
            ))}
          </>
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
    <div className="font-mono text-[10px] uppercase tracking-[0.15em] mb-2.5">
      <span style={{ color: "var(--vault-gold)" }}>{n}</span>
      <span style={{ color: "var(--vault-text-faint)" }}> · {text}</span>
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
      {/* Zone A — header: candidate identity + combined odds */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span
          className="inline-flex items-center px-2 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{
            background: "var(--vault-gold-dim)",
            border: "1px solid var(--vault-border-strong)",
            color: "var(--vault-gold-bright)",
          }}
        >
          candidate {index + 1}
        </span>
        <div className="font-mono text-[11px]">
          {candidate.combinedOddsAmerican != null ? (
            <>
              <span style={{ color: "var(--vault-text-faint)" }}>combined </span>
              <span
                className="font-semibold text-[13px]"
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
      <div
        className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.15em]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {candidate.legs.length} legs · {candidate.uniqueGames} game
        {candidate.uniqueGames === 1 ? "" : "s"}
      </div>

      {/* Zone B — legs */}
      <div className="mt-4 space-y-2">
        {candidate.legs.map((la, i) => {
          const lean = la.matchedLean;
          if (!lean) return null;
          const matchup =
            lean.team && lean.opponent
              ? `${lean.team} @ ${lean.opponent}`
              : null;
          return (
            <div
              key={i}
              className="px-3 py-2.5 rounded-[2px]"
              style={{
                background: "var(--vault-panel)",
                border: "1px solid var(--vault-border)",
              }}
            >
              {/* Row 1: player + matchup */}
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span
                  className="font-display text-[15px] font-semibold tracking-tight"
                  style={{ color: "var(--vault-text)" }}
                >
                  {lean.playerName}
                </span>
                {matchup && (
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.15em]"
                    style={{ color: "var(--vault-text-faint)" }}
                  >
                    {matchup}
                  </span>
                )}
              </div>

              {/* Row 2: lean as one readable phrase */}
              <div className="mt-1 font-display text-[13px] tracking-tight">
                <span style={{ color: "var(--vault-text-mute)" }}>
                  {lean.lean}
                </span>{" "}
                <span
                  className="font-semibold"
                  style={{ color: "var(--vault-gold-bright)" }}
                >
                  {lean.line}
                </span>{" "}
                <span style={{ color: "var(--vault-text-mute)" }}>
                  {lean.market}
                </span>
              </div>

              {/* Row 3: stat chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <StatChip
                  label="proj"
                  value={
                    typeof lean.projection === "number"
                      ? lean.projection.toFixed(1)
                      : "—"
                  }
                />
                <StatChip
                  label="edge"
                  value={
                    typeof lean.edgePct === "number"
                      ? `${lean.edgePct.toFixed(1)}%`
                      : "—"
                  }
                  valueColor="var(--vault-gold)"
                />
                <StatChip
                  label="conf"
                  value={lean.confidence}
                  valueColor={
                    lean.confidence === "High"
                      ? "var(--vault-gold-bright)"
                      : lean.confidence === "Medium"
                        ? "var(--vault-warn)"
                        : "var(--vault-text-mute)"
                  }
                />
                {!la.hasRecent10 && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-[2px] font-mono text-[10px] tracking-tight"
                    style={{
                      border: "1px solid var(--vault-border)",
                      color: "var(--vault-text-faint)",
                    }}
                  >
                    limited recent form
                  </span>
                )}
                {lean.riskFlags?.includes("suspicious_edge") && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-[2px] font-mono text-[10px] tracking-tight uppercase"
                    style={{
                      background: "var(--vault-warn-dim)",
                      border: "1px solid rgba(240, 199, 94, 0.30)",
                      color: "var(--vault-warn)",
                    }}
                  >
                    model anomaly
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zone C — footnotes: same-game chip + rationale */}
      {candidate.hasSameGameLegs && (
        <div
          className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] font-mono text-[10px] uppercase tracking-[0.15em]"
          style={{
            border: "1px solid var(--vault-warn)",
            color: "var(--vault-warn)",
          }}
        >
          <span aria-hidden>⚠</span>
          same-game legs · outcomes may correlate
        </div>
      )}
      <p
        className="mt-3 text-[12px] leading-relaxed"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {candidate.rationale}
      </p>
    </div>
  );
}

function StatChip({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-[2px] font-mono text-[10px] tracking-tight"
      style={{
        background: "var(--vault-panel-elevated)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <span
        className="uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </span>
      <span style={{ color: valueColor ?? "var(--vault-text)" }}>{value}</span>
    </span>
  );
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      className="rounded-[3px] p-8 sm:p-10 vault-glass"
      style={{ textAlign: "center" }}
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
          style={{ background: "var(--vault-gold)" }}
        />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          builder idle
        </span>
      </div>
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
