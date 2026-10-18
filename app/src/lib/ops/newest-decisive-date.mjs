/**
 * The newest settled date the public research contract can be "behind" (2026-10-17).
 *
 * build-public-research-contract summarises the research universe, which is the DECISIVE rows only:
 * model-learning-audit loadRows() keeps outcome Win/Loss and drops Void. Its asOfSettledDate is therefore the newest date
 * with a decisive row. The health gate compared it with the newest date over EVERY ledger row, voids included. When a
 * slate settles only voids (gamePk 849817 was postponed 10-16 → 10-18, and all 41 props on 10-16 voided), a correct
 * contract read as "stale", and the nightly-settle publish aborted. Both sides now use the same population.
 *
 * Pure: takes the raw JSONL text; a bad line never breaks it.
 */
export function newestDecisiveDate(jsonlText) {
  let newest = "";
  for (const line of String(jsonlText ?? "").split("\n")) {
    if (!line.trim()) continue;
    let r;
    try { r = JSON.parse(line); } catch { continue; }
    const o = String(r?.outcome ?? "").toLowerCase();
    if (o !== "win" && o !== "loss") continue;
    const d = r?.date ?? "";
    if (d > newest) newest = d;
  }
  return newest;
}
