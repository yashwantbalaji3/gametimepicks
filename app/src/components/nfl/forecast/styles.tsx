/**
 * Shared styles for the unified NFL forecast surfaces (hub boards, game dashboard). Dark GameTimePicks theme, vault
 * tokens only — no new palette. Rendered once per page.
 */
const CSS = `
.nf{--nf-gap:14px}
.nf-card{border:1px solid var(--vault-border-strong);border-radius:14px;background:var(--gtp-card);padding:16px}
.nf-eyebrow{font-family:var(--font-mono,ui-monospace,monospace);font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--vault-text-faint);margin:0}
.nf-h2{font-size:20px;margin:4px 0 0;color:var(--vault-text);font-weight:700}
.nf-sub{font-size:13px;line-height:1.5;color:var(--vault-text-mute);margin:6px 0 0;max-width:760px}
.nf-num{font-family:var(--font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums}
.nf-faint{color:var(--vault-text-faint);font-size:11.5px}
.nf-section{margin-top:30px;scroll-margin-top:72px}
/* hero */
.nf-hero{display:grid;gap:14px}
.nf-hero-teams{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}
.nf-team{display:grid;justify-items:center;gap:6px;text-align:center;min-width:0}
.nf-team b{font-size:15px;color:var(--vault-text)}
.nf-team span{font-size:11.5px;color:var(--vault-text-mute)}
.nf-score{display:grid;justify-items:center;gap:2px}
.nf-score .nf-big{font-size:44px;font-weight:800;line-height:1;color:var(--vault-text);letter-spacing:-.01em}
.nf-score .nf-dash{color:var(--vault-text-faint);padding:0 6px}
.nf-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--vault-border-strong);border-radius:999px;padding:3px 10px;font-size:11.5px;color:var(--vault-text-mute)}
.nf-dot{width:7px;height:7px;border-radius:50%;background:var(--vault-warn);display:inline-block}
.nf-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.nf-stat{border:1px solid var(--vault-border);border-radius:10px;padding:10px 12px}
.nf-stat p{margin:0}
.nf-stat .nf-k{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint)}
.nf-stat .nf-v{font-size:19px;font-weight:700;color:var(--vault-text);margin-top:3px}
.nf-stat .nf-s{font-size:11.5px;color:var(--vault-text-mute);margin-top:2px}
.nf-split{display:flex;height:12px;border-radius:999px;overflow:hidden;border:1px solid var(--vault-border)}
.nf-split > div{height:100%}
/* tabs */
.nf-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;margin-top:12px;scrollbar-width:thin}
.nf-tab{flex:0 0 auto;min-height:36px;padding:6px 12px;border-radius:999px;border:1px solid var(--vault-border-strong);background:transparent;color:var(--vault-text-mute);font-size:13px;cursor:pointer;white-space:nowrap}
.nf-tab[aria-selected="true"]{background:color-mix(in srgb, var(--vault-gold-bright) 16%, transparent);border-color:var(--vault-gold-bright);color:var(--vault-text)}
.nf-tab:focus-visible{outline:2px solid var(--vault-gold-bright);outline-offset:2px}
/* player rows */
.nf-rows{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}
.nf-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:12px;border:1px solid var(--vault-border);border-radius:12px;padding:10px 12px}
.nf-row.nf-ranked{grid-template-columns:28px auto 1fr auto}
.nf-rank{font-family:var(--font-mono,ui-monospace,monospace);font-size:15px;font-weight:700;color:var(--vault-text-faint);text-align:center}
.nf-who{min-width:0;display:grid;gap:3px}
.nf-who a,.nf-who b{font-size:14px;font-weight:600;color:var(--vault-text);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nf-who a:hover{text-decoration:underline}
.nf-meta{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--vault-text-mute);flex-wrap:wrap}
.nf-val{text-align:right;display:grid;gap:2px;justify-items:end}
.nf-val b{font-size:20px;font-weight:800;color:var(--vault-text)}
.nf-val span{font-size:11px;color:var(--vault-text-faint);white-space:nowrap}
.nf-mkt{grid-column:1 / -1;font-size:11.5px;color:var(--vault-text-mute);font-family:var(--font-mono,ui-monospace,monospace);border-top:1px dashed var(--vault-border);padding-top:6px}
.nf-flag{font-size:10.5px;border:1px solid var(--vault-warn);color:var(--vault-warn);border-radius:6px;padding:0 5px}
.nf-withheld{border:1px dashed var(--vault-border-strong);border-radius:12px;padding:12px 14px;font-size:13px;color:var(--vault-text-mute);margin-top:10px;line-height:1.5}
.nf-details summary{cursor:pointer;min-height:32px;padding:6px 0;font-size:13px;color:var(--vault-text)}
.nf-details summary:focus-visible{outline:2px solid var(--vault-gold-bright);outline-offset:2px}
.nf-table{width:100%;border-collapse:collapse}
.nf-table th{text-align:left;padding:6px 8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--vault-text-faint);white-space:nowrap}
.nf-table td{padding:6px 8px;border-top:1px solid var(--vault-border);font-size:12.5px;vertical-align:middle}
.nf-scroll{overflow-x:auto}
.nf-scroll:focus-visible{outline:2px solid var(--vault-gold-bright);outline-offset:2px}
.nf-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
.nf-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;border:1px solid var(--vault-border);border-radius:8px;padding:2px 8px;color:var(--vault-text-mute)}
@media (max-width:520px){
  .nf-hero-teams{grid-template-columns:1fr 1fr;row-gap:12px}
  .nf-hero-teams .nf-score{grid-column:1 / -1;grid-row:2}
  .nf-team .gtp-team-logo{width:64px !important;height:64px !important}
  .nf-team .gtp-team-logo img{width:56px !important;height:56px !important}
  .nf-score .nf-big{font-size:38px}
  .nf-row{gap:10px;padding:9px 10px}
  .nf-val b{font-size:17px}
}
`;

export default function ForecastStyles() {
  return <style>{CSS}</style>;
}
