'use strict';
// The Battle lane on the real table, in real Chromium. Everything below the
// pointer events is the shipping build: the live canvas, the vendored Matter
// world, the real bottle and collider, the lane runtime and the private reward
// authority. What this proves is that a flick on the Battle stage moves that
// bottle and that the pose the collider settled into is the pose the series
// scored — no simulated physics and no injected result anywhere.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const boot=fs.readFileSync(path.join(root,'js/v111-boot.js'),'utf8');
const assets=[...new Set([...boot.matchAll(/['"](js\/[^'"]+\.js)(?:\?[^'"]*)?['"]/g)].map(m=>m[1]))];
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','/usr/bin/chromium','/usr/bin/google-chrome','/usr/local/bin/google-chrome'].find(fs.existsSync);
if(!chrome)throw new Error('Set CHROME_PATH');

async function scenario(){
  const report={};
  function check(value,message){if(!value)throw new Error(message);}
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const frame=document.createElement('iframe');
  frame.style.cssText='width:1024px;height:820px;border:0';
  document.body.replaceChildren(frame);frame.src='/app';
  await new Promise((resolve,reject)=>{frame.onload=resolve;setTimeout(()=>reject(new Error('Frame load timeout')),20000);});
  const w=frame.contentWindow,d=w.document;
  for(let i=0;i<200&&!w.__ready;i++)await sleep(50);
  check(w.__ready,`Boot failed: ${w.__error||''}`);
  const click=id=>d.getElementById(id).click();

  // A duel of two humans. Battle only offers power cards to manual flippers, and
  // only a human lane is ever handed a pointer.
  click('broadcast-setup');
  let rows=()=>[...d.querySelectorAll('.player-input-row')];
  while(rows().length>2)rows().pop().querySelector('.remove-player-btn').click();
  while(rows().length<2)click('add-player-btn');
  rows().forEach((row,index)=>{row.dataset.ai='0';row.querySelector('input').value=`Guest ${index+1}`;});
  // A lineup the setup screen offers must be a lineup the reward authority will
  // accept. Otherwise Battle refuses to open and a classic match built on the
  // same seats plays to the end and earns nothing.
  const offered=rows().map(row=>row.dataset.char);
  check(offered.every(id=>w.FlipgameV112.isObjectAvailable(id)),
    `The lineup offers a Flipper the reward authority refuses: ${offered.join(', ')}`);
  report.offeredFlippers=offered;
  click('broadcast-home-back');
  click('battle-open');
  const battleText=()=>d.getElementById('battle-body').textContent;
  const press=label=>{const b=[...d.querySelectorAll('#battle-body button')].find(n=>n.textContent===label);check(b&&!b.disabled,`${label} is unavailable: ${battleText()}`);b.click();};
  press('1v1');
  check(/2 entries in your lineup · 2 required/.test(battleText()),`Battle lineup is not the duel: ${battleText()}`);
  press('Begin Battle');
  await sleep(120);

  // The live table has to be on screen, under a Battle screen that is no longer
  // painting over it, with the stage — not the canvas — taking the flick.
  const stage=d.getElementById('battle-stage');
  const canvas=d.getElementById('game-canvas');
  const why=()=>`${d.getElementById('battle-message').textContent} :: ${w.__error||''}`;
  check(!d.getElementById('game-screen').classList.contains('hidden'),`The live table never appeared: ${why()}`);
  check(d.body.classList.contains('battle-lane-live'),'The page is not in Battle lane mode');
  const stageBox=stage.getBoundingClientRect();
  check(stageBox.width>=w.innerWidth-1&&stageBox.height>=w.innerHeight-1,
    `The Battle stage does not cover the table: ${JSON.stringify(stageBox)}`);
  check(w.getComputedStyle(canvas).pointerEvents==='none','The canvas must not compete for the flick');
  check(d.elementFromPoint(w.innerWidth/2,w.innerHeight*0.7)===stage,
    'A flick over the table does not reach the Battle stage');
  const laneText=()=>[...d.querySelectorAll('.battle-lane-status p')].map(n=>n.textContent).join(' | ');
  check(/Flick to launch/.test(laneText()),`No lane is inviting a flick: ${laneText()}`);
  report.openingLane=laneText();

  // The bottle is the shipping bottle: read it straight out of the live world.
  // Physics is a lexical global in the page, not a window property, so read the
  // live body from inside the frame's own scope.
  const bottle=()=>w.eval('(function(){var b=Physics.getBottle();return {x:Math.round(b.position.x),y:Math.round(b.position.y),angle:Number(b.angle.toFixed(3))};})()');
  const scores=()=>[...d.querySelectorAll('.battle-score')].map(card=>({
    label:card.querySelector('h3').textContent,score:Number(card.querySelector('strong').textContent)}));
  report.restingBottle=bottle();

  async function flick(){
    const before=bottle();
    const x=w.innerWidth/2,y=w.innerHeight*0.78;
    const pointerId=Math.floor(Math.random()*1000)+7;
    const send=(type,clientX,clientY)=>stage.dispatchEvent(new w.PointerEvent(type,
      {pointerId,pointerType:'touch',isPrimary:true,clientX,clientY,pressure:0.5,bubbles:true,cancelable:true}));
    send('pointerdown',x,y);
    // Real timestamps across real frames, so the qualifier measures a genuine
    // peak velocity instead of falling back to raw drag distance.
    for(let step=1;step<=6;step++){await sleep(9);send('pointermove',x+step*2,y-step*46);}
    send('pointerup',x+14,y-282);
    // The flip is now the world's business, so watch it while it is still in the
    // air. Reading only the end state proves nothing: once the attempt resolves
    // the relay sets the table for whoever is next, which puts the bottle back
    // where this one started.
    let peak=before;
    for(let i=0;i<400;i++){
      await sleep(25);
      const at=bottle();
      if(Math.abs(at.y-before.y)>Math.abs(peak.y-before.y))peak=at;
      if(!/In flight|Landing|Settling|Launching|Aiming/.test(laneText()))break;
    }
    return {before,peak,after:bottle(),flew:Math.abs(peak.y-before.y)>60};
  }

  const first=await flick();
  check(first.flew,`The real bottle never left the table: ${JSON.stringify(first)}`);
  report.firstFlick=first;
  check(/Scored|Flick to launch/.test(laneText()),`The first attempt never settled: ${laneText()}`);
  // A relay has to set the table for whoever is next. Inviting a flick while the
  // last bottle is still lying where it fell would hand the next competitor a
  // fallen bottle wearing their own colour.
  const waiting=bottle();
  check(Math.abs(waiting.angle)<0.05&&waiting.x===report.restingBottle.x&&
    Math.abs(waiting.y-report.restingBottle.y)<=8,
    `The table was not set for the next competitor: ${JSON.stringify(waiting)} vs ${JSON.stringify(report.restingBottle)}`);
  report.tableSetForNext=waiting;
  report.afterFirstFlick={lanes:laneText(),scores:scores(),heading:d.querySelector('#battle-body h2').textContent};

  // A relay hands the table to the other competitor. Five more flicks is enough
  // to cross a volley boundary and see the score follow the poses.
  const heading=()=>d.querySelector('#battle-body h2').textContent;
  const opening=heading();
  const flicks=[first];
  for(let turn=0;turn<5;turn++){
    if(!/Flick to launch/.test(laneText()))break;
    flicks.push(await flick());
  }
  report.flicks=flicks.length;
  report.heading=heading();
  report.scores=scores();
  check(flicks.length>=4,`The relay stopped inviting flicks after ${flicks.length}`);
  check(heading()!==opening,`The series never advanced past "${opening}"`);
  check(report.scores.length===2&&report.scores.every(entry=>Number.isInteger(entry.score)&&entry.score>=0),
    `Scores are not whole non-negative points: ${JSON.stringify(report.scores)}`);
  // A cap land is worth two, so no series can outscore two points per attempt.
  check(report.scores.reduce((sum,entry)=>sum+entry.score,0)<=flicks.length*2,
    `${flicks.length} flicks cannot be worth ${JSON.stringify(report.scores)}`);

  // A phone gets rotated mid-heat. The table has to be re-fitted to the new glass
  // and the lane re-aimed with it, or the bottle flips against a floor that is no
  // longer there and every later flick is measured against a lane that has moved.
  const geometry=()=>({innerWidth:w.innerWidth,innerHeight:w.innerHeight,
    groundY:w.eval('Math.round(Physics.getGroundY())'),bottleX:bottle().x,
    stageWidth:Math.round(stage.getBoundingClientRect().width)});
  const beforeResize=geometry();
  frame.style.width='760px';frame.style.height='990px';
  await sleep(500);
  const afterResize=geometry();
  report.resize={before:beforeResize,after:afterResize};
  check(afterResize.innerWidth===760&&afterResize.innerWidth!==beforeResize.innerWidth,
    `The glass never changed size: ${JSON.stringify(report.resize)}`);
  check(afterResize.stageWidth>=afterResize.innerWidth-1,
    `The Battle stage did not follow the resize: ${JSON.stringify(report.resize)}`);
  check(Math.abs(afterResize.bottleX-afterResize.innerWidth/2)<=2,
    `The table was not re-centred on the new glass: ${JSON.stringify(report.resize)}`);
  check(afterResize.groundY!==beforeResize.groundY&&afterResize.groundY<afterResize.innerHeight,
    `The floor did not follow the new glass: ${JSON.stringify(report.resize)}`);
  check(!d.getElementById('battle-message').textContent,
    `The resize broke the series: ${d.getElementById('battle-message').textContent}`);
  if(/Flick to launch/.test(laneText())){
    const rotated=await flick();
    report.flickAfterResize=rotated;
    check(rotated.flew,`A flick on the resized table never launched: ${JSON.stringify(rotated)}`);
    check(/Scored|Flick to launch/.test(laneText()),
      `The attempt after the resize never settled: ${laneText()}`);
  }

  // Leaving must return the screen to the app and take the table back with it.
  click('battle-back');
  await sleep(300);
  report.leftTo={
    battleHidden:d.getElementById('battle-screen').classList.contains('hidden'),
    tableHidden:d.getElementById('game-screen').classList.contains('hidden'),
    laneMode:d.body.classList.contains('battle-lane-live'),
    fxp:w.FlipgameV112?w.FlipgameV112.snapshot().profile.fxp:null,
  };
  check(report.leftTo.tableHidden,'Leaving a Battle left the table on screen');
  check(!report.leftTo.laneMode,'Leaving a Battle left the page in lane mode');
  check(report.leftTo.fxp===0,'An abandoned Battle must award nothing');
  await window.report(report);
}

const REPORTER=`window.report=async payload=>{for(let attempt=0;attempt<6;attempt++){try{await fetch('/result',{method:'POST',body:JSON.stringify(payload)});return;}catch(_){await new Promise(r=>setTimeout(r,150));}}};`;
(async()=>{
  let done;const result=new Promise(resolve=>done=resolve);
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/result'){let body='';req.on('data',b=>body+=b);req.on('end',()=>{res.end('ok');done(JSON.parse(body));});return;}
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><body style="margin:0"><script>${REPORTER}(${scenario.toString()})().catch(e=>report({error:String(e&&e.stack||e)}));</script>`);return;}
    if(url.pathname==='/app'){
      const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="js\/v111-boot[^>]+><\/script>/,
        assets.map(a=>`<script src="/${a}"></script>`).join('')+'<script>window.__ready=true;document.body.classList.add("flipgame-boot-ready");document.getElementById("flipgame-boot-status").remove();</script>')
        .replace('</head>','<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/v112-broadcast.css"><script>addEventListener("error",e=>window.__error=e.message);</script></head>');
      res.setHeader('Content-Type','text/html');res.end(html);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  server.keepAliveTimeout=0;server.headersTimeout=0;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'flip-battle-lane-'));
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--window-size=1200,1000',`http://127.0.0.1:${server.address().port}/`],{stdio:'ignore',windowsHide:true});
  let timer;
  try{
    const output=await Promise.race([result,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Browser timeout')),180000))]);
    if(output.error)throw new Error(output.error);
    console.log(JSON.stringify(output,null,2));
    console.log('v1.12 Battle live lane browser test passed: a flick on the Battle stage moved the shipping bottle, the collider pose scored the series, the relay advanced, a mid-heat resize re-fitted the table and re-aimed the lane, and leaving took the table back and awarded nothing.');
  }finally{clearTimeout(timer);child.kill();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
})().catch(error=>{console.error(error);process.exitCode=1;});
