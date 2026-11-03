// NBA SLATE BUILD AND DELIVERY for one ET date, unattended (launchd). No AI, no paid call: the committed lane, the unified
// roster from nba-unified-roster.mjs (free ESPN) and the local renderer. Every game x 4 variants (winner, props, projection-only,
// winner-only) + NBA Today + the Top 5 carousel. All of it is rendered and checked in <stage> first; only then is it copied into
// <import-root>/packages: images to a temp folder renamed into place, each package JSON to a temp name, then every JSON renamed.
// Any failure before the renames leaves nothing importable (Command Center reads only *.json). A package already in the import
// folder is never overwritten.
//
//   GTP_NBA_UNIFIED_ROSTER=roster.json GTP_DATA_COMMIT=<origin/main sha> GTP_RENDER_CACHE=dir \
//   npx tsx scripts/social/nba-slate-deliver.mts --date 2026-11-04 --stage DIR --import-root ~/gtp-private/graphics [--top5-min-rows 5]
//
// Exit 0 delivered; 10 refused before delivery (reason on stderr and in <stage>/result.json); 11 delivery step failed.
const A = new URL("../../", import.meta.url).pathname;
const m = await import(A + "scripts/social/render-social-pack.mjs");
const fs = await import("node:fs");
const path = await import("node:path");
const crypto = await import("node:crypto");
const os = await import("node:os");

const arg = (k: string, d: string | null = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const date = arg("date")!, stage = arg("stage")!, importRoot = arg("import-root")!;
const minRows = Number(arg("top5-min-rows", "5"));
const asOf = arg("as-of") ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !stage || !importRoot || !Number.isInteger(minRows)) { console.error("usage: --date YYYY-MM-DD --stage DIR --import-root DIR [--top5-min-rows N] [--as-of ISO]"); process.exit(2); }
// A replayed --as-of is for tests only: never against Command Center's live import folder.
if (arg("as-of") && path.resolve(importRoot) === path.join(os.homedir(), "gtp-private", "graphics") && Math.abs(Date.parse(asOf) - Date.now()) > 5 * 60e3) { console.error("--as-of away from now is refused for the live import folder"); process.exit(2); }
for (const k of ["GTP_NBA_UNIFIED_ROSTER", "GTP_DATA_COMMIT"]) if (!process.env[k]) { console.error(`missing ${k}`); process.exit(2); }

const result: any = { date, asOf, dataCommit: process.env.GTP_DATA_COMMIT, importRoot, top5MinRows: minRows, games: [], slate: {}, refused: [] };
const writeResult = () => fs.writeFileSync(path.join(stage, "result.json"), `${JSON.stringify(result, null, 1)}\n`);
const refuse = (reason: string, detail: any = null): never => { result.outcome = "REFUSED"; result.reason = reason; result.detail = detail; writeResult(); console.error(`REFUSED ${reason} ${detail ? JSON.stringify(detail).slice(0, 2000) : ""}`); process.exit(10); };
fs.mkdirSync(stage, { recursive: true });
const out = path.join(stage, "packages");
if (fs.existsSync(out)) refuse("STAGE_NOT_EMPTY", out);

const lane = JSON.parse(fs.readFileSync(path.join(A, `public/data/nba/experimental-public/${date}.json`), "utf8"));
const firstTip = Math.min(...lane.games.map((g: any) => Date.parse(g.tipUtc ?? g.dateUtc ?? g.startUtc)));
if (!Number.isFinite(firstTip)) refuse("NO_TIP_TIMES");
if (Date.parse(asOf) >= firstTip) refuse("FIRST_TIP_PASSED", { asOf, firstTip: new Date(firstTip).toISOString() });

