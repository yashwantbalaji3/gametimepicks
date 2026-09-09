/**
 * WHERE THE NUMBERS COME FROM — DERIVED, NOT TYPED (P251 · F12).
 *
 * The footer listed `meta.dataSources` from the legacy NBA-era `meta.json`: "nba_api", "manual
 * schedule overrides", "manual news overrides", "demo data". NBA has been a settled archive for
 * months and no operator override feeds any live surface, so every page on a site whose whole
 * pitch is provenance credited a source it does not use and omitted the ones it does.
 *
 * A hand-maintained list of sources drifts in exactly one direction — toward the sources that
 * existed when someone last edited it. So the list is DERIVED: the product-day owner says which
 * sports are live or have an event ahead, and each sport declares the feeds it actually reads.
 * A sport that goes dormant drops its feeds from the footer without anyone editing this file.
 */
import { buildProductDays } from "@/lib/product-day/product-day";

export interface DataSource {
  name: string;
  description: string;
  url: string;
}

/** The feeds each sport's own capture chain reads. Keyed by the product-day owner's sport key. */
const FEEDS_BY_SPORT: Record<string, DataSource[]> = {
  mlb: [
    { name: "MLB Stats API", description: "Official schedule, lineups and box scores — the settlement source.", url: "https://statsapi.mlb.com/" },
    { name: "The Odds API", description: "Authorized sportsbook price captures.", url: "https://the-odds-api.com/" },
  ],
  nfl: [
    { name: "ESPN public API", description: "Schedule, rosters, injury designations and official finals.", url: "https://www.espn.com/" },
    { name: "The Odds API", description: "Authorized sportsbook price captures.", url: "https://the-odds-api.com/" },
  ],
  epl: [
    { name: "openfootball", description: "Public-domain fixture list.", url: "https://github.com/openfootball" },
    { name: "ESPN public API", description: "Per-match and per-player results.", url: "https://www.espn.com/" },
    { name: "The Odds API", description: "Authorized sportsbook price captures.", url: "https://the-odds-api.com/" },
  ],
  ufc: [
    { name: "ESPN public API", description: "Fight card, bout results and method of victory.", url: "https://www.espn.com/" },
    { name: "The Odds API", description: "Authorized sportsbook price captures.", url: "https://the-odds-api.com/" },
  ],
};

/**
 * The sources behind what the site is publishing right now.
 *
 * @param dataRoot absolute path to `public/data`
 */
export function liveDataSources(dataRoot: string): DataSource[] {
  let sports: string[] = [];
  try {
    sports = buildProductDays(dataRoot)
      .filter((d) => d.state === "LIVE" || d.state === "EVENT_UPCOMING")
      .map((d) => d.sport);
  } catch {
    sports = [];
  }
  const out: DataSource[] = [];
  const seen = new Set<string>();
  for (const s of sports) {
    for (const f of FEEDS_BY_SPORT[s] ?? []) {
      if (seen.has(f.name)) continue;
      seen.add(f.name);
      out.push(f);
    }
  }
  /*
   * A window with no live sport is a real state (between slates, or an outage). Naming the
   * settlement source is still true and is the one a reader most needs — it is what every graded
   * result on /results was settled from — so the list is never empty and never invented.
   */
  if (out.length === 0) out.push(...FEEDS_BY_SPORT.mlb);
  return out;
}
