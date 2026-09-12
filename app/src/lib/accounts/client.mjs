"use client";
/**
 * THE SUPABASE CLIENT, CREATED ONLY WHEN THERE IS A PROJECT TO TALK TO (P266).
 *
 * Returns null whenever accounts are UNCONFIGURED or MISCONFIGURED, so every caller has to handle
 * "not open yet" as a real state rather than discovering it as a crash. One client per tab: the auth
 * session lives in it, and a second instance would hold a second copy of the session.
 *
 * THE ENV READ IS LITERAL ON PURPOSE. Next inlines `process.env.NEXT_PUBLIC_*` only where it appears
 * literally in the source; reading it through a variable yields undefined in a static export, which
 * would make a configured project look unconfigured to the browser.
 */
import { createClient } from "@supabase/supabase-js";
import { accountsConfig } from "./config.mjs";

const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

let cached = null;

/** The reader-facing state of accounts, computed from the inlined env. */
export const accountsState = () => accountsConfig(ENV);

/** @returns {import("@supabase/supabase-js").SupabaseClient | null} */
export function accountsClient() {
  const cfg = accountsState();
  if (cfg.state !== "READY") return null;
  if (!cached) {
    cached = createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The magic link lands back on /account with the session in the URL; the client consumes it.
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }
  return cached;
}
