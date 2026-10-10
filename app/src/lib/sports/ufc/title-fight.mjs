/**
 * IS THIS BOUT A TITLE FIGHT? Only when the provider says so (UFC-001, 2026-10-10).
 *
 * The card builder used `titleFight: scheduledRounds === 5`. Every UFC main event is five rounds, title or not, so
 * UFC Fight Night: Allen vs. Duncan (a non-title middleweight main event; ufc.com: "Middleweight Bout") was published
 * as "Main event · title fight". Five rounds is not evidence of a belt.
 *
 * The free ESPN scoreboard carries no per-bout title flag. It does list the belts a fighter currently holds
 * (`competitors[].athlete.accolades[]`, `type: "Belt"`, e.g. "UFC Featherweight Title", "UFC Interim Bantamweight
 * Title"). A bout is marked a title fight only when it is scheduled for five rounds AND a fighter holds the UFC belt of
 * THIS bout's weight class (women's divisions matched as women's). Anything else is false.
 *
 * This fails safe: a vacant-title fight (nobody holds the belt) is not labelled, and a champion fighting outside his
 * division is not labelled either. A missing label is a smaller error than an invented belt.
 */

/** ESPN `competition.type.abbreviation` ("Featherweight", "W Strawweight") → { women, division }. */
function divisionOf(weightClass) {
  const wc = String(weightClass ?? "").trim();
  const women = /^W\s+/i.test(wc) || /^women'?s\s+/i.test(wc);
  const division = wc.replace(/^W\s+/i, "").replace(/^women'?s\s+/i, "").trim().toLowerCase();
  return { women, division };
}

/** "UFC [Interim ][Women's ]<Division> Title" → { women, division }, or null when it is not a UFC divisional belt. */
function beltDivision(name) {
  const m = /^UFC\s+(?:Interim\s+)?(Women'?s\s+)?(.+?)\s+Title$/i.exec(String(name ?? "").trim());
  return m ? { women: !!m[1], division: m[2].trim().toLowerCase() } : null;
}

/**
 * @param {{ type?: { abbreviation?: string }, format?: { regulation?: { periods?: number } }, competitors?: Array<{ athlete?: { accolades?: Array<{ type?: string, name?: string }> } }> }} competition
 * @returns {{ titleFight: boolean, titleFightBasis: "PROVIDER_BELT_HOLDER" | null }}
 */
export function titleFightFromProvider(competition) {
  const none = { titleFight: false, titleFightBasis: null };
  if ((competition?.format?.regulation?.periods ?? 3) !== 5) return none;
  const bout = divisionOf(competition?.type?.abbreviation);
  if (!bout.division) return none;
  for (const c of competition?.competitors ?? []) {
    for (const a of c?.athlete?.accolades ?? []) {
      if (a?.type !== "Belt") continue;
      const belt = beltDivision(a.name);
      if (belt && belt.division === bout.division && belt.women === bout.women) {
        return { titleFight: true, titleFightBasis: "PROVIDER_BELT_HOLDER" };
      }
    }
  }
  return none;
}
