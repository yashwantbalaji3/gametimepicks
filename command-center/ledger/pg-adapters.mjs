/**
 * DATABASE DRIVERS behind one tiny interface: { query(text, params) → { rows }, exec(sql), transaction(fn), close() }.
 *
 *   pglite(dir?)      embedded Postgres (WASM) — tests and the local hosted-mode dev server; no account, no network
 *   neon(url)         Neon's serverless driver over WebSockets — Vercel Functions and GitHub Actions (CP-H1 onwards)
 *
 * The Neon adapter is written against @neondatabase/serverless's pg-compatible Pool and is not exercised until a
 * real database exists (CP-H1); everything above this file is tested on PGlite, which is real Postgres.
 */
export async function pglite(dataDir) {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = dataDir ? new PGlite(dataDir) : new PGlite();
  await db.waitReady;
  return {
    driver: "pglite",
    query: (text, params = []) => db.query(text, params),
    exec: (sql) => db.exec(sql),
    transaction: (fn) => db.transaction(async (tx) => fn({ query: (text, params = []) => tx.query(text, params) })),
    close: () => db.close(),
  };
}

export async function neon(connectionString) {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString, max: 2 });
  return {
    driver: "neon",
    query: (text, params = []) => pool.query(text, params),
    exec: (sql) => pool.query(sql),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: (text, params = []) => client.query(text, params) });
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
