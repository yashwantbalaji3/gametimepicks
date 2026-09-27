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
import type { NflHubRoster, NflHubRosterGame, TrackedPrediction } from "@/lib/live/nfl-hub-data";
import { useLiveSlate } from "./use-live-slate";

const MONO = "var(--font-mono)";

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
      fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.1em", textTransform: "uppercase",
      color: c.fg, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 3, padding: "2px 6px", whiteSpace: "nowrap",
    }}>{label}</span>
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

/** `Q2 · 08:41`. Built only from what the envelope states; a missing clock just shortens the line. */
const periodLine = (envelope: any): string | null => {
  const label = envelope?.period?.label;
  const clock = envelope?.period?.clock;
  if (typeof label !== "string" || !label) return null;
  return typeof clock === "string" && clock ? `${label} · ${clock}` : label;
};

const num = (n: number | null | undefined, dp = 0) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(dp) : null;

/**
 * The factual measurement for one prediction, or null.
 *
 * Read out of the envelope's OWN player-stat rows, matched on `playerId` and the family key the live
 * adapter already normalises to. Null when the batch carried no box score — which is the normal case
 * on this hub — and null is rendered as an omitted row, never as a zero.
 */
function liveValueFor(envelope: any, p: TrackedPrediction): number | null {
  const rows = envelope?.playerStats;
  if (!Array.isArray(rows)) return null;
  for (const r of rows) {
    if (r?.playerId !== p.playerId) continue;
    const v = r?.markets?.[p.market];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/** Where the live value sits against the frozen line. Words only — never a win or a loss. */
function railState(live: number | null, line: number | null): string | null {
  if (live === null || line === null) return null;
  if (live > line) return "Currently above line";
  if (live < line) return "Currently below line";
  return "At line";
}

function PredictionRow({ p, envelope, started }: { p: TrackedPrediction; envelope: any; started: boolean }) {
  const live = liveValueFor(envelope, p);
  const rail = railState(live, p.line);
  const isProbability = p.gtp === null && p.pregameProbability !== null;

  return (
    <li style={{ listStyle: "none", padding: "8px 0", borderTop: "1px solid var(--vault-border)" }}>
      <p style={{ fontSize: 12.5, color: "var(--vault-text)", margin: "0 0 1px", fontWeight: 500 }}>{p.player}</p>
      <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {p.marketLabel}
      </p>

      {isProbability ? (
        /* A probability family. No rail, and no claim about whether it has happened yet. */
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <Stat label="GTP pregame" value={`${(p.pregameProbability! * 100).toFixed(1)}%`} />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Stat label="GTP" value={num(p.gtp, 1)} />
            <Stat label="Line" value={num(p.line, 1)} />
            {/* The LIVE slot appears only when a measurement exists. */}
            {live !== null ? <Stat label="Live" value={num(live, 0)} tone="live" /> : null}
          </div>
          {rail ? (
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-mute)", margin: "6px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {rail}
            </p>
          ) : !started ? (
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "6px 0 0", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Starts at kickoff
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | null; tone?: "live" }) {
  if (value === null) return null;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 52 }}>
      <span style={{ fontFamily: MONO, fontSize: 8.5, color: "var(--vault-text-faint)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
      <span style={{
        fontFamily: MONO, fontSize: 14, fontVariantNumeric: "tabular-nums",
        color: tone === "live" ? "var(--vault-success)" : "var(--vault-text)",
      }}>{value}</span>
    </span>
  );
}

function TeamRow({ abbr, name, score, sport = "nfl" as const }: { abbr: string; name: string; score: number | null; sport?: "nfl" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
      <TeamLogo team={abbr} sport={sport} size="sm" />
      <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)", width: 34, flexShrink: 0 }}>{abbr}</span>
      <span style={{ fontSize: 13.5, color: "var(--vault-text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {name}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 17, fontVariantNumeric: "tabular-nums", color: "var(--vault-text)", flexShrink: 0 }}>
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
export function NflGameCard({ game, envelope, state, label }: { game: NflHubRosterGame; envelope: any; state: string; label: string }) {
  const away = envelope?.competitors?.away?.score ?? null;
  const home = envelope?.competitors?.home?.score ?? null;
  const started = state !== "PRE";
  const when = started ? periodLine(envelope) : etTime(game.kickoffUtc);
  const shown = game.trackedPredictions;
  const more = game.trackedPredictionCount - shown.length;

  const spoken =
    `${game.awayTeam} at ${game.homeTeam}. ${label}. ` +
    (away === null || home === null ? "No score reported." : `${game.awayAbbr} ${away}, ${game.homeAbbr} ${home}.`) +
    (when ? ` ${when}.` : "") +
    ` ${game.trackedPredictionCount} GameTimePicks forecasts, each frozen before kickoff.`;

  return (
    <li style={{ listStyle: "none" }}>
      <div aria-label={spoken} style={{
        border: "1px solid var(--vault-border)", borderRadius: 8,
        background: "var(--vault-panel)", padding: "12px 14px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          <StateChip state={state} label={label} />
          <FollowedMark entities={[game.awayRef, game.homeRef].filter((r): r is NonNullable<typeof r> => r !== null)} />
          {when ? <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{when}</span> : null}
        </div>

        <div aria-hidden="true">
          <TeamRow abbr={game.awayAbbr} name={game.awayTeam} score={away} />
          <TeamRow abbr={game.homeAbbr} name={game.homeTeam} score={home} />
        </div>

        {game.trackedPredictionCount === 0 ? (
          <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "10px 0 0" }}>
            No GameTimePicks forecasts for this game
          </p>
        ) : (
          <>
            <p aria-hidden="true" style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "10px 0 2px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {game.trackedPredictionCount} GameTimePicks forecast{game.trackedPredictionCount === 1 ? "" : "s"}
            </p>
            <ul aria-hidden="true" style={{ margin: 0, padding: 0 }}>
              {shown.map((p) => (
                <li key={`${p.playerId}:${p.market}`} style={{ listStyle: "none" }}>
                  <PredictionRow p={p} envelope={envelope} started={started} />
                </li>
              ))}
            </ul>
          </>
        )}

        <p style={{ margin: "10px 0 0" }}>
          <Link href="/nfl/" style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-accent)", textDecoration: "none", display: "inline-block", minHeight: 24, lineHeight: "24px" }}>
            {more > 0 ? `All ${game.trackedPredictionCount} forecasts and live tracking →` : "Forecasts and live tracking →"}
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

  return (
    <div>
      {!enabled ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 16px" }}>
          Live tracking for NFL is currently turned off. Scheduled games and frozen forecasts are unaffected.
        </p>
      ) : unavailable ? (
        /* §9 — a provider failure keeps the last known state and says so. It never blanks a card
           and never turns a game that was live back into a scheduled one. */
        <div role="status" style={{ border: "1px solid var(--vault-warn)", borderRadius: 6, padding: "10px 12px", margin: "0 0 16px" }}>
          <p style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--vault-warn)", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Live data temporarily unavailable
          </p>
          <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "4px 0 0" }}>
            Showing last known state.{lastObservedAt ? ` Last observed: ${lastObservedAt}` : " No live state has been observed yet."}
          </p>
          <button type="button" onClick={retry} style={{
            fontFamily: MONO, fontSize: 10, marginTop: 8, minHeight: 32, padding: "0 12px",
            background: "transparent", color: "var(--vault-text)",
            border: "1px solid var(--vault-border-strong)", borderRadius: 4, cursor: "pointer",
          }}>Retry</button>
        </div>
      ) : loading ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)", margin: "0 0 16px" }}>Checking the live feed…</p>
      ) : null}

      {!roster.boardsPresent ? (
        <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>No NFL forecasts have been published yet.</p>
      ) : roster.games.length === 0 ? (
        <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>No NFL games are scheduled for {roster.etDate}.</p>
      ) : (
        SECTIONS.map(({ key, label }) => {
          const rows = grouped[key];
          if (rows.length === 0) return null;
          return (
            <section key={key} aria-label={label} style={{ marginBottom: 24 }}>
              <h3 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: "0 0 10px", fontWeight: 400 }}>
                {label} <span>· {rows.length}</span>
              </h3>
              {/* Stacked on a phone; two columns only when there is genuinely room. */}
              <ul style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", margin: 0, padding: 0 }}>
                {rows.map((r) => (
                  <NflGameCard key={r.game.providerEventId} game={r.game} envelope={r.envelope} state={r.state} label={r.label} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
