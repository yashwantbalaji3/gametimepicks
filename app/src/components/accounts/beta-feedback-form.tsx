"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { accountsClient, accountsState } from "@/lib/accounts/client.mjs";
import { accountsNotice } from "@/lib/accounts/config.mjs";
import { FEEDBACK_KINDS, FEEDBACK_PRODUCTS, FEEDBACK_SEVERITIES, FEEDBACK_SPORTS, LIMITS, buildFeedbackRow, cleanRoute } from "@/lib/accounts/beta-feedback.mjs";

/**
 * THE BETA FEEDBACK FORM (Session 9 · I6). Writes ONE row to beta_feedback as the signed-in tester (own-row
 * RLS; insert requires the invite). Nothing is read back except "sent". The founder reviews in the Supabase
 * dashboard — no client, this one included, can list anyone's feedback but their own.
 */
const KIND_LABEL: Record<string, string> = { bug: "Something broke", wrong_data: "A number or result looks wrong", confusing: "Confusing", idea: "Idea", other: "Other" };
const SEVERITY_LABEL: Record<string, string> = { blocker: "Blocks me", major: "Major", minor: "Minor", idea: "Just an idea" };
const field = { minHeight: 44, borderRadius: 10, border: "1px solid var(--vault-border)", background: "transparent", color: "var(--vault-text)", padding: "8px 10px", fontSize: 14, width: "100%" } as const;
const label = { color: "var(--vault-text-mute)", fontSize: 12.5, display: "flex", flexDirection: "column", gap: 4 } as const;

export default function BetaFeedbackForm() {
  const cfg = accountsState();
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState({ route: "/", sport: "", product: "", kind: "bug", severity: "minor", actual: "", expected: "" });
  const [state, setState] = useState<{ kind: "idle" | "sending" | "sent" | "error"; text?: string }>({ kind: "idle" });

  useEffect(() => {
    // The page the tester came from: ?from=/path, else the same-site referrer. Path only — never a query.
    const from = new URLSearchParams(window.location.search).get("from") ?? (document.referrer.startsWith(window.location.origin) ? document.referrer : "/");
    setForm((f) => ({ ...f, route: cleanRoute(from) }));
    const client = accountsClient();
    if (!client) { setReady(true); return; }
    void client.auth.getSession().then(({ data }) => { setUserId(data.session?.user?.id ?? null); setReady(true); });
  }, []);

  if (cfg.state !== "READY") return <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 14 }}>{accountsNotice(cfg)} The feedback form opens with tester accounts.</p>;
  if (!ready) return <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 13 }}>Checking your session…</p>;
  if (!userId) return <p className="m-0" style={{ fontSize: 14, color: "var(--vault-text-mute)" }}>Feedback is for invited testers. <Link href="/account" style={{ color: "var(--vault-gold-bright)" }}>Sign in</Link> first.</p>;
  if (state.kind === "sent") return <p role="status" className="m-0" style={{ fontSize: 14, color: "var(--vault-text)" }}>Thanks — sent. Only you and the GameTimePicks team can see it. <button type="button" onClick={() => { setForm((f) => ({ ...f, actual: "", expected: "" })); setState({ kind: "idle" }); }} style={{ color: "var(--vault-gold-bright)", background: "none", border: 0, textDecoration: "underline", cursor: "pointer", fontSize: 14 }}>Send another</button></p>;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    const built = buildFeedbackRow(form, { userId });
    if (!built.ok) { setState({ kind: "error", text: built.errors.join(" ") }); return; }
    setState({ kind: "sending" });
    const { error } = await accountsClient()!.from("beta_feedback").insert(built.row);
    setState(error ? { kind: "error", text: `Not sent: ${error.message}` } : { kind: "sent" });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Beta feedback" style={{ maxWidth: 620 }}>
      <label style={label}>Page<input style={field} value={form.route} onChange={set("route")} maxLength={LIMITS.route} /></label>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label style={label}>Type<select style={field} value={form.kind} onChange={set("kind")}>{FEEDBACK_KINDS.map((k: string) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
        <label style={label}>Severity<select style={field} value={form.severity} onChange={set("severity")}>{FEEDBACK_SEVERITIES.map((k: string) => <option key={k} value={k}>{SEVERITY_LABEL[k]}</option>)}</select></label>
        <label style={label}>Sport (optional)<select style={field} value={form.sport} onChange={set("sport")}><option value="">—</option>{FEEDBACK_SPORTS.map((k: string) => <option key={k} value={k}>{k.toUpperCase()}</option>)}</select></label>
        <label style={label}>Product (optional)<select style={field} value={form.product} onChange={set("product")}><option value="">—</option>{FEEDBACK_PRODUCTS.map((k: string) => <option key={k} value={k}>{k.replace(/[-_]/g, " ")}</option>)}</select></label>
      </div>
      <label style={label}>What happened<textarea required style={{ ...field, minHeight: 110 }} value={form.actual} onChange={set("actual")} maxLength={LIMITS.actual} /></label>
      <label style={label}>What you expected (optional)<textarea style={{ ...field, minHeight: 70 }} value={form.expected} onChange={set("expected")} maxLength={LIMITS.expected} /></label>
      <p className="m-0" style={{ color: "var(--vault-text-faint)", fontSize: 12 }}>Please don&rsquo;t include passwords, card or bank details, or sportsbook account info. We store the page, your choices above, your text, the time, and your tester account — nothing else.</p>
      {state.kind === "error" ? <p role="alert" className="m-0" style={{ color: "var(--vault-text)", fontSize: 13 }}>{state.text}</p> : null}
      <button type="submit" disabled={state.kind === "sending"} className="vault-press self-start rounded-full px-4" style={{ minHeight: 44, border: "1px solid var(--vault-gold)", color: "var(--vault-gold-bright)", background: "transparent", fontSize: 13 }}>
        {state.kind === "sending" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
