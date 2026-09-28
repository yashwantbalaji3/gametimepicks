"use client";
/**
 * THE NFL /live HUB (v1.2 · NFL-first MVP). PUBLIC.
 *
 * ONE batch request feeds every card (`useLiveSlate("nfl")`), joined to the build-time roster by the
 * canonical ESPN `providerEventId` — never by a team-name string, which is the join this codebase
 * has already been burned by twice.
 *
 * ⚠ WHAT THE BATCH CAN AND CANNOT SAY. The gateway's scoreboard mode returns score, quarter, clock
 *   and state. It deliberately does NOT return player stats: `api/live.mjs` fetches a box score only
 *   for a single non-PRE game a reader has open, because a pregame box score is empty and asking for
 *   fourteen of them would spend ~8 MB upstream to learn nothing. So on this hub a per-player LIVE
 *   measurement is present only when the envelope actually carries one. `LiveStat` renders the LIVE
 *   slot from that evidence and omits it otherwise — it never substitutes a zero, and a zero here
 *   would be a measurement nobody took.
 *
 * ⚠ NO WIN SEMANTICS BEFORE CANONICAL SETTLEMENT. A provider FINAL says "FINAL — GRADING PENDING".
 *   HIT/MISS/PUSH/VOID come only from the settlement owner, which for NFL props is the
 *   prop-settlement ledger — so that section is empty until it has graded something, rather than
 *   being filled with a guess from the score.
 *
 * ⚠ TOUCHDOWN MARKETS GET NO RAIL. `anytime_td` is not in the live adapter's measurable set (no feed
 *   states the scorer by id), so it shows its frozen pregame probability and makes NO claim about
 *   whether a touchdown has happened. "NO TD YET" is a statement about the present and is withheld
 *   rather than assumed.
 */
import Link from "next/link";
import { useMemo } from "react";

import TeamLogo from "@/components/team-logo";
import FollowedMark from "@/components/today/followed-mark";
import { liveReadyFor } from "@/lib/live/client";
import { derivePresentationState } from "@/lib/live/lifecycle.mjs";
import type { NflHubRoster, NflHubRosterGame } from "@/lib/live/nfl-hub-data";
import { FEED, GAME_PHASE, cardFreshness, gamePhaseForLifecycle, trackForecast } from "@/lib/live/featured-forecasts.mjs";
import FeaturedForecastRow from "./featured-forecast-row";
import { liveRefreshPlan } from "@/lib/live/live-refresh-plan.mjs";
import { NOT_ASKED, useLivePropsStore, useNowMs, type LivePropsState } from "./use-live-props";
import { useLiveSlate } from "./use-live-slate";

const SANS = "var(--font-display)";

/**
 * The four sections §4 asks for.
 *
 * Defined here rather than widening the shared `HUB_GROUPS` (which is three, and which the MLB hub
 * renders today) so this release cannot change what /live already shows for baseball.
 */
