"use client";
/**
 * LIVE HUB V2 — FOUNDATION BOARD (not wired into /live; exercised on /preview/live-v2 only).
 *
 * The cross-sport shell the founder directive asks for: one sport filter (Football · Basketball · Baseball ·
 * Soccer · MMA, sport-first), events in reading order (live → upcoming → recent → earlier → postponed →
 * unavailable), one card per event on the shared LiveEventCard, and — inside a card — the game's top frozen
 * forecasts tracked against verified progress. Everything it shows comes from its props; the data adapters
 * stay separate (lib/live/*), so this can be switched on per sport only once that sport's feed is validated.
 *
 * Sports without a validated live adapter are listed in their own panel, in words — never given cards that
 * imply live tracking.
 */
import { useId, useMemo, useState } from "react";

import { useRovingTabs } from "@/components/a11y/use-roving-tabs";
import LiveEventCard, { liveEtTime } from "@/components/live/live-event-card";
import {
  LIVE_V2_CAPABILITY, LIVE_V2_LABEL, LIVE_V2_STATUS, forecastProgress, groupEvents, isTracked, progressLine, topForecasts, ufcResultLine,
} from "@/lib/live/v2/event-view.mjs";

const SANS = "var(--font-display)";

export type LiveV2Sport = "nfl" | "nba" | "mlb" | "soccer" | "ufc";

export interface LiveV2Forecast {
  id: string;
  /** "Josh Allen · passing yards" */
  label: string;
  /** The frozen pregame claim, pre-rendered ("Over 245.5 · 58%"). Never recomputed here. */
  frozen: string;
  line: number | null;
  side: "over" | "under" | null;
  /** Verified live value, or null when the feed has not measured it. */
  current: number | null;
  unit: string;
}

export interface LiveV2Event {
  id: string;
  sport: LiveV2Sport;
  status: string;
  startUtc: string | null;
  away: { abbr: string; name: string; score: number | null; imageUrl?: string | null };
  home: { abbr: string; name: string; score: number | null; imageUrl?: string | null };
  progress?: Record<string, unknown> | null;
  /** UFC only: the official result, when one exists. */
  result?: { winner?: string; method?: string; round?: number; official?: boolean } | null;
  reportHref: string;
  /** "Forecast locked 7:47 PM ET" — present only when a frozen forecast exists. */
  forecastLocked?: string | null;
  forecasts?: LiveV2Forecast[];
}

const SPORT_TAB: Record<LiveV2Sport, string> = { nfl: "Football", nba: "Basketball", mlb: "Baseball", soccer: "Soccer", ufc: "MMA" };
const ORDER: LiveV2Sport[] = ["nfl", "nba", "mlb", "soccer", "ufc"];

const PROGRESS_WORDS: Record<string, (f: LiveV2Forecast, r: { remaining: number | null; room?: number }) => string> = {
  IN_PROGRESS: (f, r) => `${f.current} ${f.unit} · needs ${r.remaining} more`,
  REACHED_AWAITING_SETTLEMENT: (f) => `${f.current} ${f.unit} · line reached — awaiting official settlement`,
  FINAL_SHORT_AWAITING_SETTLEMENT: (f) => `${f.current} ${f.unit} at the final · awaiting official settlement`,
  ON_TRACK_UNTIL_FINAL: (f, r) => `${f.current} ${f.unit} · ${r.room} to spare — decided at the final`,
  OVER_THE_LINE: (f) => `${f.current} ${f.unit} · already over the line`,
  UNDER_AT_FINAL_AWAITING_SETTLEMENT: (f) => `${f.current} ${f.unit} at the final · awaiting official settlement`,
  SETTLED_HIT: () => "Settled · landed",
  SETTLED_MISS: () => "Settled · missed",
  NOT_MEASURED: () => "Not measured live",
  NO_LINE: () => "No line to track",
};

function ForecastRows({ ev }: { ev: LiveV2Event }) {
  const rows = topForecasts(ev.forecasts ?? [], { max: 5 });
  if (rows.length === 0) {
    return <p style={{ fontFamily: SANS, fontSize: 12, color: "var(--vault-text-faint)", margin: "12px 0 0" }}>No published GameTimePicks forecasts for this event.</p>;
  }
  return (
    <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0, display: "grid", gap: 8 }}>
      {rows.map((f: LiveV2Forecast) => {
        const tracked = ev.status !== LIVE_V2_STATUS.PREGAME;
        const p = tracked ? forecastProgress({ line: f.line, side: f.side, current: f.current, status: ev.status }) : null;
        return (
          <li key={f.id} style={{ borderTop: "1px solid var(--vault-border)", paddingTop: 8 }}>
            <div style={{ fontFamily: SANS, fontSize: 13, fontWeight: 600, color: "var(--vault-text)" }}>{f.label}</div>
            <div style={{ fontFamily: SANS, fontSize: 12, color: "var(--vault-text-mute)" }}>Frozen pregame: {f.frozen}</div>
            {p ? <div style={{ fontFamily: SANS, fontSize: 12, color: "var(--vault-text)" }}>{PROGRESS_WORDS[p.state]?.(f, p) ?? "—"}</div> : null}
          </li>
        );
      })}
    </ul>
  );
}

