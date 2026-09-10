/**
 * HOW YESTERDAY WENT (P251) — closing the daily loop.
 *
 * The product's day ended at publication. Everything settles overnight from official results, and
 * that record — the most credible thing here — lived only on /results, a 1.8 MB page a casual
 * reader never opens. So the loop was one-way: come for a forecast, never learn whether it landed.
 *
 * This assembles the most recent SETTLED day from the artifacts that already own it — the settled
 * card file and the MLB model-results rows — and computes nothing of its own beyond addition.
 * Both sources carry their own date, and if they disagree the recap says which day each figure is
 * from rather than folding two days into one number.
 *
 * A day with nothing settled returns null. An empty recap card is worse than none: it reads as a
 * broken widget rather than as "nothing has settled yet".
 */
import fs from "node:fs";
import path from "node:path";

const isDateFile = (f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

/** The newest date with a committed settlement file in a directory, or null. */
function newestDate(dir) {
  try {
    const files = fs.readdirSync(dir).filter(isDateFile).sort();
    return files.length ? files[files.length - 1].slice(0, 10) : null;
  } catch { return null; }
}

/**
 * @param {string} dataRoot absolute path to `public/data`
 * @returns {null | {
 *   date: string,
 *   cards: { published: number, hit: number, missed: number, other: number },
 *   model: null | { date: string, wins: number, losses: number, pushes: number, decisive: number, games: number },
 *   sameDay: boolean,
 * }}
 */
export function buildYesterdayRecap(dataRoot) {
  const cardsDir = path.join(dataRoot, "parlays", "lab-settled");
  const date = newestDate(cardsDir);
  if (!date) return null;
  const doc = readJson(path.join(cardsDir, `${date}.json`));
  const cardRows = doc?.cards ?? [];
  if (cardRows.length === 0) return null;

  /* The producer's own vocabulary. A card is hit, missed, or something else it says for itself —
     this never re-derives a verdict from legs, which is how two surfaces start disagreeing. */
  const cards = { published: cardRows.length, hit: 0, missed: 0, other: 0 };
  for (const c of cardRows) {
    if (c.result === "win") cards.hit += 1;
    else if (c.result === "loss") cards.missed += 1;
    else cards.other += 1;
  }

  const modelDoc = readJson(path.join(dataRoot, "mlb", "results", "model-rows", `${date}.json`));
  const model = modelDoc && Number.isFinite(modelDoc.decisive)
    ? {
      date: modelDoc.date ?? date,
      wins: modelDoc.wins ?? 0,
      losses: modelDoc.losses ?? 0,
      pushes: modelDoc.pushes ?? 0,
      decisive: modelDoc.decisive ?? 0,
      games: modelDoc.games ?? 0,
    }
    : null;

  return { date, cards, model, sameDay: !model || model.date === date };
}
