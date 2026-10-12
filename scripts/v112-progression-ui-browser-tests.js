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
 const reports=[],pause=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 for(const [width,height]of [[360,740],[1280,720]]){
  const frame=document.createElement('iframe');frame.style.cssText=`width:${width}px;height:${height}px;border:0`;document.body.replaceChildren(frame);frame.src='/app';
  await new Promise(resolve=>frame.onload=resolve);
  const w=frame.contentWindow,d=w.document;
  for(let i=0;i<150&&!w.__ready;i++)await pause(50);check(w.__ready,'Page boot');await w.FlipgameV112.ready;
  const click=id=>d.getElementById(id).click();
  const profile=w.FlipgameV112.snapshot().profile;
  check(d.getElementById('home-progression').textContent.includes(profile.fxp+' FXP'),'Current FXP shown');
  if(width===360){check(!d.getElementById('first-run-offer').hidden,'Fresh save offers tour');click('first-run-dismiss');check(d.getElementById('first-run-offer').hidden,'Tour offer can be skipped');}
  click('journey-store');await pause(80);
  check(d.getElementById('store-wallet').textContent.includes(profile.fcBalance+' Flip Credits'),'Correct wallet field');
  check(d.getElementById('store-buy').disabled,'Unaffordable purchase disabled');
  check(d.querySelectorAll('#store-grid button').length===40,'Full visual-only shop catalog');
  const c=d.getElementById('store-preview'),before=c.toDataURL();
  [...d.querySelectorAll('#store-grid button')].find(b=>b.textContent.startsWith('Sparks ·')).click();await pause(80);
  check(d.getElementById('store-preview-name').textContent==='Sparks','Selection previews before purchase');
  check(c.toDataURL()!==before,'Preview pixels change with selected effect');
  check(w.FlipgameV112.snapshot().profile.fcBalance===profile.fcBalance,'Browsing costs no credits');
  check(d.querySelector('#store-screen .app-main').scrollWidth<=d.querySelector('#store-screen .app-main').clientWidth+1,'Store has no horizontal overflow');
  click('store-back');click('journey-story');await pause(50);
  [...d.querySelectorAll('#journey-body button')].find(b=>b.textContent==='View match').click();await pause(50);
  const copy=d.getElementById('journey-body').textContent;
  check(copy.includes('The Open')&&copy.includes('WFC Standard')&&copy.includes('Ten lives. Try not to yeet it.'),'Story renders authored act and broadcast copy');
  w.FlipgameV112.close();reports.push({width,progress:true,shopPreview:true,noPurchaseOnBrowse:true,storyCopy:true});
 }
 // Seed only this disposable browser profile through a valid existing migration.
 const earned=document.createElement('iframe');document.body.replaceChildren(earned);earned.src='/app?earned=1';await new Promise(resolve=>earned.onload=resolve);
 const w=earned.contentWindow,d=w.document;for(let i=0;i<150&&!w.__ready;i++)await pause(50);await w.FlipgameV112.ready;
 d.getElementById('journey-store').click();const before=w.FlipgameV112.snapshot().profile;
 [...d.querySelectorAll('#store-grid button')].find(b=>b.textContent.startsWith('Porcelain ·')).click();
 check(!d.getElementById('store-buy').disabled,'Earned wallet can afford Porcelain');d.getElementById('store-buy').click();
 const after=w.FlipgameV112.snapshot().profile;
 check(after.fcBalance===before.fcBalance-225,'Purchase charges exact amount');check(after.fxp===before.fxp,'Cosmetics cannot alter FXP');
 check(d.getElementById('store-buy').disabled&&d.getElementById('store-buy').textContent==='Owned','Owned state updates immediately');
 check(w.FlipgameV112.isCosmeticAvailable('finish.porcelain'),'Purchase immediately available to Customize');
 d.getElementById('store-back').click();d.getElementById('journey-tour').click();await pause(80);
 for(let i=0;i<8&&d.getElementById('game-screen').classList.contains('hidden');i++){
 const tourAction=[...d.querySelectorAll('#journey-body button')].find(b=>/^(Continue|Try it)$/.test(b.textContent));
 check(tourAction,'Tour entry action');tourAction.click();await pause(80);
 }
 check(d.getElementById('menu-btn').textContent==='Skip tour','Tour exposes a visible exit');
 check(!d.getElementById('tour-help').hidden,'Live Tour keeps instruction and input guidance visible');
 const table=d.getElementById('game-canvas');
 const beforeTour=w.FlipgameV112.snapshot().profile.fxp;
 const prescribedSeed=w.FlipgameV112.tourSnapshot().activeAttempt.turnSeed;
 table.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));
 check(w.eval('Physics.getLastFlickInfo().seed')===prescribedSeed,'Tour uses its prescribed physical seed');
 check(w.eval('game.state')==='EVALUATING','Keyboard launches actual Tour physics');
 for(let i=0;i<300&&w.FlipgameV112.tourSnapshot().resolvedAttemptCount===0;i++){
  w.eval('for(let j=0;j<160;j++) Physics.step(1/60)');await pause(20);
 }
 check(w.FlipgameV112.tourSnapshot().resolvedAttemptCount===1,'Real keyboard Tour landing resolves exactly once');
 check(w.FlipgameV112.snapshot().profile.fxp===beforeTour,'Tour physics earns no progression');
 // Return to the next live step to check the table exit.
 for(let i=0;i<8&&d.getElementById('game-screen').classList.contains('hidden');i++){
  const action=[...d.querySelectorAll('#journey-body button')].find(b=>/^(Continue|Try it)$/.test(b.textContent));check(action,'Next Tour action');action.click();await pause(80);
 }
 d.getElementById('menu-btn').click();await pause(80);
 check(!w.FlipgameV112.snapshot().session,'Skip releases the Tour session');
 d.getElementById('broadcast-practice').click();await pause(80);
 const setup=w.eval('JSON.stringify({players:game.players.map(p=>({name:p.name,skin:p.skin,color:p.color})),feel:game.feel,direction:game.direction,practice:game.practice})');
 // Stage the result route only: this navigation test does not fabricate an earned outcome.
 d.getElementById('game-screen').classList.add('hidden');d.getElementById('game-over').classList.remove('hidden');
 d.getElementById('new-arena-btn').click();check(!d.getElementById('arena-select-screen').classList.contains('hidden'),'New Arena opens selector');
 d.getElementById('arena-select-back').click();check(!d.getElementById('game-over').classList.contains('hidden'),'Cancel returns to result');
 d.getElementById('new-arena-btn').click();
 const venue=[...d.querySelectorAll('#arena-select-grid button')].find(b=>!b.disabled&&b.getAttribute('aria-pressed')!=='true');check(venue,'Alternative arena');venue.click();d.getElementById('arena-play').click();await pause(80);
 check(!d.getElementById('game-screen').classList.contains('hidden'),'New Arena launches rematch');
 check(w.eval('JSON.stringify({players:game.players.map(p=>({name:p.name,skin:p.skin,color:p.color})),feel:game.feel,direction:game.direction,practice:game.practice})')===setup,'New Arena preserves match setup');
 check(w.FlipgameV112.snapshot().profile.fxp===after.fxp,'Tour and navigation award no FXP');
 w.FlipgameV112.close();await report({reports,purchase:true,tourSkip:true,newArena:true});
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