const r = m.prepareGameDay({ date, asOf });
const of = (type: string, id: string) => r.posts.find((p: any) => p.contentType === type && p.variant === id);
const laneIds = lane.games.map((g: any) => String(g.providerEventId));
const missing = laneIds.filter((id: string) => !of("NBA_GAME_WINNER", id) || !of("NBA_PLAYER_STATS", id));
if (missing.length) refuse("INCOMPLETE_SLATE", { missing, refused: r.refused });
const ton = r.posts.find((p: any) => p.contentType === "NBA_TONIGHT");
if (!ton) refuse("NO_NBA_TODAY", r.refused);
const car = m.nbaTop5Carousel({ posts: r.posts.filter((p: any) => p.contentType === "NBA_DAILY_TOP5"), date, minRows });
result.refused.push(...car.refused);
if (car.refused.some((x: any) => x.reason !== "THIN_BOARD_SKIPPED")) refuse("TOP5_CAROUSEL", car.refused);

const V = (p: any, v: string) => ({ ...p, variant: `${p.variant ?? "slate"}-${v}` });
const roster = JSON.parse(fs.readFileSync(process.env.GTP_NBA_UNIFIED_ROSTER!, "utf8"));
const sha = (b: any) => crypto.createHash("sha256").update(b).digest("hex");
const qa: any[] = [];
function check(pkg: any, post: any, slug: string) {
  if (/REHEARSAL/.test(JSON.stringify([pkg.variant, pkg.dedupeId, pkg.idempotencyKey, pkg.title, pkg.commandCenter]))) qa.push([pkg.variant, "REHEARSAL_STAMP"]);
  if (!(Date.parse(pkg.commandCenter?.firstStartUtc ?? post.firstStartUtc) > Date.parse(asOf))) qa.push([pkg.variant, "STARTED"]);
  if (pkg.images.length !== post.cards.length || pkg.images.some((i: any) => path.dirname(i.path) !== path.join(out, slug, "images"))) qa.push([pkg.variant, "IMAGE_SET"]);
  for (const i of pkg.images) {
    const b = fs.readFileSync(i.path); const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (w !== 1080 * i.scale || h !== 1350 * i.scale) qa.push([pkg.variant, "DIM", w, h]);
    if (sha(b) !== i.sha256) qa.push([pkg.variant, "SHA"]);
  }
  for (const c of post.cards) {
    const html = c.html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
    const text = html.replace(/<[^>]+>/g, " ");
    if (!pkg.containsMarketData && /class="[^"]*\b(over|under)\b/.test(html.replace(/<div class="lgd">.*?<\/div><\/div>/s, ""))) qa.push([pkg.variant, "COLOUR_WITHOUT_LINE"]);
    const need = /WINNER|TONIGHT/.test(pkg.contentType) ? /model win probability/i : /model projection/i;
    if (!need.test(text)) qa.push([pkg.variant, "LABEL", String(need)]);
    if (/\best\.|estimate\b|projected median/i.test(text)) qa.push([pkg.variant, "FORBIDDEN_WORD"]);
  }
  if (/[—–]/.test(String(pkg.caption ?? "") + String(pkg.commandCenter?.caption ?? ""))) qa.push([pkg.variant, "DASH_IN_CAPTION"]);
}

const done: any[] = []; const st: any = { rendered: 0, skipped: 0 };
// One call per post: posts sharing a card name in one writePackages call each list the other's image (winner and winner-only).
const renderEach = async (posts: any[]) => { const d: any[] = []; for (const p of posts) { const x: any = { rendered: 0, skipped: 0 }; d.push(...(await m.writePackages([p], { outRoot: out, scales: [1], png: true, stats: x }))); st.rendered += x.rendered; st.skipped += x.skipped; } return d; };
for (const id of laneIds) {
  const w = of("NBA_GAME_WINNER", id), s = of("NBA_PLAYER_STATS", id);
  const posts = [V(w, "winner"), V(s, "props"), V(s, "projonly"), V(w, "winneronly")];
  const d = await renderEach(posts);
  d.forEach((x: any, i: number) => check(x.pkg, posts[i], path.basename(x.file, ".json")));
  done.push(...d);
  const ab = s.cards[0].html.match(/([A-Z]{2,4}) @ ([A-Z]{2,4})/)?.slice(1) ?? [];
  const omitted = ab.reduce((n: number, t: string) => n + (roster[t] ?? []).reduce((k: number, e: any) => k + (typeof e === "object" ? 3 : (roster.__cells?.[e]?.length ?? 0)), 0), 0);
  result.games.push({ id, game: ab.join("@"), tipUtc: w.firstStartUtc, cellsOmitted: omitted, digests: Object.fromEntries(["winner", "props", "projonly", "winneronly"].map((v, i) => [v, d[i].pkg.contentSha256])) });
}
const slate = [V(ton, "today"), ...car.posts.map((p: any) => V(p, "top5"))];
const ds = await renderEach(slate);
ds.forEach((x: any, i: number) => check(x.pkg, slate[i], path.basename(x.file, ".json")));
done.push(...ds);
result.slate = { today: ds[0].pkg.contentSha256, top5: ds[1]?.pkg.contentSha256 ?? null, top5Boards: car.posts[0]?.content.boards ?? [], top5Skipped: car.refused };
result.render = st; result.qa = qa;
if (qa.length) refuse("QA", qa);

