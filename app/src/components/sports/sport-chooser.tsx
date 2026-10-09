/**
 * THE SPORT CHOOSER — every hub in the sport catalog, each with one ABSOLUTE fact from the existing owners (#797 PR B).
 *
 * UX-001 phase 2 (2026-10-09): the hubs come from lib/sports/catalog.ts (sport first — Football, Basketball, Baseball,
 * Soccer, MMA — then the competition), so NBA and Ligue 1 are no longer missing. Competitions the product day does not
 * cover (NBA, Ligue 1) show their coverage note — what the page is — and never a count.
 *
 * Server component, build time. Used where a reader needs to pick a sport: /sports (the "Sports"
 * primary) and /live on a day with nothing to follow. Each fact is a dated count (cross-sport owner) or
 * the next dated event (product day) — never "today" or "live", which a static page would carry past
 * its day.
 */
import path from "node:path";
import Link from "next/link";

import { buildProductDays, buildSportToday, crossSportToday } from "@/lib/product-day/product-day";
import { currentEtDate } from "@/lib/freshness";
import { COMPETITIONS } from "@/lib/sports/catalog";

/** The competitions the product day counts, and the word for one event. */
const UNIT: Record<string, string> = { nfl: "game", mlb: "game", epl: "match", ufc: "bout" };
import { etDayLabel as sharedDayLabel } from "@/lib/et-stamp.mjs";
/* P1-C: the one shared day format (lib/et-stamp.mjs). Re-exported for /live, which imports it from here. */
export const etDayLabel = (isoOrDay: string): string => sharedDayLabel(isoOrDay) ?? isoOrDay;

export default function SportChooser({ label = "Choose a sport" }: { label?: string }) {
  const today = currentEtDate();
  const dataRoot = path.join(process.cwd(), "public", "data");
  const days = buildProductDays(dataRoot, { today });
  const across = crossSportToday(today, buildSportToday(dataRoot, { today, days }));
  return (
    <nav aria-label={label} style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {COMPETITIONS.map((h) => {
        const unit = UNIT[h.key];
        const n = unit ? across.bySport.find((x) => x.sport === h.key)?.eventsToday ?? 0 : 0;
        const day = unit ? days.find((d) => d.sport === h.key) : undefined;
        const next = day?.nextEventUtc ?? null;
        /* #797 PR D: the fallback said "No scheduled events" — an absence the product day cannot prove (EPL had
           fixtures ahead with no current forecast yet). With no dated fact, the tile claims nothing. */
        const upcomingDay = day?.state === "EVENT_UPCOMING" && day.productDate > today ? day.productDate : null;
        const fact = n > 0 ? `${n} ${unit}${n === 1 ? "" : "s"} · ${etDayLabel(today)}`
          : next && Date.parse(next) > Date.now() ? `Next: ${etDayLabel(next)}`
          : upcomingDay ? `Next: ${etDayLabel(upcomingDay)}`
          : unit ? "Schedule and results" : h.note;
        return (
          <Link key={h.key} href={`${h.href}/`} className="vault-press" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 72, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--vault-border-strong)", background: "var(--gtp-card)", textDecoration: "none" }}>
            <span className="font-mono uppercase" style={{ fontSize: 10.5, letterSpacing: "0.08em", color: "var(--vault-text-mute)" }}>{h.sport.label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--vault-text)" }}><span aria-hidden>{h.sport.glyph}</span> {h.label}</span>
            <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>{fact}</span>
          </Link>
        );
      })}
    </nav>
  );
}
