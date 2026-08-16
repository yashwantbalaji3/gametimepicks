import Link from "next/link";

export type ResultsSportTab =
  | "overview"
  | "nba"
  | "mlb"
  | "parlays";

/**
 * Cross-sport sub-tabs shown at the top of every Results experience
 * (`/results`, `/nba/results`, `/mlb/results`, `/results/parlays`).
 * Server component — the active tab is passed in by the parent.
 *
 * The NHL and IPL tabs are gone with their routes: both were permanent
 * "pending" placeholders for sports with no ingest and no settlement,
 * and a tab is a claim of coverage. Only sports with a real settled
 * record appear — MLB (live) and NBA (archive).
 */
export default function ResultsSportTabs({
  activeSport,
  nbaHasData,
  mlbHasData,
}: {
  activeSport: ResultsSportTab;
  nbaHasData: boolean;
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
      id: "nba",
      label: "NBA",
      // NBA is HISTORICAL_ONLY: the record is real and settled, but nothing is still accruing.
      note: nbaHasData ? "archive" : "no data",
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
        background: "rgba(11, 18, 14, 0.55)",
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
                ? "linear-gradient(180deg, rgba(52, 211, 153, 0.12) 0%, rgba(52, 211, 153, 0) 90%)"
                : "transparent",
              border: active
                ? "1px solid rgba(52, 211, 153, 0.30)"
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
