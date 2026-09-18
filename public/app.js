import {CFG,fresh,simulate,observation,requestFor} from '/game.js';

const $=id=>document.getElementById(id),canvas=$('flight'),ctx=canvas.getContext('2d');
let game=fresh(42),view=game,mode='jev',running=false,busy=false,transition=null,lastFrame=0,flapQueued=false,loaded=false;
async function api(path,body){const r=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'Could not reach the flight.');return data;}
function error(e){running=false;$('error').textContent=e.message;$('error').hidden=false;update();}
function update(){
 const over=!game.alive||game.finished;
 $('score').textContent=String(view.score).padStart(2,'0');$('seed-label').textContent='COURSE '+String(game.seed).padStart(6,'0');
 $('flight-status').textContent=over?'FLIGHT COMPLETE':busy?'JEV IS THINKING':running?(mode==='jev'?'JEV HAS CONTROL':'YOU HAVE CONTROL'):game.time?'FLIGHT PAUSED':'ON THE RUNWAY';
 $('live-dot').classList.toggle('active',running);document.body.classList.toggle('thinking',busy);
 $('play').textContent=running?'Pause flight Ⅱ':over?'Try again ↗':game.time?'Resume flight ↗':mode==='jev'?'Let Jev fly ↗':'Start flying ↗';
 $('launch').disabled=!loaded;$('launch').textContent=mode==='jev'?'Let Jev fly ↗':'Start flying ↗';
 $('play').disabled=!loaded||busy&&!running;$('reset').disabled=busy||!!transition||!loaded;
 $('step').hidden=mode==='human';$('step').disabled=busy||running||!!transition||over||!loaded;
 for(const m of ['jev','human']){$(m).classList.toggle('active',mode===m);$(m).setAttribute('aria-pressed',mode===m);$(m).disabled=busy||!!transition||!loaded;}
 $('start-note').hidden=game.time>0||running||busy;$('end-note').hidden=!over||!!transition;
 if(over){$('end-title').textContent=game.score>=10?'Flight school graduate.':game.alive?'That’s the flight budget.':'Gravity wins.';$('end-copy').textContent=`${game.score} ${game.score===1?'pipe':'pipes'} cleared in ${game.time.toFixed(2)} simulated seconds. ${mode==='jev'?'Every move was Jev’s.':'Ready for another try?'}`;}
 $('start-copy').textContent=mode==='jev'?'Every flap comes from Jev. Let’s see how far it gets.':'Tap the course or press Space to flap. Can you beat Jev?';
 $('pace-copy').innerHTML=mode==='jev'?'<b>Decision-paced flight.</b> Physics pauses while Jev thinks, then advances 160 ms. No scripted rescue.':'<b>You have the controls.</b> Tap the course or press Space to flap. Real-time physics; no API calls.';
 $('sim-time').textContent=view.time.toFixed(2)+'s flown';
 const d=game.last;
 $('action').textContent=mode==='human'?'Your instincts':busy?'Thinking…':d?(d.action==='flap'?'Flap upward':'Coast down'):'Awaiting takeoff';
 $('action-icon').textContent=mode==='human'?'✦':busy?'·':d?(d.action==='flap'?'↑':'↓'):'?';
 $('decision-time').textContent=mode==='human'?'Space or tap to flap.':busy?'World paused. Waiting for Jev.':d?`Decision ${game.steps} · ${d.ms} ms round trip`:'The next move is up to Jev.';
 for(const action of ['flap','coast']){const p=mode==='jev'?d?.probabilities?.[action]:undefined;$(action+'-bar').style.width=Number.isFinite(p)?`${Math.max(0,Math.min(1,p))*100}%`:'0%';$(action+'-prob').textContent=Number.isFinite(p)?`${Math.round(p*100)}%`:'—';}
 $('calls').textContent=game.usage.calls;$('cost').textContent='$'+game.usage.cost.toFixed(5);$('latency').textContent=d?d.ms+' ms':'—';$('tokens').textContent=game.usage.tokens.toLocaleString();
 const sensorGame=d&&!busy?{...game,...d.before,pipes:game.pipes.map(p=>({...p,x:p.x+CFG.speed*(game.time-d.before.time)}))}:game;
 $('sensor-position').textContent=mode==='human'?'You’re reading the course directly. Jev is resting.':requestFor(sensorGame).state.currentPosition;
 $('history').replaceChildren();
 for(const row of game.history){const el=document.createElement('div');el.className='tape-entry';const n=document.createElement('span'),a=document.createElement('b'),t=document.createElement('span');n.textContent=String(row.step).padStart(3,'0');a.textContent=row.action==='flap'?'↑ FLAP':'↓ COAST';t.textContent=row.ms+' ms';el.append(n,a,t);$('history').append(el);}
 if(!game.history.length){const p=document.createElement('p');p.textContent=mode==='human'?'Human flight. No API calls.':'Nothing on the tape yet.';$('history').append(p);}
 $('footer-note').textContent=mode==='jev'?'10 pipes or 220 decisions per run. No automatic restarts.':'Same physics. Your reflexes. Clear 10 pipes to graduate.';
}
async function decide(){
 if(busy||transition||!game.alive||game.finished||mode!=='jev')return;
 busy=true;$('error').hidden=true;update();const before=game;
 try{const result=await api('/api/step',{id:game.id,step:game.steps});game=result.game;transition={before,after:game,start:performance.now()};}
 catch(e){error(e);}finally{busy=false;update();}
}
async function reset(seed){
 running=false;$('error').hidden=true;
 if(mode==='jev'){busy=true;update();try{game=(await api('/api/reset',seed===undefined?{}:{seed})).game;}finally{busy=false;}}
 else game=fresh(seed??Math.floor(Math.random()*1e6));
 view=game;flapQueued=false;transition=null;update();
}
async function play(){
 try{if(running){running=false;update();return;}if(!game.alive||game.finished)await reset(game.seed);running=true;lastFrame=performance.now();update();if(mode==='jev')decide();}
 catch(e){error(e);}
}
$('play').onclick=play;$('launch').onclick=play;$('step').onclick=decide;$('reset').onclick=()=>reset().catch(error);
for(const m of ['jev','human'])$(m).onclick=async()=>{if(mode===m)return;mode=m;try{await reset(game.seed);}catch(e){error(e);}};
function manualFlap(){if(mode!=='human'||!loaded)return;if(!running){if(game.time&&game.alive&&!game.finished)return;play();}flapQueued=true;}
canvas.addEventListener('pointerdown',manualFlap);
document.addEventListener('keydown',e=>{if(e.code==='Space'&&mode==='human'&&!e.repeat&&!$('about-dialog').open&&(running||!['BUTTON','INPUT','A'].includes(document.activeElement.tagName))){e.preventDefault();manualFlap();}});
$('about').onclick=()=>{running=false;update();$('about-dialog').showModal();};$('close-about').onclick=()=>$('about-dialog').close();
document.addEventListener('visibilitychange',()=>{if(document.hidden){running=false;update();}});

