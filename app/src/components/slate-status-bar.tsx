/**
 * SlateStatusBar — the global product header strip (under the nav).
 *
 * P208: date, slate phase and settlement freshness ONLY —
 *
 *   Today · Aug 25   |   Pregame slate   |   Settled · Aug 24
 *
 * The bankroll chips that used to sit here moved to their canonical owners
 * (/results, the homepage Recent-results strip, the product pages): a global
 * strip that led with money and navigated to two products was a second,
 * status-shaped nav competing with the real one (founder finding F3).
 * Server component; chips wrap cleanly on mobile.
 */
import Link from "next/link";

import { getOptimizerSettledDates } from "@/lib/parlay-results";
import { currentEtDate } from "@/lib/freshness";
import { currentSlateDate } from "@/lib/parlays/ui-loader";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import SlateStatusChips from "@/components/slate-status-chips";

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
    background: "rgba(11, 18, 14,0.5)",
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

  return (
    <div
      className="gtp-slate-status flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 sm:px-6 py-2"
      style={{ background: "rgba(11, 18, 14, 0.6)", borderBottom: "1px solid var(--vault-border)" }}
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
      {/*
        P208 (founder finding F3): the Paper-record and Peak money chips left this strip. A global
        header carrying two bankroll figures that NAVIGATE (to /mr-dub and /bank-builder) was a
        second, status-shaped navigation competing with the real one — and the first thing every
        page said was money. The figures still render at their canonical owners (/results, the
        homepage Recent-results section, /mr-dub, /bank-builder); the strip is now what a top bar
        is for: date, slate phase, freshness.
      */}
      <Chip href="/results" accent="var(--vault-success)">
        <span style={{ color: "var(--vault-success)" }}>Settled</span>
        <span>· {fmtShort(latestSettled)}</span>
      </Chip>
      {/*
        "Paper-only · educational" was dropped from this bar. DisclaimerBanner states the same thing
        in the layout, directly ABOVE this strip — the two sat about forty pixels apart, so the first
        viewport said "educational" twice before saying anything about tonight's games. The framing
        is not weakened: it is still global, still above every page, and still repeated in context on
        every product surface that makes a claim. This is the same call previous-hits.tsx made when
        it dropped a per-rung "· paper-only tracking" under a page that already opened with it.
      */}
    </div>
  );
}
