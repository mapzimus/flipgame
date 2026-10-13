'use strict';
// Shipping progression, Store, Story copy, Tour exit and rematch presentation.
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
 const pause=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)throw new Error(m);};
 const frame=document.createElement('iframe');frame.style.cssText='width:1280px;height:720px';document.body.replaceChildren(frame);frame.src='/app';await new Promise(r=>frame.onload=r);
 const w=frame.contentWindow,d=w.document;for(let i=0;i<150&&!w.__ready;i++)await pause(50);await w.FlipgameV112.ready;
 d.getElementById('broadcast-practice').click();await pause(100);
 const before=w.eval('JSON.stringify({players:game.players.map(p=>({lives:p.lives,streak:p.streak})),actor:game.currentPlayerIndex,points:game.pointCount})');
 const fxp=w.FlipgameV112.snapshot().profile.fxp;
 w.eval('var testEngine;var savedUpdate=Matter.Engine.update;Matter.Engine.update=function(engine,...args){testEngine=engine;return savedUpdate(engine,...args)};Physics.forceSpecialEvent("plinko")');
 d.getElementById('game-canvas').dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));
 w.eval('for(let i=0;i<150;i++)Physics.step(1/60);var jam=Matter.Composite.allBodies(testEngine.world).find(b=>b.plugin?.v112Plinko?.ref==="body:plinko-contact-chassis");Matter.Body.setStatic(jam,true);for(let i=0;i<2000;i++)Physics.step(1/60)');
 check(w.eval('Physics.getPlinkoSnapshot().tick')===1944,'Host retains measured timeout tick across a late check');
 for(let i=0;i<100&&w.eval('game.state')==='EVALUATING';i++)await pause(20);
 check(w.eval('game.state')==='TURN_START','No-contest returns same actor to live input');
 check(!d.getElementById('game-screen').classList.contains('hidden'),'Table remains visible');
 check(w.eval('JSON.stringify({players:game.players.map(p=>({lives:p.lives,streak:p.streak})),actor:game.currentPlayerIndex,points:game.pointCount})')===before,'Visible lives/streak/points/actor unchanged');
 check(w.FlipgameV112.snapshot().profile.fxp===fxp,'No-contest awards no FXP');
 check(w.FlipgameV112.snapshot().warning===null,'Neutral event accepted by private authority');
 check(d.getElementById('app-status').textContent.includes('No lives or points changed'),'Neutral outcome announced');
 check(d.getElementById('streak-banner').textContent.includes('no lives or points changed'),'Neutral outcome is visible on the table');
 check(!w.eval('Matter.Composite.allBodies(testEngine.world).includes(jam)'),'Event chassis cleaned');
 d.getElementById('game-canvas').dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));
 check(w.eval('game.state')==='EVALUATING','Next physical launch accepted');
 d.getElementById('home-btn').click();await pause(100);
 d.getElementById('broadcast-setup').click();
 [...d.querySelectorAll('.player-input-row')].forEach((row,index)=>{row.dataset.ai='0';row.querySelector('input').value='Guest '+index;});
 d.getElementById('broadcast-home-back').click();d.getElementById('battle-open').click();
 const press=label=>{const button=[...d.querySelectorAll('#battle-body button')].find(b=>b.textContent===label);check(button&&!button.disabled,label);button.click();};
 press('1v1');press('Begin Battle');await pause(100);
 // Force the real event only in this disposable browser test. No pose/score is injected.
 w.eval('var savedApply=Physics.applyFlick;Physics.applyFlick=function(...args){Physics.forceSpecialEvent("plinko");args[4]="normal";return savedApply(...args)}');
 const stage=d.getElementById('battle-stage'),x=w.innerWidth/2,y=w.innerHeight*.75;
 const send=(type,cy)=>stage.dispatchEvent(new w.PointerEvent(type,{pointerId:17,pointerType:'touch',isPrimary:true,clientX:x,clientY:cy,bubbles:true,cancelable:true}));
 send('pointerdown',y);for(let i=1;i<=6;i++){await pause(10);send('pointermove',y-i*25);}send('pointerup',y-160);
 check(w.eval('!!Physics.getPlinkoSnapshot()'),'Battle test uses a real Plinko body');
 w.eval('for(let i=0;i<150;i++)Physics.step(1/60);var battleJam=Matter.Composite.allBodies(testEngine.world).find(b=>b.plugin?.v112Plinko?.ref==="body:plinko-contact-chassis");Matter.Body.setStatic(battleJam,true);for(let i=0;i<2000;i++)Physics.step(1/60)');
 for(let i=0;i<100&&w.FlipgameV112.battle.snapshot();i++)await pause(20);
 check(!w.FlipgameV112.battle.snapshot(),'Battle timeout releases the reservation');
 check(!d.body.classList.contains('battle-lane-live'),'Battle stands down the airborne lane');
 check(d.getElementById('battle-message').textContent.includes('without a scored result'),'Battle cancellation explains the neutral exit');
 check(w.FlipgameV112.snapshot().profile.fxp===fxp,'Canceled Battle invents no earned result');
 w.FlipgameV112.close();await report({realNoContest:true,sameTurn:true,profileUnchanged:true,lateFrame:true,battleNeutralExit:true});
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
