/**
 * event-schedules — typed, SCHEDULE-ONLY data for the Sports Event Hub
 * (`/events`). Three leagues: WNBA, UFC, and FIFA World Cup.
 *
 * HARD honesty rules for this module (see the repo's product guardrails):
 *   - Schedule only. No odds, no projections, no parlays, no picks, no
 *     win/loss claims. None of these leagues are modelled, and nothing
 *     here implies they are.
 *   - Every league carries an explicit `ScheduleSource` (name, url,
 *     retrievedAt, date range, note) so the page can attribute the data
 *     and label it as a point-in-time SNAPSHOT — never "live".
 *   - The baked events are a verbatim, hand-inspected snapshot of the
 *     ESPN public scoreboard endpoints (no key, public JSON). Each event
 *     id / date / matchup was copied straight from that feed and verified
 *     before being committed — nothing is invented. The FIFA World Cup
 *     entries were additionally cross-checked against the official Final
 *     Draw schedule already shipped in `public/data/world-cup`.
 *   - A league whose feed is not wired up is modelled with status
 *     "disabled" and renders an honest "source not connected" state —
 *     never an empty calendar pretending to be complete.
 *
 * Client-safe: pure data + pure functions, no `fs` / no server-only
 * imports, so both the server page and the client tab component can use
 * it (and so `tsx --test` can import it directly).
 */

export type LeagueKey = "wnba" | "ufc" | "fifa-world-cup" | "mls";

/** Whether a league's upstream feed is wired up for this build. */
export type SourceStatus = "connected" | "disabled";

/** Provenance for a league's schedule data — always shown to the user. */
export interface ScheduleSource {
  /** Human name of the upstream source, e.g. "ESPN public scoreboard". */
  name: string;
  /** Public URL of the upstream feed (for transparency / attribution). */
  url: string;
  /** ISO timestamp the snapshot was captured. Drives the "snapshot" label. */
  retrievedAt: string;
  /** ISO date (YYYY-MM-DD) of the earliest event in the snapshot. */
  rangeStart: string;
  /** ISO date (YYYY-MM-DD) of the latest event in the snapshot. */
  rangeEnd: string;
  /** Honest one-liner: that this is a snapshot, not live, schedule-only. */
  note: string;
}

/** A single scheduled event. Schedule fields only — no betting data. */
export interface ScheduleEvent {
  id: string;
  /** Kickoff / tip-off / first-bell time in ISO-8601 UTC. */
  startUtc: string;
  /** Headline, e.g. "Phoenix Mercury at New York Liberty". */
  name: string;
  /** Compact form, e.g. "PHX @ NY". */
  shortName?: string;
  /** Venue name when the feed provides one. */
  venue?: string;
  /** Optional secondary line, e.g. a UFC main event or "13-bout card". */
  detail?: string;
  /**
   * Optional ordered list of participants (used for the UFC fight card).
   * Team-sport events leave this undefined because `name` already carries
   * both sides.
   */
  competitors?: string[];
}

export interface LeagueSchedule {
  key: LeagueKey;
  /** Short tab label, e.g. "WNBA". */
  label: string;
  /** Full name for the source banner, e.g. the league's official name. */
  longLabel: string;
  status: SourceStatus;
  source: ScheduleSource;
  events: ScheduleEvent[];
  /** Optional cross-link to a richer existing surface (e.g. /world-cup). */
  moreHref?: string;
  moreLabel?: string;
}

// FIFA World Cup opener snapshot retrieval (unchanged — official Final
// Draw data, not re-fetched).
const ESPN_RETRIEVED_AT = "2026-05-29T20:56:00Z";
// WNBA / UFC / MLS refreshed straight from the live ESPN public scoreboard
// on 2026-06-02. Verbatim event ids/dates/matchups/venues from that feed.
const ESPN_RETRIEVED_AT_JUN02 = "2026-06-02T03:06:05Z";

/**
 * Baked schedule snapshots. ESPN public scoreboard JSON — WNBA/UFC/MLS
 * refreshed 2026-06-02, FIFA opener from the 2026-05-29 Final-Draw
 * cross-check. Verbatim event ids/dates/matchups straight from the feed —
 * see the module header for the honesty contract.
 */
