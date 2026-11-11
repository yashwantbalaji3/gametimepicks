"use client";
/**
 * The tier-performance window picker: shows one window's panel ([data-ptt-window]) at a time — default "Last 7 days".
 * With JavaScript off every window stays visible, stacked. Computes nothing.
 */
import { useEffect, useState } from "react";

export default function TierWindowTabs({ windows }: { windows: { key: string; label: string }[] }) {
  const [active, setActive] = useState("7d");
  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-ptt-window]")) el.hidden = el.dataset.pttWindow !== active;
  }, [active]);
  return (
    <div className="ptt-tabs" role="group" aria-label="Time window">
      {windows.map((w) => (
        <button key={w.key} type="button" aria-pressed={active === w.key} onClick={() => setActive(w.key)}>{w.label}</button>
      ))}
    </div>
  );
}
