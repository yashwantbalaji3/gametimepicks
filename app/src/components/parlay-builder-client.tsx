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
import PlayerAvatar from "./player-avatar";
import PlayerRecentFormPanel from "./player-recent-form-panel";
import { getPlayoffContext } from "./playoff-context";
import { confidenceLabel } from "@/lib/confidence-labels";
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
  conservative:
    "Lower-variance mix · High confidence · clean leans only · 1 leg per game · no model anomalies",
  balanced:
    "Star-forward mix · High/Medium confidence · clean leans only · up to 2 legs per game",
  aggressive:
    "Wider-edge mix · model leans across tiers · up to 3 legs per game · model-anomaly leg labelled if included",
};

const MARKET_LIST: ("PTS" | "REB" | "AST")[] = ["PTS", "REB", "AST"];

// Curated star priority — sorts star names to the top of the
// Selected-Players picker so users find Anthony Edwards / Wembanyama /
// etc. without scrolling. Matches the board Headliner Rail list.
const STAR_PRIORITY: string[] = [
  "Anthony Edwards",
  "Victor Wembanyama",
  "Donovan Mitchell",
  "Cade Cunningham",
  "James Harden",
  "Evan Mobley",
  "Jarrett Allen",
  "Jalen Duren",
  "Julius Randle",
  "Rudy Gobert",
  "De'Aaron Fox",
  "Stephon Castle",
];

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
  // PR — player picker search box. Filters the chip grid in Selected
  // Players mode so stars whose teams have many loaded props are still
  // findable.
  const [playerSearch, setPlayerSearch] = useState<string>("");
  // Dossier focus — the player whose recent-form panel is being viewed.
  // Updated by togglePlayer so picking a chip immediately surfaces their
  // dossier. Falls back to another selected player if the active one is
  // deselected, otherwise null (panel hidden).
  const [activeViewPlayer, setActiveViewPlayer] = useState<string | null>(
    null,
  );

  const dateLeans = useMemo(
    () => allLeans.filter((l) => l.date === selectedDate),
    [allLeans, selectedDate],
  );

  const isSelectedDateArchived =
    datesAvailable.find((d) => d.date === selectedDate)?.isArchived ?? false;

  // PR — Selected-Players picker now shows ALL loaded players on the
  // slate, not just core-3-per-team. Previously the picker was capped
  // by `topCorePlayerKeysPerTeam` which ranks by projection-sum across
  // Over/Under markets. Stars whose biggest market got "No Play"
  // (projection sits on the line) — e.g. Anthony Edwards on May 15 —
  // fell out of MIN's top 3 and were undiscoverable. The "Include full
  // rotation" toggle still gates candidate generation; the picker is
  // always full.
  //
  // Star priority sorts to the top so users land on big names quickly.
  // Within each priority tier, alphabetical for stability.
  const playerOptions: PlayerOption[] = useMemo(() => {
    const all = uniquePlayersFromLeans(dateLeans, { coreOnly: false });
    const rank = (name: string): number => {
      const idx = STAR_PRIORITY.indexOf(name);
      return idx === -1 ? STAR_PRIORITY.length : idx;
    };
    return [...all].sort((a, b) => {
      const ra = rank(a.playerName);
      const rb = rank(b.playerName);
      if (ra !== rb) return ra - rb;
      return a.playerName.localeCompare(b.playerName);
    });
  }, [dateLeans]);

  const filteredPlayerOptions: PlayerOption[] = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return playerOptions;
    return playerOptions.filter((p) =>
      p.playerName.toLowerCase().includes(q),
    );
  }, [playerOptions, playerSearch]);
  const gameOptions: GameOption[] = useMemo(
    () => uniqueGamesFromLeans(dateLeans, gamesByGameId),
    [dateLeans, gamesByGameId],
  );

  // PR — when the user has hand-picked players in Selected Players mode,
  // their picks should always be honored even if the picked player is
  // outside the top-3 core pool. We force-enable bench inclusion in that
  // case so selecting a non-core star (e.g. Anthony Edwards on a slate
  // where his PTS is No Play) produces real candidates instead of an
  // empty result. The "Include full rotation" toggle still has effect
  // in Top Props mode and when no players are picked.
  const effectiveIncludeBench =
    includeFullRotation ||
    (mode === "selected_players" && selectedPlayerNames.size > 0);

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
      // PR #66 polish: surface more candidate slips. The underlying
      // library caps internally at 8 (parlay-builder.ts:288). Six
      // gives users meaningfully more comparison without inflating
      // beyond what the dedupe / correlation guards return.
      numCandidates: 6,
      includeBenchPlayers: effectiveIncludeBench,
      corePlayersPerTeam: 3,
    });
  }, [
    dateLeans,
    mode,
    selectedPlayerNames,
    selectedGameIds,
    selectedMarkets,
    riskProfile,
    effectiveIncludeBench,
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

  // Dynamic step numbering — visible sections are renumbered so the
  // sidebar always reads 1, 2, 3, 4, … without gaps. Previously
  // "Markets" hard-coded to step 6, leaving 1/2/3/4/6 when both
  // "Players" and "Games" were hidden (e.g. cold-start with no slate).
  const stepNumbers = (() => {
    const labels: string[] = [
      "Slate",
      "Builder mode",
      "Risk profile",
      "Player pool",
    ];
    if (mode === "selected_players") labels.push("Players");
    if (gameOptions.length > 0) labels.push("Games (optional)");
    labels.push("Markets (optional)");
    return Object.fromEntries(
      labels.map((l, i) => [l, String(i + 1)]),
    ) as Record<string, string>;
  })();

  function togglePlayer(name: string) {
    setSelectedPlayerNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
        // If we just removed the currently-viewed player, pivot the
        // dossier to another selected player (any), or clear it.
        if (activeViewPlayer === name) {
          const remaining = [...next];
          setActiveViewPlayer(remaining[0] ?? null);
        }
      } else {
        next.add(name);
        // Adding always surfaces the new player in the dossier so the
        // user sees their recent form immediately.
        setActiveViewPlayer(name);
      }
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
    <div className="grid grid-cols-1 md:grid-cols-[440px_1fr] gap-5">
      {/* Left — control panel.
          Iteration 4: small "Parlay console" eyebrow above the steps so
          users land on something that reads as a single illuminated
          control panel, not a generic form sidebar.
          Casino UI: gtp-console-chrome adds gold-rivet top rail + inner
          shadow so the sidebar reads as an aluminum-edged console plate. */}
      <div className="vault-deluxe-card gtp-console-chrome p-5 sm:p-6">
        <div
          className="mb-5 pb-4 flex items-center gap-2.5"
          style={{ borderBottom: "1px solid var(--vault-rule)" }}
        >
          <span
            aria-hidden
            className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
            style={{
              background: "var(--vault-gold-bright)",
              boxShadow: "0 0 8px rgba(240, 199, 94, 0.65)",
            }}
          />
          <span
            className="font-mono uppercase tracking-[0.18em]"
            style={{ color: "var(--vault-gold)", fontSize: 10 }}
          >
            Parlay console · build mode
          </span>
        </div>
        <SectionLabel n="1" text="Slate" />
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
                className="mb-4 px-2.5 py-1.5 rounded-[3px] text-[11px]"
                style={{
                  background: "var(--vault-warn-dim)",
                  color: "var(--vault-warn)",
                  border: "1px solid rgba(240, 199, 94, 0.30)",
                }}
              >
                Archived slate — these leans are historical, not current.
              </p>
            )}
            {!isSelectedDateArchived && (
              <p
                className="mb-4 text-[11px]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {activeSlateKind === "today"
                  ? "Current slate — today's model leans."
                  : "Upcoming slate."}
              </p>
            )}
          </>
        )}

        <SectionLabel n={stepNumbers["Builder mode"]} text="Builder mode" />
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

        <SectionLabel n={stepNumbers["Risk profile"]} text="Risk profile" />
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

        <SectionLabel n={stepNumbers["Player pool"]} text="Player pool" />
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
                Include full rotation in candidates
              </div>
              <div
                className="mt-0.5 text-[11px] leading-snug"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {includeFullRotation
                  ? "Bench / role players included in candidate generation. Wider pool, more variance."
                  : "Candidate generation defaults to the top 3 core players per team. You can still hand-pick anyone from the full list below."}
              </div>
            </div>
          </label>
        </div>

        {mode === "selected_players" && (
          <>
            <SectionLabel n={stepNumbers["Players"]} text="Players" />
            <div className="mb-3">
              <input
                type="search"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Search players on this slate…"
                aria-label="Search players"
                className="w-full px-3 py-2 rounded-[3px] text-[12px] transition-colors"
                style={{
                  background: "var(--vault-panel)",
                  border: "1px solid var(--vault-border)",
                  color: "var(--vault-text)",
                }}
              />
              <div
                className="mt-1.5 text-[10px] tracking-[0.04em]"
                style={{ color: "var(--vault-text-faint)" }}
              >
                {playerOptions.length} loaded player
                {playerOptions.length === 1 ? "" : "s"} on this slate
                {playerSearch.trim() && filteredPlayerOptions.length !==
                  playerOptions.length
                  ? ` · ${filteredPlayerOptions.length} match${
                      filteredPlayerOptions.length === 1 ? "" : "es"
                    }`
                  : ""}
              </div>
            </div>
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
                {filteredPlayerOptions.length === 0 ? (
                  <p
                    className="w-full text-[12px]"
                    style={{ color: "var(--vault-text-faint)" }}
                  >
                    No loaded players match &ldquo;{playerSearch}&rdquo;.
                  </p>
                ) : (
                  filteredPlayerOptions.map((p) => {
                    const isStar = STAR_PRIORITY.includes(p.playerName);
                    const isSelected = selectedPlayerNames.has(p.playerName);
                    return (
                      <button
                        key={`${p.playerId}_${p.playerName}`}
                        type="button"
                        onClick={() => togglePlayer(p.playerName)}
                        aria-pressed={isSelected}
                        className={`px-2.5 py-1 rounded-[3px] text-[12px] transition-colors ${
                          isSelected ? "gtp-selected-chip" : ""
                        }`}
                        style={{
                          background: isSelected
                            ? "linear-gradient(180deg, rgba(240, 199, 94, 0.18) 0%, rgba(212, 175, 55, 0.06) 100%)"
                            : "var(--vault-panel)",
                          border: `1px solid ${
                            isSelected
                              ? "rgba(240, 199, 94, 0.55)"
                              : isStar
                                ? "var(--vault-border-strong)"
                                : "var(--vault-border)"
                          }`,
                          color: isSelected
                            ? "var(--vault-gold-bright)"
                            : "var(--vault-text)",
                          boxShadow: isSelected
                            ? "0 0 0 1px rgba(240, 199, 94, 0.30) inset, 0 0 12px rgba(240, 199, 94, 0.25)"
                            : "none",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {p.playerName}
                        {(isStar || p.hasHighConfidence) && (
                          <span
                            className="ml-1.5 text-[10px]"
                            style={{
                              color: isStar
                                ? "var(--vault-gold-bright)"
                                : "var(--vault-gold)",
                            }}
                            aria-label={
                              isStar
                                ? "headliner"
                                : "has a High-confidence lean on this slate"
                            }
                          >
                            ★
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </>
        )}

        {gameOptions.length > 0 && (
          <>
            <SectionLabel
              n={stepNumbers["Games (optional)"]}
              text="Games (optional)"
            />
            <div className="mb-5 flex flex-wrap gap-1.5">
              {gameOptions.map((g) => (
                <button
                  key={g.gameId}
                  type="button"
                  onClick={() => toggleGame(g.gameId)}
                  className="px-2.5 py-1 rounded-[3px] text-[12px] transition-colors"
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
          n={stepNumbers["Markets (optional)"]}
          text="Markets (optional)"
        />
        <div className="mb-1 flex gap-1.5">
          {MARKET_LIST.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMarket(m)}
              className="px-3 py-1 rounded-[3px] font-mono text-[11px] tabular tracking-wide transition-colors"
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

      {/* Right — dossier + candidates */}
      <div className="space-y-3">
        {mode === "selected_players" &&
          activeViewPlayer &&
          selectedPlayerNames.has(activeViewPlayer) && (
            <PlayerRecentFormPanel
              key={activeViewPlayer}
              leans={dateLeans}
              playerName={activeViewPlayer}
              otherSelectedPlayers={[...selectedPlayerNames].filter(
                (p) => p !== activeViewPlayer,
              )}
              onSwitchPlayer={(p) => setActiveViewPlayer(p)}
            />
          )}
        {/* Sportsbook slip rack — the eyebrow above the candidate output
            now reads as a printer header with a thin gold rule across the
            bottom. Candidate cards still print into the same column below;
            the framing just makes the right pane feel like a slip rack
            rather than a generic results list. */}
        <div
          className="rounded-[6px] overflow-hidden gtp-crt-scanlines"
          style={{
            background:
              "linear-gradient(180deg, rgba(7,11,26,0.78) 0%, rgba(7,11,26,0.45) 100%)",
            border: "1px solid var(--vault-border)",
          }}
        >
          <div
            className="flex items-center justify-between gap-2 px-4 py-2.5"
            style={{
              borderBottom: "1px solid var(--vault-rule)",
              background:
                "linear-gradient(180deg, rgba(240, 199, 94, 0.06) 0%, transparent 100%)",
            }}
          >
            <span className="font-mono uppercase tracking-[0.18em] inline-flex items-center gap-2" style={{ color: "var(--vault-gold)", fontSize: 10 }}>
              <span
                aria-hidden
                className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
                style={{
                  background: "var(--vault-gold-bright)",
                  boxShadow: "0 0 6px rgba(240, 199, 94, 0.55)",
                }}
              />
              Candidate slips · model output
            </span>
            <span
              className="font-mono uppercase tracking-[0.14em] hidden sm:inline"
              style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
            >
              educational candidates · not betting advice
            </span>
          </div>
          <div className="p-3 sm:p-4 space-y-3">
        {noCurrentBuilder ? (
          <DemoPreviewState
            heading="No current slate available"
            body="The next slate hasn't been generated yet. Once today's or tomorrow's model leans land, the builder activates and the picker chips below light up."
          />
        ) : hasNoSlate ? (
          <DemoPreviewState
            heading="No model leans on this slate"
            body="The selected date doesn't have model leans yet. Pick a different date or check back after the next refresh — picker chips look like this when active:"
          />
        ) : candidates.length === 0 ? (
          (() => {
            // PR — when the user has hand-picked players in Selected
            // Players mode but no candidates came back, surface a more
            // tailored hint pointing at the risk profile / filters
            // rather than the generic "no candidates" copy.
            if (
              mode === "selected_players" &&
              selectedPlayerNames.size > 0
            ) {
              return (
                <EmptyState
                  heading={`No ${riskProfile} parlays from your selected players`}
                  body={
                    selectedPlayerNames.size === 1
                      ? `The model needs at least two compatible legs to build a parlay. Add another star player, switch to ${
                          riskProfile === "conservative"
                            ? "Balanced"
                            : riskProfile === "balanced"
                              ? "Aggressive"
                              : "Balanced"
                        } risk, or widen the market filter.`
                      : `Your selected players don't combine into a ${riskProfile} candidate right now. Try Aggressive risk, widen markets, or pick different players.`
                  }
                />
              );
            }
            return (
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
            );
          })()
        ) : (
          <>
            {/* Focus banner only fires in Top Props mode while the
                core-only filter is in effect — Selected Players mode
                always respects the user's hand-picked players. */}
            {!includeFullRotation && mode === "top_props" && (
              <div
                className="rounded-[3px] px-3 py-2 text-[11px] flex items-center gap-2"
                style={{
                  background: "var(--vault-gold-dim)",
                  border: "1px solid var(--vault-border-strong)",
                  color: "var(--vault-gold-bright)",
                }}
              >
                <span aria-hidden>★</span>
                <span>
                  Focused on the top core players per team. Switch to
                  Selected Players mode to hand-pick anyone on the slate.
                </span>
              </div>
            )}
            {candidates.map((c, idx) => (
              <CandidateCard key={idx} candidate={c} index={idx} />
            ))}
          </>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionLabel({ n, text }: { n: string; text: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-full font-mono text-[10px] font-semibold tabular"
        style={{
          background: "var(--vault-gold-dim)",
          border: "1px solid var(--vault-border-strong)",
          color: "var(--vault-gold-bright)",
        }}
        aria-hidden="true"
      >
        {n}
      </span>
      <span
        className="text-[13px] font-medium tracking-tight"
        style={{ color: "var(--vault-text)" }}
      >
        {text}
      </span>
    </div>
  );
}

/**
 * LED-segment mode button. The .gtp-led-mode utility paints a thin
 * rule across the bottom edge that lights up gold when active —
 * gives the Build / Analyze pair a sportsbook control-panel rhythm
 * instead of two generic buttons.
 */
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
      data-active={active}
      className="gtp-led-mode flex-1 px-3 py-2.5 rounded-[3px] text-[12px] font-mono uppercase tracking-[0.12em] transition-colors"
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

/**
 * Risk profile ticket stub. The thin gold left-edge rule on the active
 * card reads as a perforation marker — separating the chosen stub from
 * the others so the picker feels like a sportsbook ticket selector.
 */
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
      className="text-left px-3 py-2.5 rounded-[2px] transition-all relative overflow-hidden"
      style={{
        background: active ? "var(--vault-gold-dim)" : "var(--vault-panel)",
        border: `1px solid ${
          active ? "var(--vault-gold)" : "var(--vault-border)"
        }`,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-0 w-[3px] rounded-r-[2px] transition-opacity"
        style={{
          background: "var(--vault-gold-bright)",
          opacity: active ? 0.9 : 0,
          boxShadow: active
            ? "0 0 10px rgba(240, 199, 94, 0.55)"
            : "none",
        }}
      />
      <div
        className="font-display text-[13px] font-semibold tracking-tight capitalize"
        style={{
          color: active ? "var(--vault-gold-bright)" : "var(--vault-text)",
          marginLeft: active ? 8 : 0,
          transition: "margin-left 200ms ease",
        }}
      >
        {rp}
      </div>
      <div
        className="mt-0.5 text-[11px] leading-snug"
        style={{
          color: "var(--vault-text-faint)",
          marginLeft: active ? 8 : 0,
          transition: "margin-left 200ms ease",
        }}
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
      className="vault-deluxe-card casino-glow-card gtp-candidate-ticket p-5 sm:p-6 vault-rise"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Zone A — header: candidate identity + combined odds */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <h3
            className="font-display text-[16px] sm:text-[17px] font-semibold tracking-tight"
            style={{ color: "var(--vault-text)" }}
          >
            Candidate {index + 1}
          </h3>
          <span
            className="text-[12px]"
            style={{ color: "var(--vault-text-faint)" }}
          >
            · {candidate.legs.length} leg{candidate.legs.length === 1 ? "" : "s"} ·{" "}
            {candidate.uniqueGames} game
            {candidate.uniqueGames === 1 ? "" : "s"}
          </span>
        </div>
        <div className="text-[12px]">
          {candidate.combinedOddsAmerican != null ? (
            <span
              className="gtp-combined-odds-chip"
              data-tone={
                candidate.combinedOddsAmerican >= 1000 ? "big" : undefined
              }
            >
              <span className="gtp-combined-odds-label">Combined</span>
              <span className="gtp-combined-odds-value">
                {candidate.combinedOddsAmerican > 0 ? "+" : ""}
                {candidate.combinedOddsAmerican}
              </span>
            </span>
          ) : (
            <span style={{ color: "var(--vault-text-faint)" }}>
              Odds unavailable
            </span>
          )}
        </div>
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
          const playoff = getPlayoffContext(
            lean.gameId,
            lean.homeAway === "Home" ? lean.opponent ?? undefined : lean.team ?? undefined,
            lean.homeAway === "Home" ? lean.team ?? undefined : lean.opponent ?? undefined,
          );
          return (
            <div
              key={i}
              className="px-3 py-2.5 rounded-[2px]"
              style={{
                background: "var(--vault-panel)",
                border: "1px solid var(--vault-border)",
              }}
            >
              {/* Row 1: avatar + player + matchup */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-2 min-w-0">
                  <PlayerAvatar
                    playerId={lean.playerId ?? undefined}
                    playerName={lean.playerName ?? ""}
                    team={lean.team ?? undefined}
                    size="xs"
                    flat
                  />
                  <span
                    className="font-display text-[15px] font-semibold tracking-tight truncate"
                    style={{ color: "var(--vault-text)" }}
                  >
                    {lean.playerName}
                  </span>
                </span>
                {matchup && (
                  <span
                    className="text-[11px] flex items-center gap-2"
                    style={{ color: "var(--vault-text-faint)" }}
                  >
                    <span>{matchup}</span>
                    {playoff.isPlayoffs && playoff.gameLabel && (
                      <span className="gtp-game-chip">{playoff.gameLabel}</span>
                    )}
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
                  label="signal"
                  value={confidenceLabel(lean.confidence)}
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
                    className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[10px]"
                    style={{
                      border: "1px solid var(--vault-border)",
                      color: "var(--vault-text-faint)",
                    }}
                  >
                    Limited recent form
                  </span>
                )}
                {lean.riskFlags?.includes("suspicious_edge") && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[10px]"
                    style={{
                      background: "var(--vault-warn-dim)",
                      border: "1px solid rgba(240, 199, 94, 0.30)",
                      color: "var(--vault-warn)",
                    }}
                  >
                    Model anomaly
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zone C — footnotes: same-game + anomaly chips + rationale */}
      <div className="mt-3 flex flex-wrap gap-2">
        {candidate.hasSameGameLegs && (
          <span
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[3px] text-[11px]"
            style={{
              background: "var(--vault-warn-dim)",
              border: "1px solid rgba(240, 199, 94, 0.30)",
              color: "var(--vault-warn)",
            }}
          >
            <span aria-hidden>⚠</span>
            <span>Same-game legs — outcomes can correlate.</span>
          </span>
        )}
        {candidate.hasAnomalyLegs && (
          <span
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[3px] text-[11px]"
            style={{
              background: "var(--vault-warn-dim)",
              border: "1px solid rgba(240, 199, 94, 0.30)",
              color: "var(--vault-warn)",
            }}
          >
            <span aria-hidden>◆</span>
            <span>
              Includes model-anomaly leg — confidence capped at Low.
            </span>
          </span>
        )}
      </div>
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
      className="inline-flex items-baseline gap-1.5 px-2 py-0.5 rounded-[3px] text-[10px]"
      style={{
        background: "var(--vault-panel-elevated)",
        border: "1px solid var(--vault-border)",
      }}
    >
      <span style={{ color: "var(--vault-text-faint)" }}>{label}</span>
      <span
        className="font-mono tabular"
        style={{ color: valueColor ?? "var(--vault-text)" }}
      >
        {value}
      </span>
    </span>
  );
}

/**
 * Cold-start empty state — shown when no slate has leans yet.
 *
 * Demonstrates the marquee chip styling so users see what the populated
 * picker will look like instead of a blank panel. The preview chips are
 * non-interactive and labelled "preview only" so they can't be confused
 * with real picks. No data is fabricated: names are anchored to the
 * curated STAR_PRIORITY list already used by the live picker.
 */
function DemoPreviewState({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) {
  const previewNames = STAR_PRIORITY.slice(0, 3);
  return (
    <div className="vault-deluxe-card p-8 sm:p-10">
      <div className="flex items-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
          style={{ background: "var(--vault-gold)" }}
        />
        <span
          className="font-mono uppercase tracking-[0.18em]"
          style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
        >
          Builder is idle
        </span>
      </div>
      <h3
        className="font-display text-[20px] font-semibold tracking-tight"
        style={{ color: "var(--vault-text)" }}
      >
        {heading}
      </h3>
      <p
        className="mt-2 text-[13px] leading-relaxed max-w-md"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>

      {/* Preview chip row — the first chip wears the live gold-glow
          treatment so the marquee selection styling is visible even on
          cold-start days. The remaining chips show the resting state. */}
      <div
        className="mt-5 flex flex-wrap gap-1.5"
        aria-hidden
      >
        {previewNames.map((name, i) => {
          const isSelected = i === 0;
          return (
            <span
              key={name}
              className={`px-2.5 py-1 rounded-[3px] text-[12px] ${
                isSelected ? "gtp-selected-chip" : ""
              }`}
              style={{
                background: isSelected
                  ? "linear-gradient(180deg, rgba(240, 199, 94, 0.18) 0%, rgba(212, 175, 55, 0.06) 100%)"
                  : "var(--vault-panel)",
                border: `1px solid ${
                  isSelected
                    ? "rgba(240, 199, 94, 0.55)"
                    : "var(--vault-border)"
                }`,
                color: isSelected
                  ? "var(--vault-gold-bright)"
                  : "var(--vault-text)",
                boxShadow: isSelected
                  ? "0 0 0 1px rgba(240, 199, 94, 0.30) inset, 0 0 12px rgba(240, 199, 94, 0.25)"
                  : "none",
                fontWeight: isSelected ? 600 : 400,
                opacity: isSelected ? 1 : 0.7,
              }}
            >
              {name}
              <span
                className="ml-1.5 text-[10px]"
                style={{ color: "var(--vault-gold-bright)" }}
              >
                ★
              </span>
            </span>
          );
        })}
      </div>
      <div
        className="mt-3 font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        preview only · chips activate when a real slate loads
      </div>
    </div>
  );
}

function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div
      className="vault-deluxe-card p-8 sm:p-12 text-center"
    >
      <div className="flex items-center justify-center gap-2 mb-3">
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full vault-pulse"
          style={{ background: "var(--vault-gold)" }}
        />
        <span
          className="text-[11px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          Builder is idle
        </span>
      </div>
      <h3
        className="font-display text-[20px] font-semibold tracking-tight"
        style={{ color: "var(--vault-text)" }}
      >
        {heading}
      </h3>
      <p
        className="mt-2 text-[13px] leading-relaxed max-w-md mx-auto"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {body}
      </p>
    </div>
  );
}
