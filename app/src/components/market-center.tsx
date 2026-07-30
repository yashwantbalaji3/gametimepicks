"use client";

/**
 * MARKET CENTER — the consumer sportsbook-intelligence surface.
 *
 * Renders only what the canonical selectors already decided. This component performs NO sportsbook
 * math: every probability, difference and mode arrives pre-derived from lib/markets. Its job is
 * presentation, filtering and honest empty states.
 *
 * Deliberately absent, because no retained snapshot history exists: opening line, line movement,
 * market movers, steam, 24-hour change, trend charts. There is also nothing that ranks a row as
 * preferable — sorting by the size of a difference is offered as a way to find disagreement, not as
 * a recommendation, and the copy says so.
 */
import { useEffect, useMemo, useState } from "react";

import PlayerAvatar from "@/components/player-avatar";
import TeamLogo from "@/components/team-logo";
import { marketDisagreementOpenedEvent } from "@/lib/analytics/page-events";
import { readSinkConfig, resolveSink, track } from "@/lib/analytics/sink";
import { currentEtDate } from "@/lib/freshness";
import type { GameIntelligence } from "@/lib/markets/game-intelligence";
import type { PropRowView } from "@/lib/markets/view-model";
import type { IntelligenceMode } from "@/lib/markets/pairing";

type Props = {
  games: GameIntelligence[];
  props: PropRowView[];
  capturedAt: string | null;
  bookmaker: string | null;
  snapshotLabel: string | null;
  freshnessLabel: string;
  isCurrent: boolean;
};

const MODE_LABEL: Record<IntelligenceMode, string> = {
  FULL_COMPARISON: "Model + market",
  MODEL_ONLY: "Model only",
  SPORTSBOOK_ONLY: "Market only",
  UNAVAILABLE: "Not available",
};

const MODE_TONE: Record<IntelligenceMode, string> = {
  FULL_COMPARISON: "var(--vault-success)",
  MODEL_ONLY: "var(--vault-gold)",
  SPORTSBOOK_ONLY: "var(--vault-text-mute)",
  UNAVAILABLE: "var(--vault-text-faint)",
};

const pct = (p: number | null | undefined, digits = 1) =>
  typeof p === "number" && Number.isFinite(p) ? `${(p * 100).toFixed(digits)}%` : "—";

const odds = (o: number | null | undefined) =>
  typeof o === "number" && Number.isFinite(o) && o !== 0 ? (o > 0 ? `+${o}` : `${o}`) : "—";

/** Signed percentage-point gap. Neutral by construction — the sign carries no verdict. */
function Gap({ points }: { points: number }) {
  const magnitude = Math.abs(points);
  const tone = magnitude < 1 ? "var(--vault-text-mute)" : "var(--vault-text)";
  return (
    <span className="font-mono" style={{ color: tone, fontSize: 12 }}>
      {points > 0 ? "+" : ""}
      {points.toFixed(1)} pts
    </span>
  );
}

function ModeChip({ mode }: { mode: IntelligenceMode }) {
  return (
    <span
      className="font-mono uppercase tracking-[0.14em]"
      style={{
        color: MODE_TONE[mode],
        border: `1px solid ${MODE_TONE[mode]}33`,
        borderRadius: 4,
        padding: "2px 6px",
        fontSize: 9,
        whiteSpace: "nowrap",
      }}
    >
      {MODE_LABEL[mode]}
    </span>
  );
}

const CARD: React.CSSProperties = {
  background: "rgba(26, 16, 11, 0.45)",
  border: "1px solid var(--vault-border)",
  borderRadius: 10,
};

const startLabel = (iso: string | null) => {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
};

