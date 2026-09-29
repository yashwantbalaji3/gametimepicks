/**
 * SlateStatusBar — the global product header strip (under the nav).
 *
 * P208: date, the day's status and settlement freshness ONLY —
 *
 *   Today · Sep 28 · 1 event   |   ● Games under way →   |   Settled · Sep 27
 *
 * #794 PR 2 (2026-09-28): the day chip is cross-sport (lib/product-day crossSportToday). It used to be
 * an MLB-optimizer slate date plus a phase computed from the RETIRED World Cup projections, which read
 * "Pregame slate" on every page, always.
 *
 * The bankroll chips that used to sit here moved to their canonical owners
 * (/results, the homepage Recent-results strip, the product pages): a global
 * strip that led with money and navigated to two products was a second,
 * status-shaped nav competing with the real one (founder finding F3).
 * Server component; one row on a phone (scrolls, never wraps into a second row of chrome).
 */
import Link from "next/link";

import { getOptimizerSettledDates } from "@/lib/parlay-results";
import { currentEtDate } from "@/lib/freshness";
import path from "node:path";

import { buildSportToday, crossSportToday, type CrossSportToday } from "@/lib/product-day/product-day";
import SlateStatusChips from "@/components/slate-status-chips";

/* The bar renders in the layout, so it runs for every exported page; the day's answer is computed once
   per ET day per build worker, not ~1,500 times. */
const dayCache = new Map<string, CrossSportToday>();
function todayAcrossFor(today: string): CrossSportToday {
  let v = dayCache.get(today);
  if (!v) { v = crossSportToday(today, buildSportToday(path.join(process.cwd(), "public", "data"), { today })); dayCache.set(today, v); }
  return v;
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
    background: "color-mix(in srgb, var(--vault-scrim-base) 50%, transparent)",
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
  // The day chip speaks for the WHOLE day, cross-sport (lib/product-day crossSportToday) — never one
  // product's slate. Settled freshness still comes from the officially graded record.
  const realToday = currentEtDate();
  const day = todayAcrossFor(realToday);
  // SPRINT 051: settled means DECIDED, not "a graded file exists". On 2026-07-28 the settlement gate
  // refused the slate, the snapshot was written with every leg pending, and this bar told every
  // visitor "Slate settled · Jul 28". See getOptimizerSettledDates.
  const gradedDates = getOptimizerSettledDates();
  const latestSettled = gradedDates.length ? [...gradedDates].sort().slice(-1)[0] : null;

  return (
    <div
      className="gtp-slate-status flex flex-nowrap sm:flex-wrap items-center gap-x-2 gap-y-1.5 px-4 sm:px-6 py-2 overflow-x-auto"
      style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 60%, transparent)", borderBottom: "1px solid var(--vault-border)" }}
    >
      {/* Time-dependent chips — client component; re-derives the date and "under way" from the REAL
          browser clock after hydration. One row on a phone (it scrolls rather than wrapping). */}
      <SlateStatusChips
        countsFor={day.today}
        serverToday={realToday}
        serverNowMs={Date.now()}
        state={day.state}
        eventsToday={day.eventsToday}
        startsMs={day.startsUtc.map((x) => Date.parse(x))}
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
