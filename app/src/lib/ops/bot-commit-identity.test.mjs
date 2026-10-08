/**
 * OPS-002 — every automated data commit is authored AND committed as `github-actions[bot]`.
 *
 * 2026-10-07 17:40Z → 23:58Z: Vercel BLOCKED 21 consecutive Production deployments of bot data commits
 * (`seatBlock.blockCode: TEAM_ACCESS_REQUIRED`). Root cause, from 4,254 Vercel deployment records
 * (2026-08-20 → 10-08):
 *   - Vercel attributes a Git deployment to the GitHub account that GitHub resolves from the commit
 *     AUTHOR EMAIL, and — for a PRIVATE repository only — refuses it unless that account is a member of
 *     the Vercel team.
 *   - `gtp-bot <bot@users.noreply.github.com>` resolves to the unrelated GitHub user `bot` (id 58210622).
 *   - The repository was private exactly from ~17:09Z to ~00:08Z (`meta.githubRepoVisibility`). Every
 *     `bot`-attributed Production deployment in that window was BLOCKED (21/21); none outside it (0/1,616).
 *     The "intermittency" was the visibility change, not Vercel.
 *   - In the same private window `github-actions[bot]` (GitHub type Bot, Vercel `gitUser.type: bot`) and the
 *     team owner built normally.
 * Other identities had the same latent defect: `noreply@github.com` resolves to GitHub's `web-flow` user,
 * `noreply@anthropic.com` to Anthropic's `claude` account, `gtp-lifecycle@…` to an unregistered (claimable)
 * login. See docs/OPS_002_BOT_COMMIT_IDENTITY.md.
 *
 * Every workflow pushes with the job's GITHUB_TOKEN, i.e. as `github-actions[bot]`. Authoring the commit as
 * that same account makes author = committer = pusher, and the ID-prefixed noreply address
 * (`41898282+…`) is bound to the account id, so no one can register a login that captures it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const WORKFLOWS = path.join(ROOT, ".github/workflows");

export const BOT_NAME = "github-actions[bot]";
export const BOT_EMAIL = "41898282+github-actions[bot]@users.noreply.github.com";

/** Addresses that resolved to a GitHub account outside our control (or to none) — must never return. */
const RETIRED = [
  "bot@users.noreply.github.com", // → user `bot` (58210622): the 21 BLOCKED deployments
  "noreply@github.com", //           → user `web-flow`
  "noreply@anthropic.com", //        → user `claude`
  "gtp-lifecycle@users.noreply.github.com", // → unregistered login
];

const workflowFiles = fs
  .readdirSync(WORKFLOWS)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((f) => ({ name: f, text: fs.readFileSync(path.join(WORKFLOWS, f), "utf8") }));

/** Every `git config user.<key> "<value>"` (any scope flag), including several per line. */
export function identitySettings(text) {
  const out = [];
  const re = /git\s+config\s+(?:--(?:global|local|system)\s+)?user\.(name|email)\s+(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  for (const m of text.matchAll(re)) out.push({ key: m[1], value: m[2] ?? m[3] ?? m[4] });
  return out;
}

/** Other ways to set an identity: `git -c user.x=…`, GIT_AUTHOR_* / GIT_COMMITTER_* env. */
export function otherIdentitySettings(text) {
  const out = [];
  for (const m of text.matchAll(/git\s+-c\s+user\.(name|email)=("[^"]*"|'[^']*'|\S+)/g)) out.push(m[0]);
  for (const m of text.matchAll(/\bGIT_(?:AUTHOR|COMMITTER)_(?:NAME|EMAIL)\s*[:=]\s*\S+/g)) out.push(m[0]);
  return out;
}

const COMMITS = /\bgit\s+(?:-C\s+\S+\s+)?commit\b|commit-generated\.sh|roll_to_next_day\.sh|operator_settle\.sh/;

test("parser sees every identity form used in the workflows", () => {
  assert.deepEqual(identitySettings(`git config user.name  "a"; git config --global user.email 'b@c'\ngit config user.name d`), [
    { key: "name", value: "a" },
    { key: "email", value: "b@c" },
    { key: "name", value: "d" },
  ]);
  assert.equal(otherIdentitySettings(`git -c user.email=x@y commit\nGIT_AUTHOR_EMAIL: x@y`).length, 2);
});

test("every workflow git identity is github-actions[bot]", () => {
  const wrong = [];
  let seen = 0;
  for (const { name, text } of workflowFiles) {
    for (const s of identitySettings(text)) {
      seen++;
      const want = s.key === "name" ? BOT_NAME : BOT_EMAIL;
      if (s.value !== want) wrong.push(`${name}: user.${s.key} = ${s.value}`);
    }
  }
  assert.ok(seen >= 80, `expected the ~90 identity settings across the data producers, parsed ${seen}`);
  assert.deepEqual(wrong, []);
});

test("name and email are always configured together", () => {
  for (const { name, text } of workflowFiles) {
    const s = identitySettings(text);
    const names = s.filter((x) => x.key === "name").length;
    const emails = s.filter((x) => x.key === "email").length;
    assert.equal(names, emails, `${name}: ${names} user.name vs ${emails} user.email`);
  }
});

test("every workflow that commits configures the bot identity", () => {
  const missing = workflowFiles
    .filter(({ text }) => COMMITS.test(text))
    .filter(({ text }) => !identitySettings(text).some((s) => s.key === "email" && s.value === BOT_EMAIL))
    .map(({ name }) => name);
  assert.deepEqual(missing, []);
});

test("no workflow sets an identity any other way", () => {
  const found = workflowFiles.flatMap(({ name, text }) => otherIdentitySettings(text).map((x) => `${name}: ${x}`));
  assert.deepEqual(found, []);
});

test("retired identities never return to a workflow or commit script", () => {
  const scripts = [path.join(ROOT, "scripts"), path.join(ROOT, "app/scripts")].flatMap((dir) =>
    fs
      .readdirSync(dir, { recursive: true })
      .filter((f) => /\.(sh|mjs|js|py)$/.test(f))
      .map((f) => path.join(dir, f)),
  );
  const hits = [];
  for (const { name, text } of workflowFiles) {
    for (const s of identitySettings(text)) if (RETIRED.includes(s.value)) hits.push(`${name}: ${s.value}`);
  }
  for (const file of scripts) {
    const text = fs.readFileSync(file, "utf8");
    for (const s of identitySettings(text)) hits.push(`${path.relative(ROOT, file)}: user.${s.key} = ${s.value}`);
    for (const x of otherIdentitySettings(text)) if (RETIRED.some((r) => x.includes(r))) hits.push(`${path.relative(ROOT, file)}: ${x}`);
  }
  assert.deepEqual(hits, [], "commit scripts inherit the workflow identity; they must not set their own");
});

test("the bot email is the account-id-bound noreply form GitHub resolves to the Bot account", () => {
  // `<id>+<login>@users.noreply.github.com` resolves by account id. The legacy `<login>@users.noreply…`
  // form resolves by login — which is how `bot@…` landed on a stranger's account.
  assert.match(BOT_EMAIL, /^41898282\+github-actions\[bot\]@users\.noreply\.github\.com$/);
});
