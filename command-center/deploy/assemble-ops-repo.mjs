#!/usr/bin/env node
/**
 * Assemble the private ops repo (gtp-ops) as a NEW LOCAL git repository. Nothing is created on GitHub, pushed or
 * deployed: it prints the push command for when you have created the empty private repo and said go.
 *
 *   node command-center/deploy/assemble-ops-repo.mjs --out ~/Downloads/gtp-ops [--source HEAD] [--public origin/main]
 *
 * Layout (docs/hosted-deployment-runbook.md §1):
 *   command-center/          `git archive <source> command-center` (tracked files only: no out/, node_modules, .env)
 *   api/index.mjs, vercel.json   from deploy/vercel/
 *   .github/workflows/       cc-publisher.yml, cc-worker.yml (actions pinned to commit SHAs)
 *   public-snapshot/app/     the few public-site files the web function imports, read from <public> (never this
 *                            branch); Vercel's build copies them to app/. On Actions, app/ is the live sparse checkout.
 *   .gitignore, README.md, SOURCE.json (source commits + sha256 of every snapshot file)
 *
 * Refuses an existing --out, and any file that looks like a credential.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

/** Public-site files the Vercel function needs (static imports + the logo route). tests/ops-repo.test.mjs keeps it complete. */
export const PUBLIC_SNAPSHOT_FILES = [
  "app/scripts/build-mlb-social-content.mjs",
  "app/src/lib/simulation-theater/field-geometry.mjs",
  "app/src/lib/simulation-theater/nfl-team-colors.mjs",
  "app/src/lib/simulation-theater/nba/nba-team-colors.mjs",
  "app/src/lib/simulation-theater/nba/nba-team-colors.json",
  "app/public/brand/gametime-picks-logo.png",
];

/** Things that must never be in the ops repo. Matched on content, so the message names the file, never the value. */
export const CREDENTIAL_PATTERNS = [
  /github_pat_[A-Za-z0-9_]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /vercel_blob_rw_[A-Za-z0-9_]{16,}/,
  /sk-ant-[A-Za-z0-9-]{20,}/, /\bsk-[A-Za-z0-9]{32,}/, /xai-[A-Za-z0-9]{32,}/,
  /postgres(?:ql)?:\/\/[^:\s/'"`]+:[^@\s'"`…$]{8,}@/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const git = (cwd, args, opts = {}) => execFileSync("git", args, { cwd, maxBuffer: 1 << 28, ...opts });

/** Every file under dir (relative paths), skipping .git. */
export function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === ".git") return [];
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join("/")];
  });
}

