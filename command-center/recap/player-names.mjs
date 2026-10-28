/**
 * PLAYER NAME FORMATTING — one deterministic system for every player-focused graphic (V2.2 typography standard).
 *
 * Names are never shrunk to fit. Each name has an ordered list of display forms, and a graphic uses the first form
 * that fits its column at the component's fixed type size:
 *   full      "Nickeil Alexander-Walker", "Kelly Oubre Jr.", "Karl-Anthony Towns"
 *   short     "N. Alexander-Walker", "K. Oubre Jr.", "K. Towns" (first initial — hyphenated first names use their first
 *             letter — plus the full surname, compound particles and suffix kept)
 *   surname   "Alexander-Walker", "Oubre Jr." (only when the graphic already identifies the team, e.g. a team column)
 * Identity is preserved: surnames are never cut, suffixes are kept, and when two players in one graphic would share a
 * short form ("J. Williams"), both keep their full names.
 */
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "v"]);
const PARTICLES = new Set(["de", "da", "del", "della", "di", "van", "von", "der", "den", "la", "le", "st", "st.", "mac", "dos", "das"]);

/** Split a name into first, surname (with particles) and suffix. */
export function parseName(name) {
  const tokens = String(name).trim().split(/\s+/).filter(Boolean);
  let suffix = null;
  if (tokens.length > 2 && SUFFIXES.has(tokens.at(-1).toLowerCase())) suffix = tokens.pop();
  if (tokens.length < 2) return { first: "", surname: tokens.join(" "), suffix };
  let i = tokens.length - 1;
  while (i > 1 && PARTICLES.has(tokens[i - 1].toLowerCase())) i--;
  return { first: tokens[0], surname: tokens.slice(i).join(" "), suffix };
}

const initialOf = (first) => (/^[A-Z]{2,3}$/.test(first) ? first : `${first.replace(/^[^A-Za-z]+/, "")[0] ?? ""}.`);

/** Ordered display forms for one name (deduplicated). */
export function nameForms(name, { allowSurname = false } = {}) {
  const { first, surname, suffix } = parseName(name);
  const sfx = suffix ? ` ${suffix}` : "";
  const forms = [String(name).trim()];
  if (first) forms.push(`${initialOf(first)} ${surname}${sfx}`);
  if (allowSurname) forms.push(`${surname}${sfx}`);
  return [...new Set(forms)];
}

/**
 * Forms for every name in one graphic: a short form shared by two different players is removed from both (they keep
 * their full names, which are then the only forms — the layout must make room, it never guesses).
 */
export function formsForGroup(names, opts) {
  const all = names.map((n) => nameForms(n, opts));
  const count = new Map();
  for (const forms of all) for (const f of forms.slice(1)) count.set(f, (count.get(f) ?? 0) + 1);
  return all.map((forms) => [forms[0], ...forms.slice(1).filter((f) => count.get(f) === 1)]);
}
