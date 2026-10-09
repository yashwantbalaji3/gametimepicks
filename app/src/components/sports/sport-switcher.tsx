import Link from "next/link";

import { SPORTS, competitionFor } from "@/lib/sports/catalog";

/**
 * THE SPORT SWITCHER (UX-001 phase 2) — the same strip at the top of every sport hub: Football · Basketball ·
 * Baseball · Soccer · MMA, and, inside a sport with more than one competition, the competitions (Soccer → Premier
 * League · Ligue 1). Before it, a hub linked to no other sport; the only way across was back through /sports.
 *
 * Reads the one catalog (lib/sports/catalog.ts), so it cannot drift from the rail, the footer or the /sports chooser.
 * Server-rendered with the hub's own key — no pathname read on the client, so nothing here can differ between the
 * build and the browser. Wraps rather than scrolls sideways at 390px, so no keyboard-unreachable scrolling box.
 */
const pill = (on: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "6px 12px", borderRadius: 999,
  fontSize: 13, fontWeight: 650, textDecoration: "none", whiteSpace: "nowrap",
  color: on ? "var(--vault-gold-bright)" : "var(--vault-text-mute)",
  background: on ? "var(--vault-gold-dim)" : "transparent",
  border: `1px solid ${on ? "var(--vault-gold-bright)" : "var(--vault-border)"}`,
});

export default function SportSwitcher({ current }: {
  /** The hub's competition key in the catalog (nfl, nba, mlb, epl, ligue-1, ufc). */
  current: string;
}) {
  const here = competitionFor(current);
  const sport = here?.sport ?? null;
  return (
    <nav aria-label="Sports" data-sport-switcher className="mb-3">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {SPORTS.map((s) => {
          const on = s.key === sport?.key;
          const first = s.competitions[0];
          /* A one-competition sport's pill IS this page; in a sport with several, the competition row names the page
             and the sport pill only marks the section — one aria-current="page" per strip. */
          const current_ = on ? (s.competitions.length > 1 ? "true" : "page") : undefined;
          return (
            <li key={s.key}>
              <Link href={`${first.href}/`} style={pill(on)} aria-current={current_}>
                <span aria-hidden>{s.glyph}</span>{s.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {sport && sport.competitions.length > 1 ? (
        <ul aria-label={`${sport.label} competitions`} className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
          {sport.competitions.map((c) => (
            <li key={c.key}>
              <Link href={`${c.href}/`} style={pill(c.key === current)} aria-current={c.key === current ? "page" : undefined}>
                {c.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </nav>
  );
}
