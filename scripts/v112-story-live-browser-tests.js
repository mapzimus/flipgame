'use strict';
// Actual Story DOM entry, pointer input, Matter landing, abandon and re-entry.
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
  const reports=[];
  function check(value,message){if(!value)throw new Error(message);}
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  for(const [width,height] of [[360,740],[1280,720]]){
    const frame=document.createElement('iframe');frame.style.cssText=`width:${width}px;height:${height}px;border:0`;document.body.replaceChildren(frame);frame.src='/app';
    await new Promise((resolve,reject)=>{frame.onload=resolve;setTimeout(()=>reject(new Error('Frame timeout')),20000);});
    const w=frame.contentWindow,d=w.document;
    for(let i=0;i<150&&!w.__ready;i++)await pause(50);
    check(w.__ready,'Boot failed: '+w.__error);
    await w.FlipgameV112.ready;
    const click=id=>d.getElementById(id).click();
    const shown=id=>w.getComputedStyle(d.getElementById(id)).display!=='none';
    const action=label=>{const b=[...d.querySelectorAll('#journey-body button')].find(b=>b.textContent===label);check(b,'Missing '+label);b.click();};
    async function start(coop=false){
      if(!shown('journey-screen'))click('journey-story');await pause(50);
      check(shown('journey-screen'),'Story hub visible');
      check(!d.getElementById('journey-message').textContent.includes('Finish or leave'),'Abandoned Story must reopen');
      if(coop)d.querySelector('#journey-body select').value='co-op';
      action('View match');await pause(50);action('Enter Match');await pause(50);
      check(shown('game-screen'),'Entering Story must show the actual game screen');
      check(!shown('journey-screen'),'Preview yields to the table');
      const session=w.FlipgameV112.snapshot().session;
      check(session.status==='active'&&session.request.activityId==='story','Real prescribed Story session');
      check(session.request.roster.length===8,'Eight qualifier entries retained');
      check(session.request.rulesOptions.arenaId==='rooftop','Prescribed venue retained');
      check(!shown('game-over'),'No stale Free Play result');
      return session;
    }
    const initial=w.FlipgameV112.storyViews().hub.progress.cleared;
    await start();
    check(!shown('pass-screen'),'Solo Story must not ask one human to pass the device');
    const canvas=d.getElementById('game-canvas'),rect=canvas.getBoundingClientRect();
    const x=rect.left+rect.width/2,y=rect.top+rect.height*.75,stamp=w.performance.now();
    function pointer(type,end,time){const event=new w.PointerEvent(type,{bubbles:true,pointerId:17,pointerType:'touch',clientX:x,clientY:end,buttons:type==='pointerup'?0:1});Object.defineProperty(event,'timeStamp',{value:time});canvas.dispatchEvent(event);}
    pointer('pointerdown',y,stamp);pointer('pointermove',y-rect.height*.15,stamp+50);pointer('pointerup',y-rect.height*.15,stamp+51);
    await pause(50);
    check(w.FlipgameV112.snapshot().session.flipPhase==='airborne','Pointer flick reaches the private physics observer: '+JSON.stringify({phase:w.FlipgameV112.snapshot().session.flipPhase,warning:w.FlipgameV112.snapshot().warning,error:w.__error,turn:d.getElementById('turn-banner').textContent}));
    for(let i=0;i<200&&w.FlipgameV112.snapshot().session.flipPhase!=='resolved';i++)await pause(25);
    const after=w.FlipgameV112.snapshot().session;
    check(after.flipPhase==='resolved','Actual Matter landing resolves');
    check(after.rules.attemptCounter===1,'Manual landing is scored exactly once');
    click('home-btn');await pause(100);
    check(shown('broadcast-home'),'Leaving Story returns Home');
    check(w.FlipgameV112.snapshot().session.status==='abandoned','Leaving abandons the real reservation');
    check(w.FlipgameV112.storyViews().hub.progress.cleared===initial,'Abandonment grants no checkpoint');
    await start(true);
    check(shown('pass-screen'),'Co-op retains the human handoff gate');
    click('pass-go-btn');check(shown('game-screen'),'Ready keeps the table visible');
    click('home-btn');await pause(100);
    await start();click('home-btn');await pause(100);
    if(width===1280){
      const raf=w.requestAnimationFrame.bind(w),later=w.setTimeout.bind(w);let clockOffset=0;
      w.requestAnimationFrame=fn=>raf(time=>fn(time+(clockOffset+=50)));
      w.setTimeout=(fn,ms,...args)=>later(fn,Math.min(ms,20),...args);
      for(const cooperative of [false,true]){
      await start(cooperative);
      // Fast-forward only Matter frames in this test, retaining real launch,
      // collision, landing, rules and storage. Never submit a MAKE/MISS.
      const started=Date.now();
      while(w.FlipgameV112.snapshot().session.status==='active'){
        const legacy=w.eval('({state:game.state,turn:game.turnCounter,current:game.currentPlayerIndex})');
        if(legacy.state!=='EVALUATING')check(legacy.turn===w.FlipgameV112.snapshot().session.rules.attemptCounter,
          'Story display and authoritative rules diverged: '+JSON.stringify({legacy,private:w.FlipgameV112.snapshot().session.rules.attemptCounter,warning:w.FlipgameV112.snapshot().warning}));
        check(Date.now()-started<95000,'Physical Story match did not finish: '+JSON.stringify({legacy:w.eval('({state:game.state,turn:game.turnCounter,current:game.currentPlayerIndex})'),private:w.FlipgameV112.snapshot().session.rules.attemptCounter,phase:w.FlipgameV112.snapshot().session.flipPhase,warning:w.FlipgameV112.snapshot().warning,error:w.__error}));
        if(w.eval('game.state')==='TURN_START'||w.eval('game.state')==='ON_FIRE'){
          if(w.eval('game.currentPlayer().isAI')===false){
            if(shown('pass-screen'))click('pass-go-btn');
            const bounds=canvas.getBoundingClientRect(),now=w.performance.now();
            const startY=bounds.height*.75,endY=startY-bounds.height*.15;
            pointer('pointerdown',startY,now);pointer('pointermove',endY,now+50);pointer('pointerup',endY,now+51);
          }
        }
        if(w.eval('game.state')==='EVALUATING')for(let n=0;n<160;n++)w.eval('Physics.step(1/60)');
        await pause(25);
      }
      for(let n=0;n<200&&w.FlipgameV112.snapshot().session.status!=='completed';n++)await pause(25);
      check(w.FlipgameV112.snapshot().session.status==='completed','Physical result persists successfully: '+w.FlipgameV112.snapshot().warning);
      check(shown('journey-screen')&&!shown('game-screen'),'Completed encounter returns to the Story hub');
      check(!shown('game-over'),'Story does not offer a Free Play rematch');
      check(/Signal held|Result recorded/.test(d.getElementById('journey-body').textContent),'Authoritative win/loss feedback is shown');
      check(d.getElementById('reward-report').open,'Earned terminal result opens Flip Report');
      {
        const report=w.FlipgameV112.snapshot().rewardReport;
        check(d.getElementById('reward-report-level').textContent.includes('FL '+report.afterLevel),'Report uses the saved level');
        click('reward-report-continue');
        if(d.getElementById('reward-report').open)click('reward-report-continue');
        check(!d.getElementById('reward-report').open,'Tally skip and Continue are separate actions');
        // Reveals follow the report; finish them before the next encounter.
        for(let n=0;n<40&&shown('mystery-screen');n++)click('mystery-go-btn');
      }
      const earned=w.FlipgameV112.snapshot().profile.fxp;
      await w.FlipgameV112.retryFinalization();
      check(w.FlipgameV112.snapshot().profile.fxp===earned,'Repeated finalization cannot duplicate Story rewards');
      }
    }
    reports.push({width,height,storyEntry:true,manualPhysics:true,abandonAndRestart:true,coopEntry:true,completedPhysicalMatch:width===1280});
    w.FlipgameV112.close();
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
      const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="js\/v111-boot[^>]+><\/script>/,
        assets.map(a=>`<script src="/${a}"></script>`).join('')+'<script>window.__ready=true;document.body.classList.add("flipgame-boot-ready");document.getElementById("flipgame-boot-status").remove();</script>')
        .replace('</head>','<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/v112-broadcast.css"><script>addEventListener("error",e=>window.__error=e.message);</script></head>');
      res.setHeader('Content-Type','text/html');res.end(html);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  server.keepAliveTimeout=0;server.headersTimeout=0;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'flip-story-live-'));
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--window-size=4000,2400',`http://127.0.0.1:${server.address().port}/`],{stdio:'ignore',windowsHide:true});
  let timer;
  try{const output=await Promise.race([result,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Browser timeout')),120000))]);
    if(output.error)throw new Error(output.error);console.log(JSON.stringify(output,null,2));
  }finally{clearTimeout(timer);child.kill();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
})().catch(error=>{console.error(error);process.exitCode=1;});
