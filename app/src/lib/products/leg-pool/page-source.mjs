/**
 * FOUNDER RULE B (approved 2026-11-03): the Bank Builder, Moonshot and Parlay Center pages show the FROZEN daily file
 * (app/public/data/suggested-cards/<date>.json, the first generation of the day) instead of re-picking at every deploy
 * (5 different NBA Bank Builder cards were shown on 2026-11-02). ON. With no file for the day, or a file whose content
 * digest does not verify, this returns null and the page keeps its own fallback. Node-only, read-only.
 */
import fs from "node:fs";
import path from "node:path";
import { verifySuggestedCards } from "./daily-cards.mjs";

export const FROZEN_DAILY_CARDS_PUBLIC = true;
export const FROZEN_DAILY_CARDS_FLAG = "NEXT_PUBLIC_FROZEN_DAILY_CARDS";
export const frozenDailyCardsEnabled = (env = { [FROZEN_DAILY_CARDS_FLAG]: process.env.NEXT_PUBLIC_FROZEN_DAILY_CARDS }) => FROZEN_DAILY_CARDS_PUBLIC || env[FROZEN_DAILY_CARDS_FLAG] === "1";

/** The day's frozen file, or null (switch off, no file, unreadable, or not the schema/date asked for). */
export function loadFrozenDailyCards({ appDir = process.cwd(), date, enabled = frozenDailyCardsEnabled() }) {
  if (!enabled || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(appDir, "public", "data", "suggested-cards", `${date}.json`), "utf8"));
    return verifySuggestedCards(doc) && doc.productDay === date ? doc : null;
  } catch { return null; }
}