const SECTIONS = [
  { key: "LIVE_NOW", label: "Live now" },
  { key: "UPCOMING", label: "Upcoming" },
  { key: "FINAL_PENDING", label: "Final — grading pending" },
  { key: "SETTLED", label: "Settled today" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

/** Presentation state → section. An unknown state goes to UPCOMING, never silently vanishes. */
function sectionFor(state: string): SectionKey {
  if (state === "LIVE" || state === "DELAYED") return "LIVE_NOW";
  if (state === "SETTLED") return "SETTLED";
  if (state === "FINAL_PENDING_SETTLEMENT") return "FINAL_PENDING";
  return "UPCOMING";
}

const CHIP: Record<string, { fg: string; border: string; bg: string }> = {
  LIVE: { fg: "var(--vault-bg)", border: "var(--vault-success)", bg: "var(--vault-success)" },
  DELAYED: { fg: "var(--vault-warn)", border: "var(--vault-warn)", bg: "transparent" },
  PRE: { fg: "var(--vault-text-mute)", border: "var(--vault-border)", bg: "transparent" },
  FINAL_PENDING_SETTLEMENT: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  SETTLED: { fg: "var(--vault-text-mute)", border: "var(--vault-border-strong)", bg: "transparent" },
  POSTPONED: { fg: "var(--vault-warn)", border: "var(--vault-warn)", bg: "transparent" },
  UNKNOWN: { fg: "var(--vault-text-mute)", border: "var(--vault-border)", bg: "transparent" },
};

function StateChip({ state, label }: { state: string; label: string }) {
  const c = CHIP[state] ?? CHIP.UNKNOWN;
  return (
    <span style={{
      fontFamily: SANS, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
      color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

const etTime = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  /* Weekday + time in a FIXED zone from the schedule fact — identical on the server and in any reader's
     browser, so it can never cause a hydration mismatch (no "tonight", which needs a reader clock). */
  const d = new Date(t);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  return `${day} · ${time} ET`;
};

/**
 * `Q1 · 7:27`. Built from the STRUCTURED period fields, never by decorating the label.
 *
 * 🔴 ESPN's NFL label ALREADY CONTAINS THE CLOCK — `"7:27 - 1st"`, with `clock: "7:27"` beside it.
 *    Appending the clock to it rendered "7:27 - 1st · 7:27" on every live card in Production.
 *    Observed on the real feed at 2026-09-27T17:19Z, minutes after the first kickoff.
 *
 *    So the quarter and the clock are composed from `number` and `clock`, which carry one fact
 *    each. The label is used only when there is no quarter to name — "Final", "Halftime", "End of
 *    1st" — where it is the whole statement rather than half of one.
 */
const periodLine = (envelope: any): string | null => {
  const p = envelope?.period ?? {};
  const label = typeof p.label === "string" && p.label ? p.label : null;
  const clock = typeof p.clock === "string" && p.clock ? p.clock : null;
  const n = typeof p.number === "number" && p.number > 0 ? p.number : null;
  /* A running quarter is the only case with two facts to join. */
  if (n !== null && clock !== null) return `Q${n} · ${clock}`;
  return label;
};

/** Where a live-props record's measurement comes from, in reader words (Analyst detail). */
const LIVE_SOURCE_LABEL: Record<string, string> = { "espn-nfl-summary": "ESPN public box score" };

/** The card's lifecycle state → the tracker's phase, through the owner's explicit table. */
const gamePhaseOf = (state: string) => gamePhaseForLifecycle(state);

function TeamRow({ abbr, name, score, sport = "nfl" as const }: { abbr: string; name: string; score: number | null; sport?: "nfl" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", minWidth: 0 }}>
      <TeamLogo team={abbr} sport={sport} size="md" />
      {/* The full club name wraps rather than truncating: "Washington Commanders" is the fact, "Washington Comm…" is not. */}
      <span style={{ fontFamily: SANS, fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "var(--vault-text)", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        {name}
      </span>
      <span style={{ fontFamily: SANS, fontSize: 26, fontWeight: 700, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: score === null ? "var(--vault-text-faint)" : "var(--vault-text)", flexShrink: 0, minWidth: 28, textAlign: "right" }}>
        {/* An absent score is an em dash. A 0 before kickoff would be a score nobody reported. */}
        {score === null ? "—" : score}
      </span>
    </div>
  );
}

/**
 * Exported so the internal state fixture renders the REAL card rather than a mock of it.
 *
 * A fixture that reimplements the component proves the fixture works. This is the same component the
 * public hub mounts; only its inputs are synthetic.
 */
/**
 * ⚠ THE CARD OWNS NO TIMER AND MAKES NO REQUEST. Its game's live-props record and the reader's clock
 * arrive as props from the page's single owner (`useLivePropsStore` + one `useNowMs` in NflLiveHub),
 * or from the fixture — so the fixture renders THIS component with inputs the page would pass.
 */
export function NflGameCard({ game, envelope, state, label, liveProps = NOT_ASKED, nowMs = null, modelStatus = null }: {
  game: NflHubRosterGame; envelope: any; state: string; label: string;
  liveProps?: LivePropsState;
  nowMs?: number | null;
  /** Analyst detail only: the Model Lab's status for ranges and touchdowns. */
  modelStatus?: NflHubRoster["modelStatus"] | null;
}) {
  const away = envelope?.competitors?.away?.score ?? null;
  const home = envelope?.competitors?.home?.score ?? null;
  const started = state !== "PRE";
  const when = started ? periodLine(envelope) : etTime(game.kickoffUtc);
  const phase = gamePhaseOf(state);

  const byId = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of liveProps.artifact?.rows ?? []) if (r?.predictionId) m.set(r.predictionId, r);
    return m;
  }, [liveProps.artifact]);

  const feed = liveProps.feed === "OK" ? FEED.OK : liveProps.feed === "UNAVAILABLE" ? FEED.UNAVAILABLE : FEED.NOT_ASKED;
  const shown = game.featured;
  const total = game.eligibleForecastCount;
  /* V2D: one honest line about how current the live measurements are — null on the server render. */
  const fresh = cardFreshness({ gamePhase: phase, feed, observedAt: liveProps.artifact?.observedAt ?? null, nowMs });

  const spoken =
    `${game.awayTeam} at ${game.homeTeam}. ${label}. ` +
    (away === null || home === null ? "No score reported." : `${game.awayAbbr} ${away}, ${game.homeAbbr} ${home}.`) +
    (when ? ` ${when}.` : "") +
    ` ${total} GameTimePicks forecasts, each frozen before kickoff.`;

  return (
    <li style={{ listStyle: "none" }}>
      <div style={{
        border: "1px solid var(--vault-border)", borderRadius: 12,
        background: "var(--vault-panel)", padding: "16px 18px 12px",
      }}>
        <span className="sr-only">{spoken}</span>
        {/* One lifecycle chip, one time string — never the provider's label AND a clock. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          <StateChip state={state} label={label} />
          <FollowedMark entities={[game.awayRef, game.homeRef].filter((r): r is NonNullable<typeof r> => r !== null)} />
          {when ? <span style={{ marginLeft: "auto", fontFamily: SANS, fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: started ? "var(--vault-text)" : "var(--vault-text-mute)" }}>{when}</span> : null}
        </div>

        <div aria-hidden="true">
          <TeamRow abbr={game.awayAbbr} name={game.awayTeam} score={away} />
          <TeamRow abbr={game.homeAbbr} name={game.homeTeam} score={home} />
        </div>

        {shown.length === 0 ? (
          <p style={{ fontFamily: SANS, fontSize: 12, color: "var(--vault-text-faint)", margin: "14px 0 0" }}>
            No GameTimePicks forecasts for this game
          </p>
        ) : (
          <>
            {/* FEATURED — never "top", "best" or "locks": nothing here is a calibrated cross-family rank. */}
            <p style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: 11, fontWeight: 700, color: "var(--vault-accent)", margin: "18px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vault-accent)", flexShrink: 0 }} />
              Featured GameTimePicks forecasts
            </p>
            {fresh ? (
              <p role="status" style={{
                fontFamily: SANS, fontSize: 11.5, fontWeight: 600, margin: "0 0 4px", letterSpacing: "0.02em",
                color: fresh.kind === "FRESH" ? "var(--vault-text-mute)" : "var(--vault-warn)",
              }}>{fresh.text}</p>
            ) : null}
            <ul style={{ margin: 0, padding: 0 }}>
              {shown.map((f) => (
                <FeaturedForecastRow
                  key={f.predictionId}
                  f={f}
                  modelStatus={(f.kind === "PROBABILITY" ? modelStatus?.touchdowns : modelStatus?.ranges) ?? null}
                  liveSource={liveProps.feed === "OK" ? LIVE_SOURCE_LABEL[liveProps.artifact?.source] ?? "ESPN public game feed" : null}
                  lastObservedAt={liveProps.feed === "OK" ? byId.get(f.predictionId)?.live?.observedAt ?? liveProps.artifact?.observedAt ?? null : null}
                  final={phase === GAME_PHASE.FINAL}
                  t={trackForecast(f, { gamePhase: phase, liveRow: byId.get(f.predictionId) ?? null, feed, observedAt: liveProps.artifact?.observedAt ?? null, nowMs })}
                />
              ))}
            </ul>
          </>
        )}

        <p style={{ margin: "10px 0 0" }}>
          {/* V2D · View all = the game report's own player board, grouped by family (Combined + one tab per
              published family) — the existing detail mechanism, so a collapsed card carries no hidden rows. */}
          {/* The anchor only when featured rows exist: those imply a PUBLISHED family, which is exactly when
              the game page renders its #player-board section — an in-page anchor must resolve. */}
          <Link href={`/nfl/game/${game.providerEventId}/${shown.length > 0 ? "#player-board" : ""}`} style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "var(--vault-accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
            {total > shown.length ? `View all ${total} forecasts →` : "Game forecasts →"}
          </Link>
        </p>
      </div>
    </li>
  );
}

