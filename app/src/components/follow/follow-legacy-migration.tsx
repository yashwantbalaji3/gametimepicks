"use client";
/**
 * One-time migration of P251 name follows to canonical ids (v1.1.2). Renders nothing.
 *
 * Mounted where legacy follows were CREATED (/nfl) or READ (/today) and on /following. Mounting the
 * hook with the map is the whole job: `readFollowing` writes the v2 document once and leaves the P251
 * key untouched. Every other page reads v2 directly and needs no map, so the ~3 KB map ships only where
 * a returning P251 reader is most likely to land.
 */
import { type FollowRef, useFollowing } from "@/lib/follow/follow-store";

export default function FollowLegacyMigration({ legacyMap }: { legacyMap: Record<string, FollowRef> }) {
  useFollowing({ legacyMap });
  return null;
}