export default function LiveV2Board({ events, nowMs, flags }: { events: LiveV2Event[]; nowMs: number; flags: Partial<Record<LiveV2Sport, boolean>> }) {
  const present = ORDER.filter((s) => events.some((e) => e.sport === s));
  const keys = ["all", ...present] as string[];
  const [active, setActive] = useState("all");
  const idBase = useId().replace(/:/g, "");
  const tabs = useRovingTabs<string>({ keys, active, onChange: setActive, idBase });

  const shown = useMemo(() => (active === "all" ? events : events.filter((e) => e.sport === active)), [events, active]);
  const groups = groupEvents(shown, nowMs);
  const untracked = ORDER.filter((s) => !isTracked(s, flags[s] === true));

  return (
    <div>
      {keys.length > 1 ? (
        <div {...tabs.listProps} aria-label="Sport" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 14px" }}>
          {keys.map((k) => {
            const on = k === active;
            return (
              <button key={k} {...tabs.tabProps(k)} style={{
                fontFamily: SANS, fontSize: 13, fontWeight: 600, minHeight: 44, padding: "0 14px", borderRadius: 999, cursor: "pointer",
                color: on ? "var(--vault-bg)" : "var(--vault-text-mute)", background: on ? "var(--vault-text)" : "transparent",
                border: `1px solid ${on ? "var(--vault-text)" : "var(--vault-border)"}`,
              }}>{k === "all" ? "All" : SPORT_TAB[k as LiveV2Sport]}</button>
            );
          })}
        </div>
      ) : null}

      <div {...(keys.length > 1 ? tabs.panelProps(active) : {})}>
        {groups.length === 0 ? (
          <p style={{ fontFamily: SANS, fontSize: 14, color: "var(--vault-text-mute)" }}>Nothing to follow right now.</p>
        ) : groups.map((g: { label: string; events: LiveV2Event[] }) => (
          <section key={g.label} aria-label={g.label} style={{ marginBottom: 22 }}>
            <h2 style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "0 0 10px" }}>
              {g.label} <span style={{ color: "var(--vault-text-faint)", fontWeight: 400 }}>· {g.events.length}</span>
            </h2>
            <ul style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))", margin: 0, padding: 0 }}>
              {g.events.map((e) => {
                const tracked = isTracked(e.sport, flags[e.sport] === true);
                const status = tracked || e.status === LIVE_V2_STATUS.PREGAME || e.status === LIVE_V2_STATUS.POSTPONED || e.status === LIVE_V2_STATUS.CANCELLED || e.status === LIVE_V2_STATUS.FINAL_CANONICAL
                  ? e.status : LIVE_V2_STATUS.DATA_UNAVAILABLE;
                const label = LIVE_V2_LABEL[status as keyof typeof LIVE_V2_LABEL] ?? "Status unknown";
                const when = status === LIVE_V2_STATUS.PREGAME ? liveEtTime(e.startUtc) : progressLine(e.sport, e.progress ?? null, status);
                const ufc = e.sport === "ufc" ? ufcResultLine(e.result) : null;
                const scoreWords = e.away.score === null || e.home.score === null ? "No score reported." : `${e.away.abbr} ${e.away.score}, ${e.home.abbr} ${e.home.score}.`;
                return (
                  <LiveEventCard
                    key={e.id}
                    spoken={`${e.away.name} ${e.sport === "ufc" ? "versus" : "at"} ${e.home.name}. ${label}. ${scoreWords}${when ? ` ${when}.` : ""}${ufc ? ` ${ufc}.` : ""}`}
                    state={status}
                    label={label}
                    when={when}
                    started={status !== LIVE_V2_STATUS.PREGAME}
                    sport={e.sport}
                    away={e.away}
                    home={e.home}
                    reportHref={e.reportHref}
                    reportLabel={e.sport === "ufc" ? "Open bout report" : "Open game report"}
                  >
                    {ufc ? <p style={{ fontFamily: SANS, fontSize: 12.5, color: "var(--vault-text)", margin: "8px 0 0" }}>{ufc}</p> : null}
                    {e.forecastLocked ? <p style={{ fontFamily: SANS, fontSize: 11.5, color: "var(--vault-text-mute)", margin: "8px 0 0" }}>{e.forecastLocked}</p> : null}
                    <ForecastRows ev={{ ...e, status }} />
                  </LiveEventCard>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {untracked.length ? (
        <section aria-label="Not tracked live" style={{ border: "1px solid var(--vault-border)", borderRadius: 12, padding: "12px 16px", marginTop: 8 }}>
          <h2 style={{ fontFamily: SANS, fontSize: 13, fontWeight: 700, color: "var(--vault-text)", margin: "0 0 6px" }}>Not tracked live</h2>
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: SANS, fontSize: 12.5, color: "var(--vault-text-mute)", lineHeight: 1.6 }}>
            {untracked.map((s) => (
              <li key={s}><strong style={{ color: "var(--vault-text)" }}>{LIVE_V2_CAPABILITY[s].label}:</strong> {LIVE_V2_CAPABILITY[s].reason ?? "Live tracking is switched off right now."}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
