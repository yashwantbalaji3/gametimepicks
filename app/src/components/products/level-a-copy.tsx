"use client";

import { useState } from "react";

/**
 * Smart Betslip · manual entry for a Level A suggestion: copies the card's plain-text selections (no link, no price).
 * The text is prepared on the server (level-a/suggestions.mjs cardCopyText); this only puts it on the clipboard.
 */
export default function LevelACopy({ text, label = "Copy selections" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setState("copied"); } catch { setState("failed"); }
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={copy} className="vault-press rounded-full px-4"
        style={{ minHeight: 40, border: "1px solid var(--vault-border-strong)", color: "var(--vault-text)", fontSize: 12.5, fontWeight: 600, background: "transparent" }}>
        {label}
      </button>
      <span aria-live="polite" style={{ color: "var(--vault-text-mute)", fontSize: 12 }}>
        {state === "copied" ? "Copied — paste it wherever you keep notes. Nothing was placed." : state === "failed" ? "Copy is not available in this browser." : ""}
      </span>
    </span>
  );
}
