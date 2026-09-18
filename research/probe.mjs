import {writeFile} from 'node:fs/promises';
import {fresh,requestFor,parse,applyDecision} from '../game.mjs';
let g=fresh(42);const log=[];
for(let i=0;i<160&&g.alive&&g.score<5;i++){
 const start=performance.now(),r=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.TYPESAFE_API_KEY}`},body:JSON.stringify(requestFor(g)),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('HTTP '+r.status);const decision=parse(await r.json());g=applyDecision(g,decision,Math.round(performance.now()-start));log.push({step:g.steps,y:Math.round(g.y),velocity:Math.round(g.velocity),score:g.score,alive:g.alive,...decision,ms:g.last.ms});if(i%10===0||!g.alive)console.log(JSON.stringify(log.at(-1)));
}
await writeFile('research/flight-probe.json',JSON.stringify({final:g,log},null,2));console.log(JSON.stringify({score:g.score,alive:g.alive,steps:g.steps,usage:g.usage}));
