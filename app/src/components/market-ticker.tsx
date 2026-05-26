/**
 * MarketTicker — thin premium right-to-left ticker strip.
 *
 * - Renders nothing when items.length === 0.
 * - Duplicates the item list so the scrolling loop is seamless.
 * - Pauses on hover/focus (CSS `:hover` / `:focus-within`).
 * - Respects `prefers-reduced-motion`: animation disabled, the
 *   strip becomes a horizontally-scrollable row instead.
 * - Items are render as either an inert `<span>` or an `<a>` —
 *   whichever the `href` indicates. We never lie about
 *   navigation — items with no href are not pretending to be
 *   links.
 * - Pure server component; the data shape is produced upstream by
 *   `buildMarketTickerItems` in `@/lib/market-ticker`.
 *
 * Accessibility:
 *   - Wraps the strip in `role="marquee" aria-label="Market data
 *     ticker"` so assistive tech announces it.
 *   - Each item has `aria-label` derived from its label + value.
 *   - The duplicate copy carries `aria-hidden="true"` so SR users
 *     don't hear the same items twice.
 */
import Link from "next/link";
import type { MarketTickerItem } from "@/lib/market-ticker";

interface Props {
  items: ReadonlyArray<MarketTickerItem>;
  /** Optional aria-label override. Defaults to "Market data ticker". */
  ariaLabel?: string;
  /** Optional className override (e.g. for layout margins). */
  className?: string;
}

export default function MarketTicker({
  items,
  ariaLabel = "Market data ticker",
  className = "",
}: Props) {
  if (!items || items.length === 0) return null;
  return (
    <div
      role="marquee"
      aria-label={ariaLabel}
      className={`gtp-market-ticker ${className}`.trim()}
    >
      <div className="gtp-market-ticker-track">
        <TickerSet items={items} copy="primary" />
        {/* Duplicate copy lets the -50% translate seamlessly wrap. */}
        <TickerSet items={items} copy="duplicate" />
      </div>
    </div>
  );
}

function TickerSet({
  items,
  copy,
}: {
  items: ReadonlyArray<MarketTickerItem>;
  copy: "primary" | "duplicate";
}) {
  return (
    <span
      data-ticker-copy={copy}
      aria-hidden={copy === "duplicate" ? "true" : undefined}
      style={{ display: "inline-flex", gap: "inherit", alignItems: "center" }}
    >
      {items.map((it, i) => (
        <span
          key={`${copy}-${it.id}-${i}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 20 }}
        >
          <TickerItemView item={it} />
          <span aria-hidden="true" className="gtp-market-ticker-sep">·</span>
        </span>
      ))}
    </span>
  );
}

function TickerItemView({ item }: { item: MarketTickerItem }) {
  const inner = (
    <>
      {item.icon ? (
        <span aria-hidden="true" className="gtp-market-ticker-icon">
          {item.icon}
        </span>
      ) : null}
      <span>{item.label}</span>
      {item.value ? (
        <span className="gtp-market-ticker-value">{item.value}</span>
      ) : null}
    </>
  );
  const ariaLabel = item.value ? `${item.label} — ${item.value}` : item.label;
  if (item.href) {
    return (
      <Link
        href={item.href}
        prefetch={false}
        className="gtp-market-ticker-item"
        data-href="true"
        data-tone={item.tone ?? "neutral"}
        aria-label={ariaLabel}
      >
        {inner}
      </Link>
    );
  }
  return (
    <span
      className="gtp-market-ticker-item"
      data-href="false"
      data-tone={item.tone ?? "neutral"}
      aria-label={ariaLabel}
    >
      {inner}
    </span>
  );
}
