/**
 * /mr-dub — Mr. Dub's paper portfolio: the transparent accountability ledger. Order: current standings
 * → Mr. Dub's Dual Bank Builder → daily ledger (expandable to the exact cards/P&L) → full ledger →
 * exposure & bankroll intelligence. Server component; reads committed mr-dub/ JSON. Paper-only
 * educational tracking — not a sportsbook, not financial advice.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import SectionHeader from "@/components/section-header";
import MrDubAvatar from "@/components/mr-dub/mr-dub-avatar";
import MoneyPath from "@/components/ui/money-path";

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

function LegList({ legs }: { legs: any[] }) {
  if (!legs?.length) return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>
      {legs.map((l: any, i: number) => <span key={i}>· {l.selection}{l.result && !["win", "settled", "pending"].includes(l.result) ? ` — ${l.result}` : ""}{l.officialResult ? ` (${l.officialResult})` : ""}</span>)}
    </div>
  );
}

function EventCard({ e }: { e: any }) {
  const won = e.result === "won" || e.result === "win";
  const lost = e.result === "lost";
  const open = e.status === "open" || e.status === "queued";
  const tone = won ? "var(--vault-success)" : lost ? "var(--gtp-bank-heat)" : open ? "var(--vault-gold-bright)" : "var(--vault-text-faint)";
  return (
    <div className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)", borderLeft: `2px solid ${tone}` }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium" style={{ color: "var(--vault-text)" }}>
          {e.date ?? e.timestamp?.slice(0, 10)} · {TYPE_LABEL[e.type] ?? e.type}{e.step ? ` · Step ${e.step}` : ""}
        </span>
        <span className="font-mono text-[11.5px]" style={{ color: tone }}>
          {e.status === "open" ? `open ${usd(e.paperStake)} → ${usd(e.projectedReturn)}` : e.status === "queued" ? `queued ${usd(e.paperStake)}` : `${(e.paperProfit ?? 0) >= 0 ? "+" : ""}${usd(e.paperProfit)}${e.rolled ? " (rolls)" : ""}`}
        </span>
      </div>
      <LegList legs={e.legs} />
      {e.notes ? <div className="mt-1 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>{e.notes}{e.publicBankBuilderVisible === false ? " · hidden from public Bank Builder" : ""}</div> : null}
    </div>
  );
}

export default function MrDubPage() {
  const portfolio = read("portfolio.json");
  const ledger = read("ledger.json");
  const daily = read("daily-summary.json");
  if (!portfolio) {
    return <main className="mx-auto w-full max-w-3xl px-4 py-10"><p style={{ color: "var(--vault-text-mute)" }}>Mr. Dub ledger is being generated.</p></main>;
  }
  const events = (ledger?.events ?? []);
  const rec = portfolio.record ?? {};
  const intel = portfolio.intelligence ?? {};
  // Lane state for the Dual Bank Builder section, derived from the ledger (newest step per lane).
  const laneEvents = (lane: string) => events.filter((e: any) => e.laneId === lane);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-6 sm:pt-8 flex flex-col gap-6">
      {/* 1 — Current standings / portfolio hero */}
      <section className="rounded-2xl px-5 py-5" style={{ border: "1px solid var(--vault-border)", background: "linear-gradient(135deg, rgba(212,175,55,0.10), rgba(26,16,11,0.4))" }}>
        <div className="flex items-center gap-3">
          <MrDubAvatar size={56} />
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold sm:text-[26px]" style={{ color: "var(--vault-text)" }}>Mr. Dub&rsquo;s Paper Portfolio</h1>
            <span className="font-mono uppercase tracking-[0.1em] text-[10px]" style={{ color: "var(--vault-gold-bright)" }}>Paper-only · educational tracking</span>
          </div>
        </div>
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--vault-text-mute)" }}>
          The transparent paper-performance ledger — every win, loss, void, stopped lane and restart, seeded from the completed $100 → $10,376.17 ladder. No wagers are placed. Not financial advice.
        </p>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="Paper bankroll" value={usd(portfolio.currentBankroll)} accent="var(--vault-gold-bright)" sub={`from ${usd(portfolio.startingBankroll)}`} />
          <Tile label="Settled P/L" value={usd(portfolio.settledProfit)} accent={plColor(portfolio.settledProfit)} sub={`ROI ${portfolio.roi}×`} />
          <Tile label="Open exposure" value={usd(portfolio.openExposure)} sub={`${rec.pending ?? 0} open`} />
          <Tile label="Record" value={`${rec.wins ?? 0}–${rec.losses ?? 0}`} sub={`${rec.voids ?? 0} void · ${rec.pending ?? 0} pending`} accent="var(--vault-success)" />
        </div>
      </section>

      {/* 2 — Mr. Dub's Dual Bank Builder (with context the public page hides) */}
      <section>
        <SectionHeader eyebrow="Paper Dual Bank Builder" title="Mr. Dub's two lanes" sub="Full context — including stopped lanes and restarts that the public Bank Builder keeps clean." />
        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {["lane-a", "lane-b"].map((lane) => {
            const evs = laneEvents(lane);
            const open = evs.find((e: any) => e.status === "open");
            const stopped = evs.find((e: any) => e.type === "lane_stopped");
            const restart = evs.find((e: any) => e.type === "lane_restarted");
            const id = lane === "lane-a" ? "A" : "B";
            return (
              <div key={lane} className="rounded-xl p-3.5" style={{ background: "linear-gradient(180deg, rgba(58,18,12,0.4), rgba(20,10,8,0.5))", border: "1px solid var(--vault-border)", borderTop: `2px solid ${open ? "var(--gtp-bank-heat)" : "var(--vault-gold-bright)"}` }}>
                <div className="text-[13px] font-semibold" style={{ color: "var(--vault-text)" }}>Lane {id} · {id === "A" ? "survival" : "diversified"}</div>
                {open ? (
                  <>
                    <div className="mt-2"><MoneyPath stake={open.paperStake} ret={open.projectedReturn} kind="projected" step={open.step} /></div>
                    <div className="mt-1 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>Step {open.step} open · pending official settlement.</div>
                  </>
                ) : stopped ? (
                  <>
                    <div className="mt-2"><MoneyPath stake={restart?.paperStake ?? 100} ret={200} kind="starting" step={1} /></div>
                    <div className="mt-1 text-[11px]" style={{ color: "var(--vault-text-mute)" }}>Step {stopped.step} stopped ({stopped.legs?.find((l: any) => l.result === "lost")?.selection ?? "settled loss"}). Fresh $100 path {restart?.status === "queued" ? "queued for the next card" : "active"}.</div>
                  </>
                ) : (
                  <div className="mt-2 text-[12px]" style={{ color: "var(--vault-text-mute)" }}>No open step.</div>
                )}
              </div>
            );
          })}
        </div>
        <Link href="/bank-builder" className="mt-2 inline-flex font-mono uppercase tracking-[0.1em]" style={{ color: "var(--gtp-bank-heat)", fontSize: 10.5 }}>Public Bank Builder shows active paths + the completed ladder →</Link>
      </section>

      {/* 3 — Daily ledger (expandable) */}
      <section>
        <SectionHeader eyebrow={`Daily ledger · ${daily?.days?.length ?? 0} days`} title="Bankroll timeline" sub="Tap a day to see the exact cards placed and each card's paper P/L." />
        <div className="mt-2 flex flex-col gap-1.5">
          {(daily?.days ?? []).slice().reverse().map((d: any) => (
            <details key={d.date} className="rounded-xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--vault-border)" }}>
              <summary className="flex flex-wrap items-center justify-between gap-2 cursor-pointer px-3.5 py-2.5" style={{ listStyle: "none" }}>
                <span className="text-[12.5px]" style={{ color: "var(--vault-text)" }}>{d.date} · {usd(d.opening)} → {usd(d.closing)}</span>
                <span className="font-mono text-[11.5px]" style={{ color: plColor(d.pl) }}>{d.pl >= 0 ? "+" : ""}{usd(d.pl)} · {d.wins}W/{d.losses}L/{d.voids}V{d.pending ? `/${d.pending}P` : ""} ▾</span>
              </summary>
              <div className="flex flex-col gap-1.5 px-2.5 pb-2.5">
                <div className="font-mono text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>staked {usd(d.staked)} · returned {usd(d.returned)} · net {usd(d.pl)}</div>
                {(d.events ?? []).map((e: any) => <EventCard key={e.eventId} e={e} />)}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* 4 — Full ledger */}
      <section>
        <SectionHeader eyebrow={`Full ledger · ${events.length} events`} title="Every paper event" sub="Newest first — wins, losses, voids, stopped lanes, restarts, and open cards with official settlement references." />
        <div className="mt-2 flex flex-col gap-2">
          {events.slice().reverse().map((e: any) => <EventCard key={e.eventId} e={e} />)}
        </div>
      </section>

      {/* 5 — Exposure & bankroll intelligence */}
      <section>
        <SectionHeader eyebrow="Risk & exposure" title="Bankroll intelligence" sub="Paper exposure, drawdown and bankroll health — educational tracking, not financial advice." />
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile label="High-water mark" value={usd(intel.highWaterMark)} />
          <Tile label="Max drawdown" value={usd(intel.maxDrawdown)} accent={(intel.maxDrawdown ?? 0) > 0 ? "var(--gtp-bank-heat)" : undefined} />
          <Tile label="Win rate" value={intel.winRate != null ? `${Math.round(intel.winRate * 100)}%` : "—"} accent="var(--vault-success)" />
          <Tile label="Open exposure" value={usd(portfolio.openExposure)} />
        </div>
        {intel.exposureBySport && Object.keys(intel.exposureBySport).length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(intel.exposureBySport).map(([sport, amt]: any) => (
              <span key={sport} className="rounded-full px-3 py-1 font-mono text-[11px]" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)" }}>{sport}: {usd(amt)}</span>
            ))}
          </div>
        ) : null}
        {intel.note ? <p className="mt-2 text-[10.5px]" style={{ color: "var(--vault-text-faint)" }}>{intel.note}</p> : null}
      </section>

      <p className="text-[11px] leading-relaxed" style={{ color: "var(--vault-text-faint)" }}>
        Paper-only educational tracking. No wagers are placed. Mr. Dub is not a sportsbook and this is not financial advice.
        Bank Builder shows active paths and successful completed ladders; Mr. Dub tracks the full paper performance, including stopped lanes and restarts.
      </p>
    </main>
  );
}
