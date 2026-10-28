/**
 * PROMPTS FOR DELEGATED ENGINEERING — what each provider is told, built only from approved artifacts.
 *
 * The ChatGPT facts carry the current code excerpt (ChatGPT cannot read the repo). The Claude prompts carry the
 * approved spec and plan verbatim, with the digest the founder approved, so every hand-off is traceable.
 */
import fs from "node:fs";
import path from "node:path";
import { ALLOWED_PREFIXES } from "../contracts/engineering.mjs";

export const HARD_CONSTRAINTS = Object.freeze([
  `Only files under ${ALLOWED_PREFIXES.join(" and ")} may change. Nothing else in the repository.`,
  "No new dependencies, no build steps, no network calls; plain browser JavaScript and CSS in the console.",
  "Keep every existing test passing and keep the iPhone 390/430 px layouts working (no horizontal overflow, touch targets ≥ 44 px).",
  "Do not change what the approval buttons do; approvals stay bound to the exact content digest.",
  "No pushes, commits, PRs or deployments — the founder decides at gate G3 whether the change is kept.",
]);

/** The renderDecisions() function from the console, so ChatGPT can specify against real code. */
export function decisionsExcerpt(ccRoot) {
  const src = fs.readFileSync(path.join(ccRoot, "surfaces/console/app.js"), "utf8");
  const start = src.indexOf("  function renderDecisions(");
  const end = src.indexOf("  function renderControls(");
  return start >= 0 && end > start ? src.slice(start, end).trim() : "(excerpt unavailable)";
}

/** Facts handed to the Prompt Architect's manual seat (rendered into the copy-paste prompt). */
export function specFacts(commandText, ccRoot) {
  return {
    request: commandText,
    product: "GameTimePicks CEO Command Center — a local console (plain HTML/CSS/JS in command-center/surfaces/console/) where the founder approves social captions.",
    allowedPaths: [...ALLOWED_PREFIXES],
    hardConstraints: HARD_CONSTRAINTS,
    currentCode_renderDecisions_appJs: decisionsExcerpt(ccRoot),
    note: "Write a specification for an engineer (Claude Code) who will read the repository. Keep it small and testable.",
  };
}

/** Lines of `src` from `from` to `to` (1-based, inclusive), prefixed with line numbers like the Read tool. */
function numbered(src, from, to) {
  return src.split("\n").slice(from - 1, to).map((l, i) => `${String(from + i).padStart(5)}\t${l}`).join("\n");
}

function blockLines(src, startMarker, endMarker) {
  const lines = src.split("\n");
  const a = lines.findIndex((l) => l.includes(startMarker));
  if (a < 0) return null;
  const b = endMarker ? lines.findIndex((l, i) => i > a && l.includes(endMarker)) : -1;
  return [a + 1, b > a ? b : Math.min(lines.length, a + 40)];
}

/**
 * THE CONTEXT PACKET — what Claude would otherwise spend turns exploring, handed over up front from the working
 * copy itself (so line numbers match what Claude will edit): an inventory of the editable files, the decisions
 * card renderer and click handler from app.js, the caption/option/decision CSS rules, and the tests that cover
 * the Approvals card. The first real plan run read 8 files across 13 turns; this packet makes most reads redundant.
 */
export function contextPacket(wcDir) {
  const read = (rel) => fs.readFileSync(path.join(wcDir, rel), "utf8");
  const inventory = [];
  for (const dir of ALLOWED_PREFIXES) {
    const abs = path.join(wcDir, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) {
      const rel = `${dir}${f}`;
      if (!fs.statSync(path.join(wcDir, rel)).isFile()) continue;
      const src = read(rel);
      const first = (src.match(/^\s*(?:\/\*\*?|<!--)?\s*\**\s*(.+)$/m) ?? [])[1] ?? "";
      inventory.push({ path: rel, lines: src.split("\n").length, about: first.replace(/\*\/|-->/g, "").trim().slice(0, 110) });
    }
  }
  const excerpts = [];
  const add = (file, range, why) => {
    if (!range) return;
    excerpts.push({ file, lines: `${range[0]}-${range[1]}`, why, text: numbered(read(file), range[0], range[1]) });
  };
  const app = "command-center/surfaces/console/app.js";
  if (fs.existsSync(path.join(wcDir, app))) {
    const src = read(app);
    add(app, blockLines(src, "function renderDecisions(", "function renderControls("), "renders the Approvals card, including each caption option");
    add(app, blockLines(src, 'document.addEventListener("click"', 'document.addEventListener("input"'), "the single click handler (data-* attributes) to extend");
  }
  const css = "command-center/surfaces/console/styles.css";
  if (fs.existsSync(path.join(wcDir, css))) {
    const src = read(css).split("\n");
    const hits = src.map((l, i) => [i + 1, l]).filter(([, l]) => /\.(option|decision|caption)\b|@media|\.btn\.small/.test(l));
    if (hits.length) excerpts.push({ file: css, lines: hits.map(([n]) => n).join(","), why: "caption/option/decision rules and the media-query boundaries", text: hits.map(([n, l]) => `${String(n).padStart(5)}\t${l}`).join("\n") });
  }
  const mobile = "command-center/tests/console-mobile.test.mjs";
  if (fs.existsSync(path.join(wcDir, mobile))) {
    const src = read(mobile);
    add(mobile, blockLines(src, "// Approvals, reached", "// Tasks, Activity, Team."), "the iPhone test of the Approvals card (390/430 px)");
  }
  const chars = JSON.stringify({ inventory, excerpts }).length;
  return { inventory, excerpts, chars };
}