export default function NflLiveHub({ roster }: { roster: NflHubRoster }) {
  const { byGamePk, unavailable, loading, lastObservedAt, retry } = useLiveSlate("nfl");
  const enabled = liveReadyFor("nfl");

  const grouped = useMemo(() => {
    const out: Record<SectionKey, Array<{ game: NflHubRosterGame; envelope: any; state: string; label: string }>> =
      { LIVE_NOW: [], UPCOMING: [], FINAL_PENDING: [], SETTLED: [] };
    for (const game of roster.games) {
      const envelope = byGamePk[game.providerEventId] ?? null;
      /*
       * ⚠ The hub knows whether it asked and was refused; the lifecycle function cannot. Without
       *   `feedState` a first load during an outage renders every started game as "Scheduled" — and
       *   a known-live game must never regress to PRE (§9).
       *
       * `settlement: null` on purpose: NFL prop settlement is owned by the prop-settlement ledger,
       * not by this surface, so a provider FINAL stops at FINAL — GRADING PENDING.
       */
      const life = derivePresentationState({
        envelope, settlement: null,
        feedState: unavailable ? "REFUSED" : "NOT_ASKED",
      });
      out[sectionFor(life.state)].push({ game, envelope, state: life.state, label: life.label });
    }
    return out;
  }, [roster.games, byGamePk, unavailable]);

  /* THE ONE REFRESH OWNER: which games need their live-props record, fetched on one shared clock. */
  const plan = useMemo(() => liveRefreshPlan(
    (Object.values(grouped).flat() as Array<{ game: NflHubRosterGame; state: string }>).map((r) => ({
      id: r.game.providerEventId, phase: gamePhaseOf(r.state), featured: r.game.featured.length,
    })),
  ), [grouped]);
  const liveProps = useLivePropsStore(plan);
  const nowMs = useNowMs();

  return (
    <div>
      {!enabled ? (
        <p style={{ fontFamily: SANS, fontSize: 12.5, color: "var(--vault-text-mute)", margin: "0 0 16px" }}>
          Live tracking for NFL is currently turned off. Scheduled games and frozen forecasts are unaffected.
        </p>
      ) : unavailable ? (
        /* §9 — a provider failure keeps the last known state and says so. It never blanks a card
           and never turns a game that was live back into a scheduled one. */
        <div role="status" style={{ border: "1px solid var(--vault-warn)", borderRadius: 6, padding: "10px 12px", margin: "0 0 16px" }}>
          <p style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, color: "var(--vault-warn)", margin: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Live data temporarily unavailable
          </p>
          <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "4px 0 0" }}>
            Showing last known state.{lastObservedAt ? ` Last observed: ${lastObservedAt}` : " No live state has been observed yet."}
          </p>
          <button type="button" onClick={retry} style={{
            fontFamily: SANS, fontSize: 12.5, fontWeight: 600, marginTop: 8, minHeight: 44, padding: "0 16px",
            background: "transparent", color: "var(--vault-text)",
            border: "1px solid var(--vault-border-strong)", borderRadius: 4, cursor: "pointer",
          }}>Retry</button>
        </div>
      ) : loading ? (
        <p style={{ fontFamily: SANS, fontSize: 12.5, color: "var(--vault-text-mute)", margin: "0 0 16px" }}>Checking the live feed…</p>
      ) : null}

      {!roster.boardsPresent ? (
        <p style={{ fontFamily: SANS, fontSize: 13, color: "var(--vault-text-mute)" }}>No NFL forecasts have been published yet.</p>
      ) : roster.games.length === 0 ? (
        <p style={{ fontFamily: SANS, fontSize: 13, color: "var(--vault-text-mute)" }}>No NFL games are scheduled for {roster.etDate}.</p>
      ) : (
        SECTIONS.map(({ key, label }) => {
          const rows = grouped[key];
          if (rows.length === 0) return null;
          return (
            <section key={key} aria-label={label} style={{ marginBottom: 24 }}>
              <h3 style={{ fontFamily: SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "0 0 12px" }}>
                {label} <span>· {rows.length}</span>
              </h3>
              {/* Stacked on a phone; two columns only when there is genuinely room. */}
              {/*
                * V2C: one column on a phone and a tablet, TWO on a desktop. A card needs ~440px for the
                * logos, full club names, score, portraits, three figures and a rail; three columns would
                * need more room than this page ever has, so a third column never appears.
                */}
              <ul style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 440px), 1fr))", margin: 0, padding: 0 }}>
                {rows.map((r) => (
                  <NflGameCard
                    key={r.game.providerEventId} game={r.game} envelope={r.envelope} state={r.state} label={r.label}
                    liveProps={liveProps[r.game.providerEventId] ?? NOT_ASKED} nowMs={nowMs} modelStatus={roster.modelStatus ?? null}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
