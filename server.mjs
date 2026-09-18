import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fresh,requestFor,parse,applyDecision,CFG} from './game.mjs';
const port=Number(process.env.PORT||3218);let game=fresh(42),busy=false;
const files={'/':['public/index.html','text/html'],'/app.js':['public/app.js','text/javascript'],'/style.css':['public/style.css','text/css'],'/game.js':['game.mjs','text/javascript']};
http.createServer(async(req,res)=>{
 const json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
  if(req.method==='GET'&&req.url==='/api/game')return json(200,{game,config:CFG});
  if(req.method==='POST'&&['/api/step','/api/reset'].includes(req.url)){
   if(req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin))return json(403,{error:'Use the local game address.'});
   let body='';for await(const c of req){body+=c;if(Buffer.byteLength(body)>2000)return json(413,{error:'Request too large.'});}
   let input;try{input=JSON.parse(body||'{}');}catch{return json(400,{error:'Invalid request.'});}
   if(busy)return json(409,{error:'Jev is finishing a decision. Try again in a moment.'});
   if(req.url==='/api/reset'){game=fresh(Number.isSafeInteger(input.seed)?input.seed>>>0:Math.floor(Math.random()*1e6));return json(200,{game});}
   if(input.id!==game.id||input.step!==game.steps)return json(409,{error:'This flight changed in another tab. Start a new flight.'});
   if(!game.alive||game.finished)return json(409,{error:'Flight complete. Start a new flight.'});
   if(!process.env.TYPESAFE_API_KEY)return json(503,{error:'Add TYPESAFE_API_KEY to .env to let Jev fly.'});
   busy=true;try{
    const start=performance.now(),response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.TYPESAFE_API_KEY}`},body:JSON.stringify(requestFor(game)),signal:AbortSignal.timeout(15000)});
    if(!response.ok)return json(502,{error:`Jev returned HTTP ${response.status}. Flight paused; no move was substituted.`});
    game=applyDecision(game,parse(await response.json()),Math.round(performance.now()-start));return json(200,{game});
   }catch{return json(502,{error:'Jev could not finish that decision. Flight paused; try again.'});}finally{busy=false;}
  }
  if(req.method!=='GET'||!files[req.url])return json(404,{error:'Not found'});
  const [file,type]=files[req.url];res.writeHead(200,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"});res.end(await readFile(new URL(file,import.meta.url)));
 }catch{if(!res.headersSent)json(500,{error:'Could not reach the flight.'});else res.end();}
}).listen(port,'127.0.0.1',()=>console.log('Jev Flight School: http://localhost:'+port));
