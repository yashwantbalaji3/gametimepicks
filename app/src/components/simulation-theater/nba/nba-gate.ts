/**
 * NBA Simulation Theater · the FIXTURE GATE (pure; shared by the server section and the tests).
 * A manifest marked `fixture: true` may render ONLY when the caller passes the exact FIXTURE_BANNER text; the island then
 * always renders that banner above everything else. Any other input is refused (no court, score or player line).
 */
import { FIXTURE_BANNER } from "@/lib/simulation-theater/nba/adapter-nba-sim-v1.mjs";
import type { NbaLoad } from "./nba-types";

export function fixtureGate(load: NbaLoad, fixtureBanner: string | null | undefined): { ok: boolean; reason: string | null } {
  if (!load.ok || !load.manifest) return { ok: false, reason: `${load.error?.code ?? "UNAVAILABLE"}: ${load.error?.reason ?? "no data"}` };
  if (load.manifest.fixture && fixtureBanner !== FIXTURE_BANNER) {
    return { ok: false, reason: `This data is a test fixture; it renders only under the banner "${FIXTURE_BANNER}".` };
  }
  if (!load.palettes) return { ok: false, reason: "no palette" };
  return { ok: true, reason: null };
}
