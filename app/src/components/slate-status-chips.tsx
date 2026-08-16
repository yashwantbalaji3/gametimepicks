"use client";
/**
 * SlateStatusChips — the two TIME-DEPENDENT chips of the global SlateStatusBar ("Today/Latest slate ·
 * date" + "Pregame / In progress / Completed"). The static export bakes the build clock, so the server
 * bar's labels freeze at deploy time; this client component seeds with the server-computed values (SSR
 * match, no hydration mismatch) then re-derives BOTH from the REAL browser clock after mount — a slate
 * viewed after its games finish reads "Completed — awaiting settlement", never a frozen "Pregame slate".
 * Pure display: kickoffs + settled state come from the server; nothing is fetched or fabricated here.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { currentEtDate } from "@/lib/freshness";

// 90' + halftime + stoppage + extra-time/penalty buffer — mirrors lib/world-cup/round-of-32 (server-only).
const GAME_MS = 2.5 * 60 * 60 * 1000;

function progress(kickoffsMs: number[], nowMs: number): "completed" | "in_progress" | "pregame" | null {
  if (kickoffsMs.length === 0) return null;
  if (kickoffsMs.every((t) => t + GAME_MS <= nowMs)) return "completed";
  const started = kickoffsMs.filter((t) => t <= nowMs).length;
  if (started === 0) return "pregame";
  return started * 2 >= kickoffsMs.length ? "in_progress" : "pregame";
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

const chipCls = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 whitespace-nowrap";
const chipStyle = (accent?: string): React.CSSProperties => ({
  border: `1px solid ${accent ? `color-mix(in srgb, ${accent} 45%, transparent)` : "var(--vault-rule)"}`,
  background: "rgba(11, 18, 14,0.5)",
  color: "var(--vault-text-mute)",
  fontSize: 12,
  textDecoration: "none",
});

export default function SlateStatusChips({
  slateDate,
  serverToday,
  serverNowMs,
  kickoffsMs,
  activeIsSettled,
}: {
  slateDate: string | null;
  serverToday: string;       // build-time ET date (SSR seed)
  serverNowMs: number;       // build-time clock (SSR seed)
  kickoffsMs: number[];      // the slate's deduped kickoff times (server-loaded)
  activeIsSettled: boolean;  // slate ≤ latest officially graded date (not clock-dependent)
}) {
  const [nowMs, setNowMs] = useState(serverNowMs);
  const [today, setToday] = useState(serverToday);
  useEffect(() => {
    setNowMs(Date.now());
    setToday(currentEtDate());
  }, []);

  const shown = slateDate ?? today;
  const slateIsCurrent = shown === today;
  const p = activeIsSettled ? null : progress(kickoffsMs, nowMs);
  const label = activeIsSettled ? "Slate settled"
    : p === "completed" ? "Completed — awaiting settlement"
    : p === "in_progress" ? "Slate in progress"
    : "Pregame slate";
  const dot = activeIsSettled ? "var(--vault-success)"
    : p === "completed" ? "var(--vault-text-faint)"
    : p === "in_progress" ? "var(--gtp-bank-heat)"
    : "var(--vault-gold-bright)";

  return (
    <>
      <Link href="/today" className={`${chipCls} vault-press`} style={chipStyle()}>
        <span style={{ color: "var(--vault-text)" }}>{slateIsCurrent ? "Today" : "Latest slate"}</span>
        <span>· {fmtShort(shown)}</span>
      </Link>
      <span className={chipCls} style={chipStyle(p === "in_progress" ? "var(--gtp-bank-heat)" : "var(--vault-gold-bright)")}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: dot }} />
        <span style={{ color: dot }}>{label}</span>
      </span>
    </>
  );
}
