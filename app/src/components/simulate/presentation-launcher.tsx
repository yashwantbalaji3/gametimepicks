"use client";
/**
 * THE PRESENTATION ENTRY POINT — Program 234 · Release C.
 *
 * One control, one interaction, four sports. MLB's presentation opens from the report's own Generate
 * card because that entry point already existed and readers know it; every other sport gets this,
 * so the ACTION is identical everywhere even though the chapters behind it are sport-native.
 *
 * It is a button rather than a link on purpose: the presentation is a state of this page, not a
 * separate destination, so browser back never lands a reader inside a half-played frame. `?play=1`
 * — written by the /simulate card the reader clicked — opens it on arrival, which is the same user
 * action carried across one navigation rather than a dialog that opens by itself.
 *
 * When the manifest refused to build, the button still appears and the frame states the reason.
 * Hiding the control would leave a reader wondering whether the feature exists; saying "no
 * presentation for this event, here is why" answers the question they actually have.
 */
import { useEffect, useState } from "react";

import PresentationPlayer from "@/components/simulate/presentation-player";
import { themeFor } from "@/lib/simulate/themes";
import type { PresentationResult } from "@/lib/simulate/presentation/types";
import { isPresentable } from "@/lib/simulate/presentation/types";

export default function PresentationLauncher({
  presentation,
  label,
  hint,
}: {
  presentation: PresentationResult;
  /** Overrides the default verb. Sport-native wording lives at the call site, not in a registry. */
  label?: string;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const theme = themeFor(presentation.sport);
  const playable = isPresentable(presentation);
  const chapters = playable ? presentation.chapters.length : 0;
  const seconds = playable
    ? Math.round(presentation.chapters.reduce((a, c) => a + c.holdMs, 0) / 1000)
    : 0;

  useEffect(() => {
    let wanted = false;
    try { wanted = new URLSearchParams(window.location.search).get("play") === "1"; } catch { wanted = false; }
    if (wanted) setOpen(true);
  }, []);

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="vault-press inline-flex items-center gap-2 rounded-full px-5 self-start"
          style={{ minHeight: 46, border: `1px solid ${theme.accent}`, color: theme.accent, fontSize: 13.5, fontWeight: 700 }}
        >
          <span aria-hidden style={{ fontSize: 12 }}>▶</span>
          {label ?? "Play the simulation"}
        </button>
        <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {playable
            ? `${chapters} chapters · about ${seconds}s · nothing to scroll`
            : "No presentation for this event — the frame states why"}
          {hint ? ` · ${hint}` : ""}
        </span>
      </div>
      {open ? <PresentationPlayer presentation={presentation} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
