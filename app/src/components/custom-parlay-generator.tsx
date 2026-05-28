"use client";
/**
 * CustomParlayGenerator — "Generate for me" surface below the
 * official suggested slips and the manual CustomParlayBuilder.
 *
 * Honest framing (PR #115):
 *   - The user picks sport / risk / game / team / player(s).
 *   - The app synthesizes 1–5 parlay previews from the existing
 *     `legPool` using the same scoring + correlation + diversity
 *     rules as the Python optimizer (mirrored in
 *     `lib/custom-parlay-generator.ts`).
 *   - Every generated slip is labeled
 *       "Custom generated · not officially tracked"
 *     and never enters `optimizer-summary` or `/results`.
 *   - DNP guard runs by default. Toggle below allows the
 *     generator to surface DNP-risk legs with a per-slip warning.
 */
import { useMemo, useState } from "react";
import PlayerAvatar from "./player-avatar";
import TeamLogo from "./team-logo";
import SearchableSelect, { type SearchableOption } from "./searchable-select";
import CustomParlayGradeCard from "./custom-parlay-grade-card";
import type { OptimizerLeg, OptimizerSnapshot } from "@/lib/parlay-optimizer";
import { getLegPool } from "@/lib/custom-parlay";
import {
  generateCustomParlaysFromPool,
  describeGeneratorReason,
  type GeneratorRisk,
  type GeneratedSlip,
} from "@/lib/custom-parlay-generator";
import { americanToDecimal, formatAmerican } from "@/lib/odds-math";

/** Local helper: convert combined American odds → profit per $100
 *  staked. Same math as `combinedParlayPayoutPer100` but takes the
 *  already-combined American number as input. */
function _profitPer100(american: number | null): number | null {
  if (typeof american !== "number" || !Number.isFinite(american)) return null;
  const decimal = americanToDecimal(american);
  return (decimal - 1) * 100;
}

interface Props {
  snapshot: OptimizerSnapshot | null;
}

const RISK_OPTIONS: Array<{ key: GeneratorRisk; label: string; sub: string }> = [
  { key: "conservative", label: "Conservative", sub: "2 legs · safest pool" },
  { key: "balanced",     label: "Balanced",     sub: "2–3 legs · safe pool" },
  { key: "star_power",   label: "Star Power",   sub: "Recognizable stars only" },
  { key: "aggressive",   label: "Longshot",     sub: "3–4 legs · higher variance" },
];

const SPORT_OPTIONS: Array<{ key: "all" | "nba" | "mlb" | "multi"; label: string }> = [
  { key: "all",   label: "All" },
  { key: "nba",   label: "🏀 NBA" },
  { key: "mlb",   label: "⚾ MLB" },
  { key: "multi", label: "🔀 Mixed" },
];

