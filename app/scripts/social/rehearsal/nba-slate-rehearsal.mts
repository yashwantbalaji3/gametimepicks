// Full-slate rehearsal: every game x 4 variants + Today + Top 5, REHEARSAL-stamped, deterministic QA per image.
// npx tsx scripts/social/rehearsal/nba-slate-rehearsal.mts <outDir> <renderCacheDir>   (needs GTP_NBA_UNIFIED_ROSTER, GTP_DATA_COMMIT)
const A=new URL('../../../', import.meta.url).pathname;
const m=await import(A+'scripts/social/render-social-pack.mjs');
const fs=await import('node:fs');const crypto=await import('node:crypto');
const [out,cache]=process.argv.slice(2);
const T0=Date.now();
const r=m.prepareGameDay({date:'2026-11-02',asOf:'2026-11-02T18:00:00Z'});
const ids=[...new Set(r.posts.filter((p:any)=>p.contentType==='NBA_GAME_WINNER').map((p:any)=>p.variant))].slice(0,14);
const R=(p:any,v:string)=>({...p,variant:`REHEARSAL-${p.variant??'slate'}-${v}`,title:`REHEARSAL ${p.title??''}`});
const roster=JSON.parse(fs.readFileSync(process.env.GTP_NBA_UNIFIED_ROSTER!,'utf8'));
const qa:any[]=[];const rows:any[]=[];const tot={rendered:0,skipped:0,images:0};
const sha=(b:any)=>crypto.createHash('sha256').update(b).digest('hex');
function check(pkg:any,posts:any){
  const post=posts.find((p:any)=>`REHEARSAL`&&p.variant===pkg.variant);
  for(const i of pkg.images){const b=fs.readFileSync(i.path);const w=b.readUInt32BE(16),h=b.readUInt32BE(20);
    if(w!==1080*i.scale||h!==1350*i.scale)qa.push([pkg.variant,'DIM',w,h]);if(sha(b)!==i.sha256)qa.push([pkg.variant,'SHA']);tot.images++;}
  for(const c of post.cards){const html=c.html.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<script[\s\S]*?<\/script>/g,'');
    if(!pkg.containsMarketData&&/class="[^"]*\b(over|under)\b/.test(html.replace(/<div class="lgd">.*?<\/div><\/div>/s,'')))qa.push([pkg.variant,'COLOUR_WITHOUT_LINE']);
    const need=/WINNER|TONIGHT/.test(pkg.contentType)?/model win probability/i:/model projection/i;
    if(!need.test(html.replace(/<[^>]+>/g,' ')))qa.push([pkg.variant,'LABEL',String(need)]);
    if(/\best\.|estimate\b|projected median/i.test(html.replace(/<[^>]+>/g,' ')))qa.push([pkg.variant,'FORBIDDEN_WORD']);}
}
for(const id of ids){
  const t=Date.now();
  const w=r.posts.find((p:any)=>p.contentType==='NBA_GAME_WINNER'&&p.variant===id);
  const s=r.posts.find((p:any)=>p.contentType==='NBA_PLAYER_STATS'&&p.variant===id);
  const posts=[R(w,'winner'),R(s,'props'),R(s,'projonly'),R(w,'winneronly')];
  const st:any={};const d=await m.writePackages(posts,{outRoot:out,scales:[1],png:true,renderCache:cache,stats:st});
  tot.rendered+=st.rendered;tot.skipped+=st.skipped;
  for(const x of d)check(x.pkg,posts);
  const teams=[w.content.game?.away??null];
  const ab=[s.cards[0].html.match(/([A-Z]{2,4}) @ ([A-Z]{2,4})/)?.slice(1)??[]][0];
  const om=ab.reduce((n:number,t:string)=>n+(roster[t]??[]).reduce((k:number,e:any)=>k+(typeof e==='object'?3:(roster.__cells[e]?.length??0)),0),0);
  rows.push({id,game:ab.join('@'),tip:w.firstStartUtc,ms:Date.now()-t,images:d.reduce((n:number,x:any)=>n+x.pkg.images.length,0),omitted:om,winner:d[0].pkg.contentSha256.slice(0,12),props:d[1].pkg.contentSha256.slice(0,12)});
}
const ton=r.posts.find((p:any)=>p.contentType==='NBA_TONIGHT');
const car=m.nbaTop5Carousel({posts:r.posts.filter((p:any)=>p.contentType==='NBA_DAILY_TOP5'),date:'2026-11-02'}).posts[0];
const sp=[R(ton,'today'),R(car,'top5')];const st:any={};const t=Date.now();
const d=await m.writePackages(sp,{outRoot:out,scales:[1],png:true,renderCache:cache,stats:st});tot.rendered+=st.rendered;tot.skipped+=st.skipped;
for(const x of d)check(x.pkg,sp);
rows.push({id:'slate',ms:Date.now()-t,images:d.reduce((n:number,x:any)=>n+x.pkg.images.length,0),today:d[0].pkg.contentSha256.slice(0,12),top5:d[1].pkg.contentSha256.slice(0,12)});
console.log(JSON.stringify({totalMs:Date.now()-T0,packages:ids.length*4+2,...tot,qa,rows}));process.exit(0);
