"use client";
/**
 * SlateStatusChips — the time-dependent part of the global SlateStatusBar.
 *
 * 2026-09-28 (#794 PR 2): the phase chip used to read the RETIRED World Cup projections for its kickoffs
 * and the MLB optimizer's slate date, so with no World Cup match it always fell back to its "pregame" label —
 * on every page, during a live NFL game, on a day with no MLB. It now speaks for the whole day, from the
 * cross-sport owner (lib/product-day crossSportToday, each sport's schedule):
 *
 *   Today · Sep 28 · 1 event        — the count only when the day's schedules are known
 *   ● Games under way →  (/live)    — only while a kickoff has passed and its game window is open
 *
 * The static export bakes the build clock, so this seeds from the server's values (the server render
 * and the first client render agree) and re-derives from the real browser clock after mount. A count
 * is shown only for the day it was computed for; a page viewed on a later day shows the date alone.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { currentEtDate } from "@/lib/freshness";

/** A generous game window: NFL ~3h15, MLB ~3h, EPL ~2h, a UFC card longer — past it, a start is over. */
const GAME_MS = 3.5 * 60 * 60 * 1000;

export function underWay(startsMs: number[], nowMs: number): boolean {
  return startsMs.some((t) => t <= nowMs && nowMs < t + GAME_MS);
}

export function dayChipText(o: { today: string; countsFor: string; state: "EVENTS" | "NO_EVENTS" | "UNKNOWN"; eventsToday: number }): string {
  const date = fmtShort(o.today);
  if (o.today !== o.countsFor) return `Today · ${date}`;
  if (o.state === "EVENTS") return `Today · ${date} · ${o.eventsToday} event${o.eventsToday === 1 ? "" : "s"}`;
  if (o.state === "NO_EVENTS") return `Today · ${date} · no games`;
  return `Today · ${date}`;
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const chipCls = "inline-flex items-center gap-1.5 rounded-full px-2.5 sm:px-3 py-1 whitespace-nowrap shrink-0";
const chipStyle = (accent?: string): React.CSSProperties => ({
  border: `1px solid ${accent ? `color-mix(in srgb, ${accent} 45%, transparent)` : "var(--vault-rule)"}`,
  background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)",
  color: "var(--vault-text-mute)",
  fontSize: 12,
  textDecoration: "none",
});

export default function SlateStatusChips({
  countsFor,
  serverToday,
  serverNowMs,
  state,
  eventsToday,
  startsMs,
}: {
  countsFor: string;        // the ET day the counts below were computed for (build day)
  serverToday: string;      // build-time ET date (SSR seed)
  serverNowMs: number;      // build-time clock (SSR seed)
  state: "EVENTS" | "NO_EVENTS" | "UNKNOWN";
  eventsToday: number;
  startsMs: number[];       // today's event starts across sports (server-loaded)
}) {
  const [nowMs, setNowMs] = useState(serverNowMs);
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    setNowMs(Date.now());
    setToday(currentEtDate());
  }, []);

  const live = underWay(startsMs, nowMs);
  return (
    <>
      <Link href="/today" className={`${chipCls} vault-press`} style={chipStyle()}>
        <span style={{ color: "var(--vault-text)" }}>{dayChipText({ today, countsFor, state, eventsToday })}</span>
      </Link>
      {live ? (
        <Link href="/live" className={`${chipCls} vault-press`} style={chipStyle("var(--gtp-bank-heat)")}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "var(--gtp-bank-heat)" }} />
          <span style={{ color: "var(--vault-text)" }}>Games under way</span>
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </>
  );
}
