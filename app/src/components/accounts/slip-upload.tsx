"use client";
import { useRef, useState } from "react";
import { accountsClient } from "@/lib/accounts/client.mjs";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from "@/lib/accounts/slip-reading.mjs";

/**
 * UPLOAD A SLIP (P266) — the picture goes to your own private folder, then the reader looks at it.
 *
 * The browser enforces the SAME type and size rules the endpoint enforces, so a file is never stored
 * and then rejected. Nothing is saved to your record here: the reading comes back for you to confirm,
 * and a reading you never confirm is a picture we looked at, not a bet you placed.
 */
export interface SlipReadResult {
  readonly reading: Record<string, unknown> | null;
  readonly review: string[];
  readonly errors: string[];
  readonly imagePath: string;
}

export default function SlipUpload({ userId, onRead }: { userId: string; onRead: (r: SlipReadResult) => void }) {
  const [busy, setBusy] = useState<null | "uploading" | "reading">(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  async function handle(file: File) {
    setError(null);
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setError(`That is ${file.type || "an unknown file type"} — a PNG, JPEG, WebP or GIF screenshot works.`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`That image is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`);
      return;
    }
    const client = accountsClient();
    if (!client) { setError("Accounts are not connected yet."); return; }

    try {
      setBusy("uploading");
      const { data: sess } = await client.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) { setError("Your sign-in expired — sign in again and the upload will work."); return; }

      const ext = (file.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
      // Your own folder, always: the bucket's policies allow nothing else, and the endpoint checks again.
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const up = await client.storage.from("slips").upload(path, file, { contentType: file.type, upsert: false });
      if (up.error) { setError(`The upload did not complete: ${up.error.message}`); return; }

      setBusy("reading");
      const res = await fetch("/api/slip-read/", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, path, contentType: file.type, bytes: file.size }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload) {
        setError(payload?.reason ?? `The reader answered ${res.status}. Nothing was saved — you can enter the slip by hand.`);
        return;
      }
      onRead({ reading: payload.reading ?? null, review: payload.review ?? [], errors: payload.errors ?? [], imagePath: path });
    } catch (e) {
      setError(`The upload failed: ${String((e as Error)?.message ?? e).slice(0, 120)}. Nothing was saved.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-col items-center gap-2 rounded-[14px] px-4 py-6 text-center"
        style={{ border: "1px dashed var(--vault-border-strong)", background: "color-mix(in srgb, var(--vault-scrim-base) 45%, transparent)" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handle(f); }}
      >
        <span aria-hidden style={{ fontSize: 22 }}>🧾</span>
        <p className="m-0" style={{ color: "var(--vault-text)", fontSize: 14, fontWeight: 600 }}>
          {busy === "uploading" ? "Uploading…" : busy === "reading" ? "Reading the slip…" : "Add a bet you placed"}
        </p>
        <p className="m-0" style={{ color: "var(--vault-text-mute)", fontSize: 12.5, lineHeight: 1.55, maxWidth: "46ch" }}>
          Drop a screenshot of your betslip, or choose one. It goes to your own private folder, the reader pulls out
          the legs, odds and stake, and <strong>you check them before anything is saved</strong>.
        </p>
        <input
          ref={input} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="sr-only"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ""; }}
        />
        <button type="button" disabled={busy != null} onClick={() => input.current?.click()}
          className="vault-press rounded-full px-4"
          style={{ minHeight: 44, border: "1px solid var(--vault-gold-bright)", color: "var(--vault-gold-bright)", background: "var(--vault-gold-dim)", fontSize: 13, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Working…" : "Choose a screenshot"}
        </button>
      </div>
      {error ? (
        <p className="m-0 rounded-[8px] px-3 py-2" role="alert" style={{ color: "var(--vault-text)", fontSize: 12.5, background: "var(--vault-danger-dim)", border: "1px solid var(--vault-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
