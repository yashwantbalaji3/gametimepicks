"use client";
import { useState } from "react";
import { accountsClient } from "@/lib/accounts/client.mjs";

/**
 * SIGN IN — one email field and a link in your inbox (P266).
 *
 * No password: nothing to store, nothing to leak, nothing for a visitor to reuse from another site.
 * The form says what will happen before it happens, and an unconfigured project never reaches here
 * (the gate above renders the "not open yet" state instead).
 */
export default function SignInPanel({ onSent }: { onSent?: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const client = accountsClient();
    if (!client) { setState("error"); setMessage("Accounts are not connected yet."); return; }
    setState("sending"); setMessage(null);
    const { error } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: typeof window === "undefined" ? undefined : `${window.location.origin}/account/` },
    });
    if (error) { setState("error"); setMessage(error.message); return; }
    setState("sent");
    onSent?.(email.trim());
  }

  if (state === "sent") {
    return (
      <div className="rounded-[12px] p-4" style={{ background: "var(--vault-gold-dim)", border: "1px solid var(--vault-gold-bright)" }}>
        <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>Check your email</p>
        <p className="m-0 mt-1" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6 }}>
          We sent a sign-in link to <strong>{email}</strong>. Opening it on this device signs you in — the link works once
          and expires.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-3 rounded-[12px] p-4" style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
      <div className="flex flex-col gap-1">
        <label htmlFor="account-email" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>Sign in with your email</label>
        <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55 }}>
          We email you a link — no password to choose, store or lose. Your bets are visible only to you.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          id="account-email" type="email" required autoComplete="email" inputMode="email"
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
          className="flex-1 rounded-[8px] px-3"
          style={{ minHeight: 44, minWidth: 220, background: "var(--vault-wash-faint)", border: "1px solid var(--vault-rule)", color: "var(--vault-text)", fontSize: 15 }}
        />
        <button type="submit" disabled={state === "sending" || !email.trim()} className="vault-press rounded-full px-5"
          style={{ minHeight: 44, background: "var(--gtp-bank-lava-cta)", color: "var(--vault-ink-on-mint)", fontSize: 14, fontWeight: 800, opacity: state === "sending" ? 0.7 : 1 }}>
          {state === "sending" ? "Sending…" : "Email me a link"}
        </button>
      </div>
      {message ? <p className="m-0" style={{ color: "var(--vault-danger)", fontSize: 12.5 }}>{message}</p> : null}
      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 11.5, lineHeight: 1.55 }}>
        An account is only needed to keep your own bet history. Everything else on this site works signed out.
      </p>
    </form>
  );
}
