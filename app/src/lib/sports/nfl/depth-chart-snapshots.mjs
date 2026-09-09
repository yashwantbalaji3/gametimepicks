/** Timestamped nflverse depth-chart evidence (2025+ schema), not confirmed actives. */
const teamCode = t => ({ LA: "LAR", JAC: "JAX", WAS: "WSH" }[t] ?? t);
export function parseCsv(text) {
  const rows = []; let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"' && value === "") quoted = true;
    else if (c === ",") { row.push(value); value = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = "";
    } else value += c;
  }
  if (quoted) throw new Error("unterminated CSV field");
  if (row.length || value) { row.push(value); rows.push(row); }
  return rows;
}

export function quarterbackSnapshotsFromCsv(text) {
  const [header, ...rows] = parseCsv(text);
  const required = ["dt", "team", "player_name", "espn_id", "pos_abb", "pos_rank"];
  if (!header || required.some(k => !header.includes(k))) throw new Error("unsupported depth-chart schema");
  const ix = Object.fromEntries(required.map(k => [k, header.indexOf(k)]));
  const byKey = new Map();
  let invalidRows = 0;
  for (const row of rows) {
    if (row[ix.pos_abb] !== "QB") continue;
    const timestamp = row[ix.dt], team = teamCode(row[ix.team]), playerId = row[ix.espn_id], rank = Number(row[ix.pos_rank]);
    if (row.length !== header.length || !Number.isFinite(Date.parse(timestamp)) || !team || !/^\d+$/.test(playerId) || !Number.isInteger(rank) || rank < 1) { invalidRows++; continue; }
    const key = `${team}|${timestamp}`;
    if (!byKey.has(key)) byKey.set(key, { timestamp, team, quarterbacks: [] });
    const snapshot = byKey.get(key);
    // Repeated formation rows with identical identity/rank are duplicates, not extra players.
    if (!snapshot.quarterbacks.some(p => p.playerId === playerId && p.rank === rank)) snapshot.quarterbacks.push({ playerId, name: row[ix.player_name], rank });
  }
  const snapshots = [...byKey.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.team.localeCompare(b.team));
  return { snapshots, invalidRows, sourceRows: rows.length };
}

export function projectedQuarterbackAt(snapshots, { team, cutoffIso, maxAgeHours = 168 }) {
  const cutoff = Date.parse(cutoffIso);
  if (!Number.isFinite(cutoff) || !(maxAgeHours > 0)) return { state: "REFUSED", reason: "invalid cutoff or freshness window" };
  const before = snapshots.filter(s => s.team === teamCode(team) && Date.parse(s.timestamp) < cutoff).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const snapshot = before[0];
  if (!snapshot) return { state: "MISSING", reason: "no snapshot strictly before cutoff" };
  const ageHours = (cutoff - Date.parse(snapshot.timestamp)) / 3600000;
  if (ageHours > maxAgeHours) return { state: "STALE", timestamp: snapshot.timestamp, ageHours };
  const ids = new Set(snapshot.quarterbacks.filter(p => p.rank === 1).map(p => p.playerId));
  if (ids.size !== 1) return { state: "AMBIGUOUS", timestamp: snapshot.timestamp, reason: "requires exactly one rank-1 quarterback" };
  const playerId = [...ids][0];
  return { state: "PROJECTED_DEPTH_STARTER", playerId, name: snapshot.quarterbacks.find(p => p.playerId === playerId).name, timestamp: snapshot.timestamp, ageHours, limitation: "Depth-chart position, not confirmed active status or guaranteed workload" };
}
