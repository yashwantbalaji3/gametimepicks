/** Test helpers: a fresh orchestrator on a temp directory with a deterministic clock. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFileStore } from "../ledger/store.mjs";
import { createOrchestrator } from "../orchestrator/orchestrator.mjs";
import { stepClock } from "../lib/util.mjs";

export const FOUNDER = Object.freeze({ role: "founder", id: "founder", surface: "test" });
export const STRANGER = Object.freeze({ role: "agent", id: "social-strategy", surface: "test" });
export const RECAP_COMMAND = "Team, prepare GameTimePicks' NFL postgame recap content for last night's games. Identify content opportunities, draft graphics and captions, and report what needs my approval.";

export function tempDir(prefix = "gtp-cc-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Pinned to the 2026-10-25 slate so a new data commit can never change what these tests see. */
export const TEST_SLATE = "2026-10-25";

export function freshOrchestrator({ dir = tempDir(), env = {}, origin } = {}) {
  const clock = stepClock(origin);
  const store = createFileStore({ dir: path.join(dir, "ledger"), clock });
  const orchestrator = createOrchestrator({ store, clock, env, outDir: dir, slateDate: TEST_SLATE });
  return { dir, store, orchestrator };
}

/** Every ledger file under dir, as { relativePath: bytes }. */
export function ledgerSnapshot(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else out[path.relative(dir, p)] = fs.readFileSync(p, "utf8");
    }
  };
  walk(path.join(dir, "ledger"));
  return out;
}

/** v3 console navigation: open a section by id on any width (the sidebar holds every section, even when hidden). */
export async function openView(page, id) {
  await page.locator(`.sidenav [data-tab="${id}"]`).waitFor({ state: "attached" });
  await page.evaluate((v) => document.querySelector(`.sidenav [data-tab="${v}"]`).click(), id);
  await page.locator(`body[data-view="${id}"]`).waitFor();
}
/** Review cards start compact: expand one (no-op if it already is). */
export async function expandPost(post) {
  if (!(await post.evaluate((el) => el.classList.contains("expanded")))) await post.locator("[data-expand]").first().click();
  await post.locator(".rbody").waitFor();
}
