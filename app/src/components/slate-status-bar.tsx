/**
 * SlateStatusBar — the global product header strip (under the nav).
 *
 * June-12 rebrand: the old version read like internal metadata ("today
 * 2026-06-12 · active slate · bank $100 paper · EDUCATIONAL · PAPER ONLY")
 * and showed a stale hardcoded $100 bank label. It is now a row of polished,
 * clickable chips in plain English:
 *
 *   Today · Jun 13   |   Pregame slate   |   Bank Builder $3,623.97 · Step 5 · 4–0   |   Settled Jun 12
 *
 * Every value is read from the SAME public loaders the rest of the app uses —
 * the Bank Builder chip shows the REAL current public bankroll/step/record
 * (never the $100 ladder base), and the responsible-use disclosure stays, in
 * sentence case. Server component; chips wrap cleanly on mobile.
 */
import fs from "node:fs";
import path from "node:path";
import Link from "next/link";

import { getOptimizerSettledDates } from "@/lib/parlay-results";
import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { loadPublicBankBuilderSummary } from "@/lib/data-bank-builder";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import SlateStatusChips from "@/components/slate-status-chips";

/**
 * Active paper bankroll (Mr. Dub portfolio) — the LIVE figure, distinct from the completed crown
 * ladder. Read straight from the committed artifact (server component, build-time). Fail-closed.
 */
function loadActiveBankroll(): { active: number; crown: number; wins: number; losses: number } | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "mr-dub", "portfolio.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8")) as {
      currentBankroll?: number; crownBankroll?: number; record?: { wins?: number; losses?: number };
    };
    if (typeof j.currentBankroll !== "number") return null;
    return {
      active: j.currentBankroll,
      crown: typeof j.crownBankroll === "number" ? j.crownBankroll : j.currentBankroll,
      wins: j.record?.wins ?? 0,
      losses: j.record?.losses ?? 0,
    };
  } catch {
    return null;
  }
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * The current slate's deduped kickoff times (ms), from the World Cup projections artifact. The TIME
 * judgement (pregame / in progress / completed) now lives in the CLIENT chips component so it tracks
 * the real browser clock instead of the frozen build clock — this server helper only loads the data.
 */
function slateKickoffsMs(slateDate: string | null): number[] {
  if (!slateDate) return [];
  const proj = loadWorldCupProjections();
  if (!proj || proj.date !== slateDate) return [];
  // Dedupe to one kickoff per match (the projections artifact has many market rows per match).
  const kickoffByMatch = new Map<number, number>();
  for (const m of proj.matches ?? []) {
    if (!m.kickoffUtc) continue;
    const t = Date.parse(m.kickoffUtc);
    if (Number.isNaN(t)) continue;
    if (!kickoffByMatch.has(m.matchId)) kickoffByMatch.set(m.matchId, t);
  }
  return [...kickoffByMatch.values()];
}

function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function Chip({
  href,
  children,
  accent,
}: {
  href?: string;
  children: React.ReactNode;
  accent?: string;
}) {
  const style: React.CSSProperties = {
    border: `1px solid ${accent ? `color-mix(in srgb, ${accent} 45%, transparent)` : "var(--vault-rule)"}`,
    background: "rgba(26, 16, 11,0.5)",
    color: "var(--vault-text-mute)",
    fontSize: 12,
    textDecoration: "none",
  };
  const cls = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 whitespace-nowrap";
  return href ? (
    <Link href={href} className={`${cls} vault-press`} style={style}>
      {children}
    </Link>
  ) : (
    <span className={cls} style={style}>{children}</span>
  );
}

export default function SlateStatusBar() {
  // The chip reflects the slate the product is presenting (the latest generated slate), not the bare
  // wall clock — when no fresh slate has been generated for the real calendar date yet, show the
  // latest available slate's date labeled "Latest slate" rather than asserting a "Today" with no data.
  const slateDate = currentSlateDate();
  const realToday = currentEtDate();
  // SPRINT 051: settled means DECIDED, not "a graded file exists". On 2026-07-28 the settlement gate
  // refused the slate, the snapshot was written with every leg pending, and this bar told every
  // visitor "Slate settled · Jul 28". See getOptimizerSettledDates.
  const gradedDates = getOptimizerSettledDates();
  const latestSettled = gradedDates.length ? [...gradedDates].sort().slice(-1)[0] : null;
  // The current slate is "settled" only when it is on or before the latest officially-graded slate.
  // A freshly-pulled pregame slate (its date is after the last settled date) reads "Pregame slate" —
  // not "settled" — even if the optimizer's last snapshot is an older graded day. The pregame /
  // in-progress / completed judgement itself lives in the CLIENT chips (real browser clock).
  const activeIsSettled = !!latestSettled && !!slateDate && slateDate <= latestSettled;
  const kickoffsMs = slateKickoffsMs(slateDate);
  const bank = loadPublicBankBuilderSummary();
  // Active = the live Mr. Dub paper bankroll; Crown = the completed $100→$10K proof ladder. These are
  // two different numbers and were previously shown as one ambiguous chip — surface both, clearly labeled.
  const portfolio = loadActiveBankroll();
  const crownAmount = portfolio?.crown ?? (bank ? bank.currentBankrollUnits : null);
  const crownRecord = bank ? `${bank.record.wins}–${bank.record.losses}` : null;

  return (
    <div
      className="gtp-slate-status flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 sm:px-6 py-2"
      style={{ background: "rgba(26, 16, 11, 0.6)", borderBottom: "1px solid var(--vault-border)" }}
    >
      {/* Time-dependent chips — client component; re-derives "Today/Latest" + pregame/in-progress/
          completed from the REAL browser clock after hydration (the frozen-build-clock fix). */}
      <SlateStatusChips
        slateDate={slateDate}
        serverToday={realToday}
        serverNowMs={Date.now()}
        kickoffsMs={kickoffsMs}
        activeIsSettled={activeIsSettled}
      />
      {portfolio ? (
        // Lead with WHAT it is (a paper track record), not a headline dollar figure — the dollar is muted so the
        // strip never reads as a profit claim before the paper/educational context lands. Numbers unchanged.
        <Chip href="/mr-dub" accent="var(--vault-text-mute)">
          <span aria-hidden>🏦</span>
          <span style={{ color: "var(--vault-text-faint)" }}>Paper record</span>
          <span style={{ fontWeight: 600 }}>{portfolio.wins}–{portfolio.losses}</span>
          <span style={{ color: "var(--vault-text-faint)" }}>· {usd(portfolio.active)} paper</span>
        </Chip>
      ) : null}
      {crownAmount != null ? (
        <Chip href="/bank-builder" accent="var(--vault-gold)">
          <span aria-hidden>👑</span>
          <span style={{ color: "var(--vault-text-faint)" }}>Peak</span>
          <span style={{ color: "var(--vault-gold)", fontWeight: 600 }}>{usd(crownAmount)}</span>
          {crownRecord ? <span>· {crownRecord}</span> : null}
        </Chip>
      ) : null}
      <Chip href="/results" accent="var(--vault-success)">
        <span style={{ color: "var(--vault-success)" }}>Settled</span>
        <span>· {fmtShort(latestSettled)}</span>
      </Chip>
      <span className="ml-auto hidden sm:inline" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
        Paper-only · educational
      </span>
    </div>
  );
}
