"use client";
/**
 * /live SPORT CONTROLS.
 *
 * ⚠ ONLY SPORTS THAT ACTUALLY HAVE A ROSTER GET A TAB. §4 names five; EPL has no hub roster yet, and
 *   a tab that opens onto nothing is a claim the product cannot keep — the same defect class as an
 *   empty "NFL Live" promise. A sport appears here the day its roster does, not before.
 *
 * Defaults to NFL on a day the NFL slate exists, because that is the slate a reader came for.
 *
 * UFC (UFC-001) IS BUILT AND HIDDEN. Its tab exists only when BOTH hold: the build enables it
 * (`liveSportEnabled("ufc")`, closed by default and closed under Production's `mlb,nfl`) AND today's
 * roster has bouts. Either missing ⇒ no tab, no section, no request — the rule above still holds.
 */
import { type ReactNode, useState } from "react";

import type { HubRoster } from "@/lib/live/hub-data";
import { liveSportEnabled } from "@/lib/live/client";
import type { NflHubRoster } from "@/lib/live/nfl-hub-data";
import type { UfcHubRoster } from "@/lib/live/ufc-hub-data";
import LiveHub from "./live-hub";
import NflLiveHub from "./nfl-live-hub";
import UfcLiveHub from "./ufc-live-hub";

const MONO = "var(--font-mono)";

export default function LiveSportTabs({ nfl, mlb, ufc = null, quietDay }: { nfl: NflHubRoster; mlb: HubRoster; ufc?: UfcHubRoster | null; quietDay?: ReactNode }) {
  /* Both halves of the UFC gate, evaluated here as well as on the page: a tab onto nothing — or onto
     a sport this build does not enable — is a claim we cannot keep. */
  const hasUfc = Boolean(ufc && ufc.bouts.length > 0 && liveSportEnabled("ufc"));
  const tabs = [
    { key: "ALL", label: "All" },
    ...(nfl.games.length > 0 ? [{ key: "NFL", label: "NFL" }] : []),
    ...(mlb.games.length > 0 ? [{ key: "MLB", label: "MLB" }] : []),
    ...(hasUfc ? [{ key: "UFC", label: "UFC" }] : []),
  ];
  const [active, setActive] = useState<string>(nfl.games.length > 0 ? "NFL" : "ALL");

  const showNfl = (active === "ALL" || active === "NFL") && nfl.games.length > 0;
  const showMlb = (active === "ALL" || active === "MLB") && mlb.games.length > 0;
  const showUfc = (active === "ALL" || active === "UFC") && hasUfc;

  return (
    <div>
      {tabs.length > 1 ? (
        <div role="tablist" aria-label="Sport" style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "0 0 18px" }}>
          {tabs.map((t) => {
            const on = t.key === active;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={on}
                type="button"
                onClick={() => setActive(t.key)}
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

      {showUfc && ufc ? (
        <section aria-label="UFC" style={{ marginTop: 28 }}>
          {active === "ALL" ? (
            <h2 style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--vault-text-mute)", margin: "0 0 12px", fontWeight: 400 }}>UFC</h2>
          ) : null}
          <UfcLiveHub roster={ufc} />
        </section>
      ) : null}

      {/* The page supplies the quiet-day state (what Live covers, the dated day, where to go next). A
          sentence claiming no games are SCHEDULED would be a schedule claim this roster cannot make: it
          holds only games with a published forecast. */}
      {!showNfl && !showMlb && !showUfc ? (quietDay ?? (
        <p style={{ fontFamily: MONO, fontSize: 11, color: "var(--vault-text-faint)" }}>Nothing to follow on Live right now.</p>
      )) : null}
    </div>
  );
}
