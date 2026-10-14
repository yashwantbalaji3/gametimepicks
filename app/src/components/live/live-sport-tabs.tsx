"use client";
/**
 * /live SPORT CONTROLS.
 *
 * ⚠ ONLY SPORTS THAT ACTUALLY HAVE A ROSTER GET A TAB. §4 names five; UFC and EPL have no hub roster
 *   yet, and a tab that opens onto nothing is a claim the product cannot keep — the same defect class
 *   as an empty "NFL Live" promise. They appear here the day their roster does, not before.
 *
 * Defaults to NFL on a day the NFL slate exists, because that is the slate a reader came for.
 */
import { type ReactNode, useId, useState } from "react";

import { useRovingTabs } from "@/components/a11y/use-roving-tabs";
import { liveReadyFor } from "@/lib/live/client";

import type { HubRoster } from "@/lib/live/hub-data";
import type { NflHubRoster } from "@/lib/live/nfl-hub-data";
import LiveHub from "./live-hub";
import NflLiveHub from "./nfl-live-hub";

const MONO = "var(--font-mono)";

/** The rollout flags decide which sports are tracked; the sentence follows them (never a hard-coded claim). */
export function liveCoverageLine(tracked: string[]): string {
  const untracked = "NBA, Premier League and UFC are not tracked live yet — their schedules and forecasts are on each sport's hub.";
  if (tracked.length === 0) return `Live tracking is turned off right now. ${untracked}`;
  return `Live tracking: ${tracked.join(" and ")}. ${untracked}`;
}

export default function LiveSportTabs({ nfl, mlb, quietDay }: { nfl: NflHubRoster; mlb: HubRoster; quietDay?: ReactNode }) {
  const tabs = [
    { key: "ALL", label: "All" },
    ...(nfl.games.length > 0 ? [{ key: "NFL", label: "NFL" }] : []),
    ...(mlb.games.length > 0 ? [{ key: "MLB", label: "MLB" }] : []),
  ];
  const [active, setActive] = useState<string>(nfl.games.length > 0 ? "NFL" : "ALL");
  /* GTP-13: arrow keys / Home / End, one tab stop, tab ↔ panel pairing (shared hook). */
  const idBase = useId().replace(/:/g, "");
  const roving = useRovingTabs<string>({ keys: tabs.map((t) => t.key), active, onChange: setActive, idBase });

  const showNfl = (active === "ALL" || active === "NFL") && nfl.games.length > 0;
  const showMlb = (active === "ALL" || active === "MLB") && mlb.games.length > 0;

  return (
    <div>
      {tabs.length > 1 ? (
        <div {...roving.listProps} aria-label="Sport" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 10px" }}>
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                {...roving.tabProps(t.key)}
                style={{
                  fontFamily: MONO, fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase",
                  /* 44px tall: a real touch target, not a desktop chip shrunk onto a phone. */
                  minHeight: 44, padding: "0 14px", cursor: "pointer", borderRadius: 4,
                  color: on ? "var(--vault-bg)" : "var(--vault-text-mute)",
                  background: on ? "var(--vault-text)" : "transparent",
                  border: `1px solid ${on ? "var(--vault-text)" : "var(--vault-border)"}`,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {/* LIVE-F: which sports Live tracks, said once, so an absent tab is never read as "no games". NBA, the
          Premier League and UFC have no validated live adapter yet; they are never presented as tracked. */}
      <p style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--vault-text-mute)", margin: "0 0 18px" }}>
        {liveCoverageLine((["nfl", "mlb"] as const).filter((s) => liveReadyFor(s)).map((s) => s.toUpperCase()))}
      </p>

      <div {...(tabs.length > 1 ? roving.panelProps(active) : {})}>
      {showNfl ? (
        <section aria-label="NFL" style={{ marginBottom: 28 }}>
          {active === "ALL" ? (
            <h2 style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "0 0 12px", fontWeight: 400 }}>NFL</h2>
          ) : null}
          <NflLiveHub roster={nfl} />
        </section>
      ) : null}

      {showMlb ? (
        <section aria-label="MLB">
          {active === "ALL" ? (
            <h2 style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "0 0 12px", fontWeight: 400 }}>MLB</h2>
          ) : null}
          <LiveHub roster={mlb} />
        </section>
      ) : null}

      {/* The page supplies the quiet-day state (what Live covers, the dated day, where to go next). A
          sentence claiming no games are SCHEDULED would be a schedule claim this roster cannot make: it
          holds only games with a published forecast. */}
      {!showNfl && !showMlb ? (quietDay ?? (
        <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>Nothing to follow on Live right now.</p>
      )) : null}
      </div>
    </div>
  );
}