const PACKET_TEXT = (packet) => [
  "Editable files (path · lines · first comment):",
  ...packet.inventory.map((f) => `- ${f.path} · ${f.lines} lines · ${f.about}`),
  "",
  ...packet.excerpts.flatMap((e) => [`--- ${e.file} (lines ${e.lines}) — ${e.why} ---`, e.text, ""]),
].join("\n");

const PLAN_LIMITS = [
  "summary ≤ 500 characters",
  "files: at most 4, each `change` ≤ 500 characters",
  "steps: at most 8, each ≤ 250 characters",
  "risks: at most 5; testPlan: at most 5, each ≤ 250 characters",
];

export function planPrompt({ spec, specDigest, packet }) {
  return [
    "You are the Engineering seat of the GameTimePicks CEO Command Center, running headless in an isolated working copy (the current directory).",
    "This is a READ-ONLY planning run. Plan only the proposed change and its tests.",
    "",
    `The founder approved this engineering specification at gate G1 (sha256 ${specDigest}). It was written by ChatGPT:`,
    JSON.stringify(spec, null, 2),
    "",
    "Hard constraints:",
    ...HARD_CONSTRAINTS.map((c) => `- ${c}`),
    "",
    "CONTEXT PACKET — current code from this working copy. It is accurate; rely on it.",
    PACKET_TEXT(packet),
    "",
    "How to work (this run has a small usage budget):",
    "- Use the packet first. Only Read a file if an excerpt is genuinely insufficient: at most 3 Read/Grep/Glob calls in total, and never read the same file twice.",
    "- Do not explore other directories (no orchestrator/, contracts/, recap/, engineering/, app/, data/).",
    `- Keep the plan concise: ${PLAN_LIMITS.join("; ")}.`,
    "- Call StructuredOutput exactly ONCE, with the complete plan (summary, files, steps, risks, testPlan). Paths are repo-relative.",
  ].join("\n");
}

export function buildPrompt({ spec, specDigest, plan, planDigest, packet }) {
  return [
    "You are the Engineering seat of the GameTimePicks CEO Command Center, running headless in an isolated working copy (the current directory).",
    `Implement exactly the plan the founder approved at gate G2 (sha256 ${planDigest}), for the spec approved at G1 (sha256 ${specDigest}).`,
    "",
    "Approved spec:",
    JSON.stringify(spec, null, 2),
    "",
    "Approved plan:",
    JSON.stringify(plan, null, 2),
    "",
    "Hard constraints:",
    ...HARD_CONSTRAINTS.map((c) => `- ${c}`),
    "",
    "CONTEXT PACKET — current code from this working copy:",
    packet ? PACKET_TEXT(packet) : "(none)",
    "",
    "How to work (this run has a usage budget):",
    "- Read each file you will edit once (the Edit tool requires it), then edit. Do not read files you won't change; do not explore other directories.",
    "- You can edit or create files only under the allowed paths. You cannot run commands: the orchestrator runs the full test suite and takes desktop/iPhone screenshots after you finish.",
    "- If the plan includes a test, write it with node:test like the existing files in command-center/tests/.",
    "- When done, call StructuredOutput exactly once: summary (≤ 500 chars), filesChanged (repo-relative), notes (≤ 5 items).",
  ].join("\n");
}
