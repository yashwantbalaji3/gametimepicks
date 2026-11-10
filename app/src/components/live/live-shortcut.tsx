"use client";
/**
 * LIVE SHORTCUT (founder condition 2, 2026-11-09): Live left the top bars, so every place a visitor starts — Today (/)
 * and the sport hubs Live covers — carries ONE highly visible link to the Live hub, one interaction away.
 *
 * It always renders (a static page cannot know what is live, so the link never depends on a fetch). When the live
 * gateway — the same list endpoint /live and Live Now read — reports games in play for these sports, it turns into
 * the stronger "Live now · N in progress" state. Unreadable, off, or nothing in play: the plain link stands. It never
 * prints a score or a probability; the Live hub does that.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

import { liveReadyFor, liveUrl } from "@/lib/live/client";
import { inPlayEvents } from "./live-now-strip";

type Sport = "nfl" | "mlb";
const POLL_MS = 60_000;
export const LIVE_HREF = "/live/";

/** Pure: the copy for an in-play count (tested). */
export function liveShortcutText(inPlay: number | null): { title: string; sub: string; hot: boolean } {
  return inPlay && inPlay > 0
    ? { title: `Live now · ${inPlay} game${inPlay === 1 ? "" : "s"} in progress`, sub: "Scores as they happen, beside the frozen forecasts", hot: true }
    : { title: "Live scores", sub: "Games in progress, beside the frozen forecasts", hot: false };
}

export default function LiveShortcut({ sports, where }: { sports: Sport[]; where: string }) {
  const enabled = sports.filter((s) => liveReadyFor(s));
  const [inPlay, setInPlay] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled.length) return undefined;
    let cancelled = false;
    const read = async () => {
      if (document.visibilityState === "hidden") return;
      const results = await Promise.all(enabled.map((s) =>
        fetch(liveUrl({ sport: s }), { headers: { accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)).then((p) => (p ? inPlayEvents(s, p).length : null)).catch(() => null)));
      if (!cancelled) setInPlay(results.some((r) => r === null) ? null : results.reduce<number>((a, n) => a + (n ?? 0), 0));
    };
    read();
    const id = setInterval(read, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled.join(",")]);

  const t = liveShortcutText(inPlay);
  return (
    <Link
      href={LIVE_HREF}
      prefetch={false}
      className={`gtp-live-shortcut${t.hot ? " is-hot" : ""}`}
      data-live-shortcut={where}
      data-live-in-play={inPlay ?? undefined}
      aria-label={`${t.title}: open the Live hub`}
    >
      <span className="gtp-live-shortcut-dot" aria-hidden="true" />
      <span className="gtp-live-shortcut-text">
        <b aria-live="polite">{t.title}</b>
        <span>{t.sub}</span>
      </span>
      <span aria-hidden="true" className="gtp-live-shortcut-go">→</span>
    </Link>
  );
}
