/**
 * NBA SIMULATION THEATER · POSSESSION PLAY-BY-PLAY TEXT. Pure; client-safe.
 * One line per engine event, from templates — the text restates the event's own fields and adds nothing the engine did
 * not record (no shot locations, distances, dunks or timeouts: not modelled).
 */
const short = (name) => {
  if (!name) return null;
  const parts = String(name).trim().split(/\s+/);
  if (parts.length < 2) return parts[0];
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i.test(parts[parts.length - 1]) ? ` ${parts.pop()}` : "";
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}${suffix}`;
};

/**
 * @param e      engine event
 * @param names  Map<providerAthleteId, displayName>
 * @param abbr   [homeAbbr, awayAbbr]
 * @returns {{ text: string, kind: string, team: 0|1|null, scoring: boolean }}
 */
export function playLine(e, names, abbr) {
  const nm = (id) => (id == null ? null : short(names.get(String(id))) ?? `Player ${id}`);
  const team = e.team ?? null;
  const T = (t) => abbr[t] ?? (t === 0 ? "Home" : "Away");
  switch (e.type) {
    case "period_start": return { text: e.q <= 4 ? `Start of the ${["1st", "2nd", "3rd", "4th"][e.q - 1]} quarter` : `Start of overtime ${e.q - 4}`, kind: "period", team: null, scoring: false };
    case "jump_ball": return { text: `Jump ball · ${T(e.team)} win the tip`, kind: "jump", team, scoring: false };
    case "sub": return { text: `Substitution · ${T(e.team)}: ${nm(e.in)} in for ${nm(e.out)}`, kind: "sub", team, scoring: false };
    case "shot": {
      const what = `${e.value}-point shot`;
      if (e.made) return { text: `${nm(e.player)} makes a ${what}${e.assist != null ? ` (assist: ${nm(e.assist)})` : ""}`, kind: e.value === 3 ? "three" : "two", team, scoring: true };
      return { text: `${nm(e.player)} misses a ${what}${e.block != null ? ` · blocked by ${nm(e.block)}` : ""}`, kind: "miss", team, scoring: false };
    }
    case "free_throw": return { text: `${nm(e.player)} ${e.made ? "makes" : "misses"} free throw ${e.n} of ${e.of}`, kind: e.made ? "ft" : "ft-miss", team, scoring: !!e.made };
    case "rebound": return { text: e.player == null ? `${T(e.team)} team ${e.kind} rebound` : `${e.kind === "offensive" ? "Offensive" : "Defensive"} rebound · ${nm(e.player)}`, kind: "rebound", team, scoring: false };
    case "turnover": return { text: `Turnover · ${nm(e.player)}${e.steal != null ? ` · stolen by ${nm(e.steal)}` : ""}`, kind: "turnover", team, scoring: false };
    case "foul": {
      const k = { shooting: "Shooting foul", and_one: "Shooting foul (and-one)", personal: "Personal foul", late_intentional: "Intentional foul (late game)" }[e.kind] ?? "Foul";
      return { text: `${k} · ${nm(e.player)}${e.on != null ? ` on ${nm(e.on)}` : ""}${e.fouledOut ? ` · ${nm(e.player)} fouls out (6th foul)` : ""}`, kind: "foul", team, scoring: false };
    }
    case "period_end": return { text: e.q <= 4 ? `End of the ${["1st", "2nd", "3rd", "4th"][e.q - 1]} quarter` : `End of overtime ${e.q - 4}`, kind: "period", team: null, scoring: false };
    case "game_end": return { text: "Final", kind: "final", team: null, scoring: false };
    default: return { text: e.type, kind: "other", team, scoring: false };
  }
}
