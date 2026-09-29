import type { ProductAvailability } from "@/lib/products/availability";

/* P1 (2026-09-29): the heading said "Today's eligible universe · 2026-09-27" on Sep 29 — the availability
   artifact names the day it evaluated, which is not always the reader's day. The heading now names that day
   in words and never says "today", so a static page cannot present an older evaluation as current. */
const ET_DAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric" });
export function universeDayLabel(date: string | null | undefined): string | null {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return ET_DAY.format(new Date(`${date}T12:00:00Z`));
}

/**
 * "Today's eligible universe" — which sports could contribute a leg to the Play products today, with
 * counts and a plain reason per sport. Server component; renders what the availability owner says and
 * computes nothing. It never prints an internal reason code, and it names the one honest caveat the
 * products carry today: every eligible leg is priced by the market with no forecast behind it.
 */
export default function EligibleUniverse({ availability, compact = false }: { availability: ProductAvailability | null; compact?: boolean }) {
  if (!availability) return null;
  const marketOnly = availability.sports.some((s) => s.eligibleLegs > 0 && s.marketPricedOnly);
  return (
    <section aria-label="Eligible universe" className={`rounded-xl border px-4 ${compact ? "py-3" : "py-4"}`} style={{ borderColor: "var(--vault-border)", background: "var(--vault-panel)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--vault-text-faint)" }}>Eligible universe{universeDayLabel(availability.date) ? ` · evaluated ${universeDayLabel(availability.date)}` : ""}</h2>
        <span className="font-mono text-[10px]" style={{ color: "var(--vault-text-mute)" }}>{availability.totalEligible} eligible leg{availability.totalEligible === 1 ? "" : "s"} across {availability.sports.filter((s) => s.eligibleLegs > 0).length} sport{availability.sports.filter((s) => s.eligibleLegs > 0).length === 1 ? "" : "s"}</span>
      </div>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2" role="list">
        {availability.sports.map((s) => (
          <li key={s.sport} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="font-semibold" style={{ color: s.eligibleLegs > 0 ? "var(--vault-text)" : "var(--vault-text-mute)" }}>{s.label}</span>
            <span className="text-right" style={{ color: "var(--vault-text-mute)" }}>{s.eligibleLegs > 0 ? `${s.eligibleLegs} eligible legs · ${s.events} game${s.events === 1 ? "" : "s"}` : s.reason}</span>
          </li>
        ))}
      </ul>
      {marketOnly ? (
        <p className="mt-2 text-[11px] leading-snug" style={{ color: "var(--vault-text-mute)" }}>
          Every eligible leg on this date is priced by the sportsbook market with no forecast behind it. A card built from these legs is a market construction; its chance of landing is what the prices imply, not a prediction.
        </p>
      ) : null}
      <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--vault-text-faint)" }}>A sport enters only when its model has earned product eligibility. The selector never requires a sport to appear, and a day with no qualifying card publishes no card.</p>
    </section>
  );
}