export default function MarketCenter({
  games,
  props,
  bookmaker,
  snapshotLabel,
  freshnessLabel,
  isCurrent,
}: Props) {
  const [tab, setTab] = useState<"games" | "players">("games");
  const [mode, setMode] = useState<IntelligenceMode | "ALL">("ALL");
  const [gameFilter, setGameFilter] = useState<string>("ALL");
  const [family, setFamily] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"start" | "gap" | "agreement" | "player">("start");
  const [page, setPage] = useState(0);

  // Analytics (v2): resolved ONCE from build-time config — the NO-OP sink unless a provider endpoint
  // is configured AND the kill-switch is on, so by default nothing leaves the browser.
  const analyticsSink = useMemo(() => resolveSink(readSinkConfig()), []);

  // Any change to what is being filtered must return to the first page. Without this a narrowed
  // result set can leave the reader stranded on a page index that no longer exists, which reads as
  // "no rows" when rows very much exist.
  useEffect(() => {
    setPage(0);
  }, [mode, gameFilter, family, query, sort, tab]);

  const gameOptions = useMemo(
    () =>
      games.map((g) => ({
        id: g.gameId,
        label: `${g.awayTeam} @ ${g.homeTeam}`,
      })),
    [games],
  );

  const familyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of props) {
      if (p.marketLabel) seen.set(p.marketLabel, p.marketLabel);
    }
    return [...seen.keys()].sort();
  }, [props]);

  const visibleProps = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = props.filter((p) => {
      if (mode !== "ALL" && p.mode !== mode) return false;
      if (gameFilter !== "ALL" && p.gameId !== gameFilter) return false;
      if (family !== "ALL" && p.marketLabel !== family) return false;
      if (q) {
        const hay = `${p.playerName} ${p.team ?? ""} ${p.marketLabel ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case "player":
          return a.playerName.localeCompare(b.playerName);
        case "gap":
          // Largest disagreement first. A way to FIND disagreement, not a ranking of merit.
          return Math.abs(b.differencePoints ?? -1) - Math.abs(a.differencePoints ?? -1);
        case "agreement":
          return (
            Math.abs(a.differencePoints ?? Number.MAX_SAFE_INTEGER) -
            Math.abs(b.differencePoints ?? Number.MAX_SAFE_INTEGER)
          );
        default:
          return String(a.startTime ?? "").localeCompare(String(b.startTime ?? ""));
      }
    });
    return rows;
  }, [props, mode, gameFilter, family, query, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { FULL_COMPARISON: 0, MODEL_ONLY: 0, SPORTSBOOK_ONLY: 0, UNAVAILABLE: 0 };
    for (const p of props) c[p.mode] += 1;
    return c;
  }, [props]);

  return (
    <div>
      {/* ── Snapshot provenance ───────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1" style={{ marginBottom: 18 }}>
        <span
          className="font-mono uppercase tracking-[0.14em]"
          style={{
            fontSize: 10,
            color: isCurrent ? "var(--vault-success)" : "var(--vault-warn)",
          }}
        >
          {freshnessLabel}
        </span>
        {snapshotLabel ? (
          <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>{snapshotLabel}</span>
        ) : null}
        {bookmaker ? (
          <span style={{ fontSize: 12, color: "var(--vault-text-faint)" }}>· {bookmaker}</span>
        ) : null}
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────────────────────────── */}
      <div className="flex gap-2" style={{ marginBottom: 16 }}>
        {(["games", "players"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="font-mono uppercase tracking-[0.14em]"
            style={{
              fontSize: 11,
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${tab === t ? "var(--vault-border-active)" : "var(--vault-border)"}`,
              background: tab === t ? "var(--vault-panel-elevated)" : "transparent",
              color: tab === t ? "var(--vault-text)" : "var(--vault-text-mute)",
              cursor: "pointer",
            }}
          >
            {t === "games" ? `Game markets (${games.length})` : `Player props (${props.length})`}
          </button>
        ))}
      </div>

      {tab === "games" ? (
        <GameSection games={games} />
      ) : (
        <>
          <PlayerFilters
            mode={mode}
            setMode={setMode}
            counts={counts}
            gameFilter={gameFilter}
            setGameFilter={setGameFilter}
            gameOptions={gameOptions}
            family={family}
            setFamily={setFamily}
            familyOptions={familyOptions}
            query={query}
            setQuery={setQuery}
            sort={sort}
            setSort={(v) => {
              // Choosing the "largest difference" sort IS the open-the-disagreement-view interaction
              // (v2 `market_disagreement_opened`) — a measure of interest in the comparison itself,
              // never a claim about it. Validated + routed through the resolved (default NO-OP) sink.
              if (v === "gap" && sort !== "gap") track(marketDisagreementOpenedEvent(currentEtDate()), analyticsSink);
              setSort(v);
            }}
          />
          <PlayerSection rows={visibleProps} total={props.length} page={page} setPage={setPage} />
        </>
      )}
    </div>
  );
}