export default function CustomParlayGenerator({ snapshot }: Props) {
  const pool = useMemo(() => (snapshot ? getLegPool(snapshot) : []), [snapshot]);
  const [sport, setSport] = useState<"all" | "nba" | "mlb" | "multi">("all");
  const [risk, setRisk] = useState<GeneratorRisk>("balanced");
  const [team, setTeam] = useState<string | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [allowRiskLegs, setAllowRiskLegs] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Derive option lists from the pool (only show teams/players
  // that actually appear after the sport filter).
  const sportFilteredPool = useMemo(() => {
    if (sport === "all" || sport === "multi") return pool;
    return pool.filter((l) => (l.sport ?? "").toLowerCase() === sport);
  }, [pool, sport]);

  const teamOptions = useMemo<SearchableOption[]>(() => {
    const seen = new Set<string>();
    const opts: SearchableOption[] = [{ value: null, label: "All teams" }];
    for (const l of sportFilteredPool) {
      const t = (l.team ?? "").trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      opts.push({ value: t, label: t });
    }
    return opts;
  }, [sportFilteredPool]);

  const playerOptions = useMemo<SearchableOption[]>(() => {
    const seen = new Set<string>();
    const opts: SearchableOption[] = [{ value: null, label: "All players" }];
    for (const l of sportFilteredPool) {
      const k = (l.playerName ?? "").trim();
      if (!k || seen.has(k.toLowerCase())) continue;
      seen.add(k.toLowerCase());
      opts.push({
        value: k,
        label: k,
        sub: l.team ? `${l.team} · ${l.sport.toUpperCase()}` : l.sport.toUpperCase(),
      });
    }
    return opts;
  }, [sportFilteredPool]);

  const gameOptions = useMemo<SearchableOption[]>(() => {
    const seen = new Set<string>();
    const opts: SearchableOption[] = [{ value: null, label: "All games" }];
    for (const l of sportFilteredPool) {
      const g = l.gameId ?? "";
      if (!g || seen.has(g)) continue;
      seen.add(g);
      // Show "OKC @ SAS" if we can derive it from the leg pair.
      const sample = sportFilteredPool.find((x) => x.gameId === g);
      const matchup = sample?.team && sample?.opponent
        ? `${sample.team} vs ${sample.opponent}`
        : g.slice(0, 12);
      opts.push({ value: g, label: matchup, sub: l.sport.toUpperCase() });
    }
    return opts;
  }, [sportFilteredPool]);

  // Run the generator each time the user picks something.
  const result = useMemo(() => {
    if (!showResults) return null;
    return generateCustomParlaysFromPool(pool, {
      sport,
      risk,
      gameId: gameId ?? null,
      team: team ?? null,
      playerNames: player ? [player] : [],
      count: 5,
      allowRiskLegs,
    });
  }, [pool, sport, risk, gameId, team, player, allowRiskLegs, showResults]);

  return (
    <section
      className="rounded-[10px] p-4 sm:p-5 flex flex-col gap-3"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-border)",
      }}
      aria-label="Custom parlay generator"
    >
      <header className="flex flex-col gap-1">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{ color: "var(--vault-gold)", fontSize: 11 }}
        >
          Custom generator · not officially tracked
        </span>
        <h2
          className="font-display tracking-tight"
          style={{ color: "var(--vault-text)", fontSize: 18, fontWeight: 600 }}
        >
          Generate for me
        </h2>
        <p
          className="text-[12.5px] leading-snug"
          style={{ color: "var(--vault-text-mute)", maxWidth: 620 }}
        >
          Pick a sport, a risk level, and (optionally) a game, team, or
          player. The generator builds up to 5 parlay previews from the
          existing leg pool using the same model scoring and DNP
          guard as the official lanes. Generated slips are never
          tracked publicly.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {/* Sport pill row */}
        <PillRow
          label="Sport"
          options={SPORT_OPTIONS}
          value={sport}
          onChange={(v) => {
            setSport(v as "all" | "nba" | "mlb" | "multi");
            setTeam(null);
            setPlayer(null);
            setGameId(null);
          }}
        />
        {/* Risk pill row */}
        <PillRow
          label="Risk"
          options={RISK_OPTIONS.map((r) => ({ key: r.key, label: r.label }))}
          value={risk}
          onChange={(v) => setRisk(v as GeneratorRisk)}
        />
        {/* Game / team / player selects */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SearchableSelect
            label="Game"
            placeholder="All games"
            value={gameId}
            options={gameOptions}
            onChange={setGameId}
            emptyMessage="No games for this sport"
          />
          <SearchableSelect
            label="Team"
            placeholder="All teams"
            value={team}
            options={teamOptions}
            onChange={setTeam}
            emptyMessage="No teams for this sport"
          />
          <SearchableSelect
            label="Player"
            placeholder="All players"
            value={player}
            options={playerOptions}
            onChange={setPlayer}
            emptyMessage="No players match"
          />
        </div>
        {/* Risk-legs toggle */}
        <label
          className="inline-flex items-center gap-2 text-[12px]"
          style={{ color: "var(--vault-text-mute)" }}
        >
          <input
            type="checkbox"
            checked={allowRiskLegs}
            onChange={(e) => setAllowRiskLegs(e.target.checked)}
          />
          Include DNP-risk legs (each slip flagged)
        </label>
        {/* Generate button */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowResults(true)}
            className="font-mono uppercase tracking-[0.16em] px-4 py-2 rounded-[6px]"
            style={{
              color: "var(--vault-bg)",
              background: "var(--vault-gold-bright)",
              border: "1px solid var(--vault-gold-bright)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Generate 5 builds
          </button>
          {showResults && (
            <button
              type="button"
              onClick={() => setShowResults(false)}
              className="font-mono uppercase tracking-[0.14em] px-3 py-2 rounded-[6px]"
              style={{
                color: "var(--vault-text-mute)",
                background: "transparent",
                border: "1px solid var(--vault-rule)",
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {result && (
        <GeneratorResultsView result={result} />
      )}
    </section>
  );
}

function PillRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ key: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="font-mono uppercase tracking-[0.16em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 10 }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onChange(opt.key)}
              className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
              style={{
                color: active ? "var(--vault-bg)" : "var(--vault-text-mute)",
                background: active ? "var(--vault-gold-bright)" : "var(--gtp-card)",
                border: `1px solid ${active ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
                fontSize: 10,
                cursor: "pointer",
              }}
              aria-pressed={active}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GeneratorResultsView({
  result,
}: {
  result: ReturnType<typeof generateCustomParlaysFromPool>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p
        className="text-[11.5px] leading-snug"
        style={{ color: "var(--vault-text-mute)" }}
      >
        {describeGeneratorReason(result.reason, result.slips.length, 5)}
        {result.excludedDnp > 0 && (
          <span style={{ color: "var(--vault-text-faint)" }}>
            {" "}· {result.excludedDnp} leg{result.excludedDnp === 1 ? "" : "s"} excluded by DNP guard
          </span>
        )}
      </p>
      {result.slips.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {result.slips.map((slip) => (
            <GeneratedSlipCard key={slip.slipId} slip={slip} />
          ))}
        </div>
      )}
    </div>
  );
}

function GeneratedSlipCard({ slip }: { slip: GeneratedSlip }) {
  const american = slip.combinedOdds;
  const profit = _profitPer100(american);
  return (
    <article
      className="rounded-[8px] p-3 flex flex-col gap-2"
      style={{
        background: "var(--gtp-card)",
        border: `1px solid ${slip.containsRiskLeg ? "var(--vault-warn)" : "var(--vault-border)"}`,
      }}
    >
      <header className="flex items-center justify-between gap-2">
        <span
          className="font-mono uppercase tracking-[0.16em]"
          style={{
            color: slip.containsRiskLeg
              ? "var(--vault-warn)"
              : "var(--vault-gold)",
            fontSize: 9,
          }}
        >
          Custom · {slip.risk.replace("_", " ")}
          {slip.containsRiskLeg ? " · DNP risk" : ""}
        </span>
        <span
          className="font-mono"
          style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
        >
          {slip.legCount} leg{slip.legCount === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="flex flex-col gap-1">
        {slip.legs.map((leg, i) => (
          <li key={`${slip.slipId}-${i}`}>
            <LegRow leg={leg} />
          </li>
        ))}
      </ul>
      <footer
        className="pt-1.5 grid grid-cols-3 gap-2"
        style={{ borderTop: "1px solid var(--vault-rule)" }}
      >
        <Stat label="Legs" value={String(slip.legCount)} tone="text" />
        <Stat
          label="Combined"
          value={typeof american === "number" ? formatAmerican(american) : "—"}
          tone="gold"
        />
        <Stat
          label="Per $100"
          value={profit !== null ? `+$${profit.toFixed(0)}` : "—"}
          tone={profit !== null ? "success" : "faint"}
        />
      </footer>

      {/* PR `feature/custom-parlay-grading-scale` — informational
          grade for each generated custom slip. Renders alongside the
          existing stats so the user sees A/B/C/D/F + score + top
          positives/warnings before considering this build. Custom
          slips remain not officially tracked. */}
      <CustomParlayGradeCard legs={slip.legs} />
    </article>
  );
}

function LegRow({ leg }: { leg: OptimizerLeg }) {
  const sportLower = (leg.sport ?? "").toLowerCase();
  const teamSport = sportLower === "mlb" || sportLower === "nba" ? sportLower : null;
  return (
    <div
      className="grid grid-cols-[auto_1fr_auto] gap-2 items-center px-2 py-1.5 rounded-[4px]"
      style={{
        background: "var(--gtp-card)",
        border: "1px solid var(--vault-rule)",
      }}
    >
      <PlayerAvatar
        playerId={leg.playerId ?? null}
        playerName={leg.playerName}
        team={leg.team ?? undefined}
        sport={(teamSport as "mlb" | "nba") ?? "nba"}
        size="xs"
        flat
      />
      <div className="min-w-0">
        <div
          className="font-display tracking-tight truncate"
          style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 600 }}
        >
          {leg.playerName}
        </div>
        <div
          className="font-mono flex items-center gap-1.5 min-w-0"
          style={{ color: "var(--vault-text-mute)", fontSize: 10 }}
        >
          {leg.team && teamSport ? (
            <TeamLogo team={leg.team} sport={teamSport as "mlb" | "nba"} size="sm" />
          ) : null}
          <span className="truncate">
            {leg.marketLabel || leg.market}{" "}
            {leg.side} {leg.line != null ? leg.line.toFixed(1) : "—"}
          </span>
        </div>
      </div>
      <span
        className="font-mono shrink-0 text-right"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {typeof leg.edgePct === "number" ? `${leg.edgePct.toFixed(1)}pp` : "—"}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "text" | "gold" | "success" | "faint";
}) {
  const color =
    tone === "gold"
      ? "var(--vault-gold-bright)"
      : tone === "success"
        ? "var(--vault-success)"
        : tone === "faint"
          ? "var(--vault-text-faint)"
          : "var(--vault-text)";
  return (
    <div className="flex flex-col items-start">
      <span
        className="font-mono uppercase tracking-[0.14em]"
        style={{ color: "var(--vault-text-faint)", fontSize: 9 }}
      >
        {label}
      </span>
      <span
        className="font-display tabular"
        style={{ color, fontSize: 13, fontWeight: 600 }}
      >
        {value}
      </span>
    </div>
  );
}
