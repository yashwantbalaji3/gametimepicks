"use client";
/**
 * THE UFC /live HUB (UFC-001). Built, and mounted ONLY when `liveSportEnabled("ufc")` — which is
 * false by default and false under Production's current `mlb,nfl`. See `live-sport-tabs.tsx`.
 *
 * ONE batch request feeds every bout (`useLiveSlate("ufc", scope)`), joined to the build-time roster
 * by the ESPN bout id and checked against both ESPN athlete ids (`envelopeMatchesBout`). Nothing
 * here fetches per bout. Every present-tense statement comes from `deriveUfcBoutState`, the single
 * owner of the bout live-state contract.
 *
 * WHAT A CARD SAYS, AND WHEN:
 *   - both fighters (portrait, name, record) — always, from the card
 *   - the frozen pregame pick and its win chance — always, exactly as published before the card
 *   - round and clock — only while the provider states the bout is in a round, and only what it states
 *   - a reported winner — once the provider says FINAL, labelled as awaiting the official result
 *   - "Pick correct" / "Pick missed" — only from the graded ledger's settlement, never from the feed
 *   - method of victory — never; the feed does not state it, and the card says so
 *
 * No `aria-live`: a card's state lives in its accessible sentence, read on demand.
 */
import Link from "next/link";
import { useMemo } from "react";

import PlayerAvatar from "@/components/player-avatar";
import { liveReadyFor } from "@/lib/live/client";
import { ageSeconds } from "@/lib/live/freshness.mjs";
import { slateFeedStatus } from "@/lib/live/slate-scope.mjs";
import { UFC_HUB_GROUPS, UFC_HUB_GROUP_LABEL, deriveUfcBoutState, groupUfcBouts } from "@/lib/live/ufc-live.mjs";
import type { UfcHubRoster, UfcRosterBout, UfcRosterFighter } from "@/lib/live/ufc-hub-data";
import { StateChip } from "./live-hub";
import { useNowMs } from "./use-live-props";
import { useLiveSlate } from "./use-live-slate";

const MONO = "var(--font-mono)";

const etTime = (iso: string | null) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(t)) + " ET";
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

/** `R2 · 3:10` from whichever of the two the provider stated; null when it stated neither. */
function roundClock(round: number | null, clock: string | null): string | null {
  const parts = [round !== null ? `R${round}` : null, clock].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

type View = ReturnType<typeof deriveUfcBoutState>;

function FighterRow({ f, mark }: { f: UfcRosterFighter; mark: string | null }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", minWidth: 0 }}>
      <PlayerAvatar photoUrl={f.photoUrl} playerName={f.name} size="sm" flat />
      <span style={{ fontFamily: "var(--font-headline)", fontSize: 14, color: "var(--vault-text)", flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        {f.name}
        {f.record ? <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}> · {f.record}</span> : null}
      </span>
      {mark ? (
        <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-mute)", whiteSpace: "nowrap" }}>{mark}</span>
      ) : null}
    </div>
  );
}

/**
 * One bout. Exported so a test renders THIS component with the inputs the hub would pass, rather than
 * a mock of it.
 */
export function UfcBoutCard({ bout, view }: { bout: UfcRosterBout; view: View }) {
  const start = etTime(bout.startUtc);
  const live = view.state === "LIVE";
  const rc = live ? roundClock(view.round, view.clock) : null;
  const ageSecs = ageSeconds(view.freshness?.ageMs ?? null);
  const winnerName = view.result?.winnerName ?? null;
  const markFor = (f: UfcRosterFighter) =>
    winnerName && f.name === winnerName
      ? view.state === "FINAL_CANONICAL" ? "Winner" : "Reported winner"
      : null;

  const chipLabel = live && view.stale ? "Live · feed delayed" : view.label;
  const resultLine =
    view.state === "FINAL_PROVISIONAL"
      ? winnerName
        ? `ESPN reports ${winnerName} won${roundClock(view.result?.round ?? null, view.result?.clock ?? null) ? ` (${roundClock(view.result?.round ?? null, view.result?.clock ?? null)})` : ""}. Official result pending — the pick is not graded yet.`
        : "ESPN reports this bout is over without naming a winner. Official result pending — the pick is not graded yet."
      : view.state === "FINAL_CANONICAL"
        ? winnerName ? `Official result: ${winnerName} won.` : "Official result recorded, with no winner to show."
        : view.state === "NOT_TRACKABLE"
          ? `ESPN lists this bout as ${view.label.toLowerCase()}.`
          : null;
  const outcomeLine = view.outcome === "HIT" ? "Pick correct" : view.outcome === "MISS" ? "Pick missed" : null;

  const spoken =
    `${bout.red.name} versus ${bout.blue.name}. ${bout.position}. ${chipLabel}.` +
    (rc ? ` ${view.stale ? "Last confirmed " : ""}${rc}.` : "") +
    (view.state === "UPCOMING" && start ? ` Scheduled segment start ${start}.` : "") +
    (bout.pregame ? ` Pregame pick, frozen before the card: ${bout.pregame.pickName}, ${pct(bout.pregame.winChance)} win chance.` : " No pregame pick for this bout.") +
    (resultLine ? ` ${resultLine}` : "") +
    (outcomeLine ? ` ${outcomeLine}.` : "");

  return (
    <li style={{ listStyle: "none" }}>
      <div style={{ border: "1px solid var(--vault-border)", borderRadius: 8, background: "var(--vault-panel)", padding: "12px 14px" }}>
        <span className="sr-only">{spoken}</span>
        <div aria-hidden="true">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <StateChip state={view.lifecycleState} label={chipLabel} />
            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>
              {bout.position}{bout.weightClass ? ` · ${bout.weightClass}` : ""}
            </span>
            {rc ? (
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 11, fontVariantNumeric: "tabular-nums", color: view.stale ? "var(--vault-warn)" : "var(--vault-text)" }}>
                {view.stale ? "last confirmed " : ""}{rc}
              </span>
            ) : view.state === "UPCOMING" && start ? (
              <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }}>{start}</span>
            ) : null}
          </div>

          <FighterRow f={bout.red} mark={markFor(bout.red)} />
          <FighterRow f={bout.blue} mark={markFor(bout.blue)} />

          {live && view.stale && ageSecs !== null ? (
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-warn)", margin: "6px 0 0" }}>
              Live feed delayed — showing the last confirmed state from {ageSecs} sec ago
            </p>
          ) : null}

          {bout.pregame ? (
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "8px 0 0" }}>
              Pregame pick · frozen before the card · {bout.pregame.pickName} · {pct(bout.pregame.winChance)} win chance
            </p>
          ) : (
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "8px 0 0" }}>
              No pregame pick{bout.unmodelledReason ? ` — ${bout.unmodelledReason}` : ""}
            </p>
          )}

          {resultLine ? (
            <p style={{ fontSize: 12, color: "var(--vault-text-mute)", margin: "6px 0 0", lineHeight: 1.5 }}>{resultLine}</p>
          ) : null}
          {outcomeLine ? (
            <p style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text)", margin: "4px 0 0" }}>{outcomeLine}</p>
          ) : null}
          {view.state === "FINAL_PROVISIONAL" || view.state === "FINAL_CANONICAL" ? (
            <p style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--vault-text-faint)", margin: "4px 0 0" }}>{view.methodNote}</p>
          ) : null}
        </div>
        <p style={{ margin: "8px 0 0" }}>
          <Link href={bout.href} style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-gold)", display: "inline-flex", alignItems: "center", minHeight: 44 }}>
            Bout read →
          </Link>
        </p>
      </div>
    </li>
  );
}

