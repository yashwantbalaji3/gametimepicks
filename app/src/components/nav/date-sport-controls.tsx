"use client";

/**
 * DATE + SPORT CONTROLS — one family, rendered over the canonical URL owner.
 *
 * P216 shipped the owner (`lib/nav/date-sport-route`) and migrated six hand-built date links to it,
 * but the CONTROLS stayed where they were: /simulate had its own prev/next/picker written inline,
 * and every other date- or sport-capable surface had none at all. An owner nothing renders is a
 * contract with one consumer.
 *
 * Three properties this family exists to hold, none of which a per-surface implementation can be
 * relied on to keep:
 *
 *   · IT ASKS, IT DOES NOT BUILD. Every destination comes from `surfaceHref`. When the owner
 *     returns null — a today-only surface asked for another day — the control renders a disabled
 *     state saying so, rather than a link to a page that does not exist.
 *
 *   · THE URL IS THE AUTHORITY. Sport lives in `?sport=`, and the component reads it back from the
 *     address bar on mount and on popstate. Local state alone would survive neither a refresh, a
 *     shared link, nor the back button — which is the whole point of putting it in the URL.
 *
 *   · IT SHOWS WHAT IT HAS. Sport chips are derived from the inventory passed in, with counts, so a
 *     chip never advertises a sport with nothing behind it on the selected day.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { surfaceHref, supportsDate, supportsSport, type Surface } from "@/lib/nav/date-sport-route";

/** One selectable sport, with however many events the surface actually has for the selected day. */
export interface SportOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  /** Sport glyph. Decorative — the label is always printed beside it, never replaced by it. */
  readonly icon?: string | null;
  /** Shown instead of a count when the sport has a typed reason for being empty. */
  readonly emptyReason?: string | null;
}

export interface DateSportControlsProps {
  readonly surface: Surface;
  /** Selected day, YYYY-MM-DD. */
  readonly date: string;
  /** The surface's default day — today, or the newest settled date for Results. */
  readonly defaultDate: string;
  /** Days this surface has a page for, ascending. Empty disables the picker honestly. */
  readonly availableDates?: readonly string[];
  readonly sports?: readonly SportOption[];
  /**
   * The OWNER'S total for the selected day. Passed in rather than summed here: a surface that
   * computes its own count is a second opinion about the day, which is the class of defect the
   * cross-surface contract exists to prevent. Falls back to the sum only when a caller has no
   * owner-supplied total to give.
   */
  readonly totalCount?: number | null;
  /** Extra context — "Week 4", "Matchweek 2", "UFC Fight Night" — beside the date, never instead. */
  readonly context?: string | null;
  readonly labelledBy?: string;
  /** The surface's own accessible name for the date nav. Defaults to "Date". */
  readonly navLabel?: string;
}

/** "Wed, Aug 27" — formatted at UTC noon so the calendar date cannot slip a day in any timezone. */
function fmtDay(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

const PILL: React.CSSProperties = {
  minHeight: 40,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  fontSize: 12.5,
  textDecoration: "none",
};

/**
 * The Suspense boundary lives HERE, not in each caller.
 *
 * `useSearchParams` opts a route into client-side bailout, and this export is statically
 * prerendered — every /simulate page failed to prerender the first time this component was adopted,
 * because the boundary was the caller's job and the caller did not know. Owning it means the next
 * surface to adopt these controls cannot make the same mistake.
 *
 * The fallback must not call the hook either — the first attempt at this rendered the same inner
 * component with an empty sport list, which still ran `useSearchParams` inside the boundary meant to
 * contain it, and every /simulate page failed to prerender exactly as before. It renders the date
 * bar directly instead: no query string needed, so the bar does not appear and then jump.
 */
export default function DateSportControls(props: DateSportControlsProps) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-2">
          <DateBar {...props} sport={null} />
          <SportChips surface={props.surface} sports={props.sports} totalCount={props.totalCount} sport={null} />
        </div>
      }
    >
      <DateSportControlsInner {...props} />
    </Suspense>
  );
}