function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function pipe(x,top,bottom){
 for(const [y,h,capY] of [[-4,top+4,top-20],[bottom,CFG.height-bottom+4,bottom]]){
  rect(x,y,CFG.pipeWidth,h,'#456c42');rect(x+3,y,CFG.pipeWidth-6,h,'#86b560');rect(x+9,y,8,h,'#acd382');rect(x+CFG.pipeWidth-10,y,7,h,'#699749');
  rect(x-5,capY,CFG.pipeWidth+10,21,'#456c42');rect(x-2,capY+3,CFG.pipeWidth+4,14,'#92bf6c');rect(x+3,capY+4,7,12,'#bfdd94');
 }
}
function paint(now){
 const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
 ctx.setTransform(w/CFG.width,0,0,h/CFG.height,0,0);
 rect(0,0,820,520,'#bce1ca');
 for(let i=0;i<5;i++){const x=((i*213+90-view.time*7)%1100+1100)%1100-100;ellipse(x,115+i%2*55,49,14,'#dfecd9');ellipse(x-15,106+i%2*55,24,19,'#dfecd9');ellipse(x+14,109+i%2*55,27,20,'#dfecd9');}
 for(let i=0;i<7;i++){ellipse(i*160-40,516,140,100+i%3*28,'#9dc79c');ellipse(i*140+20,540,110,81+i%2*22,'#87b587');}
 for(const p of view.pipes)if(p.x>-80&&p.x<900)pipe(p.x,p.center-CFG.gap/2,p.center+CFG.gap/2);
 rect(0,507,820,13,'#5f8c5e');rect(0,512,820,8,'#e0d89e');for(let x=0;x<840;x+=18)rect(x-(view.time*CFG.speed)%18,507,9,3,'#a9c976');
 if($('forecast').checked&&view.alive){
  for(const [action,color] of [['coast','#387858'],['flap','#bb922c']]){
   let future=view;
   for(let i=1;i<=8;i++){future=simulate(future,i===1?action:'coast',.04);ellipse(CFG.birdX+i*.04*CFG.speed,future.y,2.8,2.8,future.alive?color:'#bc6547');if(!future.alive)break;}
  }
 }
 ctx.save();ctx.translate(CFG.birdX,view.y);ctx.rotate(Math.max(-.38,Math.min(.8,view.velocity/600)));
 ellipse(0,1,18,14,'#3d5940');ellipse(0,-1,16,12,'#f6d954');ellipse(-3,4,12,7,'#edc548');ellipse(8,-6,7,8,'#fff9dc');ellipse(11,-6,2.6,3.6,'#354534');
 ctx.fillStyle='#ed8950';ctx.strokeStyle='#6b6740';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(26,3);ctx.lineTo(13,7);ctx.closePath();ctx.fill();ctx.stroke();
 ellipse(-10,Math.sin(now/95)*2+3,9,5,'#fff0a1');ctx.restore();
}
function frame(now){
 const dt=Math.min((now-lastFrame)/1000,.04);lastFrame=now;
 if(transition){const t=Math.min(1,(now-transition.start)/(CFG.step*1000)),a=transition.before,b=transition.after;view={...b,y:a.y+(b.y-a.y)*t,velocity:a.velocity+(b.velocity-a.velocity)*t,time:a.time+(b.time-a.time)*t,pipes:b.pipes.map((p,i)=>({...p,x:a.pipes[i].x+(p.x-a.pipes[i].x)*t})),score:t<1?a.score:b.score};
  if(t>=1){view=game;transition=null;if(!game.alive||game.finished)running=false;update();if(running)decide();}
 }else if(mode==='human'&&running){game=simulate(game,flapQueued?'flap':'coast',dt||1/120);flapQueued=false;if(game.score>=10)game.finished=true;view=game;if(!game.alive||game.finished)running=false;update();}
 $('score').textContent=String(view.score).padStart(2,'0');$('sim-time').textContent=view.time.toFixed(2)+'s flown';paint(now);requestAnimationFrame(frame);
}
update();requestAnimationFrame(frame);
api('/api/game').then(data=>{game=data.game;view=game;loaded=true;update();}).catch(error);
