"use client";
/**
 * KICKOFF-AWARE SLOTS — the static NFL game page, corrected on the reader's clock.
 *
 * The page is a static export: "· started", "This game has kicked off", where the live panel sits and the
 * provenance state are all decided when the page was BUILT. A page built at 15:30Z for an 00:15Z kickoff kept
 * framing the game as upcoming for the whole game — beside a live panel that said LIVE — until some unrelated
 * commit happened to rebuild it (Live & Today audit, MNF 2026-10-05).
 *
 * These slots re-ask the one question that changes at kickoff — has it started? — against `Date.now()` in the
 * reader's browser. Two rules:
 *   - The first render is the BUILD's answer, so server and client markup agree (no hydration flip).
 *   - The clock may advance "started"; it never rewinds it. A build that already said started stays started.
 * Nothing here reads a score, a feed or a forecast: it is the same kickoff time the page already prints.
 */
import React, { useEffect, useState, type ReactNode } from "react";

const TICK_MS = 30_000;

/** Pure: has the game started, given the build's answer and the reader's clock? */
export function kickedOff(kickoffUtc: string | null | undefined, startedAtBuild: boolean, nowMs: number): boolean {
  if (startedAtBuild) return true;
  const k = Date.parse(kickoffUtc ?? "");
  /* An unreadable kickoff never advances the stamp — same rule as effectiveLifecycle. */
  return Number.isFinite(k) && nowMs >= k;
}

export function useKickedOff(kickoffUtc: string | null | undefined, startedAtBuild: boolean): boolean {
  const [started, setStarted] = useState(startedAtBuild);
  useEffect(() => {
    if (startedAtBuild) return;
    const check = () => setStarted((s) => s || kickedOff(kickoffUtc, false, Date.now()));
    check();
    const id = window.setInterval(check, TICK_MS);
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [kickoffUtc, startedAtBuild]);
  return started;
}

/** Renders `children` only before kickoff (`when="before"`) or only once the game has started (`when="after"`). */
export function KickoffSlot({ kickoffUtc, startedAtBuild, when, children }: {
  kickoffUtc: string | null | undefined;
  startedAtBuild: boolean;
  when: "before" | "after";
  children: ReactNode;
}) {
  const started = useKickedOff(kickoffUtc, startedAtBuild);
  return (when === "after") === started ? <>{children}</> : null;
}
