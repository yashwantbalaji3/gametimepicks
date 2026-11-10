/**
 * Tonight, per sport — the Parlay Center's status block on a night MLB has no games (sport-night-status.ts).
 * Server component: plain text only, nothing reaches the client payload.
 */
import type { SportNightLine } from "@/lib/parlays/sport-night-status";

export default function SportNightStatus({ lines }: { lines: readonly SportNightLine[] }) {
  return (
    <section aria-label="Tonight, by sport" data-sport-night-status="" className="rounded-[10px] px-4 py-3" style={{ border: "1px solid var(--vault-border-strong)" }}>
      <h2 className="font-mono uppercase tracking-[0.12em]" style={{ fontSize: 10, color: "var(--vault-text-faint)", margin: 0 }}>Tonight, by sport</h2>
      <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "grid", gap: 8 }}>
        {lines.map((l) => (
          <li key={l.sport} data-sport={l.sport} data-state={l.state} style={{ fontSize: 13, lineHeight: 1.45, color: "var(--vault-text)" }}>
            <b>{l.label}</b>: {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
