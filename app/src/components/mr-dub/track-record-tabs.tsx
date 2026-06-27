"use client";

/**
 * TrackRecordTabs — splits the Track Record page into two tabs so newcomers see the STORY (the narrative
 * summary: calendar, exposure, lanes) by default, and power users can open the FULL LEDGER (every event +
 * the cross-product master ledger + allocation). The money-path hero stays above the tabs (always visible).
 * Server component renders both trees and passes them as props; this only toggles which one shows.
 */
import { useState, type ReactNode } from "react";

export default function TrackRecordTabs({ story, ledger }: { story: ReactNode; ledger: ReactNode }) {
  const [tab, setTab] = useState<"story" | "ledger">("story");
  const Tab = ({ id, label }: { id: "story" | "ledger"; label: string }) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        aria-current={active ? "page" : undefined}
        className="flex-1 rounded-[9px] px-3 py-2 font-mono uppercase tracking-[0.1em] text-[11px] transition-colors"
        style={{
          color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
          background: active ? "var(--vault-gold-dim)" : "transparent",
          border: active ? "1px solid var(--vault-gold-bright)" : "1px solid var(--vault-rule)",
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <>
      <div role="tablist" aria-label="Track record view" className="flex gap-2">
        <Tab id="story" label="Story" />
        <Tab id="ledger" label="Full ledger" />
      </div>
      <div className="mt-1 flex flex-col gap-6">{tab === "story" ? story : ledger}</div>
    </>
  );
}
