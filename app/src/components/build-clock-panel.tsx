"use client";

/**
 * BuildClockPanel — reports how stale the export you are looking at actually is.
 *
 * Must be a client component, and for a specific reason: the build clock is the thing under
 * suspicion. Rendering this on the server would compare the frozen clock against *itself* and
 * always print "current" — a measurement that can only ever pass. Only the browser has a clock
 * the build did not author, so the comparison happens after hydration.
 *
 * Before hydration it renders the neutral "checking" state rather than an optimistic one, so a
 * reader never sees "current" that later flips to "9 days behind".
 */

import { useEffect, useState } from "react";
import { classifyBuildClock, buildClockLabel, buildInfoFromEnv, type BuildClock } from "@/lib/build-clock";
import { currentEtDate } from "@/lib/freshness";

const TONE: Record<BuildClock["status"], string> = {
  current: "var(--vault-success)",
  yesterday: "var(--vault-gold)",
  stale: "var(--gtp-bank-heat)",
  very_stale: "var(--gtp-bank-heat)",
  future: "var(--vault-gold)",
  unknown: "var(--vault-text-faint)",
};

export function BuildClockPanel() {
  const [clock, setClock] = useState<BuildClock | null>(null);

  useEffect(() => {
    // currentEtDate() with no argument reads the browser's real wall clock.
    setClock(classifyBuildClock(buildInfoFromEnv(), currentEtDate()));
  }, []);

  if (!clock) {
    return (
      <div className="text-[12px]" style={{ color: "var(--vault-text-faint)" }}>
        Checking build clock…
      </div>
    );
  }

  const info = buildInfoFromEnv();

  return (
    <div className="flex flex-col gap-1 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>
      <div>
        Build clock:{" "}
        <span className="font-mono" style={{ color: TONE[clock.status] }}>
          {clock.buildEtDate ?? "unknown"}
        </span>
        {clock.daysBehind !== null && clock.daysBehind > 0 ? (
          <span style={{ color: TONE[clock.status] }}>
            {" "}
            · {clock.daysBehind} day{clock.daysBehind === 1 ? "" : "s"} behind
          </span>
        ) : null}
      </div>
      <div style={{ color: "var(--vault-text-faint)" }}>{buildClockLabel(clock)}</div>
      <div className="mt-2 flex flex-wrap gap-x-4 font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        <span>
          Commit: <span style={{ color: "var(--vault-text-mute)" }}>{clock.shortSha ?? "—"}</span>
        </span>
        <span>
          Built by: <span style={{ color: "var(--vault-text-mute)" }}>{clock.environment ?? "—"}</span>
        </span>
        <span>
          Built at:{" "}
          <span style={{ color: "var(--vault-text-mute)" }}>
            {info?.builtAt ? `${info.builtAt.slice(0, 16).replace("T", " ")}Z` : "—"}
          </span>
        </span>
      </div>
      {clock.status === "unknown" ? (
        <div className="mt-1 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
          This export carries no build marker — its age cannot be measured. Expected only for{" "}
          <span className="font-mono">next dev</span> and builds made before Sprint 032.
        </div>
      ) : null}
      <div className="mt-1 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>
        Describes the build, not the data. Slate freshness is reported separately.
      </div>
    </div>
  );
}
