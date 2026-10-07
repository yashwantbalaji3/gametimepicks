"use client";
/**
 * THE /live HUB (v1.1.1 · Deliverable A) — "what is happening right now?"
 *
 * ONE batch request feeds every card (`useLiveSlate`). Cards are joined to the build-time roster by
 * `gamePk`; nothing here fetches per card, which is both the cost rule (§10) and the reason the CDN
 * and the gateway's upstream memo keep working.
 *
 * THE DISTINCTION THE HUB MUST NEVER BLUR. A card carries provider-owned facts (score, inning,
 * state, age) and, separately and explicitly labelled, the model-owned frozen pregame forecast. No
 * live probability, no "on pace", no "edge" — the components take a score and a band and say
 * nothing else. Colour never carries state alone: every card states its status in words.
 *
 * NO `aria-live`. A scoreboard that re-announces itself every 30 seconds is hostile to screen-reader
 * users and §11 forbids it. The state is in each card's accessible name instead, so it is read on
 * demand rather than shouted on a timer.
 */
import Link from "next/link";
import { useMemo } from "react";

import { liveReadyFor } from "@/lib/live/client";
import { ageSeconds } from "@/lib/live/freshness.mjs";
import { slateFeedStatus } from "@/lib/live/slate-scope.mjs";
import {
  HUB_GROUPS,
  HUB_GROUP_LABEL,
  derivePresentationState,
  hubGroupFor,
} from "@/lib/live/lifecycle.mjs";
import type { HubRoster, HubRosterGame } from "@/lib/live/hub-data";
import { useLiveSlate } from "./use-live-slate";
import FollowedMark from "@/components/today/followed-mark";

const MONO = "var(--font-mono)";

/** State → chip styling. The LABEL is the information; colour only reinforces it. */
const CHIP: Record<string, { fg: string; border: string; bg: string }> = {
  LIVE: { fg: "var(--vault-bg)", border: "var(--vault-success)", bg: "var(--vault-success)" },
  DELAYED: { fg: "var(--vault-warn)", border: "var(--vault-warn)", bg: "transparent" },
  PRE: { fg: "var(--vault-text-mute)", border: "var(--vault-border)", bg: "transparent" },
  FINAL_PENDING_SETTLEMENT: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  SETTLED: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  POSTPONED: { fg: "var(--vault-warn)", border: "var(--vault-warn)", bg: "transparent" },
  CANCELLED: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  UNKNOWN: { fg: "var(--vault-text-mute)", border: "var(--vault-border)", bg: "transparent" },
};

function StateChip({ state, label }: { state: string; label: string }) {
  const c = CHIP[state] ?? CHIP.UNKNOWN;
  return (
    <span
      style={{
        fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase",
        color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
        borderRadius: 3, padding: "2px 6px", whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

const etTime = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(t)) + " ET";
};

function GameCard({ game, envelope }: { game: HubRosterGame; envelope: any }) {
  const life = derivePresentationState({ envelope, settlement: game.settlement });
  const away = envelope?.competitors?.away?.score ?? null;
  const home = envelope?.competitors?.home?.score ?? null;
  const period = [envelope?.period?.label, typeof envelope?.situation?.outs === "number" ? `${envelope.situation.outs} out` : null]
    .filter(Boolean).join(" · ");
  const start = etTime(game.firstPitch);

  /*
   * The accessible name carries the whole card: status in words, the score if one exists, and an
   * explicit statement of which half is a live fact and which is a frozen forecast. A sighted
   * reader gets the same from the layout.
   */
  const scoreSpoken = away === null || home === null ? "no score reported" : `${game.awayAbbr} ${away}, ${game.homeAbbr} ${home}`;
  const label =
    `${game.awayName} at ${game.homeName}. ${life.label}. ${scoreSpoken}.` +
    (period ? ` ${period}.` : "") +
    (life.state === "PRE" && start ? ` First pitch ${start}.` : "") +
    (game.forecast ? " A GameTime pregame forecast is available and is frozen." : " No GameTime pregame forecast.");

  return (
    <li style={{ listStyle: "none" }}>
      <Link
        href={game.href}
        aria-label={label}
        style={{
          display: "block", textDecoration: "none", padding: "12px 14px", minHeight: 44,
          border: "1px solid var(--vault-border)", borderRadius: 8, background: "var(--vault-panel)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <StateChip state={life.state} label={life.label} />
          {/* v1.1.2: a LOCAL marker for a club the reader follows. It never refetches the slate and never
              reorders the hub — personalized ordering belongs to My GameTime, which does not exist yet. */}
          <FollowedMark entities={[game.awayRef, game.homeRef].filter((r): r is NonNullable<typeof r> => r !== null)} />
          {life.state === "PRE" && start ? (
            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{start}</span>
          ) : period ? (
            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{period}</span>
          ) : null}
        </div>

        <div aria-hidden="true">
          {([["away", game.awayAbbr, away], ["home", game.homeAbbr, home]] as const).map(([k, abbr, score]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "2px 0" }}>
              <span style={{ fontFamily: "var(--font-headline)", fontSize: 14, color: "var(--vault-text)" }}>{abbr}</span>
              <span style={{ fontFamily: MONO, fontSize: 16, fontVariantNumeric: "tabular-nums", color: "var(--vault-text)" }}>
                {/* An absent score is an em dash. A 0 here would be a score nobody reported. */}
                {score === null ? "—" : score}
              </span>
            </div>
          ))}
        </div>

        {game.forecast ? (
          <p aria-hidden="true" style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "8px 0 0" }}>
            Pregame GameTime · frozen · {game.awayAbbr} {game.forecast.runs.away.rangeLow}–{game.forecast.runs.away.rangeHigh}
            {" · "}{game.homeAbbr} {game.forecast.runs.home.rangeLow}–{game.forecast.runs.home.rangeHigh} runs
          </p>
        ) : (
          <p aria-hidden="true" style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "8px 0 0" }}>
            No GameTime pregame forecast
          </p>
        )}
      </Link>
    </li>
  );
}

