import { SeededRng } from "./rng.ts";
import { simulateGame, DEFAULT_ENGINE_PARAMS } from "./engine_x.ts";
const bat = (h:number,tb:number)=>({playerId:1,name:"b",team:"",expHits:h,expTotalBases:tb,expHrr:null});
const lineup = (h:number,tb:number)=>Array.from({length:9},()=>bat(h,tb));
const sp = (k:number|null)=>({playerId:2,name:"p",team:"",expStrikeouts:k});
function run(label:string, game:any, N=40000, auto=true){
  (globalThis as any).AUTO = auto; (globalThis as any).CAP = 0;
  const rng = new SeededRng("mlb001|"+label);
  let hw=0, ex=0, tot=0, inn=0, extraRuns=0, exN=0, awayR=0, homeR=0, oneRun=0;
  for(let i=0;i<N;i++){ const r=simulateGame(game,rng,DEFAULT_ENGINE_PARAMS); if(r.homeRuns>r.awayRuns)hw++; tot+=r.homeRuns+r.awayRuns; awayR+=r.awayRuns; homeR+=r.homeRuns; if(Math.abs(r.homeRuns-r.awayRuns)===1) oneRun++; if(r.extra){ex++; inn+=r.innings; } }
  console.log(`${label.padEnd(44)} P(home)=${(hw/N).toFixed(4)} extras=${(ex/N).toFixed(4)} meanTot=${(tot/N).toFixed(3)} away=${(awayR/N).toFixed(3)} home=${(homeR/N).toFixed(3)} 1run=${(oneRun/N).toFixed(3)} meanInnIfExtra=${ex?(inn/ex).toFixed(2):'-'} capHits=${(globalThis as any).CAP}`);
}
const avg = {awayLineup: lineup(0.95,1.5), homeLineup: lineup(0.95,1.5), awayStarter: sp(5.2), homeStarter: sp(5.2)};
run("symmetric avg, auto runner", avg);
run("symmetric avg, NO auto runner (postseason rule)", avg, 40000, false);
const low = {awayLineup: lineup(0.8,1.2), homeLineup: lineup(0.8,1.2), awayStarter: sp(7), homeStarter: sp(7)};
run("low-offense, auto", low); run("low-offense, NO auto", low, 40000, false);
// pitcher K sensitivity: home starter K 3 vs 9 facing avg lineup
for (const k of [3,5.2,7,9]) run(`away bats vs home SP expK=${k}`, {awayLineup: lineup(0.95,1.5), homeLineup: lineup(0.95,1.5), awayStarter: sp(5.2), homeStarter: sp(k)});
// batter quality sensitivity
for (const h of [0.85,0.95,1.05]) run(`away lineup expHits=${h}`, {awayLineup: lineup(h,h*1.58), homeLineup: lineup(0.95,1.5), awayStarter: sp(5.2), homeStarter: sp(5.2)});
// no starters (bullpen only) vs starters
run("both no starter (bullpen aggregate)", {awayLineup: lineup(0.95,1.5), homeLineup: lineup(0.95,1.5), awayStarter: null, homeStarter: null});
