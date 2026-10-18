/**
 * Simulation Theater V2 · theme variables. Tokens only (globals.css): no raw colour literal may appear here or in
 * theater.css (token ratchet; theater-pack.test.mjs also scans theater.css). Turf greens are colour-mixes of
 * --vault-accent-deep ("simulation surfaces") into --bg; THEATER_TURF_MIX (field-geometry.mjs) names the two
 * percentages so the contrast maths can recompute them. Shell transitions use the --motion-* role tokens, so the global
 * reduced-motion block shortens or removes them with no theater-specific override (spec S18).
 *
 * The rules themselves live in theater.css (a CSS file the route links, not an inline <style>, iteration 2).
 */
import { THEATER_TURF_MIX } from "@/lib/simulation-theater/field-geometry.mjs";

/** Theater-scoped custom properties, applied as an inline style on every theater root (component-level definitions). */
export const THEATER_VARS = {
  "--st-turf-a": `color-mix(in srgb, var(--vault-accent-deep) ${THEATER_TURF_MIX.a}%, var(--bg))`,
  "--st-turf-b": `color-mix(in srgb, var(--vault-accent-deep) ${THEATER_TURF_MIX.b}%, var(--bg))`,
  "--st-turf-out": `color-mix(in srgb, var(--vault-accent-deep) 15%, var(--bg))`,
  "--st-line": `color-mix(in srgb, var(--lava-text) 78%, transparent)`,
  "--st-line-strong": `color-mix(in srgb, var(--lava-text) 92%, transparent)`,
  "--st-line-soft": `color-mix(in srgb, var(--lava-text) 50%, transparent)`,
  "--st-num": `color-mix(in srgb, var(--lava-text) 80%, transparent)`,
  "--st-post": `var(--vault-warn)`,
  "--st-pylon": `var(--vault-risk)`,
  "--st-ball": `color-mix(in srgb, var(--vault-risk) 52%, var(--bg))`,
  "--st-ball-hi": `color-mix(in srgb, var(--vault-crown) 70%, var(--vault-risk))`,
  "--st-ball-lo": `color-mix(in srgb, var(--vault-risk) 26%, var(--bg))`,
  "--st-glow": `var(--vault-warn)`,
  "--st-start": `var(--vault-info)`,
  "--st-end": `var(--vault-warn)`,
  "--st-panel": `var(--gtp-card)`,
  "--st-panel-2": `var(--gtp-card-elevated)`,
  "--st-edge": `var(--gtp-card-border)`,
  "--st-text": `var(--lava-text)`,
  "--st-mute": `var(--lava-text-muted)`,
  "--st-faint": `var(--lava-text-faint)`,
} as Record<string, string>;
