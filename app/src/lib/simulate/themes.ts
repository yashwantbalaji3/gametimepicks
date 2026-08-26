/**
 * SPORT SIMULATION THEMES (P209 · Release C) — the registry behind the generation scenes.
 *
 * One entry per registered sport plus a generic arena fallback for any future sport: accent
 * tokens (semantic vars only — the ratchet still applies), the scene id the stage renders, and
 * the poster line used under prefers-reduced-motion. Registry-driven so a new sport gets a
 * quality scene by default and a theme-less screen is impossible.
 */
import type { SimSport } from "@/lib/simulate/day-view";

export type SceneId = "diamond" | "field" | "pitch" | "octagon" | "court" | "arena";

export interface SportSimulationTheme {
  readonly scene: SceneId;
  /** Accent CSS variable (semantic or sport token — never a raw hex here). */
  readonly accent: string;
  readonly accentSoft: string;
  readonly label: string;
  /** Poster caption for the reduced-motion fallback. */
  readonly poster: string;
}

const THEMES: Record<SimSport, SportSimulationTheme> = {
  mlb: {
    scene: "diamond",
    accent: "var(--gtp-bank-heat)",
    accentSoft: "color-mix(in srgb, var(--gtp-bank-heat) 22%, transparent)",
    label: "MLB",
    poster: "Night stadium · illuminated diamond",
  },
  nfl: {
    scene: "field",
    accent: "var(--vault-gold-bright)",
    accentSoft: "color-mix(in srgb, var(--vault-gold-bright) 20%, transparent)",
    label: "NFL",
    poster: "Field grid · chalk routes",
  },
  epl: {
    scene: "pitch",
    accent: "var(--sport-soccer, var(--vault-success))",
    accentSoft: "color-mix(in srgb, var(--sport-soccer, var(--vault-success)) 20%, transparent)",
    label: "Premier League",
    poster: "Floodlit pitch · passing network",
  },
  ufc: {
    scene: "octagon",
    accent: "var(--sport-ufc, var(--vault-warn))",
    accentSoft: "color-mix(in srgb, var(--sport-ufc, var(--vault-warn)) 20%, transparent)",
    label: "UFC",
    poster: "Octagon · red and blue corners",
  },
  nba: {
    scene: "court",
    accent: "var(--vault-info-bright, var(--vault-gold))",
    accentSoft: "color-mix(in srgb, var(--vault-info, var(--vault-gold)) 20%, transparent)",
    label: "NBA",
    poster: "Court lines · shot arcs",
  },
};

const ARENA: SportSimulationTheme = {
  scene: "arena",
  accent: "var(--vault-gold-bright)",
  accentSoft: "var(--vault-gold-dim)",
  label: "Event",
  poster: "Arena floor · house lights",
};

/** Total lookup — an unregistered sport gets the quality generic arena, never a blank screen. */
export function themeFor(sport: string): SportSimulationTheme {
  return (THEMES as Record<string, SportSimulationTheme>)[sport] ?? ARENA;
}