const WNBA_SCHEDULE: LeagueSchedule = {
  key: "wnba",
  label: "WNBA",
  longLabel: "Women's National Basketball Association",
  status: "connected",
  source: {
    name: "ESPN public scoreboard",
    url: "https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard",
    retrievedAt: ESPN_RETRIEVED_AT_JUN02,
    rangeStart: "2026-06-02",
    rangeEnd: "2026-06-05",
    note: "Point-in-time snapshot of the public ESPN scoreboard — schedule only, not live, and not a betting product. Verify times against the league before relying on them.",
  },
  events: [
    {
      id: "401856955",
      startUtc: "2026-06-02T23:30Z",
      name: "Connecticut Sun at Atlanta Dream",
      shortName: "CON @ ATL",
      venue: "Gateway Center",
    },
    {
      id: "401856956",
      startUtc: "2026-06-02T23:30Z",
      name: "Chicago Sky at Washington Mystics",
      shortName: "CHI @ WSH",
      venue: "CareFirst Arena",
    },
    {
      id: "401856957",
      startUtc: "2026-06-03T02:00Z",
      name: "Portland Fire at Golden State Valkyries",
      shortName: "POR @ GS",
      venue: "Chase Center",
    },
    {
      id: "401856958",
      startUtc: "2026-06-03T02:00Z",
      name: "Las Vegas Aces at Los Angeles Sparks",
      shortName: "LV @ LA",
      venue: "crypto.com Arena",
    },
    {
      id: "401856959",
      startUtc: "2026-06-03T23:30Z",
      name: "Toronto Tempo at New York Liberty",
      shortName: "TOR @ NY",
      venue: "Barclays Center",
    },
    {
      id: "401856960",
      startUtc: "2026-06-04T02:00Z",
      name: "Phoenix Mercury at Seattle Storm",
      shortName: "PHX @ SEA",
      venue: "Climate Pledge Arena",
    },
    {
      id: "401856961",
      startUtc: "2026-06-04T23:00Z",
      name: "Atlanta Dream at Indiana Fever",
      shortName: "ATL @ IND",
      venue: "Gainbridge Fieldhouse",
    },
    {
      id: "401856962",
      startUtc: "2026-06-05T01:00Z",
      name: "Golden State Valkyries at Minnesota Lynx",
      shortName: "GS @ MIN",
      venue: "Target Center",
    },
  ],
};

const UFC_SCHEDULE: LeagueSchedule = {
  key: "ufc",
  label: "UFC",
  longLabel: "Ultimate Fighting Championship",
  status: "connected",
  source: {
    name: "ESPN public scoreboard",
    url: "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard",
    retrievedAt: ESPN_RETRIEVED_AT_JUN02,
    rangeStart: "2026-06-06",
    rangeEnd: "2026-07-11",
    note: "Point-in-time snapshot of the public ESPN scoreboard — schedule only, not live, and not a betting product. Cards can change; verify against the promotion before relying on them.",
  },
  events: [
    {
      id: "600058949",
      startUtc: "2026-06-06T21:00Z",
      name: "UFC Fight Night: Muhammad vs. Bonfim",
      venue: "Meta APEX",
    },
    {
      id: "600058854",
      startUtc: "2026-06-15T00:00Z",
      name: "UFC Freedom 250: Topuria vs. Gaethje",
      venue: "South Lawn of the White House",
    },
    {
      id: "600059467",
      startUtc: "2026-06-20T21:00Z",
      name: "UFC Fight Night: Kape vs. Horiguchi",
      venue: "Meta APEX",
    },
    {
      id: "600059254",
      startUtc: "2026-06-27T13:00Z",
      name: "UFC Fight Night: Fiziev vs. Torres",
      venue: "National Gymnastics Arena",
    },
    {
      id: "600059148",
      startUtc: "2026-07-11T21:00Z",
      name: "UFC 329: McGregor vs. Holloway 2",
      venue: "T-Mobile Arena",
    },
  ],
};

const FIFA_WORLD_CUP_SCHEDULE: LeagueSchedule = {
  key: "fifa-world-cup",
  label: "FIFA World Cup",
  longLabel: "FIFA World Cup 2026",
  status: "connected",
  source: {
    name: "ESPN public scoreboard",
    url: "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard",
    retrievedAt: ESPN_RETRIEVED_AT,
    rangeStart: "2026-06-11",
    rangeEnd: "2026-06-12",
    note: "Opener-window snapshot from the public ESPN scoreboard, cross-checked against the official Final Draw. The complete, official tournament schedule lives in the World Cup command center.",
  },
  moreHref: "/world-cup/",
  moreLabel: "Open the World Cup command center",
  events: [
    {
      id: "760415",
      startUtc: "2026-06-11T19:00Z",
      name: "South Africa at Mexico",
      shortName: "RSA @ MEX",
      venue: "Estadio Banorte",
      detail: "Group stage · tournament opener",
    },
    {
      id: "760414",
      startUtc: "2026-06-12T02:00Z",
      name: "Czechia at South Korea",
      shortName: "CZE @ KOR",
      venue: "Estadio Akron",
      detail: "Group stage",
    },
  ],
};

