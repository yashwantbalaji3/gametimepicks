/**
 * SIMULATION THEATER V2 · TRANSPORT MACHINE — play state, time cursor, speed, seek (spec §3.5). Pure: no timers, no DOM.
 *
 * Uses the presentation player's state vocabulary (player-machine.mjs: IDLE, PLAYING, PAUSED, COMPLETED, UNAVAILABLE,
 * ERROR). Playback NEVER starts on its own: only an explicit PLAY moves IDLE → PLAYING (founder D1: no autoplay).
 * Speed and seek only change `t`; outcomes come from stateAt, so 1×/2×/4× are identical at equal `t`.
 */
import { PLAYER_STATES } from "../simulate/presentation/player-machine.mjs";

export const TRANSPORT_STATES = PLAYER_STATES;
export const SPEEDS = Object.freeze([1, 2, 4]);
/** A frame's dt is clamped so a stalled tab cannot jump the playback forward. */
export const MAX_DT_MS = 100;
/** "Previous drive" restarts the current drive unless it is within this much of the drive's start. */
export const PREV_GRACE_MS = 1000;

/**
 * @param {{ tEnd: number, driveStarts: number[], unavailable?: boolean, reason?: string|null }} init
 */
export function createTransport({ tEnd, driveStarts, unavailable = false, reason = null }) {
  if (unavailable || !(tEnd > 0)) {
    return Object.freeze({ state: "UNAVAILABLE", t: 0, tEnd: 0, speed: 1, driveStarts: [], reason: reason ?? "Playback unavailable for this run." });
  }
  return Object.freeze({ state: "IDLE", t: 0, tEnd, speed: 1, driveStarts: [...driveStarts], reason: null });
}

const clampT = (m, t) => Math.min(m.tEnd, Math.max(0, t));

function driveIndexAt(m, t) {
  let idx = 0;
  for (let i = 0; i < m.driveStarts.length; i++) if (m.driveStarts[i] <= t) idx = i;
  return idx;
}

/**
 * Apply an action. An action a state does not accept returns the SAME object (compare by reference).
 * Actions: PLAY, PAUSE, TOGGLE, TICK {dt}, SEEK {t}, SPEED {speed}, RESTART, NEXT_DRIVE, PREV_DRIVE, FAIL {reason}.
 */
export function transport(m, action, arg = {}) {
  if (m.state === "UNAVAILABLE" || m.state === "ERROR") return m;
  switch (action) {
    case "PLAY": {
      if (m.state === "PLAYING") return m;
      // Play from the end replays from the start rather than doing nothing.
      const t = m.state === "COMPLETED" || m.t >= m.tEnd ? 0 : m.t;
      return Object.freeze({ ...m, state: "PLAYING", t });
    }
    case "PAUSE":
      return m.state === "PLAYING" ? Object.freeze({ ...m, state: "PAUSED" }) : m;
    case "TOGGLE":
      return m.state === "PLAYING" ? transport(m, "PAUSE") : transport(m, "PLAY");
    case "TICK": {
      if (m.state !== "PLAYING") return m;
      const dt = Math.min(MAX_DT_MS, Math.max(0, Number(arg.dt) || 0));
      const t = clampT(m, m.t + dt * m.speed);
      return t >= m.tEnd ? Object.freeze({ ...m, t: m.tEnd, state: "COMPLETED" }) : Object.freeze({ ...m, t });
    }
    case "SEEK": {
      const t = clampT(m, Number(arg.t) || 0);
      // A seek never starts playback; it keeps PLAYING if already playing, and leaves COMPLETED for PAUSED.
      const state = m.state === "PLAYING" ? (t >= m.tEnd ? "COMPLETED" : "PLAYING") : t >= m.tEnd ? "COMPLETED" : m.state === "IDLE" && t === 0 ? "IDLE" : "PAUSED";
      return Object.freeze({ ...m, t, state });
    }
    case "SPEED":
      return SPEEDS.includes(arg.speed) && arg.speed !== m.speed ? Object.freeze({ ...m, speed: arg.speed }) : m;
    case "RESTART":
      return Object.freeze({ ...m, t: 0, state: m.state === "PLAYING" ? "PLAYING" : "IDLE" });
    case "NEXT_DRIVE": {
      const i = driveIndexAt(m, m.t);
      return i + 1 < m.driveStarts.length ? transport(m, "SEEK", { t: m.driveStarts[i + 1] }) : transport(m, "SEEK", { t: m.tEnd });
    }
    case "PREV_DRIVE": {
      const i = driveIndexAt(m, m.t);
      const target = m.t - m.driveStarts[i] > PREV_GRACE_MS || i === 0 ? m.driveStarts[i] : m.driveStarts[i - 1];
      return transport(m, "SEEK", { t: target });
    }
    case "FAIL":
      return Object.freeze({ ...m, state: "ERROR", reason: arg.reason ?? "Playback stopped unexpectedly. The transcript below is unaffected." });
    default:
      return m;
  }
}

export const isPlaying = (m) => m.state === "PLAYING";
