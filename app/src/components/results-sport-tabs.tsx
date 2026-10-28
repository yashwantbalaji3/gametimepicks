import Link from "next/link";
import { NBA_OFFICIAL_RECORD_LABEL } from "@/lib/results/nba-official-record.mjs";

export type ResultsSportTab =
  | "overview"
  | "nba"
  | "mlb"
  | "nfl"
  | "parlays";

/**
 * Cross-sport sub-tabs shown at the top of every Results experience
 * (`/results`, `/nba/results`, `/mlb/results`, `/results/parlays`).
 * Server component — the active tab is passed in by the parent.
 *
 * The NHL and IPL tabs are gone with their routes: both were permanent
 * "pending" placeholders for sports with no ingest and no settlement,
 * and a tab is a claim of coverage. Only sports with a real settled
 * record appear — MLB (live), NFL (the weekly report, P296) and NBA (its Official Forecast record, with the retired
 * model's archive below it on the same page).
 */
export default function ResultsSportTabs({
  activeSport,
  mlbHasData,
}: {
  activeSport: ResultsSportTab;
  /** Retired-archive presence. Kept for callers; the NBA tab now names the official record, which is always present. */
  nbaHasData?: boolean;
  mlbHasData: boolean;
}) {
  const tabs: Array<{
    id: ResultsSportTab;
    label: string;
    note?: string;
    href: string;
  }> = [
    { id: "overview", label: "Overview", href: "/results" },
    {
      id: "mlb",
      label: "MLB",
      note: mlbHasData ? "live" : "pending",
      href: "/mlb/results",
    },
    {
      id: "nfl",
      label: "NFL",
      note: "week report",
      href: "/results/nfl/",
    },
    {
      id: "nba",
      label: "NBA",
      /* P0 10-28: this said "archive" — but /results/nba leads with the NBA Official Forecast record, graded nightly from
         Oct 20; the retired May–June model's archive sits below it. The tab names the page's current record, in the one
         name lib/results/nba-official-record.mjs keeps (the Forecast Record's NBA line reads the same constant). */
      note: NBA_OFFICIAL_RECORD_LABEL,
      href: "/results/nba",
    },
    {
      id: "parlays",
      label: "Parlays",
      note: "pending snapshots",
      href: "/results/parlays",
    },
  ];

  return (
    <div
      className="mt-6 inline-flex flex-wrap items-stretch gap-1 p-1 rounded-[4px]"
      style={{
        background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)",
        border: "1px solid var(--vault-border)",
      }}
      aria-label="Model audit sport tabs"
    >
      {tabs.map((t) => {
        const active = activeSport === t.id;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className="font-mono uppercase tracking-[0.14em] px-3 py-1.5 rounded-[3px] transition-colors"
            style={{
              fontSize: 11,
              color: active
                ? "var(--vault-gold-bright)"
                : "var(--vault-text-mute)",
              background: active
                ? "linear-gradient(180deg, var(--vault-gold-dim) 0%, color-mix(in srgb, var(--vault-accent) 0%, transparent) 90%)"
                : "transparent",
              border: active
                ? "1px solid color-mix(in srgb, var(--vault-accent) 30%, transparent)"
                : "1px solid var(--vault-border)",
              textDecoration: "none",
            }}
          >
            {t.label}
            {t.note && (
              <span
                style={{ color: "var(--vault-text-faint)", marginLeft: 6 }}
              >
                · {t.note}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
