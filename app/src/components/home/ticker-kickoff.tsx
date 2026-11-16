"use client";
/**
 * The ticker card's kickoff line, corrected on the reader's clock (same rule as the game page's KickoffSlot): the first
 * render is the build's answer; once the kickoff passes it reads "Started", and it never rewinds. No score, no feed.
 */
import React from "react";
import { useKickedOff } from "@/components/live/kickoff-aware";

// Built from formatToParts VALUES with ASCII joins (same rule as lib/et-stamp.mjs): Intl's own format() joiner and
// its space before "PM" differ across engines, which would be a hydration mismatch on this server-rendered card.
const ET_WEEKDAY_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true });
const fmt = (iso: string) => {
  const p = Object.fromEntries(ET_WEEKDAY_TIME.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.hour}:${p.minute} ${String(p.dayPeriod ?? "").toUpperCase()} ET`;
};

export default function TickerKickoff({ kickoffUtc, startedAtBuild }: { kickoffUtc: string; startedAtBuild: boolean }) {
  const started = useKickedOff(kickoffUtc, startedAtBuild);
  return <span className="gt-tk-k">{started ? "Started · scores in Live" : fmt(kickoffUtc)}</span>;
}
