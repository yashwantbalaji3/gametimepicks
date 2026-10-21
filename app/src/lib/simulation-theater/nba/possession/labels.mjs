/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK · LABELS (pure; client-safe). Every reader-facing claim about what the
 * possession playback is and is not lives here, so the dev route, the public candidate and the tests print one text.
 */
import { WHAT_IF_BANNER, WHAT_IF_TAG } from "../../representative-labels.mjs";

export const POSSESSION_ENGINE_ID = "nba-possession-sim-v0";
export const POSSESSION_PLAYBACK_SCHEMA = "nba-possession-playback@1";

/** The engine's identity, printed on EVERY Theater surface (release owner 2026-10-21): a THIRD, research engine — not v1. */
export const ENGINE_IDENTITY = `Research possession engine ${POSSESSION_ENGINE_ID}, unvalidated`;
export const ENGINE_LABEL = `${ENGINE_IDENTITY} — not the official forecast, not the v1 supporting simulation`;
export const POSSESSION_BANNER = `SIMULATED GAME · RESEARCH POSSESSION ENGINE ${POSSESSION_ENGINE_ID.toUpperCase()}, UNVALIDATED · NOT THE OFFICIAL FORECAST · NOT A PREDICTION OF THIS GAME'S PLAYS`;
export const WHAT_IS_REAL =
  "Real possession-level generation: every play, score change, clock reading, possession arrow and lineup below comes from one stored event log of the engine, and the box score is that log added up. The court graphic is decorative: player positions, ball movement and shot locations are not modelled.";
export const ENGINE_NOTE =
  "This engine is an unvalidated research simulation. It is a different model from both the official forecast and the v1 supporting simulation; its runs are independent draws (not reconciled to v1's draws), it has no preregistered evaluation, it has not been shown to be more accurate, and nothing it shows changes an official number.";

export const OFFICIAL_PANEL_TITLE = "Official projection";
export const OFFICIAL_PANEL_NOTE = "The canonical forecast for this game. It is the same for every run and every what-if; no run below changes it.";
export const WITHHELD = "Withheld";
export const OUTCOME_PANEL_TITLE = `Simulation outcome · this run · ${ENGINE_IDENTITY}`;
// Gate V2 labels describe v1 runs; this engine is NOT v1, so its default run says which engine it is.
export const DEFAULT_RUN_TITLE = `Simulated game · one run of the ${ENGINE_IDENTITY.replace(/^R/, "r")}`;
export const DEFAULT_RUN_SUBTITLE = "an individual research-engine run; the official projection beside it never changes";
export { WHAT_IF_BANNER, WHAT_IF_TAG };

/** What the possession engine does not model (research doc §7), printed on every page. */
export const POSSESSION_NOT_MODELLED = Object.freeze([
  "Shot locations, player movement and ball movement (the court graphic is decorative)",
  "Timeouts and coach's challenges",
  "Offensive fouls (booked as turnovers; every personal foul is on the defence)",
  "Bonus / penalty situations (folded into the fitted free-throw trip rate)",
  "Late-game strategy beyond intentional fouling (overtime is rarer than in real games)",
  "Technical fouls (folded into odd free-throw trips)",
  "Fatigue and blowout rest",
]);

export const KEYBOARD_HELP = "Keys: Space or K play / pause · , and . previous / next play · [ and ] previous / next quarter · Home restart · End final";
