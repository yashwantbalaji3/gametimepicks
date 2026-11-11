#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path"; import { fileURLToPath } from "node:url";
const W = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const L = await import(W + "/app/src/lib/availability/stale-flags.mjs");
const git = (...a) => execFileSync("git", a, { cwd: W, encoding: "utf8", maxBuffer: 1 << 28 });
const sha = (o) => crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const dates = git("ls-tree", "--name-only", "origin/main", "app/public/data/nba/experimental-public/").split("\n").map((p) => p.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1]).filter(Boolean);
let games = 0, gamesMaterial = 0, gamesAny = 0; const perGame = []; const gaps = []; let caps = 0;
for (const d of dates) {
  let lane; try { lane = JSON.parse(git("show", `origin/main:app/public/data/nba/experimental-public/${d}.json`)); } catch { continue; }
  if (!lane.games?.length) continue;
  const cands = L.nbaCandidates(lane, sha);
  const next = new Date(Date.parse(d + "T00:00:00Z") + 86400e3).toISOString().slice(0, 10);
  const commits = git("log", "origin/main", `--since=${d}T05:00:00Z`, `--until=${next}T05:00:00Z`, "--format=%H", "--", "data/internal/research/injuries/nba/latest.json").split("\n").filter(Boolean).reverse();
  let file = null;
  for (const c of commits) { let cap; try { cap = JSON.parse(git("show", `${c}:data/internal/research/injuries/nba/latest.json`)); } catch { continue; } caps++; file = L.appendStaleFlags(file, L.detectStaleEvents(cands, cap), { sport: "nba", date: d, capturedAt: cap.sourceAsOf }); }
  for (const g of lane.games) {
    games++;
    const ev = (file?.events ?? []).filter((e) => e.eventId === String(g.providerEventId));
    const mat = ev.filter((e) => e.flags.game);
    if (ev.length) gamesAny++; if (mat.length) gamesMaterial++;
    perGame.push(mat.length);
    const ts = mat.map((e) => Date.parse(e.statedAt)).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) gaps.push((ts[i] - ts[i - 1]) / 60000);
  }
}
const dist = {}; for (const n of perGame) dist[n] = (dist[n] ?? 0) + 1;
gaps.sort((a, b) => a - b);
console.log(JSON.stringify({ dates: dates.length, captures: caps, games, gamesWithAnyFlag: gamesAny, gamesWithMaterial: gamesMaterial, materialEventsPerGame: dist, gapsBetweenMaterialEventsSameGameMin: { n: gaps.length, min: gaps[0], median: gaps[Math.floor(gaps.length / 2)], max: gaps.at(-1), within15: gaps.filter((g) => g <= 15).length } }));