// Delivery. Pre-check every name, then copy images, then write temp JSONs, then rename them all.
const pk = path.join(importRoot, "packages");
fs.mkdirSync(pk, { recursive: true });
const slugs = done.map((x: any) => path.basename(x.file, ".json"));
const clash = slugs.filter((s: string) => fs.existsSync(path.join(pk, `${s}.json`)) || fs.existsSync(path.join(pk, s)));
if (clash.length) refuse("ALREADY_IN_IMPORT_FOLDER", clash);
const tag = `${process.pid}-${Date.now()}`;
const made: string[] = []; const temps: string[] = [];
try {
  for (const x of done) {
    const slug = path.basename(x.file, ".json");
    const tmpDir = path.join(pk, `.${slug}.${tag}`);
    fs.cpSync(path.join(out, slug), tmpDir, { recursive: true }); temps.push(tmpDir);
    fs.renameSync(tmpDir, path.join(pk, slug)); temps.pop(); made.push(path.join(pk, slug));
    const pkg = JSON.parse(fs.readFileSync(x.file, "utf8"));
    for (const i of pkg.images) { i.path = path.join(pk, path.relative(out, i.path)); if (sha(fs.readFileSync(i.path)) !== i.sha256) throw new Error(`copy mismatch ${i.path}`); }
    const tmp = path.join(pk, `.${slug}.json.${tag}`);
    fs.writeFileSync(tmp, `${JSON.stringify(pkg, null, 2)}\n`); temps.push(tmp);
  }
} catch (e: any) {
  for (const t of [...temps, ...made]) fs.rmSync(t, { recursive: true, force: true });
  result.outcome = "DELIVERY_FAILED"; result.reason = e.message; writeResult(); console.error(`DELIVERY_FAILED ${e.message} (nothing importable left behind)`); process.exit(11);
}
for (const t of temps) fs.renameSync(t, path.join(pk, `${path.basename(t).slice(1).split(`.json.${tag}`)[0]}.json`));
result.outcome = "DELIVERED"; result.packages = slugs.length; result.images = done.reduce((n: number, x: any) => n + x.pkg.images.length, 0);
writeResult();
const md = [`# NBA slate ${date} delivered ${new Date().toISOString()}`, "", `dataCommit ${result.dataCommit} · asOf ${asOf} · ${result.packages} packages · ${result.images} images · rendered ${st.rendered}, cached ${st.skipped}`, `Top 5 carousel boards: ${result.slate.top5Boards.join(", ") || "none"}${car.refused.length ? ` (skipped under ${minRows} rows: ${car.refused[0].boards.join(", ")})` : ""}`, "", "| Game | Tip (UTC) | Winner | Props | Projection-only | Winner-only | Cells omitted |", "|---|---|---|---|---|---|---|",
  ...result.games.map((g: any) => `| ${g.game} | ${g.tipUtc} | ${g.digests.winner.slice(0, 12)} | ${g.digests.props.slice(0, 12)} | ${g.digests.projonly.slice(0, 12)} | ${g.digests.winneronly.slice(0, 12)} | ${g.cellsOmitted} |`),
  "", `NBA Today ${result.slate.today.slice(0, 12)} · Top 5 ${result.slate.top5?.slice(0, 12) ?? "not made"}`, ""].join("\n");
fs.writeFileSync(path.join(stage, "report.md"), md);
console.log(md);
process.exit(0);
