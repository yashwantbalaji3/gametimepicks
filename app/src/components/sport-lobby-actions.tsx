import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared sport-lobby action grid.
 *
 * Renders the four canonical sport actions in a single grid so every
 * sport overview (NBA / MLB / NHL / IPL) ships the same shape:
 *
 *   Model Board  ·  Parlays  ·  Power Board  ·  Results
 *
 * Each tile shows:
 *   - sport-tinted neon eyebrow
 *   - short headline
 *   - one-line status (e.g. "live · 72 leans", "lines pending",
 *     "candidate slips pending", "55.2% on 145")
 *   - CTA chevron back to the appropriate route
 *
 * Callers pass per-tile status text so they can drive their own
 * pending/live language honestly. The component never invents status.
 */
export type SportKey = "nba" | "mlb" | "nhl" | "ipl";

interface ActionTile {
  key: "board" | "parlays" | "power" | "results";
  label: string;
  caption: string;
  /** Optional status text under the headline. */
  status?: ReactNode;
  /** Optional tone for the status pill. Defaults to "mute". */
  statusTone?: "gold" | "success" | "warn" | "mute";
  href: string;
}

const TONE_COLOR: Record<NonNullable<ActionTile["statusTone"]>, string> = {
  gold: "var(--vault-gold-bright)",
  success: "var(--vault-success)",
  warn: "var(--vault-warn)",
  mute: "var(--vault-text-faint)",
};

export interface SportLobbyActionsProps {
  sport: SportKey;
  /** Per-tile status, indexed by tile key. */
  status?: Partial<Record<ActionTile["key"], { text: ReactNode; tone?: ActionTile["statusTone"] }>>;
}

const TILE_BASE: Record<ActionTile["key"], { label: string; caption: string }> = {
  board: { label: "Model Board", caption: "Projection cards · clean leans" },
  parlays: { label: "Parlays", caption: "Candidate slips · risk-aware" },
  power: { label: "Power Board", caption: "High-variance watch" },
  results: { label: "Results", caption: "Model audit · settled" },
};

export default function SportLobbyActions({
  sport,
  status,
}: SportLobbyActionsProps) {
  const base = `/${sport}`;

  const tiles: ActionTile[] = (
    ["board", "parlays", "power", "results"] as const
  ).map((key) => {
    const meta = TILE_BASE[key];
    const s = status?.[key];
    return {
      key,
      label: meta.label,
      caption: meta.caption,
      status: s?.text,
      statusTone: s?.tone ?? "mute",
      href: key === "board" ? `${base}/board` : `${base}/${key}`,
    };
  });

  return (
    <section
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
      aria-label="Sport actions"
    >
      {tiles.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className="gtp-aurora-halo block reveal vault-glow-hover rounded-[8px]"
          style={{ textDecoration: "none" }}
        >
          <div
            className="gtp-status-board p-4 sm:p-5 h-full flex flex-col justify-between"
            style={{ borderRadius: 8 }}
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 rounded-full gtp-neon-pulse"
                  style={{
                    background: "var(--vault-gold-bright)",
                    boxShadow: "0 0 8px rgba(240, 199, 94, 0.55)",
                  }}
                />
                <span
                  className="font-mono uppercase tracking-[0.16em]"
                  style={{ color: "var(--vault-gold-bright)", fontSize: 9 }}
                >
                  {t.label}
                </span>
              </div>
              <h3
                className="mt-2 font-display font-semibold tracking-tight"
                style={{
                  color: "var(--vault-text)",
                  fontSize: 18,
                  lineHeight: 1.15,
                }}
              >
                {t.caption}
              </h3>
              {t.status && (
                <div
                  className="mt-2 font-mono uppercase tracking-[0.14em]"
                  style={{
                    color: TONE_COLOR[t.statusTone ?? "mute"],
                    fontSize: 10,
                  }}
                >
                  {t.status}
                </div>
              )}
            </div>
            <div
              className="mt-4 font-mono"
              style={{
                color: "var(--vault-gold-bright)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.14em",
              }}
            >
              Open →
            </div>
          </div>
        </Link>
      ))}
    </section>
  );
}
