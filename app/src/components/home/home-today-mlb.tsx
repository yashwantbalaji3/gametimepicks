/**
 * HomeTodayMlb — the homepage's daily-MLB destination hook: a compact strip that turns the landing page
 * into a reason to come back every day. It shows today's slate freshness, the current availability
 * (games + simulations ready + last updated), a plain reason to return tomorrow, and one clear path into
 * the /today intelligence brief. Simulation-first, educational, no betting claims.
 *
 * Presentational only: every figure is a factual count passed from the server page (the same shared
 * availability contract that powers /today). It reads no data and fabricates nothing.
 */
import Link from "next/link";
import { formatUpdatedEt } from "@/lib/format";
import { DayAwareSlateChip } from "@/components/day-aware-status-pill";

export default function HomeTodayMlb({
  dateLabel,
  games,
  simulationsReady,
  lastUpdatedIso,
  slateDate,
  seedToday,
  hasGames,
}: {
  dateLabel: string;
  games: number;
  simulationsReady: number;
  lastUpdatedIso: string | null;
  /** The MLB slate's ET date, the build's ET date (SSR seed), and whether the slate has games. */
  slateDate: string | null;
  seedToday: string;
  hasGames: boolean;
}) {
  if (games === 0) return null; // no slate → the liveness banner already frames the page honestly
  // #761 PR 2: an "Updated" stamp always carries its DATE — a bare "7:45 AM ET" read as today's on any later day.
  const updated = lastUpdatedIso ? formatUpdatedEt(lastUpdatedIso) : null;
  const availability = `${games} ${games === 1 ? "game" : "games"} · ${simulationsReady} ${simulationsReady === 1 ? "simulation" : "simulations"} ready${updated ? ` · updated ${updated}` : ""}`;
  return (
    <section aria-label="Today's MLB" className="flex flex-col gap-2.5 rounded-[16px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between" style={{ border: "1px solid var(--vault-border)", background: "color-mix(in srgb, var(--vault-scrim-base) 60%, transparent)", borderLeft: "2px solid var(--vault-gold-bright)" }}>
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", fontSize: 9.5 }}>Today&rsquo;s MLB</span>
          <span className="font-mono" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{dateLabel}</span>
          {/* #761 PR 2: decided on the READER'S day — the build-time comparison said "Live today" all night. */}
          <DayAwareSlateChip slateDate={slateDate} seedToday={seedToday} hasGames={hasGames} />
        </div>
        <span className="font-mono" style={{ color: "var(--vault-text)", fontSize: 12, fontWeight: 600 }}>{availability}</span>
        <span style={{ color: "var(--vault-text-mute)", fontSize: 10.5, lineHeight: 1.3 }}>
          A fresh MLB simulation brief every game day — graded from official box scores.
        </span>
      </div>
      <Link
        href="/today"
        className="vault-press inline-flex w-fit items-center rounded-full px-4 shrink-0"
        style={{ minHeight: 38, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-mono)", letterSpacing: "0.08em", textTransform: "uppercase", textDecoration: "none", background: "var(--gtp-bank-lava-cta)", color: "var(--vault-on-accent-deep)" }}
      >
        Open today&rsquo;s brief →
      </Link>
    </section>
  );
}