const groupLabel = (g: string): string =>
  (HUB_GROUP_LABEL as Record<string, string>)[g] ?? g;

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)", margin: 0 }}>{children}</p>
  );
}

export default function LiveHub({ roster }: { roster: HubRoster }) {
  // Only today's roster is joined: another day's finals can neither stop the poll nor set freshness.
  const scope = useMemo(
    () => ({ rosterIds: roster.games.map((g) => g.gamePk), rosterDate: roster.etDate }),
    [roster.games, roster.etDate],
  );
  const { byGamePk, unavailable, loading, freshness, matched, settled, rosterIsToday, lastObservedAt } = useLiveSlate("mlb", scope);
  const enabled = liveReadyFor("mlb");

  const grouped = useMemo(() => {
    const out: Record<string, Array<{ game: HubRosterGame; envelope: any }>> = { LIVE_NOW: [], UPCOMING: [], FINAL_TODAY: [] };
    for (const game of roster.games) {
      const envelope = byGamePk[game.gamePk] ?? null;
      /* ⚠ The hub knows whether it asked and was refused; the lifecycle function cannot. Without
         this a first load during an outage renders every started game as "Scheduled" (§9). */
      const life = derivePresentationState({
        envelope, settlement: game.settlement,
        feedState: unavailable ? "REFUSED" : "NOT_ASKED",
      });
      out[hubGroupFor(life.state)].push({ game, envelope });
    }
    return out;
  }, [roster.games, byGamePk, unavailable]);

  const secs = ageSeconds(freshness.ageMs);
  const status = slateFeedStatus({
    enabled, rosterSize: roster.games.length, unavailable, loading,
    matched, settled, freshnessLevel: freshness.level, ageSecs: secs,
  });
  const checkedAt = etTime(lastObservedAt);

  /* One line for the WHOLE slate, because there was one request. Each status says only what is
     known: no "updated N sec ago" unless that age is being measured right now. */
  const line: string | null =
    status === "OFF" ? "Live tracking is currently turned off. Scheduled games and frozen forecasts are unaffected."
    : status === "NO_GAMES" ? null
    : status === "UNAVAILABLE" ? "Live data is unavailable right now. Scheduled games and frozen forecasts below are unaffected."
    : status === "CHECKING" ? "Checking the live feed…"
    : status === "NO_TODAY_DATA" ? "No live data for today's games yet. Checking again every minute."
    : status === "ALL_FINAL" ? `All of today's games are final${checkedAt ? ` · last checked ${checkedAt}` : ""} · source MLB StatsAPI`
    : status === "AGE_UNKNOWN" ? "Live feed age unknown"
    : status === "STALE" ? `Live feed delayed — showing the last confirmed state from ${secs} sec ago`
    : `Live feed updated ${secs} sec ago · source MLB StatsAPI`;

  return (
    <div>
      {/* A roster built before midnight ET keeps its own date (the feed is asked for that date too),
          and says so — another day's games are never presented as today's. */}
      {rosterIsToday === false ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-warn)", margin: "0 0 8px" }}>
          {`Showing MLB games for ${roster.etDate} (ET). Today's slate has not been published here yet.`}
        </p>
      ) : null}
      {line ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: status === "STALE" ? "var(--vault-warn)" : "var(--vault-text-faint)", margin: "0 0 16px" }}>
          {line}
        </p>
      ) : null}

      {!roster.slateArtifactPresent ? (
        <Empty>No MLB slate has been published for {roster.etDate} yet.</Empty>
      ) : roster.games.length === 0 ? (
        <Empty>No MLB games are scheduled for {roster.etDate}.</Empty>
      ) : (
        HUB_GROUPS.map((group) => {
          const rows = grouped[group];
          if (rows.length === 0) return null;
          return (
            <section key={group} aria-label={groupLabel(group)} style={{ marginBottom: 24 }}>
              <h2 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: "0 0 10px", fontWeight: 400 }}>
                {groupLabel(group)} <span style={{ color: "var(--vault-text-faint)" }}>· {rows.length}</span>
              </h2>
              <ul style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", margin: 0, padding: 0 }}>
                {rows.map(({ game, envelope }) => (
                  <GameCard key={game.gamePk} game={game} envelope={envelope} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
