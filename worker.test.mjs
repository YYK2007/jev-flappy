import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './dist/server/index.js';
const env={TYPESAFE_API_KEY:'test-secret-not-a-real-key'},origin='https://flight.example';
const req=(path,body,cookie)=>new Request(origin+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const cookieOf=r=>r.headers.get('set-cookie').split(';')[0];
test('static allowlist serves the game and never private files',async()=>{const r=await worker.fetch(req('/'),env);assert.equal(r.status,200);assert.match(await r.text(),/Jev Flight School/);for(const p of ['/.env','/worker.mjs','/.git/config'])assert.equal((await worker.fetch(req(p),env)).status,404);});
test('separate browsers have separate flights and secure signed cookies',async()=>{const a=await worker.fetch(req('/api/game'),env),b=await worker.fetch(req('/api/game'),env);assert.match(a.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.notEqual((await a.json()).game.id,(await b.json()).game.id);});
test('a Jev choice survives a fresh request with its true usage and physics',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({answers:{move:{type:'choice',choice:'flap',confidence:.9,probabilities:{flap:.9,coast:.1}}},usage:{input_tokens:637}});};
 try{
  const init=await worker.fetch(req('/api/game'),env),g=(await init.clone().json()).game;
  const r=await worker.fetch(req('/api/step',{id:g.id,step:0},cookieOf(init)),env);assert.equal(r.status,200);
  const next=(await r.clone().json()).game;assert.equal(next.last.action,'flap');assert.ok(next.y<g.y);assert.equal(next.usage.tokens,637);assert.equal(calls,1);
  const resumed=(await (await worker.fetch(req('/api/game',undefined,cookieOf(r)),env)).json()).game;assert.deepEqual(resumed,next);assert.ok(r.headers.get('set-cookie').length<4096);
  assert.equal((await worker.fetch(req('/api/step',{id:g.id,step:0},cookieOf(r)),env)).status,409);assert.equal(calls,1);
  const bad=cookieOf(r).replace('=', '=X');assert.equal((await worker.fetch(req('/api/step',{id:g.id,step:1},bad),env)).status,409);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('failed model requests preserve the flight, with no substitute action',async()=>{const original=globalThis.fetch;globalThis.fetch=async()=>new Response('Unavailable',{status:503});try{const init=await worker.fetch(req('/api/game'),env),g=(await init.clone().json()).game;const r=await worker.fetch(req('/api/step',{id:g.id,step:0},cookieOf(init)),env);assert.equal(r.status,502);assert.equal(r.headers.get('set-cookie'),null);const unchanged=(await (await worker.fetch(req('/api/game',undefined,cookieOf(init)),env)).json()).game;assert.equal(unchanged.steps,0);}finally{globalThis.fetch=original;}});
test('cross-origin steps are refused before reaching Jev',async()=>{const r=await worker.fetch(new Request(origin+'/api/step',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}),env);assert.equal(r.status,403);});
