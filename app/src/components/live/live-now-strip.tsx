"use client";
/**
 * LIVE NOW — the games being played right now, at the top of Home and of each sport hub (founder UX decision
 * 2026-10-08: live games first, everywhere a visitor starts).
 *
 * Read at view time from the live gateway's list endpoint — the same factual source /live uses — because a static page
 * cannot know which games are live after it was built. Shows ONLY games the gateway reports as in play (LIVE or
 * DELAYED): score, period and clock as the source states them, nothing derived and no live probability. When nothing
 * is live, or live data is off for the sport, or the gateway cannot be read on the first check, it renders nothing — the
 * page's own build-time content stands. If a LATER check fails, the cards already shown stop claiming to be live: each
 * reads "Last known", and the status line says the feed is unavailable and when it was last read. Polls on a slow
 * clock and only while the tab is visible.
 */
import { useEffect, useState } from "react";
import Link from "next/link";

import TeamLogo from "@/components/team-logo";
import { liveReadyFor, liveUrl } from "@/lib/live/client";

type Sport = "nfl" | "mlb";
interface LiveEvent {
  sport: Sport; providerEventId: string; state: string; label: string | null;
  away: { abbr: string; name: string; score: number | null }; home: { abbr: string; name: string; score: number | null };
}

const IN_PLAY = new Set(["LIVE", "DELAYED"]);
const POLL_MS = 60_000;

/** Pure: the gateway list → the in-play games to show (tested). */
export function inPlayEvents(sport: Sport, payload: any): LiveEvent[] {
  const events: any[] = Array.isArray(payload?.events) ? payload.events : [];
  return events
    .filter((e) => IN_PLAY.has(String(e?.state)) && e?.competitors?.home?.abbr && e?.competitors?.away?.abbr && e?.providerEventId)
    .map((e) => ({
      sport, providerEventId: String(e.providerEventId), state: String(e.state), label: e.period?.label ?? e.stateDetail ?? null,
      away: { abbr: e.competitors.away.abbr, name: e.competitors.away.name ?? e.competitors.away.abbr, score: Number.isFinite(e.competitors.away.score) ? e.competitors.away.score : null },
      home: { abbr: e.competitors.home.abbr, name: e.competitors.home.name ?? e.competitors.home.abbr, score: Number.isFinite(e.competitors.home.score) ? e.competitors.home.score : null },
    }));
}

const SPORT_LABEL: Record<Sport, string> = { nfl: "NFL", mlb: "MLB" };

export default function LiveNowStrip({ sports, hrefs }: { sports: Sport[]; hrefs: Record<string, string> }) {
  const enabled = sports.filter((s) => liveReadyFor(s));
  const [games, setGames] = useState<LiveEvent[]>([]);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!enabled.length) return undefined;
    let cancelled = false;
    const read = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      const results = await Promise.all(enabled.map((s) =>
        fetch(liveUrl({ sport: s }), { headers: { accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)).then((p) => (p ? inPlayEvents(s, p) : null)).catch(() => null)));
      if (cancelled) return;
      if (results.some((r) => r === null)) { setStale(true); return; } // unreadable: never invent, never claim "live"
      setGames(results.flatMap((r) => r ?? []));
      setReadAt(Date.now());
      setStale(false);
    };
    read();
    const id = setInterval(read, POLL_MS);
    const onVis = () => { if (document.visibilityState === "visible") read(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled.join(",")]);

  if (!games.length) return null;
  return (
    <section aria-labelledby="live-now-h" data-live-now="" style={{ border: "1px solid var(--vault-border-strong)", borderTop: "2px solid var(--vault-accent)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h2 id="live-now-h" style={{ margin: 0, fontSize: 16, color: "var(--vault-text)", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--vault-accent)", display: "inline-block" }} />
          Live now
        </h2>
        <Link href="/live/" style={{ fontSize: 13, color: "var(--vault-accent)", minHeight: 32, display: "inline-flex", alignItems: "center" }}>Follow every game live →</Link>
      </div>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))" }}>
        {games.map((g) => {
          const href = hrefs[`${g.sport}:${g.providerEventId}`] ?? null;
          return (
            <li key={`${g.sport}-${g.providerEventId}`} style={{ border: "1px solid var(--vault-border)", borderRadius: 10, padding: "10px 12px", display: "grid", gap: 6 }}>
              <p style={{ margin: 0, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>
                {SPORT_LABEL[g.sport]} · {stale ? "last known" : g.state === "DELAYED" ? "delayed" : "live"}{g.label ? ` · ${g.label}` : ""}
              </p>
              {[g.away, g.home].map((t) => (
                <p key={t.abbr} style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--vault-text)" }}>
                  <TeamLogo team={t.abbr} sport={g.sport} size="sm" ariaLabel={`${t.name} logo`} />
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  <b style={{ fontFamily: "var(--font-mono, monospace)", fontVariantNumeric: "tabular-nums", fontSize: 16 }}>{t.score ?? "–"}</b>
                </p>
              ))}
              <p style={{ margin: 0, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
                {href ? <Link href={href} style={{ color: "var(--vault-accent)", minHeight: 32, display: "inline-flex", alignItems: "center" }}>Forecast and live stats →</Link> : null}
                <Link href="/live/" style={{ color: "var(--vault-text-mute)", minHeight: 32, display: "inline-flex", alignItems: "center" }}>On Live →</Link>
              </p>
            </li>
          );
        })}
      </ul>
      <p role="status" data-stale={stale ? "1" : "0"} style={{ margin: "6px 0 0", fontSize: 11, color: stale ? "var(--vault-warn)" : "var(--vault-text-faint)" }}>
        {stale
          ? `Live feed unavailable — scores last read ${readAt ? new Date(readAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "earlier"} and may be out of date.`
          : `Scores from the live feed${readAt ? `, checked ${new Date(readAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}. Forecasts were frozen before kickoff and do not change during the game.`}
      </p>
    </section>
  );
}
