/**
 * THE SPORT CHOOSER — the four hubs, each with one ABSOLUTE fact from the existing owners (#797 PR B).
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
import { getSportIdentity } from "@/lib/sport-identity";

const HUBS = [
  { sport: "nfl", label: "NFL", href: "/nfl/", unit: "game" },
  { sport: "mlb", label: "MLB", href: "/mlb/", unit: "game" },
  { sport: "epl", label: "Premier League", href: "/epl/", unit: "match", identity: "world_cup" },
  { sport: "ufc", label: "UFC", href: "/ufc/", unit: "bout" },
] as const;
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
export const etDayLabel = (isoOrDay: string) => ET_DAY.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoOrDay) ? `${isoOrDay}T12:00:00Z` : isoOrDay));

export default function SportChooser({ label = "Choose a sport" }: { label?: string }) {
  const today = currentEtDate();
  const dataRoot = path.join(process.cwd(), "public", "data");
  const days = buildProductDays(dataRoot, { today });
  const across = crossSportToday(today, buildSportToday(dataRoot, { today, days }));
  return (
    <nav aria-label={label} style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      {HUBS.map((h) => {
        const n = across.bySport.find((x) => x.sport === h.sport)?.eventsToday ?? 0;
        const next = days.find((d) => d.sport === h.sport)?.nextEventUtc ?? null;
        const fact = n > 0 ? `${n} ${h.unit}${n === 1 ? "" : "s"} · ${etDayLabel(today)}`
          : next && Date.parse(next) > Date.now() ? `Next: ${etDayLabel(next)}`
          : "No scheduled events";
        const id = getSportIdentity("identity" in h ? h.identity : h.sport);
        return (
          <Link key={h.sport} href={h.href} className="vault-press" style={{ display: "flex", flexDirection: "column", gap: 4, minHeight: 72, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--vault-border-strong)", background: "var(--gtp-card)", textDecoration: "none" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--vault-text)" }}><span aria-hidden>{id.icon}</span> {h.label}</span>
            <span className="font-mono" style={{ fontSize: 11.5, color: "var(--vault-text-mute)" }}>{fact}</span>
          </Link>
        );
      })}
    </nav>
  );
}
