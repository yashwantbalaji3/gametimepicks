/**
 * NBA SIMULATION THEATER · POSSESSION PLAYBACK · LABELS (pure; client-safe). Every reader-facing claim about what the
 * possession playback is and is not lives here, so the dev route, the public candidate and the tests print one text.
 */
import { SUPPORTING_RUN_SUBTITLE, SUPPORTING_RUN_TITLE, WHAT_IF_BANNER, WHAT_IF_TAG } from "../../representative-labels.mjs";

export const POSSESSION_ENGINE_ID = "nba-possession-sim-v0";
export const POSSESSION_PLAYBACK_SCHEMA = "nba-possession-playback@1";

export const ENGINE_LABEL = `Possession-level research simulation (${POSSESSION_ENGINE_ID}) — not the official forecast`;
export const POSSESSION_BANNER = "SIMULATED GAME · POSSESSION-LEVEL RESEARCH SIMULATION · NOT THE OFFICIAL FORECAST · NOT A PREDICTION OF THIS GAME'S PLAYS";
export const WHAT_IS_REAL =
  "Real possession-level generation: every play, score change, clock reading, possession arrow and lineup below comes from one stored event log of the engine, and the box score is that log added up. The court graphic is decorative: player positions, ball movement and shot locations are not modelled.";
export const ENGINE_NOTE =
  "This engine is a research simulation. It is a different model from the official forecast, it has not been shown to be more accurate, and nothing it shows changes an official number.";

export const OFFICIAL_PANEL_TITLE = "Official projection";
export const OFFICIAL_PANEL_NOTE = "The canonical forecast for this game. It is the same for every run and every what-if; no run below changes it.";
export const WITHHELD = "Withheld";
export const OUTCOME_PANEL_TITLE = "Simulation outcome · this run";
export const DEFAULT_RUN_TITLE = SUPPORTING_RUN_TITLE;
export const DEFAULT_RUN_SUBTITLE = SUPPORTING_RUN_SUBTITLE;
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
