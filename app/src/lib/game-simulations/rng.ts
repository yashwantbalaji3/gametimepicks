/**
 * DETERMINISTIC GAME SIMULATION — stable seeded PRNG + hashing (Phase 4).
 *
 * The whole game-simulation feature promises the SAME output for every user for the same
 * `game + modelVersion + simulationVersion`. That promise only holds if the sampling is fully
 * deterministic. This module is the deterministic core: a string-seeded PRNG (cyrb128 → mulberry32),
 * a seeded Gaussian draw (Box-Muller), and helpers for stable content hashing.
 *
 * HARD RULE (enforced by the generator's tests): nothing here may call `Math.random()`, `Date.now()`,
 * or an argless `new Date()`. Every random number descends from an explicit string seed, so re-running
 * the generator on the same board yields a byte-identical artifact (modulo the single `generatedAt`
 * field, which is injected).
 *
 * Framework-free (only `node:crypto` for hashing) so tsx can run the tests directly.
 */

import crypto from "node:crypto";

/**
 * cyrb128 — a fast, well-distributed string hash producing four 32-bit seeds. Public-domain algorithm
 * (bryc). We use it to turn a human-readable seed string into a strong 128-bit seed for the PRNG so
 * that even tiny changes to the seed string (a different line, player, or market) yield an unrelated
 * stream.
 */
export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i += 1) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/**
 * mulberry32 — a compact, high-quality 32-bit PRNG. Given a 32-bit seed it returns a function that
 * yields the next uniform double in [0, 1) on each call. Deterministic: same seed ⇒ same stream.
 * Retained as a small, well-known building block (the RNG itself now uses sfc32 to consume all 128
 * bits of the cyrb128 hash — see below).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * sfc32 — Small Fast Counter, a fast 32-bit PRNG that natively takes FOUR 32-bit seed words. Public-
 * domain algorithm (PractRand's sfc). Pairing it with cyrb128 means all 128 bits of the string hash
 * feed the generator directly — unlike folding to a single 32-bit seed, which can XOR-collide (two
 * different seed strings collapsing to the same 32-bit value and thus the same stream). Deterministic:
 * same four seeds ⇒ same stream.
 */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  let s0 = a >>> 0;
  let s1 = b >>> 0;
  let s2 = c >>> 0;
  let s3 = d >>> 0;
  return function next(): number {
    s0 |= 0;
    s1 |= 0;
    s2 |= 0;
    s3 |= 0;
    const t = (((s0 + s1) | 0) + s3) | 0;
    s3 = (s3 + 1) | 0;
    s0 = s1 ^ (s1 >>> 9);
    s1 = (s2 + (s2 << 3)) | 0;
    s2 = (s2 << 21) | (s2 >>> 11);
    s2 = (s2 + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * A tiny deterministic RNG over a string seed. `next()` yields uniforms in [0, 1); `gaussian()` yields
 * standard-normal draws via Box-Muller (caching the paired draw). Constructed only from a seed string,
 * so it carries no ambient state — reproducible across processes and machines.
 */
export class SeededRng {
  private next32: () => number;
  private spare: number | null = null;

  constructor(seedString: string) {
    // Feed ALL FOUR 128-bit hash words into sfc32 (no lossy 32-bit fold → no XOR seed collisions).
    const [a, b, c, d] = cyrb128(seedString);
    this.next32 = sfc32(a, b, c, d);
    // Warm up: sfc32 benefits from discarding the first few outputs so the seed state fully mixes.
    for (let i = 0; i < 12; i += 1) this.next32();
  }

  /** Next uniform double in [0, 1). Deterministic. */
  next(): number {
    return this.next32();
  }

  /**
   * Next standard-normal draw (mean 0, sd 1) via the Box-Muller transform. The transform produces two
   * independent normals per pair of uniforms; we return one and cache the other for the next call so
   * no uniform is wasted and the stream stays deterministic.
   */
  gaussian(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    // Guard u1 away from 0 so log() is finite.
    let u1 = this.next();
    const u2 = this.next();
    if (u1 < 1e-12) u1 = 1e-12;
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    const z1 = mag * Math.sin(2.0 * Math.PI * u2);
    this.spare = z1;
    return z0;
  }

  /** Draw from N(mean, sigma). `sigma` <= 0 collapses to the mean (a degenerate, still-deterministic draw). */
  normal(mean: number, sigma: number): number {
    if (!(sigma > 0)) return mean;
    return mean + sigma * this.gaussian();
  }
}

/**
 * Build a deterministic per-lean seed string. The seed is composed ONLY of stable, board-derived
 * fields so the same board always seeds the same stream:
 *   `${date}|mlb|${gamePk}|${modelVersion}|${simulationVersion}|${marketKey}|${playerId}|${line}`.
 */
export function leanSeed(params: {
  date: string;
  gamePk: number | string;
  modelVersion: string;
  simulationVersion: number;
  marketKey: string;
  playerId: number | string;
  line: number | string;
}): string {
  return [
    params.date,
    "mlb",
    String(params.gamePk),
    params.modelVersion,
    String(params.simulationVersion),
    params.marketKey,
    String(params.playerId),
    String(params.line),
  ].join("|");
}

/**
 * Stable SHA-256 over an arbitrary JSON-serializable value. The value is canonicalized (object keys
 * sorted recursively) BEFORE hashing so logically-identical payloads with different key order hash the
 * same. Returns a lowercase hex digest. Used for both `sourceBoardHash` and `artifactHash`.
 */
export function stableHash(value: unknown): string {
  const canonical = canonicalize(value);
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

/**
 * Recursively canonicalize a value so serialization is order-independent: object keys are sorted;
 * arrays keep their order (order is semantically meaningful there); primitives pass through. `undefined`
 * is dropped from objects (JSON would drop it anyway), keeping the digest stable regardless of whether
 * an optional field is `undefined` or simply absent.
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => canonicalize(v));
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    out[key] = canonicalize(v);
  }
  return out;
}
