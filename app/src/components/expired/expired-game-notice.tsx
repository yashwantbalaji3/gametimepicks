"use client";
/**
 * The 404 page's notice for an expired MLB game report or UFC bout link (expired-games.mjs). Renders nothing on the
 * server and nothing for any other missing path, so every other 404 is unchanged. Figures are the recorded final and
 * the graded rows, verbatim; a link the records do not hold gets the plain expiry note and the results link.
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { MLB_MARKET_WORDS, OUTCOME_WORDS, expiredGameFor, loadExpiredGames } from "./expired-games.mjs";

type Notice = ReturnType<typeof expiredGameFor>;

const dayLabel = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
const pct = (p: number) => `${Math.round(p * 1000) / 10}%`;
const linkCls = "gtp-hit-44 inline-flex items-center rounded-full px-4 text-[13px] font-semibold no-underline";

export default function ExpiredGameNotice() {
  const [n, setN] = useState<Notice>(null);
  useEffect(() => {
    const path = window.location.pathname;
    // only an MLB game report or UFC bout path fetches the index; until it arrives (or if it cannot), the plain note shows
    const plain = expiredGameFor(path, null);
    if (!plain) return;
    setN(plain);
    let live = true;
    loadExpiredGames().then((idx) => { if (live && idx) setN(expiredGameFor(path, idx)); });
    return () => { live = false; };
  }, []);
  if (!n) return null;
  const mlb = n.sport === "mlb";
  const title = n.kind !== "KNOWN" ? (mlb ? "MLB game report no longer available" : "UFC bout report no longer available")
    : mlb ? `MLB · ${n.matchup} · ${dayLabel(n.date!)}` : `UFC · ${n.red} vs ${n.blue} · ${dayLabel(n.date!)}`;
  return (
    <section aria-labelledby="expired-game-h" data-expired-game={`${n.sport}:${n.kind}`} className="mt-6 max-w-2xl rounded-[12px] px-4 py-3.5 flex flex-col gap-2"
      style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)" }}>
      <h2 id="expired-game-h" className="m-0 font-display text-[16px] font-bold" style={{ color: "var(--vault-text)" }}>{title}</h2>
      <p className="m-0 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
        {mlb ? "Game reports and their simulations are shown for the current day only." : "Bout reports are shown for the current card only."}{" "}
        The result and how the published forecast did are kept in the results record.
      </p>
      {n.kind === "KNOWN" && mlb ? (() => {
        const [away, home] = String(n.matchup).split(" @ ");
        const picks = (n.picks ?? []) as [string, string, number, string][];
        return (
          <>
            <p className="m-0 text-[14px] font-semibold" style={{ color: "var(--vault-text)" }} data-expired-final="">Final: {away} {n.awayRuns} – {n.homeRuns} {home}</p>
            {picks.length ? (
              <ul className="m-0 pl-4 text-[13px] leading-relaxed" style={{ color: "var(--vault-text-mute)" }}>
                {picks.map(([market, pick, p, outcome], i) => (
                  <li key={i}>{MLB_MARKET_WORDS[market as keyof typeof MLB_MARKET_WORDS]}: forecast {pick} ({pct(p)}) · {OUTCOME_WORDS[outcome as keyof typeof OUTCOME_WORDS] ?? outcome.toLowerCase()}</li>
                ))}
              </ul>
            ) : <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No graded forecast for this game.</p>}
          </>
        );
      })() : null}
      {n.kind === "KNOWN" && !mlb ? (
        <>
          <p className="m-0 text-[14px] font-semibold" style={{ color: "var(--vault-text)" }} data-expired-final="">
            {n.winner ? `Result: ${n.winner} won` : "Result: no winner recorded (draw or no contest)"}{n.card ? ` · ${n.card}` : ""}
          </p>
          <p className="m-0 text-[13px]" style={{ color: "var(--vault-text-mute)" }}>
            {n.predicted && typeof n.probability === "number"
              ? <>The forecast favoured {n.predicted} ({pct(n.probability)}){n.hit === true ? " — right." : n.hit === false ? " — wrong." : "."}</>
              : "No graded winner forecast for this bout."}
          </p>
        </>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href={n.resultsHref} className={linkCls} style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>{mlb ? "MLB results →" : "UFC results →"}</Link>
        <Link href={mlb ? "/mlb/" : "/ufc/"} className={linkCls} style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text)" }}>{mlb ? "Today's MLB games →" : "Current UFC card →"}</Link>
      </div>
    </section>
  );
}
