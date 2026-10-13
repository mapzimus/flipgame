'use strict';
// Actual two/four-lane Battle: independent worlds, live paint and saved scoring.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const boot=fs.readFileSync(path.join(root,'js/v111-boot.js'),'utf8');
const assets=[...boot.matchAll(/['"](js\/[^'"]+\.js)(?:\?[^'"]*)?['"]/g)].map(m=>m[1]);
// v111-boot.js names the private bundle twice; loading it twice trips its own
// single-composition guard and hides every later boot error behind that throw.
const ordered=[...new Set(assets)];assets.length=0;assets.push(...ordered);
if(!assets.includes('js/v112-battle-routes.js'))assets.splice(assets.indexOf('js/main.js'),0,'js/v112-battle-routes.js');
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome','/usr/local/bin/google-chrome'].find(fs.existsSync);
if(!chrome)throw new Error('Set CHROME_PATH');
async function scenario(){
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw new Error(m);},reports=[];
 for(const count of [2,4]){
  const frame=document.createElement('iframe');frame.style.cssText=`width:${count===2?1280:1920}px;height:820px`;document.body.replaceChildren(frame);frame.src='/app';await new Promise(r=>frame.onload=r);
  const w=frame.contentWindow,d=w.document;for(let i=0;i<150&&!w.__ready;i++)await pause(50);await w.FlipgameV112.ready;
  w.eval('window.testEngines=[];var createEngine=Matter.Engine.create;Matter.Engine.create=function(...args){var e=createEngine(...args);testEngines.push(e);return e}');
  const raf=w.requestAnimationFrame.bind(w);let offset=0;w.requestAnimationFrame=fn=>raf(t=>fn(t+(offset+=80)));
  const click=id=>d.getElementById(id).click();click('broadcast-setup');
  let rows=()=>[...d.querySelectorAll('.player-input-row')];while(rows().length<count)click('add-player-btn');while(rows().length>count)rows().at(-1).querySelector('.remove-player-btn').click();
  rows().forEach((row,i)=>{row.dataset.ai='0';row.querySelector('input').value='Player '+i;});
  const feel=d.querySelector('input[name="feel"][value="forgiving"]');feel.checked=true;feel.dispatchEvent(new w.Event('change',{bubbles:true}));
  click('broadcast-home-back');click('battle-open');
  const pad=d.getElementById('battle-touch-pad');
  for(let i=0;i<4;i++){pad.dispatchEvent(new w.PointerEvent('pointerdown',{pointerId:i+1,pointerType:'touch',clientX:200+i*30,clientY:200,bubbles:true}));if(i===0)check(w.FlipgameV112.battle.capabilities().activeLaneLimit===1,'One pointer cannot claim simultaneous play');if(i===1)check(w.FlipgameV112.battle.capabilities().activeLaneLimit===2,'Two observed touches qualify two lanes');}
  for(let i=0;i<4;i++)pad.dispatchEvent(new w.PointerEvent('pointerup',{pointerId:i+1,pointerType:'touch',bubbles:true}));
  check(w.FlipgameV112.battle.capabilities().activeLaneLimit===4,'Only observed contacts unlock lane count');
  const press=label=>{const button=[...d.querySelectorAll('#battle-body button')].find(b=>b.textContent===label);check(button&&!button.disabled,label);button.click();};
  press(count===2?'1v1':'1v1v1v1');press('Begin Battle');await pause(100);
  check(d.querySelectorAll('.battle-live-canvas').length===count,'Every simultaneous lane has its own visible canvas');
  const forged=w.FlipgameV112PhysicsDriver.create({getObservation:()=>null,subscribeObservations:()=>()=>{}});
  let rejected=false;try{w.FlipgameV112.battle.attachPhysics(w.FlipgameV112.battle.snapshot().config.matchId,forged);}catch(error){rejected=/actual engine/.test(error.message);}
  check(rejected,'Caller-authored observer snapshots cannot supply reward metadata');forged.close();
  check(w.testEngines.length===count&&new Set(w.testEngines).size===count,'Each lane owns an independent Matter world');
  const bodies=()=>w.testEngines.map(e=>w.Matter.Composite.allBodies(e.world).find(b=>b.label==='bottle'));
  check(new Set(bodies().map(b=>b.id)).size===count,'Bodies are not shared across lanes');
  const stage=d.getElementById('battle-stage'),width=w.innerWidth/count;
  const send=(type,i,y)=>stage.dispatchEvent(new w.PointerEvent(type,{pointerId:i+10,pointerType:'touch',isPrimary:i===0,clientX:(i+.5)*width,clientY:y,pressure:.5,bubbles:true,cancelable:true}));
  let volley=0,concurrent=false;
  const baseline=w.FlipgameV112.snapshot().profile.fxp,started=Date.now();
  while(w.FlipgameV112.battle.snapshot()?.status==='playing'){
   check(Date.now()-started<100000,'Concurrent Battle did not finish: '+d.getElementById('battle-body').textContent);
   const nodes=[...d.querySelectorAll('.battle-lane-status p')];
   const active=nodes.map(p=>Number(p.dataset.laneId.split('-').at(-1))-1);
   if(nodes.length&&nodes.every(p=>p.textContent.includes('Flick to launch'))){
    const start=w.innerHeight*.75;
    const beforePixels=volley===0?[...d.querySelectorAll('.battle-live-canvas')].map(c=>c.toDataURL()):null;
    for(const i of active)send('pointerdown',i,start);
    for(let step=1;step<=6;step++){await pause(10);for(const i of active)send('pointermove',i,start-step*(i===0?20:31+i*3));}
    send('pointerup',active[0],start-6*(active[0]===0?20:31+active[0]*3));
    if(volley===0)check(bodies().every(b=>Math.abs(b.velocity.y)<2),'One prepared lane cannot launch before its peers');
    for(const i of active.slice(1))send('pointerup',i,start-6*(i===0?20:31+i*3));
    await pause(30);
    if(beforePixels)check([...d.querySelectorAll('.battle-live-canvas')].every((c,i)=>c.toDataURL()!==beforePixels[i]),'Every independent canvas paints its moving bottle');
    if(bodies().filter(b=>Math.abs(b.velocity.y)>2).length===count)concurrent=true;
    volley++;
   }
   await pause(30);
  }
  for(let i=0;i<200&&w.FlipgameV112.battle.snapshot()?.status!=='completed';i++)await pause(25);
  const state=w.FlipgameV112.battle.snapshot();check(state?.status==='completed','Real concurrent series persists');
  check(concurrent,'All lane bottles are physically airborne together');
  check(w.FlipgameV112.snapshot().profile.fxp>baseline,'Concurrent physical result earns saved progression');
  const reward=w.FlipgameV112.snapshot().rewardReport;check(reward.performance.expectedMakeRate===(count===2?.57:.55),'Battle uses the observed human feel');
  check(reward.performanceSample.observedShots===reward.performance.eligibleShots,'Every rewarded performance sample has matching engine evidence');
  if(reward.performanceSample.perfectMakes)check(reward.performance.components.landingQuality>0,'Measured perfect landings contribute quality');
  const fxp=w.FlipgameV112.snapshot().profile.fxp;await w.FlipgameV112.battle.retryFinalization();check(w.FlipgameV112.snapshot().profile.fxp===fxp,'Concurrent result cannot award twice');
  check(d.querySelectorAll('.battle-live-canvas').length===0,'Every lane canvas is cleaned at completion');
  if(d.getElementById('reward-report').open){click('reward-report-continue');if(d.getElementById('reward-report').open)click('reward-report-continue');}
  for(let i=0;i<40&&!d.getElementById('mystery-screen').classList.contains('hidden');i++)click('mystery-go-btn');
  reports.push({count,volleys:volley,concurrent:true,earned:fxp-baseline,observedFeel:true});w.FlipgameV112.close();
 }
 await report({reports});
}
const REPORTER=`window.report=async payload=>{for(let attempt=0;attempt<6;attempt++){try{await fetch('/result',{method:'POST',body:JSON.stringify(payload)});return;}catch(_){await new Promise(r=>setTimeout(r,150));}}};`;
(async()=>{
  let done;const result=new Promise(resolve=>done=resolve);
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/result'){let body='';req.on('data',b=>body+=b);req.on('end',()=>{res.end('ok');done(JSON.parse(body));});return;}
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0"><script>${REPORTER}(${scenario.toString()})().catch(e=>report({error:String(e&&e.stack||e)}));</script>`);return;}
    if(url.pathname==='/app'){
      const fixture=url.searchParams.has('earned')?'<script>localStorage.clear();localStorage.setItem("flipgame.progression.v3",JSON.stringify({qualifyingWins:20}));</script>':'';
      const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="js\/v111-boot[^>]+><\/script>/,
        assets.map(a=>`<script src="/${a}"></script>`).join('')+'<script>window.__ready=true;document.body.classList.add("flipgame-boot-ready");document.getElementById("flipgame-boot-status").remove();</script>')
        .replace('<body>','<body>'+fixture).replace('</head>','<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/v112-broadcast.css"><script>addEventListener("error",e=>window.__error=e.message);</script></head>');
      res.setHeader('Content-Type','text/html');res.end(html);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  server.keepAliveTimeout=0;server.headersTimeout=0;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'flip-progression-ui-'));
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--window-size=4000,2400',`http://127.0.0.1:${server.address().port}/`],{stdio:'ignore',windowsHide:true});
  let timer;
  try{const output=await Promise.race([result,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Browser timeout')),120000))]);
    if(output.error)throw new Error(output.error);console.log(JSON.stringify(output,null,2));
  }finally{clearTimeout(timer);child.kill();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
})().catch(error=>{console.error(error);process.exitCode=1;});