// ── Game markets ────────────────────────────────────────────────────────────────────────────────

function GameSection({ games }: { games: GameIntelligence[] }) {
  if (games.length === 0) {
    return <Empty title="No game markets in this snapshot" body="The sportsbook artifact for this slate has no game markets." />;
  }
  return (
    <div className="grid gap-3">
      {games.map((g) => (
        <div key={g.gameId} style={{ ...CARD, padding: 16 }}>
          <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 12 }}>
            <div className="flex items-center gap-2 min-w-0">
              {/* The logo CDN is keyed by ABBREVIATION — passing a display name 404s and silently
                  degrades to an initials badge, which looks fine and is therefore easy to ship broken. */}
              <TeamLogo team={g.awayTeamAbbr ?? g.awayTeam} sport="mlb" size="sm" />
              <span style={{ fontSize: 14, color: "var(--vault-text)" }}>{g.awayTeam}</span>
              <span style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>@</span>
              <TeamLogo team={g.homeTeamAbbr ?? g.homeTeam} sport="mlb" size="sm" />
              <span style={{ fontSize: 14, color: "var(--vault-text)" }}>{g.homeTeam}</span>
            </div>
            <div className="flex items-center gap-2">
              {g.eventPhase === "STARTED" ? (
                <span className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: 9, color: "var(--vault-warn)" }}>
                  Started
                </span>
              ) : (
                <span className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>
                  {startLabel(g.startTime)} ET
                </span>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <MarketBox label="Moneyline" mode={g.moneyline.intelligence.mode}>
              {g.moneyline.model && g.moneyline.sportsbook ? (
                <>
                  <Row
                    left={g.homeTeam}
                    model={pct(g.moneyline.model.homeWinProb)}
                    market={pct(g.moneyline.sportsbook.homeNoVigProb)}
                    price={odds(g.moneyline.sportsbook.homeOdds)}
                    gap={g.moneyline.comparison?.home.differencePoints}
                  />
                  <Row
                    left={g.awayTeam}
                    model={pct(g.moneyline.model.awayWinProb)}
                    market={pct(g.moneyline.sportsbook.awayNoVigProb)}
                    price={odds(g.moneyline.sportsbook.awayOdds)}
                    gap={g.moneyline.comparison?.away.differencePoints}
                  />
                </>
              ) : g.moneyline.sportsbook ? (
                <Row left={g.homeTeam} market={pct(g.moneyline.sportsbook.homeNoVigProb)} price={odds(g.moneyline.sportsbook.homeOdds)} />
              ) : (
                <Muted>No comparable market</Muted>
              )}
            </MarketBox>

            <MarketBox label="Run line" mode={g.runLine.intelligence.mode}>
              {g.runLine.model && g.runLine.sportsbook ? (
                <Row
                  left={`${g.homeTeam} ${g.runLine.homeLine != null && g.runLine.homeLine > 0 ? "+" : ""}${g.runLine.homeLine}`}
                  model={pct(g.runLine.model.homeCoverProb)}
                  market={pct(g.runLine.sportsbook.homeCoverNoVigProb)}
                  price={odds(g.runLine.sportsbook.homeOdds)}
                  gap={g.runLine.comparison?.home.differencePoints}
                />
              ) : g.runLine.sportsbook ? (
                <Row
                  left={`${g.homeTeam} ${g.runLine.homeLine ?? ""}`}
                  market={pct(g.runLine.sportsbook.homeCoverNoVigProb)}
                  price={odds(g.runLine.sportsbook.homeOdds)}
                />
              ) : (
                <Muted>No comparable market</Muted>
              )}
              {g.runLine.intelligence.blockedBy.includes("THRESHOLD_UNSUPPORTED") ? (
                <Muted>Simulation did not publish this line</Muted>
              ) : null}
            </MarketBox>

            <MarketBox label="Total" mode={g.total.intelligence.mode}>
              {g.total.model && g.total.sportsbook ? (
                <>
                  <Row
                    left={`Over ${g.total.line}`}
                    model={pct(g.total.model.overProbExcludingPush)}
                    market={pct(g.total.sportsbook.overNoVigProb)}
                    price={odds(g.total.sportsbook.overOdds)}
                    gap={g.total.comparison?.over.differencePoints}
                  />
                  <div style={{ fontSize: 11, color: "var(--vault-text-faint)", marginTop: 4 }}>
                    Simulated median {g.total.model.medianTotal} · p10–p90 {g.total.model.p10}–{g.total.model.p90}
                    {g.total.model.pushProb > 0 ? ` · push ${pct(g.total.model.pushProb)}` : ""}
                  </div>
                </>
              ) : g.total.sportsbook ? (
                <Row left={`Over ${g.total.line}`} market={pct(g.total.sportsbook.overNoVigProb)} price={odds(g.total.sportsbook.overOdds)} />
              ) : (
                <Muted>No comparable market</Muted>
              )}
            </MarketBox>
          </div>

          {g.moneyline.model?.uncertainty.isDegraded ? (
            <div style={{ fontSize: 11, color: "var(--vault-warn)", marginTop: 10 }}>
              Simulation ran with incomplete inputs — treat the model side with extra caution.
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MarketBox({ label, mode, children }: { label: string; mode: IntelligenceMode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--vault-rule)", borderRadius: 8, padding: 10 }}>
      <div className="flex items-center justify-between gap-2" style={{ marginBottom: 8 }}>
        <span className="font-mono uppercase tracking-[0.16em]" style={{ fontSize: 10, color: "var(--vault-gold)" }}>
          {label}
        </span>
        <ModeChip mode={mode} />
      </div>
      {children}
    </div>
  );
}

function Row({
  left,
  model,
  market,
  price,
  gap,
}: {
  left: string;
  model?: string;
  market?: string;
  price?: string;
  gap?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2" style={{ padding: "3px 0" }}>
      <span style={{ fontSize: 12, color: "var(--vault-text-mute)", minWidth: 0 }}>{left}</span>
      <span className="flex items-baseline gap-2 font-mono" style={{ fontSize: 12 }}>
        {model ? <span style={{ color: "var(--vault-text)" }}>{model}</span> : null}
        {market ? <span style={{ color: "var(--vault-text-mute)" }}>{market}</span> : null}
        {price ? <span style={{ color: "var(--vault-text-faint)" }}>{price}</span> : null}
        {typeof gap === "number" ? <Gap points={gap} /> : null}
      </span>
    </div>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>{children}</div>
);

// ── Player props ────────────────────────────────────────────────────────────────────────────────

function PlayerFilters(p: {
  mode: IntelligenceMode | "ALL";
  setMode: (m: IntelligenceMode | "ALL") => void;
  counts: Record<string, number>;
  gameFilter: string;
  setGameFilter: (v: string) => void;
  gameOptions: { id: string; label: string }[];
  family: string;
  setFamily: (v: string) => void;
  familyOptions: string[];
  query: string;
  setQuery: (v: string) => void;
  sort: "start" | "gap" | "agreement" | "player";
  setSort: (v: "start" | "gap" | "agreement" | "player") => void;
}) {
  const selectStyle: React.CSSProperties = {
    background: "var(--vault-panel)",
    border: "1px solid var(--vault-border)",
    borderRadius: 6,
    color: "var(--vault-text)",
    fontSize: 12,
    padding: "6px 8px",
  };
  const tabs: Array<{ key: IntelligenceMode | "ALL"; label: string }> = [
    { key: "ALL", label: "All" },
    { key: "FULL_COMPARISON", label: `Model + market (${p.counts.FULL_COMPARISON})` },
    { key: "MODEL_ONLY", label: `Model only (${p.counts.MODEL_ONLY})` },
    { key: "SPORTSBOOK_ONLY", label: `Market only (${p.counts.SPORTSBOOK_ONLY})` },
  ];
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="flex flex-wrap gap-2" style={{ marginBottom: 10 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => p.setMode(t.key)}
            className="font-mono uppercase tracking-[0.12em]"
            style={{
              fontSize: 10,
              padding: "6px 10px",
              borderRadius: 6,
              cursor: "pointer",
              border: `1px solid ${p.mode === t.key ? "var(--vault-border-active)" : "var(--vault-border)"}`,
              background: p.mode === t.key ? "var(--vault-panel-elevated)" : "transparent",
              color: p.mode === t.key ? "var(--vault-text)" : "var(--vault-text-mute)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          value={p.query}
          onChange={(e) => p.setQuery(e.target.value)}
          placeholder="Search player or team"
          style={{ ...selectStyle, minWidth: 180, flex: "1 1 180px" }}
          aria-label="Search player or team"
        />
        <select value={p.gameFilter} onChange={(e) => p.setGameFilter(e.target.value)} style={selectStyle} aria-label="Filter by game">
          <option value="ALL">All games</option>
          {p.gameOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <select value={p.family} onChange={(e) => p.setFamily(e.target.value)} style={selectStyle} aria-label="Filter by market">
          <option value="ALL">All markets</option>
          {p.familyOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select
          value={p.sort}
          onChange={(e) => p.setSort(e.target.value as "start" | "gap" | "agreement" | "player")}
          style={selectStyle}
          aria-label="Sort rows"
        >
          <option value="start">Sort: start time</option>
          <option value="player">Sort: player</option>
          <option value="gap">Sort: largest difference</option>
          <option value="agreement">Sort: closest agreement</option>
        </select>
      </div>
    </div>
  );
}

/** Rows per page. Every matching row is reachable — this bounds what is DRAWN, not what exists. */
export const PAGE_SIZE = 50;

/**
 * Page a filtered set. Pure and exported so the guards can assert the properties that matter —
 * no row dropped, none duplicated, and the reported total always the FULL matching count rather
 * than the size of the current page.
 */
export function paginate<T>(rows: ReadonlyArray<T>, page: number, size = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  // Clamp rather than trust the caller: a stale page index after a filter change must land on a
  // real page instead of rendering an empty list that reads as "no results".
  const current = Math.min(Math.max(0, page), pageCount - 1);
  const start = current * size;
  return { items: rows.slice(start, start + size), pageCount, current, start, total: rows.length };
}

function PlayerSection({
  rows,
  total,
  page,
  setPage,
}: {
  rows: PropRowView[];
  total: number;
  page: number;
  setPage: (n: number) => void;
}) {
  if (total === 0) {
    return <Empty title="No player props in this snapshot" body="The sportsbook artifact for this slate has no player markets." />;
  }
  if (rows.length === 0) {
    return <Empty title="No rows match these filters" body="Try clearing the search or choosing a different market." />;
  }
  const { items, pageCount, current, start } = paginate(rows, page);
  return (
    <>
      <div className="grid gap-2">
        {items.map((p, i) => (
          <PropRow key={`${p.playerName}-${p.marketLabel}-${p.line}-${start + i}`} p={p} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginTop: 14 }}>
        <span style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>
          {start + 1}&ndash;{start + items.length} of {rows.length} matching {rows.length === 1 ? "row" : "rows"}
        </span>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <PageButton disabled={current === 0} onClick={() => setPage(current - 1)} label="Previous" />
            <span className="font-mono" style={{ fontSize: 11, color: "var(--vault-text-mute)" }}>
              Page {current + 1} of {pageCount}
            </span>
            <PageButton disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)} label="Next" />
          </div>
        ) : null}
      </div>
    </>
  );
}

function PageButton({ disabled, onClick, label }: { disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="font-mono uppercase tracking-[0.12em]"
      style={{
        fontSize: 10,
        padding: "7px 12px",
        minHeight: 38,
        borderRadius: 6,
        border: "1px solid var(--vault-border)",
        background: "transparent",
        color: disabled ? "var(--vault-text-faint)" : "var(--vault-text)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function PropRow({ p }: { p: PropRowView }) {
  return (
    <div style={{ ...CARD, padding: 12 }}>
      <div className="flex flex-wrap items-center gap-3">
        <PlayerAvatar sport="mlb" playerId={p.playerId} playerName={p.playerName} team={p.team ?? undefined} size="sm" />
        <div style={{ minWidth: 0, flex: "1 1 160px" }}>
          <div style={{ fontSize: 13, color: "var(--vault-text)" }}>{p.playerName}</div>
          <div style={{ fontSize: 11, color: "var(--vault-text-faint)" }}>
            {p.team ? `${p.team} vs ${p.opponent ?? "—"}` : `${p.awayTeam} @ ${p.homeTeam}`}
            {p.marketLabel ? ` · ${p.marketLabel}` : ""}
            {p.line != null ? ` ${p.line}` : ""}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono" style={{ fontSize: 12 }}>
          {p.modelProbOver != null ? (
            <span title="GameTimePicks simulation">
              <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>MODEL </span>
              <span style={{ color: "var(--vault-text)" }}>{pct(p.modelProbOver)}</span>
            </span>
          ) : null}
          {p.marketProbOver != null ? (
            <span title="No-vig probability derived from the sportsbook price">
              <span style={{ color: "var(--vault-text-faint)", fontSize: 10 }}>MARKET </span>
              <span style={{ color: "var(--vault-text-mute)" }}>{pct(p.marketProbOver)}</span>
            </span>
          ) : null}
          {p.overOdds != null ? <span style={{ color: "var(--vault-text-faint)" }}>{odds(p.overOdds)}</span> : null}
          {p.differencePoints != null ? <Gap points={p.differencePoints} /> : null}
        </div>

        <ModeChip mode={p.mode} />
      </div>

      {p.recentCount != null ? (
        <div style={{ fontSize: 11, color: "var(--vault-text-faint)", marginTop: 6 }}>
          Last {p.recentCount}: avg {p.recentAverage}
          {p.recentOverLine != null && p.line != null ? ` · over ${p.line} in ${p.recentOverLine}` : ""}
          {p.samples != null ? ` · projection sample ${p.samples}` : ""}
          {!p.recentLeakageSafe ? " · recent-form window incomplete" : ""}
        </div>
      ) : null}

      {p.mode === "SPORTSBOOK_ONLY" && p.noModelFamily ? (
        <div style={{ fontSize: 11, color: "var(--vault-text-faint)", marginTop: 6 }}>
          GameTimePicks does not model this market — shown as market context only.
        </div>
      ) : null}
      {p.teamUnresolved ? (
        <div style={{ fontSize: 11, color: "var(--vault-text-faint)", marginTop: 6 }}>
          No posted evidence yet for this player&rsquo;s side, so no comparison is shown.
        </div>
      ) : null}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ ...CARD, padding: 24, textAlign: "center" }}>
      <div style={{ fontSize: 14, color: "var(--vault-text)", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--vault-text-mute)" }}>{body}</div>
    </div>
  );
}
