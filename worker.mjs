// The build embeds game.mjs and the public assets before this module.
const cookieName='jev_flight';
const encoder=new TextEncoder();
const inflight=new Set();
function encode(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
function decode(s){return Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
async function key(env){return crypto.subtle.importKey('raw',encoder.encode('jev-flight-school:'+env.TYPESAFE_API_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function seal(state,env){const data=encode(encoder.encode(JSON.stringify(state))),signature=await crypto.subtle.sign('HMAC',await key(env),encoder.encode(data));return data+'.'+encode(new Uint8Array(signature));}
async function unseal(value,env){try{const [data,signature]=value.split('.');if(!await crypto.subtle.verify('HMAC',await key(env),decode(signature),encoder.encode(data)))return null;const s=JSON.parse(new TextDecoder().decode(decode(data)));if(typeof s.actions!=='string'||s.actions.length>CFG.maxDecisions||!/^[fc]*$/.test(s.actions)||!Number.isSafeInteger(s.seed)||typeof s.id!=='string')return null;return s;}catch{return null;}}
function newState(seed=42){return {seed,id:crypto.randomUUID(),actions:'',tokens:0,ms:0,last:null,history:[]};}
function restore(s){let g=fresh(s.seed),before;g.id=s.id;for(const a of s.actions){before=g;g=simulate(g,a==='f'?'flap':'coast');}g.steps=s.actions.length;g.usage={calls:g.steps,tokens:s.tokens,cost:s.tokens*PRICE,ms:s.ms};g.history=s.history;if(s.last&&before)g.last={...s.last,before:{y:before.y,velocity:before.velocity,time:before.time},observation:observation(before)};if(g.steps>=CFG.maxDecisions||g.score>=10)g.finished=true;return g;}
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname;
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const json=(status,data,cookie)=>new Response(JSON.stringify(data),{status,headers:{...headers,...(cookie?{'Set-Cookie':`${cookieName}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`}:{})}});
 if(!path.startsWith('/api/')){
  const asset=ASSETS[path];if(request.method!=='GET'||!asset)return json(404,{error:'Not found'});
  return new Response(asset.body,{headers:{'Content-Type':asset.type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 }
 if(!env.TYPESAFE_API_KEY)return json(503,{error:'The flight service needs its Jev API key.'});
 if(!['/api/game','/api/reset','/api/step'].includes(path))return json(404,{error:'Not found'});
 const cookie=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 let state=cookie?await unseal(cookie,env):null;
 if(request.method==='GET'&&path==='/api/game'){state??=newState();return json(200,{game:restore(state),config:CFG},await seal(state,env));}
 if(request.method!=='POST'||path==='/api/game')return json(405,{error:'Method not allowed'});
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin)return json(403,{error:'Use the Flight School website.'});
 if(Number(request.headers.get('Content-Length'))>2000)return json(413,{error:'Request too large.'});
 let input;try{const text=await request.text();if(text.length>2000)return json(413,{error:'Request too large.'});input=JSON.parse(text||'{}');if(!input||typeof input!=='object')throw Error();}catch{return json(400,{error:'Invalid request.'});}
 if(path==='/api/reset'){state=newState(Number.isSafeInteger(input.seed)?input.seed>>>0:Math.floor(Math.random()*1e6));return json(200,{game:restore(state)},await seal(state,env));}
 if(!state||input.id!==state.id||input.step!==state.actions.length)return json(409,{error:'This flight changed or expired. Start a new flight.'});
 const game=restore(state);if(!game.alive||game.finished)return json(409,{error:'Flight complete. Start a new flight.'});
 const pending=state.id+':'+game.steps;if(inflight.has(pending)||inflight.size>=4)return json(429,{error:'Jev is finishing a decision. Try again in a moment.'});
 inflight.add(pending);
 try{
  const start=performance.now(),response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.TYPESAFE_API_KEY}`},body:JSON.stringify(requestFor(game)),signal:AbortSignal.timeout(15000)});
  if(!response.ok)return json(502,{error:`Jev returned HTTP ${response.status}. Flight paused; no move was substituted.`});
  const decision=parse(await response.json()),ms=Math.round(performance.now()-start),next=applyDecision(game,decision,ms);
  state={...state,actions:state.actions+(decision.action==='flap'?'f':'c'),tokens:next.usage.tokens,ms:next.usage.ms,last:{...decision,ms},history:next.history};
  return json(200,{game:next},await seal(state,env));
 }catch{return json(502,{error:'Jev could not finish that decision. Flight paused; try again.'});}finally{inflight.delete(pending);}
}};
