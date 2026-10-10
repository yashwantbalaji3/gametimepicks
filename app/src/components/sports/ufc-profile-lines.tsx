/**
 * A fighter profile's lines, in four categories that never share a marker (founder decision on PR #1059, 2026-10-10):
 *   · Tracked record — verified historical facts (the summary; the caller renders last 5 beneath);
 *   · Strengths · weaknesses — outcome rates only, "+" and "−";
 *   · Tendencies — neutral descriptions of how bouts go, "·", never green and never "−";
 *   · Not established — what the record is too thin to say, "?".
 * Model reasoning is deliberately absent: none exists for a fighter profile, and the per-bout line is a tracked-record
 * summary that says so in its own text.
 *
 * Shared by the /ufc card (compact) and the bout page (full), so both render the categories the same way.
 */
export type ProfileLinesInput = {
  summary?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  tendencies?: string[];
  unknowns?: string[];
};

export const PROFILE_CATEGORY_LABEL = {
  facts: "Tracked record",
  edges: "Strengths · weaknesses",
  tendencies: "Tendencies",
  unknowns: "Not established",
} as const;

export const PROFILE_MARKER = { strength: "+", weakness: "−", tendency: "·", unknown: "?" } as const;
type Kind = keyof typeof PROFILE_MARKER;

const COLOR: Record<Kind, string> = {
  strength: "var(--vault-success)",
  weakness: "var(--vault-text-faint)",
  tendency: "var(--vault-text-mute)",
  unknown: "var(--vault-text-faint)",
};

export default function UfcProfileLines({ profile, size = "compact" }: { profile: ProfileLinesInput; size?: "compact" | "full" }) {
  const compact = size === "compact";
  const fontSize = compact ? 10.5 : 12;
  const label = (text: string) => (
    <div className="font-mono uppercase tracking-[0.1em] mt-1.5 mb-0.5" style={{ fontSize: compact ? 8.5 : 9, color: "var(--vault-text-faint)" }}>{text}</div>
  );
  const lines = (kind: Kind, xs: string[] | undefined) => (xs ?? []).map((x) => (
    <div key={`${kind}-${x}`} data-profile-line={kind} style={{ fontSize, color: COLOR[kind], fontStyle: kind === "unknown" ? "italic" : undefined }}>
      {PROFILE_MARKER[kind]} {x}
    </div>
  ));
  const edges = [...(profile.strengths ?? []), ...(profile.weaknesses ?? [])].length > 0;
  return (
    <div className="flex flex-col gap-0.5">
      {profile.summary ? (
        <>
          {label(PROFILE_CATEGORY_LABEL.facts)}
          <p className="m-0" style={{ fontSize: compact ? 10.5 : 12.5, lineHeight: compact ? 1.5 : 1.6, color: "var(--vault-text-mute)" }}>{profile.summary}</p>
        </>
      ) : null}
      {edges ? <>{label(PROFILE_CATEGORY_LABEL.edges)}{lines("strength", profile.strengths)}{lines("weakness", profile.weaknesses)}</> : null}
      {profile.tendencies?.length ? <>{label(PROFILE_CATEGORY_LABEL.tendencies)}{lines("tendency", profile.tendencies)}</> : null}
      {profile.unknowns?.length ? <>{label(PROFILE_CATEGORY_LABEL.unknowns)}{lines("unknown", profile.unknowns)}</> : null}
    </div>
  );
}
