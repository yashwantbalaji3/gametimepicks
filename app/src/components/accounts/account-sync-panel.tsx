"use client";
import { useEffect, useRef, useState } from "react";
import { accountsClient } from "@/lib/accounts/client.mjs";
import { describeSync, planFollowSync, planSavedSync } from "@/lib/accounts/account-sync.mjs";
import { isSavedForecast } from "@/lib/saved/saved-schema.mjs";
import { useFollowing, type FollowRef } from "@/lib/follow/follow-store";
import { useSavedForecasts } from "@/lib/saved/saved-store";

/**
 * FOLLOWS AND SAVES, ON EVERY DEVICE (Session 9 · I1/I2).
 *
 * Runs once per sign-in, after both device stores have been read. The merge is a UNION with a per-account
 * last-synced baseline (lib/accounts/account-sync.mjs): on the first sign-in nothing on either side is
 * removed; afterwards only what the reader removed since the last sync is removed on the other side. What
 * happened is always said in a sentence — never silent.
 */
const baselineKey = (userId: string) => `gtp.account-sync.v1:${userId}`;
function readBaseline(userId: string): { follows: string[] | null; saved: string[] | null } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(baselineKey(userId)) ?? "null");
    return { follows: Array.isArray(raw?.follows) ? raw.follows : null, saved: Array.isArray(raw?.saved) ? raw.saved : null };
  } catch { return { follows: null, saved: null }; }
}

export default function AccountSyncPanel({ userId }: { userId: string }) {
  const follow = useFollowing();
  const saved = useSavedForecasts();
  const [note, setNote] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    const client = accountsClient();
    if (!client || ran.current || !follow.ready || !saved.ready || !follow.writable) return;
    ran.current = true;
    void (async () => {
      const [f, s] = await Promise.all([
        client.from("user_follows").select("kind, entity_id, label"),
        client.from("saved_items").select("kind, ref, snapshot"),
      ]);
      if (f.error || s.error) { setNote("Could not reach your account just now — this browser is unchanged."); return; }
      const base = readBaseline(userId);
      const fp = planFollowSync(follow.followed, f.data ?? [], base.follows);
      const sp = planSavedSync(saved.items, s.data ?? [], (x: unknown) => (isSavedForecast(x) ? x : null), base.saved);
      const errors: string[] = [];
      if (fp.toAccount.length) { const r = await client.from("user_follows").upsert((fp.toAccount as object[]).map((row) => ({ ...row, user_id: userId })), { onConflict: "user_id,kind,entity_id", ignoreDuplicates: true }); if (r.error) errors.push(r.error.message); }
      for (const row of fp.removeFromAccount) { const r = await client.from("user_follows").delete().match({ ...row, user_id: userId }); if (r.error) errors.push(r.error.message); }
      if (sp.toAccount.length) { const r = await client.from("saved_items").upsert((sp.toAccount as object[]).map((row) => ({ ...row, user_id: userId })), { onConflict: "user_id,kind,ref", ignoreDuplicates: true }); if (r.error) errors.push(r.error.message); }
      for (const row of sp.removeFromAccount) { const r = await client.from("saved_items").delete().match({ ...row, user_id: userId }); if (r.error) errors.push(r.error.message); }
      for (const ref of fp.toDevice as FollowRef[]) if (!follow.isFollowing(ref)) follow.toggle(ref);
      for (const ref of fp.removeFromDevice as FollowRef[]) follow.unfollow(ref);
      if (sp.toDevice.length) saved.adopt(sp.toDevice);
      for (const item of sp.removeFromDevice as Array<{ id: string }>) saved.unsave(item.id);
      if (errors.length) { setNote(`Partly synced — ${errors[0]}. Nothing was removed; it will retry next time.`); return; }
      try { window.localStorage.setItem(baselineKey(userId), JSON.stringify({ follows: fp.synced, saved: sp.synced })); } catch { /* baseline is a convenience */ }
      setNote(describeSync(fp, sp));
    })();
  }, [userId, follow, saved]);

  if (!note) return null;
  return (
    <p role="status" className="m-0 rounded-[10px] px-3 py-2" style={{ border: "1px solid var(--vault-border)", color: "var(--vault-text-mute)", fontSize: 12.5 }}>
      <strong style={{ color: "var(--vault-text)" }}>Follows &amp; saves:</strong> {note}
    </p>
  );
}
