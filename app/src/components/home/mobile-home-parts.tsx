/**
 * Release B (competitor benchmark PR 1193 gaps 2, 3, 8 · founder sprint directive 2026-10-23): a shorter phone homepage and
 * discoverable tools — no redesign.
 *
 *   SportsToday   phones only: the five sports in one row of 44px chips, right under the hero, so every sport is above
 *                 the fold. Each chip is the Command Center lane's own label and hub (its state is in the lane below).
 *   HomeTools     every width: the analytical tools a reader can open — Top Boards, Research Lab, Results, Forecast
 *                 Record, Model Performance — as 44px links to pages that exist.
 *   MobileMore    phones only: one 44px link per secondary section that is not rendered on phones (the full sections
 *                 render from sm up), to the page that carries it. Labels only — nothing is invented.
 */
import Link from "next/link";
import type { CommandCenterLane } from "@/lib/command-center/command-center";
import { PUBLIC_TERMS } from "@/lib/public-registry";

const CHIP = "inline-flex items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold no-underline whitespace-nowrap";
const CHIP_STYLE = { minHeight: 44, border: "1px solid var(--vault-border)", color: "var(--vault-text)", background: "var(--vault-panel)" } as const;

export function SportsToday({ lanes }: { lanes: CommandCenterLane[] }) {
  if (!lanes.length) return null;
  return (
    <nav aria-label="Sports today" className="sm:hidden -mt-3">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {lanes.map((l) => (
          <li key={l.sport}>
            <Link href={l.hubHref} className={CHIP} style={CHIP_STYLE}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The tools row's destinations — every href is a real route (mobile-home.test.mjs checks each one). */
export const HOME_TOOLS: ReadonlyArray<{ label: string; href: string }> = Object.freeze([
  { label: "NFL Top Boards", href: "/nfl/#nfl-boards" },
  { label: "NBA Top Boards", href: "/nba/projections/" },
  { label: "MLB board", href: "/mlb/board/" },
  { label: "Research Lab", href: "/research/lab/" },
  { label: "Results", href: "/results/" },
  { label: "Forecast Record", href: "/results/forecasts/" },
  { label: PUBLIC_TERMS.MODEL_PERFORMANCE, href: "/models/" },
  { label: "Methodology", href: "/methodology/" },
]);

export function HomeTools() {
  return (
    <section aria-labelledby="home-tools-h" className="flex flex-col gap-2">
      <h2 id="home-tools-h" className="m-0 font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>Tools</h2>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {HOME_TOOLS.map((t) => (
          <li key={t.href}><Link href={t.href} className={CHIP} style={CHIP_STYLE}>{t.label} →</Link></li>
        ))}
      </ul>
    </section>
  );
}

export type MobileMoreItem = { label: string; href: string };

/* Labels only: the homepage's first-viewport word ceiling (busiest-state.test, 1,820) leaves no room for a second
   description of sections the page already describes from sm up. */
export function MobileMore({ items }: { items: MobileMoreItem[] }) {
  if (!items.length) return null;
  return (
    <nav aria-labelledby="home-more-h" className="sm:hidden flex flex-col gap-2">
      <h2 id="home-more-h" className="m-0 font-mono uppercase tracking-[0.14em]" style={{ color: "var(--vault-gold)", fontSize: 11 }}>More</h2>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {items.map((i) => (
          <li key={i.href + i.label}><Link href={i.href} className={CHIP} style={CHIP_STYLE}>{i.label} →</Link></li>
        ))}
      </ul>
    </nav>
  );
}