function DateSportControlsInner({
  surface,
  date,
  defaultDate,
  availableDates = [],
  sports = [],
  totalCount = null,
  context = null,
  labelledBy,
}: DateSportControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  /*
   * Seeded from the URL the server rendered, then re-read on mount and on every popstate. Seeding
   * from the query rather than from null keeps SSR and the first client render agreeing, which is
   * what stops the selected chip flashing to "All" and back on load.
   */
  const [sport, setSport] = useState<string | null>(params.get("sport"));
  useEffect(() => {
    const read = () => setSport(new URLSearchParams(window.location.search).get("sport"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const pickSport = useCallback(
    (next: string | null) => {
      setSport(next);
      const qs = new URLSearchParams(params.toString());
      if (next == null) qs.delete("sport"); else qs.set("sport", next);
      const q = qs.toString();
      // `replace`, not `push`: switching a filter is refining the current view, not travelling to a
      // new one, and pushing would make Back walk through every chip the reader tried.
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );


  return (
    <div className="flex flex-col gap-2">
      <DateBar {...{ surface, date, defaultDate, availableDates, context, labelledBy }} sport={sport} />

      <SportChips surface={surface} sports={sports} totalCount={totalCount} sport={sport} onPick={pickSport} />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="vault-press shrink-0 px-3.5 gap-1.5"
      style={{
        ...PILL,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        whiteSpace: "nowrap",
        border: `1px solid ${active ? "var(--vault-gold-bright)" : "var(--vault-rule)"}`,
        background: active ? "var(--vault-gold-dim)" : "transparent",
        color: active ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * The date half, with no hooks — so the Suspense fallback can render it and the boundary actually
 * contains the one thing it exists to contain.
 */
function DateBar({
  surface, date, defaultDate, availableDates = [], context = null, labelledBy, navLabel, sport,
}: DateSportControlsProps & { sport: string | null }) {
  const router = useRouter();
  if (!supportsDate(surface)) return null;

  const idx = availableDates.indexOf(date);
  const prev = idx > 0 ? availableDates[idx - 1] : null;
  const next = idx >= 0 && idx < availableDates.length - 1 ? availableDates[idx + 1] : null;
  const href = (d: string | null) => (d == null ? null : surfaceHref(surface, { date: d, defaultDate, sport }));

  const prevHref = href(prev);
  const nextHref = href(next);
  const todayHref = date === defaultDate ? null : href(defaultDate);

  return (

        <nav
          aria-label={labelledBy ? undefined : (navLabel ?? "Date")}
          aria-labelledby={labelledBy}
          className="flex flex-wrap items-center gap-2"
        >
          {prevHref ? (
            <Link href={prevHref} className="vault-press px-3" style={{ ...PILL, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)" }}>
              ← {fmtDay(prev!)}
            </Link>
          ) : (
            /* Not a disabled link. There is genuinely no earlier page on this surface, and saying
               so is more useful than an inert arrow the reader has to test. */
            <span className="px-3" style={{ ...PILL, color: "var(--vault-text-faint)", fontSize: 12 }}>
              Start of window
            </span>
          )}

          <span
            className="px-4 font-display"
            aria-current="date"
            style={{ ...PILL, border: "1px solid var(--vault-gold-bright)", background: "var(--vault-gold-dim)", color: "var(--vault-gold-bright)", fontSize: 13.5, fontWeight: 750 }}
          >
            {date === defaultDate ? "Today · " : ""}{fmtDay(date)}{context ? ` · ${context}` : ""}
          </span>

          {nextHref ? (
            <Link href={nextHref} className="vault-press px-3" style={{ ...PILL, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)" }}>
              {fmtDay(next!)} →
            </Link>
          ) : (
            <span className="px-3" style={{ ...PILL, color: "var(--vault-text-faint)", fontSize: 12 }}>
              End of window
            </span>
          )}

          {todayHref && (
            <Link href={todayHref} className="vault-press px-3" style={{ ...PILL, color: "var(--vault-gold-bright)", fontWeight: 700 }}>
              Jump to today
            </Link>
          )}

          {availableDates.length > 1 && (
            <label className="ml-auto inline-flex items-center gap-2" style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>
              <span>Date</span>
              <select
                value={date}
                aria-label="Jump to a date"
                onChange={(ev) => {
                  const target = href(ev.target.value);
                  // The owner refused: there is no page for that day here. Do nothing rather than
                  // navigate somewhere the reader did not ask for.
                  if (target) router.push(target);
                }}
                className="rounded-[8px] px-2 py-1.5"
                style={{ minHeight: 40, background: "color-mix(in srgb, var(--vault-scrim-base) 70%, transparent)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)", fontSize: 12.5 }}
              >
                {availableDates.map((d) => (
                  <option key={d} value={d}>{fmtDay(d)}{d === defaultDate ? " · today" : ""}</option>
                ))}
              </select>
            </label>
          )}
        </nav>
  );
}

/**
 * The chips, also hook-free, so the Suspense FALLBACK can render them.
 *
 * The first swap put them inside the boundary and they vanished from the prerendered HTML entirely —
 * a real capability loss, caught by diffing the built page against the one the inline implementation
 * produced rather than by looking at the screen. The server has no query string, so `sport` is null
 * there and "All" is active, which is exactly what the old implementation rendered too; hydration
 * only ever moves the active chip.
 */
function SportChips({
  surface, sports = [], sport, onPick, totalCount = null,
}: Pick<DateSportControlsProps, "surface" | "sports" | "totalCount"> & { sport: string | null; onPick?: (s: string | null) => void }) {
  if (!supportsSport(surface) || sports.length === 0) return null;
  const pick = (v: string | null) => () => onPick?.(v);
  return (

        <div role="group" aria-label="Sport filter" className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <Chip active={sport == null} onClick={pick(null)}>
            All · {totalCount ?? sports.reduce((a, s) => a + s.count, 0)}
          </Chip>
          {sports.map((s) => (
            <Chip key={s.id} active={sport === s.id} onClick={pick(s.id)}>
              {s.icon ? <span aria-hidden>{s.icon}</span> : null}
              {s.label}
              <span className="font-mono" style={{ fontSize: 10.5, opacity: 0.85 }}>
                {s.count}{s.emptyReason ? ` · ${s.emptyReason}` : ""}
              </span>
            </Chip>
          ))}
        </div>
  );
}
