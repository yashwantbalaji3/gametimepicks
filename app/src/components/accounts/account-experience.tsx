"use client";
import { useEffect, useState } from "react";
import { accountsClient, accountsState } from "@/lib/accounts/client.mjs";
import { accountsNotice } from "@/lib/accounts/config.mjs";
import SignInPanel from "./sign-in-panel";
import SlipUpload, { type SlipReadResult } from "./slip-upload";
import SlipConfirm from "./slip-confirm";
import MyBetsRecord from "./my-bets-record";

/**
 * THE ACCOUNT SURFACE (P266) — sign in, add a slip, see your own record.
 *
 * It has three honest states and renders whichever is true: accounts not open (no project connected),
 * signed out, signed in. The first is not an error — the rest of the site works without an account,
 * and this page says so instead of showing a sign-in form that could not work.
 */
export default function AccountExperience() {
  const cfg = accountsState();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [pending, setPending] = useState<SlipReadResult | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const client = accountsClient();
    if (!client) { setReady(true); return; }
    let alive = true;
    void client.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const u = data.session?.user;
      setUser(u ? { id: u.id, email: u.email ?? undefined } : null);
      setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? undefined } : null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  if (cfg.state !== "READY") {
    return (
      <section aria-label="Accounts" className="flex flex-col gap-2 rounded-[14px] p-4"
        style={{ background: "color-mix(in srgb, var(--vault-scrim-base) 55%, transparent)", border: "1px solid var(--vault-border)" }}>
        <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>{accountsNotice(cfg)}</p>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 13, lineHeight: 1.6, maxWidth: "64ch" }}>
          When accounts open you will be able to sign in with an email link, add a screenshot of a bet you placed, check
          what we read from it, and keep your own record — the legs you repeat, your risk mix, and how it has actually
          gone. Your bets stay yours: never part of the site&rsquo;s published record.
        </p>
      </section>
    );
  }

  if (!ready) return <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 13 }}>Checking your session…</p>;
  if (!user) return <SignInPanel />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span style={{ color: "var(--vault-text-mute)", fontSize: 12.5 }}>
          Signed in as <strong style={{ color: "var(--vault-text)" }}>{user.email ?? "you"}</strong>
        </span>
        <button type="button" onClick={() => { void accountsClient()?.auth.signOut(); }}
          className="vault-press rounded-full px-3.5"
          style={{ minHeight: 40, border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)", background: "transparent", fontSize: 12.5 }}>
          Sign out
        </button>
      </div>

      {pending?.reading ? (
        <SlipConfirm
          userId={user.id}
          /* The validator's shape, handed straight through — the confirm screen edits it, nothing else does. */
          reading={pending.reading as never}
          review={pending.review}
          imagePath={pending.imagePath}
          onSaved={() => { setPending(null); setRefreshKey((k) => k + 1); }}
          onCancel={() => setPending(null)}
        />
      ) : (
        <SlipUpload userId={user.id} onRead={setPending} />
      )}

      {pending && !pending.reading && pending.errors.length > 0 ? (
        <p className="m-0 rounded-[8px] px-3 py-2" role="alert" style={{ background: "var(--vault-danger-dim)", border: "1px solid var(--vault-danger)", color: "var(--vault-text)", fontSize: 12.5 }}>
          {pending.errors.join(" · ")} — nothing was saved.
        </p>
      ) : null}

      <MyBetsRecord refreshKey={refreshKey} />
    </div>
  );
}
