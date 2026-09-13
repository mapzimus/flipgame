'use strict';
// Actual app/Chromium navigation. No gameplay is simulated or started here.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const boot=fs.readFileSync(path.join(root,'js/v111-boot.js'),'utf8');
const assets=[...boot.matchAll(/['"](js\/[^'"]+\.js)(?:\?[^'"]*)?['"]/g)].map(m=>m[1]);
assets.splice(assets.indexOf('js/main.js'),0,'js/v112-battle-routes.js');
const chrome=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(fs.existsSync);
if(!chrome)throw new Error('Set CHROME_PATH');
async function scenario(){
  const reports=[];
  function check(value,message){if(!value)throw new Error(message);}
  for(const [width,height]of [[360,740],[768,1024],[1280,720],[1366,768],[1920,1080],[3840,2160]]){
    const frame=document.createElement('iframe');frame.style.cssText=`width:${width}px;height:${height}px;border:0`;document.body.replaceChildren(frame);frame.src='/app';
    await new Promise(resolve=>frame.onload=resolve);
    const w=frame.contentWindow,d=w.document;
    for(let i=0;i<150&&!w.__ready;i++)await new Promise(r=>setTimeout(r,50));
    check(w.__ready,`Boot failed ${width}: ${w.__error||''}`);
    const click=id=>d.getElementById(id).click();
    const visible=selector=>[...d.querySelectorAll(selector)].filter(n=>!n.hidden);
    function inspect(id){const screen=d.getElementById(id);check(!screen.classList.contains('hidden'),`${id} hidden`);
      for(const node of screen.querySelectorAll('.app-main,.app-footer,.app-header'))check(node.scrollWidth<=node.clientWidth+1,`${id} horizontal overflow ${width}`);}
    click('battle-open');inspect('battle-screen');
    check(d.getElementById('battle-body').textContent.includes('1v1v1v1'),'All formats shown');
    check(d.getElementById('battle-body').textContent.includes('8v8'),'Largest team format shown');
    check([...d.querySelectorAll('#battle-body button')].find(b=>b.textContent==='Begin Battle').disabled,'Missing host must disable start');
    click('battle-back');await new Promise(r=>setTimeout(r,0));
    click('broadcast-setup');
    const initial=d.querySelectorAll('.player-input-row').length;
    for(let i=initial;i<16;i++)click('add-player-btn');
    inspect('setup-screen');
    check(d.querySelectorAll('.player-input-row').length===16,'All sixteen DOM entries retained');
    check(visible('.player-input-row').length===8,'Only eight entries visible');
    check(visible('.player-input-row')[0].querySelector('.player-num').textContent.includes('9'),'Add follows last page');
    const rows=[...d.querySelectorAll('.player-input-row')];
    rows.forEach((row,i)=>row.querySelector('input').value=`Guest ${i+1}`);
    click('setup-roster-prev');check(visible('.player-input-row')[0]===rows[0],'Previous shows first page');
    click('setup-roster-next');check(rows[0].querySelector('input').value==='Guest 1','Paging preserves names');
    if(width>=1100){
      for(const panel of d.querySelectorAll('.players-panel,.match-panel'))check(!['auto','scroll'].includes(w.getComputedStyle(panel).overflowY),'No nested panel scroll');
      const pager=d.getElementById('setup-roster-pages').getBoundingClientRect();
      check(pager.bottom<=d.querySelector('#setup-screen .app-footer').getBoundingClientRect().top+1,`Setup pager clipped ${width}: ${pager.bottom}`);
    }
    rows[8].querySelector('.remove-player-btn').click();
    check(d.querySelectorAll('.player-input-row').length===15,'Removal retains remaining entries');
    check(visible('.player-input-row').length===8,'Removal focuses preceding page');
    click('add-player-btn');check(d.querySelectorAll('.player-input-row').length===16,'Can refill roster');
    // A name on the hidden page must be revealed when validation rejects it.
    const first=d.querySelector('.player-input-row input');first.value='';click('start-btn');
    check(!d.querySelector('.player-input-row').hidden,'Invalid hidden name revealed');first.value='Guest 1';
    click('start-btn');inspect('arena-select-screen');click('arena-play');inspect('broadcast-ready');
    check(d.querySelectorAll('.broadcast-ready-entry').length===16,'Ready retains sixteen entries');
    check(visible('.broadcast-ready-entry').length===8,'Ready displays one page');
    click('ready-roster-next');check(visible('.broadcast-ready-entry')[0].textContent.includes('Entry 09'),'Ready page two contains ninth seat');
    check(d.getElementById('broadcast-ready-details').textContent.includes('16'),'Ready summary is full roster, not visible page');
    if(width>=1100){const pager=d.getElementById('ready-roster-pages').getBoundingClientRect();check(pager.bottom<=d.querySelector('#broadcast-ready .app-footer').getBoundingClientRect().top+1,`Ready pager clipped ${width}`);}
    click('broadcast-ready-back');click('arena-select-back');click('broadcast-home-back');
    click('journey-story');check(!d.getElementById('journey-screen').classList.contains('hidden'),'Story route preserved');
    check(d.getElementById('game-screen').classList.contains('hidden'),'No gameplay authority invoked');
    reports.push({width,height,entries:16,pages:2,battle:'fail-closed',story:'preserved'});
  }
  await fetch('/result',{method:'POST',body:JSON.stringify({reports})});
}
(async()=>{
  let done;const result=new Promise(resolve=>done=resolve);
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/result'){let body='';req.on('data',b=>body+=b);req.on('end',()=>{res.end('ok');done(JSON.parse(body));});return;}
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<body style="margin:0"><script>(${scenario.toString()})().catch(e=>fetch('/result',{method:'POST',body:JSON.stringify({error:e.stack})}));</script>`);return;}
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
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'flip-battle-roster-'));
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--window-size=4000,2400',`http://127.0.0.1:${server.address().port}/`],{stdio:'ignore',windowsHide:true});
  let timer;
  try{const output=await Promise.race([result,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Browser timeout')),120000))]);
    if(output.error)throw new Error(output.error);console.log(JSON.stringify(output,null,2));
  }finally{clearTimeout(timer);child.kill();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
})().catch(error=>{console.error(error);process.exitCode=1;});