/** @returns {{file: string, why: string}[]} credential-looking content or forbidden paths in an assembled tree */
export function scanTree(dir) {
  const problems = [];
  for (const f of listFiles(dir)) {
    if (/(^|\/)(node_modules|out)\//.test(f) || /(^|\/)\.env(\.|$)/.test(f) || /\.(pem|key|p12)$/.test(f)) problems.push({ file: f, why: "forbidden path" });
    const buf = fs.readFileSync(path.join(dir, f));
    if (buf.includes(0)) continue; // binary (the logo)
    const text = buf.toString("utf8");
    for (const re of CREDENTIAL_PATTERNS) if (re.test(text)) problems.push({ file: f, why: `looks like a credential (${re.source.slice(0, 18)}…)` });
  }
  return problems;
}

export function assemble({ repoRoot, out, source = "HEAD", publicRef = "origin/main", commit = true }) {
  if (fs.existsSync(out)) throw new Error(`${out} already exists: pick a new folder (this never overwrites)`);
  const sourceSha = git(repoRoot, ["rev-parse", `${source}^{commit}`], { encoding: "utf8" }).trim();
  const publicSha = git(repoRoot, ["rev-parse", `${publicRef}^{commit}`], { encoding: "utf8" }).trim();
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-ops-"));
  try {
    // 1. command-center/ exactly as committed at <source>
    const tar = git(repoRoot, ["archive", "--format=tar", sourceSha, "command-center"]);
    execFileSync("tar", ["-x", "-C", staging], { input: tar });
    const cc = path.join(staging, "command-center");
    // 2. root files
    const put = (rel, bytes) => { const p = path.join(staging, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); };
    put("api/index.mjs", fs.readFileSync(path.join(cc, "deploy/vercel/api/index.mjs")));
    put("vercel.json", fs.readFileSync(path.join(cc, "deploy/vercel/vercel.json")));
    put(".gitignore", fs.readFileSync(path.join(cc, "deploy/ops-repo.gitignore")));
    for (const w of ["cc-publisher.yml", "cc-worker.yml"]) put(`.github/workflows/${w}`, fs.readFileSync(path.join(cc, "deploy/github", w)));
    // 3. the public-site snapshot, from the public main branch (read-only)
    const snapshot = {};
    for (const f of PUBLIC_SNAPSHOT_FILES) {
      const bytes = git(repoRoot, ["show", `${publicSha}:${f}`]);
      put(`public-snapshot/${f}`, bytes);
      snapshot[f] = sha256(bytes);
    }
    put("SOURCE.json", `${JSON.stringify({ commandCenter: { repo: "yashwantbalaji3/gametimepicks", commit: sourceSha }, publicSnapshot: { repo: "yashwantbalaji3/gametimepicks", commit: publicSha, files: snapshot } }, null, 2)}\n`);
    put("README.md", README);
    // 4. nothing that looks like a credential, no build output
    const problems = scanTree(staging);
    if (problems.length) throw new Error(`refused:\n${problems.map((p) => `  ${p.file}: ${p.why}`).join("\n")}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.renameSync(staging, out);
  } catch (err) { fs.rmSync(staging, { recursive: true, force: true }); throw err; }
  if (commit) {
    git(out, ["init", "-q", "-b", "main"]);
    git(out, ["add", "-A"]);
    git(out, ["commit", "-q", "-m", `gtp-ops: hosted Command Center from gametimepicks ${sourceSha.slice(0, 10)} (public snapshot ${publicSha.slice(0, 10)})`]);
  }
  return { out, sourceSha, publicSha, files: listFiles(out).length };
}

const README = `# gtp-ops (private)

The hosted GameTimePicks CEO Command Center: \`https://team.gametimepicks.yashwantbalaji.com\`.
Assembled by \`command-center/deploy/assemble-ops-repo.mjs\` from the public repo; see \`SOURCE.json\` for the commits.

- **Vercel project \`gtp-team\`** deploys \`main\` only: \`api/index.mjs\` + \`vercel.json\`. The build copies
  \`public-snapshot/app\` to \`app/\` (the few public-site files the function imports).
- **Actions:** \`cc-publisher.yml\` (sends due posts; does nothing unless this host is the live sender) and
  \`cc-worker.yml\` (CP-H2). Both read the public repo through a read-only sparse checkout.
- **Procedures, safety rules and cutover:** \`command-center/docs/hosted-deployment-runbook.md\`.
- **Never commit** secrets, \`.env\` files or \`command-center/out/\`. Configuration lives in Vercel and GitHub settings only.
`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
  const out = arg("--out");
  if (!out) { console.error("usage: assemble-ops-repo.mjs --out <new folder> [--source HEAD] [--public origin/main]"); process.exit(2); }
  const repoRoot = git(process.cwd(), ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const r = assemble({ repoRoot, out: path.resolve(out.replace(/^~(?=\/)/, os.homedir())), source: arg("--source", "HEAD"), publicRef: arg("--public", "origin/main") });
  console.log(`Assembled ${r.files} files in ${r.out} (one local commit on main).`);
  console.log(`  command-center from ${r.sourceSha.slice(0, 10)}; public snapshot from ${r.publicSha.slice(0, 10)}`);
  console.log("Nothing was pushed. After you create the EMPTY private repo gtp-ops and say go:");
  console.log(`  git -C ${r.out} remote add origin https://github.com/<owner>/gtp-ops.git && git -C ${r.out} push -u origin main`);
}
