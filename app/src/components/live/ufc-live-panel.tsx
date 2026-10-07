"use client";

/**
 * /ufc LIVE PANEL — bout state on fight night, beside the frozen card. Client-only, read-only.
 *
 * Renders nothing unless the build enabled UFC Live (`liveReadyFor("ufc")`) AND the reader's clock is
 * inside the card's window (30 minutes before the first bout to 6 hours after the last). Inside it,
 * one scoreboard call for the card's ET date every minute, stopped once every bout the feed lists is
 * final or cancelled. The words are the join's (`ufc-live-card.mjs`): Upcoming, Round N · clock,
 * Final, Cancelled or Unavailable — never a method, never a guess. The forecasts on the card below
 * were made before the card and do not change here; Results records the official outcome.
 */
import { useEffect, useState } from "react";

import { etDateOf, liveReadyFor, liveUrl } from "@/lib/live/client";
import { formatUpdatedEt } from "@/lib/format";
import {
  UFC_LIVE_STATUS,
  UFC_POLL_MS,
  joinUfcCard,
  ufcKeepPolling,
  ufcLiveWindow,
  ufcStatusText,
} from "@/lib/live/ufc-live-card.mjs";

export type UfcLiveBout = {
  boutId: string;
  startUtc?: string;
  red: { name: string; athleteId?: string | null };
  blue: { name: string; athleteId?: string | null };
};

type Row = { boutId: string | null; status: string; round: number | null; clock: string | null; winnerName: string | null; why: string | null };
type Joined = { feedOk: boolean; fetchedAt: string | null; rows: Row[] };

const MONO = "var(--font-mono)";

export default function UfcLivePanel({ cardStartUtc, bouts }: { cardStartUtc?: string; bouts: UfcLiveBout[] }) {
  const enabled = liveReadyFor("ufc");
  const date = etDateOf(cardStartUtc ?? bouts[0]?.startUtc);
  const [now, setNow] = useState<number | null>(null);
  const [joined, setJoined] = useState<Joined | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  // The window is judged on the READER's clock, after hydration — never at build time.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), UFC_POLL_MS);
    return () => clearInterval(id);
  }, []);

  const phase = now === null ? null : ufcLiveWindow(bouts, now);
  const open = enabled && Boolean(date) && phase === "OPEN";
  const done = joined !== null && !ufcKeepPolling(joined);

  useEffect(() => {
    if (!open || done || !date) return;
    let cancelled = false;
    const controller = new AbortController();
    const poll = async () => {
      let body: unknown = null;
      try {
        const res = await fetch(liveUrl({ sport: "ufc", date }), { signal: controller.signal, headers: { accept: "application/json" } });
        body = await res.json();
      } catch {
        body = null;
      }
      if (cancelled) return;
      setJoined(joinUfcCard(bouts, body, date) as Joined);
      setCheckedAt(new Date().toISOString());
    };
    poll();
    const id = setInterval(poll, UFC_POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(id);
    };
  }, [open, done, date, bouts]);

  if (!open) return null;

  const rows = joined?.rows ?? [];
  const byId = new Map(rows.map((r) => [r.boutId, r]));
  const feedLine = !joined
    ? "Checking live bout status…"
    : !joined.feedOk
      ? "Live bout status is unavailable right now. Checking again every minute."
      : done
        ? `Every bout on the feed is final · last checked ${formatUpdatedEt(checkedAt)}`
        : `Feed checked ${formatUpdatedEt(joined.fetchedAt ?? checkedAt)} · checking every minute`;

  return (
    <section aria-label="Live bout status" className="rounded-[12px] px-3 py-2.5" style={{ border: "1px solid var(--vault-rule)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--vault-text)", margin: 0 }}>Live bout status</h3>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--vault-text-faint)" }} aria-live="polite">{feedLine}</span>
      </div>
      <ul className="mt-2 flex flex-col gap-1" style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
        {bouts.map((b) => {
          const row = byId.get(b.boutId);
          const status = row?.status ?? UFC_LIVE_STATUS.UNAVAILABLE;
          const text = joined ? ufcStatusText(row) : "…";
          return (
            <li key={b.boutId} className="flex flex-wrap items-baseline justify-between gap-x-3" style={{ fontSize: 12.5 }}>
              <span style={{ color: "var(--vault-text)" }}>{b.red.name} vs {b.blue.name}</span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: status === UFC_LIVE_STATUS.IN_ROUND ? "var(--gtp-bank-heat)" : "var(--vault-text-mute)",
                }}
              >
                {text}
              </span>
            </li>
          );
        })}
      </ul>
      <p style={{ fontSize: 11, color: "var(--vault-text-faint)", margin: "8px 0 0", lineHeight: 1.5 }}>
        Round and clock come from ESPN&apos;s public scoreboard; it does not say how a fight ended, so no method is shown.
        A final here is provisional: the official result is what Results records after the card. The forecasts below
        were made before the card and do not change.
      </p>
    </section>
  );
}