const MLS_SCHEDULE: LeagueSchedule = {
  key: "mls",
  label: "MLS",
  longLabel: "Major League Soccer",
  status: "connected",
  source: {
    name: "ESPN public scoreboard",
    url: "https://site.api.espn.com/apis/site/v2/sports/soccer/usa.1/scoreboard",
    retrievedAt: ESPN_RETRIEVED_AT_JUN02,
    rangeStart: "2026-07-16",
    rangeEnd: "2026-07-22",
    note: "Point-in-time snapshot of the public ESPN scoreboard — schedule only, not live, and not a betting product. MLS pauses for the FIFA World Cup, so the next fixtures resume in July. Verify times against the league before relying on them.",
  },
  events: [
    {
      id: "761659",
      startUtc: "2026-07-16T23:30Z",
      name: "Toronto FC at CF Montréal",
      shortName: "TOR @ MTL",
      venue: "Stade Saputo",
    },
    {
      id: "761660",
      startUtc: "2026-07-17T00:30Z",
      name: "Vancouver Whitecaps at Chicago Fire FC",
      shortName: "VAN @ CHI",
      venue: "Soldier Field",
    },
    {
      id: "761661",
      startUtc: "2026-07-17T00:30Z",
      name: "Sporting Kansas City at St. Louis CITY SC",
      shortName: "SKC @ STL",
      venue: "Energizer Park",
    },
    {
      id: "761662",
      startUtc: "2026-07-17T02:30Z",
      name: "Portland Timbers at Seattle Sounders FC",
      shortName: "POR @ SEA",
      venue: "Lumen Field",
    },
    {
      id: "761663",
      startUtc: "2026-07-18T00:00Z",
      name: "Atlanta United FC at Nashville SC",
      shortName: "ATL @ NSH",
      venue: "GEODIS Park",
    },
    {
      id: "761664",
      startUtc: "2026-07-18T02:45Z",
      name: "LAFC at LA Galaxy",
      shortName: "LAFC @ LA",
      venue: "Dignity Health Sports Park",
    },
    {
      id: "761668",
      startUtc: "2026-07-22T23:30Z",
      name: "New York City FC at Columbus Crew",
      shortName: "NYC @ CLB",
      venue: "ScottsMiracle-Gro Field",
    },
    {
      id: "761669",
      startUtc: "2026-07-22T23:30Z",
      name: "Vancouver Whitecaps at FC Cincinnati",
      shortName: "VAN @ CIN",
      venue: "TQL Stadium",
    },
  ],
};

const SCHEDULES: Record<LeagueKey, LeagueSchedule> = {
  wnba: WNBA_SCHEDULE,
  ufc: UFC_SCHEDULE,
  mls: MLS_SCHEDULE,
  "fifa-world-cup": FIFA_WORLD_CUP_SCHEDULE,
};

/** Tab order for the hub. */
export const EVENT_LEAGUE_ORDER: LeagueKey[] = [
  "wnba",
  "ufc",
  "mls",
  "fifa-world-cup",
];

/** Fetch a single league's schedule by key. */
export function getLeagueSchedule(key: LeagueKey): LeagueSchedule {
  return SCHEDULES[key];
}

/** All league schedules in tab order. */
export function listLeagueSchedules(): LeagueSchedule[] {
  return EVENT_LEAGUE_ORDER.map((k) => SCHEDULES[k]);
}

/** True when the league's upstream feed is wired up for this build. */
export function isSourceConnected(league: LeagueSchedule): boolean {
  return league.status === "connected";
}

const DISPLAY_TIME_ZONE = "America/New_York";

/**
 * "YYYY-MM-DD" calendar key for an instant, evaluated in the display
 * time zone (Eastern). Used to bin events into day groups. en-CA gives a
 * stable ISO-shaped date regardless of locale.
 */
function etDateKey(iso: string, timeZone: string = DISPLAY_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "Fri, May 29" style label for a date, in the display time zone. */
export function formatEventDateLabel(
  iso: string,
  timeZone: string = DISPLAY_TIME_ZONE,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** "7:30 PM ET" style label for a time, in the display time zone. */
export function formatEventTimeLabel(
  iso: string,
  timeZone: string = DISPLAY_TIME_ZONE,
): string {
  const t = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
  return `${t} ET`;
}

export interface EventDateGroup {
  /** "YYYY-MM-DD" key in the display time zone. */
  dateKey: string;
  /** Human label, e.g. "Fri, May 29". */
  label: string;
  events: ScheduleEvent[];
}

/**
 * Group events by their calendar day (Eastern), ascending by day and by
 * start time within each day. Returns `[]` for an empty input — the
 * caller renders the honest empty state. Never mutates the input.
 */
export function groupEventsByDate(
  events: ReadonlyArray<ScheduleEvent>,
  timeZone: string = DISPLAY_TIME_ZONE,
): EventDateGroup[] {
  const byKey = new Map<string, ScheduleEvent[]>();
  for (const ev of events) {
    const key = etDateKey(ev.startUtc, timeZone);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(ev);
    else byKey.set(key, [ev]);
  }

  return [...byKey.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((dateKey) => {
      const dayEvents = [...byKey.get(dateKey)!].sort((a, b) =>
        a.startUtc.localeCompare(b.startUtc),
      );
      return {
        dateKey,
        label: formatEventDateLabel(dayEvents[0].startUtc, timeZone),
        events: dayEvents,
      };
    });
}

/** "ESPN public scoreboard · snapshot 2026-05-29" attribution string. */
export function summarizeSource(source: ScheduleSource): string {
  const day = source.retrievedAt.slice(0, 10);
  return `${source.name} · snapshot ${day}`;
}
