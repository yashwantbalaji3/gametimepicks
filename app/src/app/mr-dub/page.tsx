/**
 * /mr-dub — Mr. Dub's paper portfolio: the transparent accountability ledger. Shows EVERYTHING the
 * public Bank Builder hides — wins, losses, voids, stopped lanes, restarts, daily P&L, exposure —
 * seeded from the completed $100 → $10,376.17 ladder. Server component; reads the committed mr-dub/
 * JSON. Paper-only educational tracking — not a sportsbook, not financial advice.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import SectionHeader from "@/components/section-header";

export const metadata = {
  title: "Mr. Dub · Paper Portfolio · GameTime Picks",
  description: "Mr. Dub's paper portfolio ledger — full transparent paper performance: bankroll, P/L, wins/losses/voids, stopped lanes and restarts. Educational, paper-only; not financial advice.",
};

function read(rel: string): any {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "mr-dub", rel), "utf8")); } catch { return null; }
}
const usd = (n: number | null | undefined) => n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plColor = (n: number) => n > 0 ? "var(--vault-success)" : n < 0 ? "var(--gtp-bank-heat)" : "var(--vault-text-faint)";

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl px-3 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
      <div className="font-display tracking-tight" style={{ color: accent ?? "var(--vault-text)", fontSize: 19, fontWeight: 800 }}>{value}</div>
      <div className="font-mono uppercase tracking-[0.1em]" style={{ color: "var(--vault-text-faint)", fontSize: 9.5 }}>{label}</div>
      {sub ? <div className="mt-0.5 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>{sub}</div> : null}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  ladder_step_won: "Ladder rung won", ladder_step_settled: "Ladder rung", lane_step_won: "Lane step won",
  lane_stopped: "Lane stopped", lane_step_open: "Lane step open", lane_restarted: "Lane restarted",
};

export default function MrDubPage() {
  const portfolio = read("portfolio.json");
  const ledger = read("ledger.json");
  const daily = read("daily-summary.json");

  if (!portfolio) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-10"><p style={{ color: "var(--vault-text-mute)" }}>Mr. Dub ledger is being generated.</p></main>;
  }
  const events = (ledger?.events ?? []).slice().reverse(); // newest first
  const rec = portfolio.record ?? {};

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pt-8 flex flex-col gap-6">
      {/* Hero */}
      <section className="rounded-2xl px-5 py-5" style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(212,175,55,0.10), rgba(26,16,11,0.4))" }}>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-[22px] font-semibold sm:text-[26px]" style={{ color: "var(--vault-text)" }}>Mr. Dub&rsquo;s Paper Portfolio</h1>
          <span className="rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--vault-gold-bright)", background: "rgba(212,175,55,0.12)", border: "1px solid var(--vault-border)" }}>Paper-only</span>
        </div>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          The transparent paper-performance ledger — every win, loss, void, stopped lane and restart, seeded from the completed $100 → $10,376.17 ladder. No wagers are placed. Educational tracking · not financial advice.
        </p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="Paper bankroll" value={usd(portfolio.currentBankroll)} accent="var(--vault-gold-bright)" sub={`from ${usd(portfolio.startingBankroll)}`} />
          <Tile label="Settled P/L" value={usd(portfolio.settledProfit)} accent={plColor(portfolio.settledProfit)} sub={`ROI ${portfolio.roi}×`} />
          <Tile label="Open exposure" value={usd(portfolio.openExposure)} sub={`${rec.pending ?? 0} open`} />
          <Tile label="Record" value={`${rec.wins ?? 0}–${rec.losses ?? 0}`} sub={`${rec.voids ?? 0} void · ${rec.pending ?? 0} pending`} accent="var(--vault-success)" />
        </div>
        <Link href="/bank-builder" className="mt-3 inline-flex font-mono uppercase tracking-[0.12em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10.5 }}>← Bank Builder shows active paths + the completed ladder</Link>
      </section>

      {/* Active paper cards */}
      <section>
        <SectionHeader eyebrow={`Active paper cards · ${(portfolio.activeCards ?? []).length}`} title="Open & queued lanes" sub="What's live now — Bank Builder shows these; full history is below." />
        <div className="mt-2 flex flex-col gap-2">
          {(portfolio.activeCards ?? []).length === 0 ? <p className="text-[13px]" style={{ color: "var(--vault-text-mute)" }}>No open paper cards right now.</p> :
            (portfolio.activeCards ?? []).map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
                <span className="text-[13px]" style={{ color: "var(--vault-text)" }}>
                  {c.laneId === "lane-a" ? "Lane A" : c.laneId === "lane-b" ? "Lane B" : c.laneId} · {c.status === "queued" ? "fresh $100 restart (queued)" : `Step ${c.step} open`}
                </span>
                <span className="font-mono text-[11.5px]" style={{ color: "var(--vault-text-mute)" }}>{usd(c.stake)}{c.projectedReturn ? ` → ${usd(c.projectedReturn)}` : ""}</span>
              </div>
            ))}
        </div>
      </section>

      {/* Daily ledger */}
      <section>
        <SectionHeader eyebrow={`Daily ledger · ${daily?.days?.length ?? 0} days`} title="Bankroll timeline" sub="Opening → closing paper bankroll, staked, returned, and net P/L per day." />
        <div className="mt-2 overflow-x-auto rounded-xl" style={{ border: "1px solid var(--vault-border)" }}>
          <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--vault-text-faint)" }}>
                {["Date", "Opening", "Staked", "Returned", "Net P/L", "Closing", "W/L/V"].map((h) => <th key={h} className="px-2.5 py-2 text-left font-mono uppercase tracking-wide" style={{ fontSize: 9.5 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(daily?.days ?? []).map((d: any) => (
                <tr key={d.date} style={{ borderTop: "1px solid var(--vault-border)" }}>
                  <td className="px-2.5 py-2" style={{ color: "var(--vault-text)" }}>{d.date}</td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: "var(--vault-text-mute)" }}>{usd(d.opening)}</td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: "var(--vault-text-mute)" }}>{usd(d.staked)}</td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: "var(--vault-text-mute)" }}>{usd(d.returned)}</td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: plColor(d.pl) }}>{d.pl >= 0 ? "+" : ""}{usd(d.pl)}</td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: "var(--vault-text)" }}>{usd(d.closing)}</td>
                  <td className="px-2.5 py-2 font-mono" style={{ color: "var(--vault-text-faint)" }}>{d.wins}/{d.losses}/{d.voids}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Full ledger */}
      <section>
        <SectionHeader eyebrow={`Full ledger · ${events.length} events`} title="Every paper event" sub="Wins, losses, voids, stopped lanes, restarts, and open cards — with official settlement references." />
        <div className="mt-2 flex flex-col gap-2">
          {events.map((e: any) => {
            const won = e.result === "won" || e.result === "win";
            const lost = e.result === "lost";
            const tone = won ? "var(--vault-success)" : lost ? "var(--gtp-bank-heat)" : e.status === "open" || e.status === "queued" ? "var(--vault-gold-bright)" : "var(--vault-text-faint)";
            return (
              <div key={e.eventId} className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)", borderLeft: `2px solid ${tone}` }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>
                    {e.date ?? e.timestamp?.slice(0, 10)} · {TYPE_LABEL[e.type] ?? e.type}{e.step ? ` · Step ${e.step}` : ""}
                  </span>
                  <span className="font-mono text-[11.5px]" style={{ color: tone }}>
                    {e.status === "open" ? `open ${usd(e.paperStake)} → ${usd(e.projectedReturn)}` : e.status === "queued" ? `queued ${usd(e.paperStake)}` : `${(e.paperProfit ?? 0) >= 0 ? "+" : ""}${usd(e.paperProfit)}`}
                  </span>
                </div>
                {e.legs?.length ? (
                  <div className="mt-1 flex flex-col gap-0.5 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
                    {e.legs.map((l: any, i: number) => <span key={i}>· {l.selection}{l.result && l.result !== "win" && l.result !== "settled" ? ` — ${l.result}` : ""}{l.officialResult ? ` (${l.officialResult})` : ""}</span>)}
                  </div>
                ) : null}
                {e.notes ? <div className="mt-1 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>{e.notes}</div> : null}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only educational tracking. No wagers are placed. Mr. Dub is not a sportsbook and this is not financial advice.
        Bank Builder shows active paths and successful completed ladders; Mr. Dub tracks the full paper performance, including stopped lanes and restarts.
      </p>
    </main>
  );
}