export default function UfcLiveHub({ roster }: { roster: UfcHubRoster }) {
  const scope = useMemo(
    () => ({ rosterIds: roster.bouts.map((b) => b.boutId), rosterDate: roster.etDate }),
    [roster.bouts, roster.etDate],
  );
  const { byGamePk, unavailable, loading, freshness, matched, settled, rosterIsToday, lastObservedAt } = useLiveSlate("ufc", scope);
  const enabled = liveReadyFor("ufc");
  const nowMs = useNowMs(5_000);

  const feed: "NOT_ASKED" | "OK" | "REFUSED" = unavailable ? "REFUSED" : lastObservedAt ? "OK" : "NOT_ASKED";
  const grouped = useMemo(
    () => groupUfcBouts(roster.bouts, byGamePk, { feed, nowMs }),
    [roster.bouts, byGamePk, feed, nowMs],
  );

  const secs = ageSeconds(freshness.ageMs);
  const status = slateFeedStatus({
    enabled, rosterIsToday, rosterSize: roster.bouts.length, unavailable, loading,
    matched, settled, freshnessLevel: freshness.level, ageSecs: secs,
  });
  const checkedAt = etTime(lastObservedAt);
  const line: string | null =
    status === "OFF" ? "Live tracking for UFC is currently turned off. The card and the frozen pregame picks are unaffected."
    : status === "NO_GAMES" ? null
    : status === "PRIOR_DAY_DONE" ? `Every bout from the ${roster.etDate} card reads final. Tonight's card appears here once it is published.`
    : status === "UNAVAILABLE" ? "Live data is unavailable right now. Showing the last known state; the frozen pregame picks are unaffected."
    : status === "CHECKING" ? "Checking the live feed…"
    : status === "NO_TODAY_DATA" ? "No live data for tonight's bouts yet. Checking again every minute."
    : status === "ALL_FINAL" ? `Every bout on the card reads final${checkedAt ? ` · last checked ${checkedAt}` : ""} · source ESPN`
    : status === "AGE_UNKNOWN" ? "Live feed age unknown"
    : status === "STALE" ? `Live feed delayed — showing the last confirmed state from ${secs} sec ago`
    : `Live feed updated ${secs} sec ago · source ESPN`;

  return (
    <div>
      {roster.eventName ? (
        <p style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--vault-text-mute)", margin: "0 0 6px" }}>
          {roster.eventName} · {roster.etDate} (ET)
        </p>
      ) : null}
      {rosterIsToday === false && status !== "PRIOR_DAY_DONE" ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-warn)", margin: "0 0 8px" }}>
          {`Showing the UFC card for ${roster.etDate} (ET).`}
        </p>
      ) : null}
      {line ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: status === "STALE" ? "var(--vault-warn)" : "var(--vault-text-faint)", margin: "0 0 16px" }}>
          {line}
        </p>
      ) : null}

      {status === "PRIOR_DAY_DONE" ? null : (
        UFC_HUB_GROUPS.map((group) => {
          const rows = grouped[group as keyof typeof grouped];
          if (!rows || rows.length === 0) return null;
          const label = (UFC_HUB_GROUP_LABEL as Record<string, string>)[group] ?? group;
          return (
            <section key={group} aria-label={label} style={{ marginBottom: 24 }}>
              <h2 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-faint)", margin: "0 0 10px", fontWeight: 400 }}>
                {label} <span>· {rows.length}</span>
              </h2>
              <ul style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", margin: 0, padding: 0 }}>
                {rows.map(({ bout, view }) => (
                  <UfcBoutCard key={bout.boutId} bout={bout} view={view} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
