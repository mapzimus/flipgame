'use strict';
// Real-browser layout/route qualification of the actual app, without service
// worker activation or release/cache mutations. Gameplay is never started.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const boot=fs.readFileSync(path.join(root,'js/v111-boot.js'),'utf8');
const assets=[...boot.matchAll(/['"](js\/[^'"]+\.js)(?:\?[^'"]*)?['"]/g)].map(m=>m[1]);
const browser=process.env.CHROME_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].find(fs.existsSync);
if(!browser)throw new Error('Set CHROME_PATH');
async function scenario(){
  const dimensions=[[360,740],[768,1024],[1280,720],[1366,768],[1920,1080],[3840,2160]], reports=[];
  function check(ok,message){if(!ok)throw new Error(message);}
  for(const [width,height]of dimensions){
    const frame=document.createElement('iframe');frame.style.cssText=`width:${width}px;height:${height}px;border:0;display:block`;frame.src='/app';document.body.replaceChildren(frame);
    await new Promise((resolve,reject)=>{frame.onload=()=>resolve();setTimeout(()=>reject(new Error('Frame loading timeout')),20000);});
    const w=frame.contentWindow,d=w.document;
    for(let i=0;i<100&&!w.__layoutReady;i++)await new Promise(r=>setTimeout(r,50));
    check(w.__layoutReady,`App boot failed ${width}: ${w.__layoutError||''}`);
    function click(id){const button=d.getElementById(id);check(button,`Missing ${id}`);button.click();}
    function inspect(id,targets=[]){
      const screen=d.getElementById(id);check(!screen.classList.contains('hidden'),`${id} not visible`);
      check(screen.getBoundingClientRect().width<=width+1,`${id} horizontal overflow ${width}`);
      for(const node of screen.querySelectorAll('.app-main,.app-footer,.app-header')){
        check(node.scrollWidth<=node.clientWidth+1,`${id}/${node.className} horizontal scroll ${width}`);
      }
      for(const selector of targets){
        const node=screen.querySelector(selector);check(node,selector+' missing');const r=node.getBoundingClientRect();
        check(r.top>=-1&&r.bottom<=height+1,`${selector} offscreen ${width}: ${r.top},${r.bottom}`);
        check(r.height>=48-1,`${selector} touch target too small`);
      }
      reports.push({width,height,screen:id});
    }
    inspect('broadcast-home');
    if(width===1280)await fetch('/capture?name=home');
    click('broadcast-setup');
    const initial=d.querySelectorAll('.player-input-row').length;
    for(let i=initial;i<8;i++)click('add-player-btn');
    inspect('setup-screen',['#start-btn','#practice-btn']);
    if(width===1280)await fetch('/capture?name=setup');
    const rows=[...d.querySelectorAll('.player-input-row')];check(rows.length===8,'Eight lineup entries required');
    if(width>=1100){
      const rects=rows.map(r=>r.getBoundingClientRect());
      check(Math.abs(rects[0].top-rects[1].top)<2,'Lineup must have two columns');
      check(rects[7].bottom<=d.querySelector('#setup-screen .app-footer').getBoundingClientRect().top,'Eighth entry clipped');
      for(const row of rows)for(const control of row.querySelectorAll('button,input[type="text"]')){
        check(control.getBoundingClientRect().height>=47,'Smartboard control too small');
      }
    }
    rows[0].querySelector('.char-change-btn').click();
    inspect('char-picker-screen',['#customize-apply','#customize-cancel']);
    click('customize-tab-variant');
    check(d.querySelectorAll('.variant-tile').length===12,'Twelve live variant options required');
    click('customize-cancel');click('start-btn');
    inspect('arena-select-screen',['#arena-play']);
    click('arena-play');inspect('broadcast-ready',['#broadcast-ready-play']);
    if(width===1280)await fetch('/capture?name=ready');
    check(d.querySelectorAll('.broadcast-ready-entry').length===8,'Ready lineup incomplete');
    if(width>=1100)check([...d.querySelectorAll('.broadcast-ready-entry')].every(n=>n.getBoundingClientRect().bottom<height-70),'Ready lineup clipped');
    click('broadcast-ready-back');inspect('arena-select-screen',['#arena-play']);
    click('arena-select-back');inspect('setup-screen',['#start-btn']);
    click('broadcast-home-back');inspect('broadcast-home');
    check(d.getElementById('game-screen').classList.contains('hidden'),'Navigation must not begin gameplay');
    frame.remove();
  }
  await fetch('/result',{method:'POST',body:JSON.stringify({reports})});
}
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'flip-broadcast-'));
  async function capture(name){
    if(!['home','setup','ready'].includes(name))throw new Error('Unknown capture');
    const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    const target=targets.find(t=>t.type==='page');
    const socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    try {
      const reply=new Promise((resolve,reject)=>{socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id===1)data.error?reject(new Error(data.error.message)):resolve(data.result);});});
      socket.send(JSON.stringify({id:1,method:'Page.captureScreenshot',params:{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1280,height:720,scale:1}}}));
      const image=await reply;fs.writeFileSync(path.join(profile,name+'.png'),Buffer.from(image.data,'base64'));
    }finally{socket.close();}
  }
  let receive;const result=new Promise(resolve=>receive=resolve);
  const server=http.createServer((request,response)=>{
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/capture'){capture(url.searchParams.get('name')).then(()=>response.end('ok')).catch(error=>{response.writeHead(500);response.end(error.message);});return;}
    if(url.pathname==='/result'){let b='';request.on('data',c=>b+=c);request.on('end',()=>{response.end('ok');receive(JSON.parse(b));});return;}
    if(url.pathname==='/app'){
      const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/<script src="js\/v111-boot[^>]+><\/script>/,
        assets.map(a=>`<script src="/${a}"></script>`).join('')+'<script>window.__layoutReady=true;document.body.classList.add("flipgame-boot-ready");document.getElementById("flipgame-boot-status").remove();</script>')
        .replace('</head>','<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/v112-broadcast.css"><script>addEventListener("error",e=>window.__layoutError=e.message);</script></head>');
      response.setHeader('Content-Type','text/html;charset=utf-8');response.end(html);return;
    }
    if(url.pathname==='/'){response.setHeader('Content-Type','text/html;charset=utf-8');response.end('<!doctype html><meta charset="utf-8"><style>body{margin:0}</style><body><script>('+scenario.toString()+')().catch(e=>fetch("/result",{method:"POST",body:JSON.stringify({error:e.stack})}));</script>');return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){response.writeHead(404);response.end();return;}
    response.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream');response.end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=0','--user-data-dir='+profile,'http://127.0.0.1:'+server.address().port],{stdio:'ignore',windowsHide:true});
  let timeout;
  try{const output=await Promise.race([result,new Promise((_,reject)=>timeout=setTimeout(()=>reject(new Error('Layout timeout')),60000))]);
    if(output.error)throw new Error(output.error);console.log('Broadcast layout passed',output.reports);console.log('Visual artifacts:',profile);
  }finally{clearTimeout(timeout);child.kill();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
