"use client";
/**
 * The ticker card's kickoff line, corrected on the reader's clock (same rule as the game page's KickoffSlot): the first
 * render is the build's answer; once the kickoff passes it reads "Started", and it never rewinds. No score, no feed.
 */
import React from "react";
import { useKickedOff } from "@/components/live/kickoff-aware";

const fmt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " ET";

export default function TickerKickoff({ kickoffUtc, startedAtBuild }: { kickoffUtc: string; startedAtBuild: boolean }) {
  const started = useKickedOff(kickoffUtc, startedAtBuild);
  return <span className="gt-tk-k">{started ? "Started · scores in Live" : fmt(kickoffUtc)}</span>;
}
