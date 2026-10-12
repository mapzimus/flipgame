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
 const baseline=JSON.stringify(w.FlipgameV112.snapshot().profile);
 w.eval('var originalFrame=Renderer.frame; Renderer.frame=function(dt,state){window.lastRender=state;return originalFrame(dt,state)}');
 d.getElementById('journey-tour').click();await pause(80);
 const table=d.getElementById('game-canvas');
 async function enter(){
  for(let n=0;n<8&&d.getElementById('game-screen').classList.contains('hidden');n++){
   const action=[...d.querySelectorAll('#journey-body button')].find(b=>/^(Continue|Try it)$/.test(b.textContent));check(action,'Tour action');action.click();await pause(80);
  }
 }
 async function flip(power){
  const count=w.FlipgameV112.tourSnapshot().resolvedAttemptCount;
  // Power changes remain ordinary keyboard input through the shipping handler.
  for(let i=0;i<30;i++)table.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  for(let i=600;i<power;i+=150)table.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
  table.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true}));
  for(let i=0;i<300&&w.FlipgameV112.tourSnapshot().resolvedAttemptCount===count;i++){
   w.eval('for(let j=0;j<160;j++)Physics.step(1/60)');await pause(20);
  }
  check(w.FlipgameV112.tourSnapshot().resolvedAttemptCount===count+1,'Exactly one real physical landing');
 }
 // The cap step follows an actual upright make; no outcome is injected.
 for(let n=0;n<40&&w.FlipgameV112.tourSnapshot().step.id!=='cap';n++){
  await enter();await flip([1800,2100,2400][n%3]);
 }
 check(w.FlipgameV112.tourSnapshot().step.id==='cap','Actual upright make reached cap teaching');
 for(let n=0;n<2;n++){await enter();await flip(600);}
 await enter();
 check(!d.getElementById('tour-ghost-btn').hidden,'Repeated misses offer recorded success path');
 const physicsBefore=w.eval('JSON.stringify(Physics.getBottle().position)');
 d.getElementById('tour-ghost-btn').click();
 check(w.eval('JSON.stringify(Physics.getBottle().position)')===physicsBefore,'Ghost changes no physics position');
 await pause(80);
 check(w.lastRender.successfulShotGhost&&w.lastRender.successfulShotGhost.path.length>1,'Renderer receives recorded physical path');
 check(d.getElementById('tour-feedback').textContent.includes('full turn'),'Miss advice uses actual no-rotation result');
 check(JSON.stringify(w.FlipgameV112.snapshot().profile)===baseline,'Ghost and Tour do not write progression');
 d.getElementById('menu-btn').click();await pause(80);
 check(!w.FlipgameV112.snapshot().session,'Tour exit releases table');
 d.getElementById('broadcast-practice').click();await pause(80);
 check(!w.lastRender.successfulShotGhost&&d.getElementById('tour-help').hidden,'Tour help does not leak into Practice');
 w.FlipgameV112.close();await report({realTourGhost:true,manualKeyboardPhysics:true,profileUnchanged:true});
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
