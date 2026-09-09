/**
 * ENDZONE VAULT — the board, in one place (P251 · F4).
 *
 * The Vault is one of five flagship products, one per sport, and it was the only live one with no
 * home: /mr-dub's "Open →" dropped a reader at the top of the NFL hub to scroll for a section,
 * while two products that have never been built each had their own route. This renders the same
 * artifact the hub renders, so the two cannot drift — the hub keeps a short preview and this is
 * the full board.
 */
import PlayerAvatar from "@/components/player-avatar";

export interface VaultCandidate {
  playerId: string;
  name: string;
  position: string | null;
  team: string;
  opponent?: string;
  event: string;
  kickoffUtc?: string;
  tdProbability: number;
  roleState: string;
  roleNote?: string;
  marketPrice?: number | null;
}

export interface VaultArtifact {
  state: string;
  isCard?: boolean;
  reason?: string;
  generatedAt?: string;
  candidateCount?: number;
  selections?: VaultCandidate[];
  watchlist?: VaultCandidate[];
  gates?: { required?: string[]; tdMarketOffered?: boolean | null; pricedCandidates?: number; roleReadyCandidates?: number };
  disclaimer?: string;
}

/** The ESPN athlete id already inside the Vault's own playerId ("nfl-athlete-4430807"). */
export const espnAthleteId = (playerId: string) => Number(String(playerId).replace(/^nfl-athlete-/, "")) || null;

const PLAYING_TIME: Record<string, string> = {
  ACTIVE_EXPECTED: "Expected to play",
  QUESTIONABLE: "Questionable",
  ROLE_UNCERTAIN: "Playing time unknown",
};

export default function EndzoneVaultBoard({ vault, limit = 25 }: { vault: VaultArtifact; limit?: number }) {
  const rows = (vault.state === "ACTIVE" ? vault.selections : vault.watchlist) ?? [];
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
        <thead>
          <tr>
            {["Player", "Game", "Chance to score", "Playing time"].map((h) => (
              <th key={h} scope="col" style={{ textAlign: "left", padding: "7px 10px", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--vault-text-faint)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((c) => (
            <tr key={c.playerId}>
              <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 13 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <PlayerAvatar playerId={espnAthleteId(c.playerId)} playerName={c.name} team={c.team} sport="nfl" size="sm" />
                  <span>
                    {c.name} <span style={{ color: "var(--vault-text-faint)", fontSize: 11 }}>{c.position ?? ""} · {c.team}</span>
                  </span>
                </span>
              </td>
              <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12, color: "var(--vault-text-mute)" }}>{c.event}</td>
              <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 12.5, fontFamily: "var(--font-mono, monospace)" }}>{(c.tdProbability * 100).toFixed(1)}%</td>
              <td style={{ padding: "7px 10px", borderTop: "1px solid var(--vault-border)", fontSize: 11.5, color: "var(--vault-text-mute)" }}>
                {PLAYING_TIME[c.roleState] ?? "Playing time unknown"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
