/**
 * GameTimeBrief (P311) — what changed, and your own layer. Server component; every line arrives from
 * lib/command-center/changes.ts (real previous states only) and the client layer reads the reader's browser.
 * No "best bets", no invented change: a day with nothing to report says so in one line.
 */
import Link from "next/link";
import type { ChangeLog } from "@/lib/command-center/changes";
import YourBrief from "./your-brief";

const etTime = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) + " ET" : null);

export default function GameTimeBrief({ changes }: { changes: ChangeLog }) {
  const modelLines = changes.modelStates.slice(0, 4);
  const moveLines = changes.forecastMoves.slice(0, 6);
  const quiet = !modelLines.length && !moveLines.length;
  return (
    <section aria-labelledby="gt-brief-h" className="flex flex-col gap-2.5 rounded-[14px] px-4 py-3.5" style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)" }}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 id="gt-brief-h" className="font-mono uppercase tracking-[0.14em] m-0" style={{ color: "var(--vault-gold)", fontSize: 11 }}>What changed</h2>
        <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>
          {changes.snapshotWindow.first && changes.snapshotWindow.latest ? `MLB forecasts compared ${etTime(changes.snapshotWindow.first)} → ${etTime(changes.snapshotWindow.latest)} · ${changes.snapshotWindow.games} games` : "no earlier forecast snapshot today to compare"}
        </span>
      </div>
      {quiet ? (
        <p className="m-0 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>No model changed state this week and no forecast moved by 5 points or more since the first run today. Quiet is a real answer.</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
          {modelLines.map((c) => (
            <li key={`${c.id}-${c.at}`} className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>model · {c.sport.toUpperCase()} </span>
              {c.line} <Link href="/models/" className="font-mono" style={{ color: "var(--vault-gold-bright)", fontSize: 10 }}>why →</Link>
            </li>
          ))}
          {moveLines.map((m) => (
            <li key={`${m.gamePk}-${m.kind}`} className="text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
              <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 8.5 }}>forecast · MLB </span>
              {m.slug ? <Link href={`/games/mlb/${m.slug}/`} style={{ color: "var(--vault-text)", textDecoration: "none" }}>{m.line}</Link> : m.line}
            </li>
          ))}
        </ul>
      )}
      <YourBrief />
    </section>
  );
}
