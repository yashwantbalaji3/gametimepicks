"use client";
/**
 * CustomParlayBuilder — "Build your own parlay" surface under the
 * suggested parlays on the homepage + Parlay Lab.
 *
 * Honest framing (PR #101):
 *   - User picks any available leg from the optimizer's `legPool`.
 *   - We show a "Custom evaluation" card with model rating, average
 *     edge, combined odds when available, risk label, and warnings.
 *   - We do NOT compute win probability or expected value.
 *   - We do NOT track custom slips — they never enter optimizer-
 *     summary or /results. The card explicitly says
 *     "Custom evaluation · not tracked".
 */
import { useMemo, useState } from "react";
import SearchableSelect, { type SearchableOption } from "./searchable-select";
import PlayerAvatar from "./player-avatar";
import TeamLogo from "./team-logo";
import CustomParlayGradeCard from "./custom-parlay-grade-card";
import type { OptimizerLeg, OptimizerSnapshot } from "@/lib/parlay-optimizer";
import {
  CUSTOM_PARLAY_MAX_LEGS,
  evaluateCustomParlay,
  getLegPool,
  warningLabel,
  type CustomParlayWarning,
} from "@/lib/custom-parlay";

interface Props {
  snapshot: OptimizerSnapshot | null;
}

export default function CustomParlayBuilder({ snapshot }: Props) {
  const pool = useMemo(() => (snapshot ? getLegPool(snapshot) : []), [snapshot]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Map keyed by leanId so duplicate selections are impossible. We
  // key off leanId because (playerId, market, side, line) is what the
  // pipeline uses to identify a unique leg.
  const poolByKey = useMemo(() => {
    const m = new Map<string, OptimizerLeg>();
    for (const leg of pool) m.set(leg.leanId, leg);
    return m;
  }, [pool]);

  const selectedLegs = useMemo(
    () =>
      selectedKeys
        .map((k) => poolByKey.get(k))
        .filter((l): l is OptimizerLeg => l != null),
    [selectedKeys, poolByKey],
  );

  const evaluation = useMemo(
    () => evaluateCustomParlay(selectedLegs),
    [selectedLegs],
  );

  const options = useMemo<SearchableOption[]>(() => {
    const out: SearchableOption[] = [
      { value: null, label: "Pick a leg…" },
    ];
    for (const leg of pool) {
      if (selectedKeys.includes(leg.leanId)) continue;
      const sportLower = (leg.sport ?? "").toLowerCase();
      const sport = (leg.sport ?? "").toUpperCase();
      const star = leg.isStar ? "⭐ " : "";
      const line = leg.line != null ? leg.line : "—";
      const avatarSport = (sportLower === "mlb" || sportLower === "nba")
        ? (sportLower as "mlb" | "nba")
        : "nba";
      out.push({
        value: leg.leanId,
        label: `${star}${leg.playerName} · ${leg.market} ${leg.side} ${line}`,
        // PR 3: de-emphasize edgePct/confidence (non-predictive per #240).
        // Show factual sport · team only.
        sub: `${sport} · ${leg.team ?? "?"}`,
        searchText: `${leg.playerName} ${leg.team ?? ""} ${leg.market} ${sport}`,
        leadIcon: (
          <PlayerAvatar
            playerId={leg.playerId ?? null}
            playerName={leg.playerName}
            team={leg.team ?? undefined}
            sport={avatarSport}
            size="xs"
            flat
          />
        ),
      });
    }
    return out;
  }, [pool, selectedKeys]);

  function addLeg(value: string | null) {
    if (!value) return;
    if (selectedKeys.includes(value)) return;
    if (selectedKeys.length >= CUSTOM_PARLAY_MAX_LEGS) return;
    setSelectedKeys((cur) => [...cur, value]);
  }

  function removeLeg(leanId: string) {
    setSelectedKeys((cur) => cur.filter((k) => k !== leanId));
  }

  function clearAll() {
    setSelectedKeys([]);
  }

  const atCap = selectedKeys.length >= CUSTOM_PARLAY_MAX_LEGS;

  return (
    <section
      className="flex flex-col gap-4 rounded-lg border border-[color:var(--vault-divider)] p-4"
      aria-label="Build your own parlay"
    >
      <header className="flex flex-col gap-1">
        <span
          className="font-mono uppercase tracking-[0.16em] text-[10px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          BUILD YOUR OWN PARLAY
        </span>
        <h3 className="text-lg font-semibold">
          Pick legs. We score the slip with the model.
        </h3>
        <p
          className="text-sm"
          style={{ color: "var(--vault-text-soft)" }}
        >
          Select players from available MLB and NBA model legs (mixed is
          allowed). This is a Custom evaluation — not officially tracked, no
          probability claims.
        </p>
      </header>

      {pool.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--vault-text-soft)" }}>
          No leg pool available for this slate yet.
        </p>
      ) : (
        <>
          <SearchableSelect
            label="ADD LEG"
            placeholder={
              atCap
                ? `Max ${CUSTOM_PARLAY_MAX_LEGS} legs reached`
                : "Search by player, team, market…"
            }
            options={atCap ? [{ value: null, label: "Max legs reached" }] : options}
            value={null}
            onChange={addLeg}
          />

          {selectedLegs.length > 0 ? (
            <ul
              className="flex flex-col gap-2"
              aria-label="Selected custom parlay legs"
            >
              {selectedLegs.map((leg) => {
                const sport = (leg.sport ?? "").toLowerCase();
                const avatarSport = (sport === "mlb" || sport === "nba")
                  ? (sport as "mlb" | "nba")
                  : "nba";
                const teamSport = (sport === "mlb" || sport === "nba" || sport === "nhl")
                  ? (sport as "mlb" | "nba" | "nhl")
                  : null;
                return (
                  <li
                    key={leg.leanId}
                    className="flex items-center justify-between gap-3 rounded-md border border-[color:var(--vault-divider)] p-2.5 sm:p-3"
                    style={{ background: "var(--gtp-card)" }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar
                        playerId={leg.playerId ?? null}
                        playerName={leg.playerName}
                        team={leg.team ?? undefined}
                        sport={avatarSport}
                        size="sm"
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {leg.isStar ? "⭐ " : ""}
                          {leg.playerName}{" "}
                          <span
                            className="font-mono text-[11px]"
                            style={{ color: "var(--vault-text-soft)" }}
                          >
                            · {leg.market} {leg.side} {leg.line ?? "—"}
                          </span>
                        </span>
                        <span
                          className="text-[11px] font-mono uppercase tracking-wider flex items-center gap-1.5 truncate"
                          style={{ color: "var(--vault-text-faint)" }}
                        >
                          {teamSport && leg.team ? (
                            <TeamLogo team={leg.team} sport={teamSport} size="sm" />
                          ) : null}
                          <span className="truncate">
                            {/* PR 3: de-emphasize edgePct/confidence
                                (non-predictive per #240). Factual sport ·
                                team · price only. */}
                            {(leg.sport ?? "?").toUpperCase()} · {leg.team ?? "?"}
                            {typeof leg.oddsForSide === "number"
                              ? ` · ${leg.oddsForSide > 0 ? "+" : ""}${leg.oddsForSide}`
                              : ""}
                          </span>
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLeg(leg.leanId)}
                      aria-label={`Remove ${leg.playerName} leg`}
                      className="text-xs font-mono uppercase tracking-wider px-2 py-1 rounded border border-[color:var(--vault-divider)] hover:border-[color:var(--vault-text-soft)] shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p
              className="text-sm"
              style={{ color: "var(--vault-text-faint)" }}
            >
              Add a leg to see the model's evaluation.
            </p>
          )}

          {selectedLegs.length > 0 && (
            <EvaluationCard evaluation={evaluation} onClearAll={clearAll} />
          )}

          {/* PR `feature/custom-parlay-grading-scale` — informational
              A/B/C/D/F grade with positives/warnings + collapsed factor
              breakdown. Renders whenever the user has picked at least
              one leg so the grade can guide their build. Empty pool
              still renders a neutral "pick legs" state inside the
              component. */}
          <CustomParlayGradeCard legs={selectedLegs} context="Manual Builder" />
        </>
      )}
    </section>
  );
}

function EvaluationCard({
  evaluation,
  onClearAll,
}: {
  evaluation: ReturnType<typeof evaluateCustomParlay>;
  onClearAll: () => void;
}) {
  const {
    legCount,
    averageEdgePct,
    modelRating,
    combinedOdds,
    riskLabel,
    warnings,
    starHeavy,
  } = evaluation;
  const oddsLabel =
    combinedOdds == null
      ? "—"
      : combinedOdds >= 0
      ? `+${combinedOdds}`
      : `${combinedOdds}`;
  const negativeWarnings = warnings.filter(
    (w): w is Exclude<CustomParlayWarning, "star_heavy"> => w !== "star_heavy",
  );
  return (
    <article
      className="rounded-md border border-[color:var(--vault-divider)] bg-[color:var(--vault-surface-1,rgba(26, 16, 11,0.45))] p-3 flex flex-col gap-2"
      aria-label="Custom evaluation"
    >
      <header className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.14em] text-[10px]"
          style={{ color: "var(--vault-text-faint)" }}
        >
          CUSTOM EVALUATION · NOT TRACKED
        </span>
        <button
          type="button"
          onClick={onClearAll}
          className="text-[10px] font-mono uppercase tracking-wider"
          style={{ color: "var(--vault-text-soft)" }}
        >
          Clear all
        </button>
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Legs" value={legCount.toString()} />
        <Stat
          label="Model rating"
          value={modelRating.toFixed(2)}
        />
        <Stat
          label="Avg edge"
          value={
            averageEdgePct == null ? "—" : `${averageEdgePct.toFixed(1)}pp`
          }
        />
        <Stat label="Combined" value={oddsLabel} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          label={riskLabel}
          tone={riskLabel === "High variance" ? "warn" : "default"}
        />
        {starHeavy && <Chip label="Star-heavy" tone="positive" />}
        {negativeWarnings.map((w) => (
          <Chip key={w} label={warningLabel(w)} tone="warn" />
        ))}
      </div>
      <p
        className="text-[11px]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        Custom evaluation only — not a tracked or recommended slip. Model
        rating combines confidence, edge, recent form, market stability,
        and correlation penalties.
      </p>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className="text-[10px] font-mono uppercase tracking-[0.12em]"
        style={{ color: "var(--vault-text-faint)" }}
      >
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

function Chip({
  label,
  tone,
}: {
  label: string;
  tone: "default" | "positive" | "warn";
}) {
  const color =
    tone === "warn"
      ? "var(--vault-warn)"
      : tone === "positive"
      ? "var(--vault-success)"
      : "var(--vault-text-soft)";
  return (
    <span
      className="text-[10px] font-mono uppercase tracking-[0.12em] px-2 py-0.5 rounded-[3px]"
      style={{
        color,
        border: `1px solid ${color}`,
      }}
    >
      {label}
    </span>
  );
}
