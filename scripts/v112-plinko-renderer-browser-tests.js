'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const http = require('node:http'), {spawn} = require('node:child_process');
const {frames} = require('./v112-plinko-renderer-tests.js');
const root = path.resolve(__dirname,'..');
const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!browser) throw new Error('Set CHROME_PATH to a Chromium browser');
const assets = ['v112-plinko-presentation.js','renderer.js'];
async function scenario() {
  const frames=await (await fetch('/frames')).json();
  const sheet=document.createElement('canvas'); sheet.width=1440; sheet.height=740;
  const montage=sheet.getContext('2d');
  const chosen=[frames[0],frames.find(f=>f.boardEnabled&&!f.landing.settled),
    frames[Math.floor(frames.length*.65)],frames.at(-1)];
  for(let i=0;i<chosen.length;i++) {
    const canvas=document.createElement('canvas'); canvas.width=360; canvas.height=740;
    Renderer.init(canvas); Renderer.resize(360,740); Renderer.setReduceMotion(true);
    Renderer.frame(1/60,{plinkoSnapshot:chosen[i],liquid:{slosh:.2,vel:0},groundY:6000,
      skin:'bottle',variantId:'blue-steel',liquidColor:'#0b86ff',stake:0,flipSeed:9123});
    const data=canvas.getContext('2d').getImageData(165,355,30,30).data;
    if(!data.some(v=>v!==0)) throw new Error('Blank center');
    montage.drawImage(canvas,i*360,0);
  }
  document.body.append(sheet);
  await fetch('/result',{method:'POST',body:JSON.stringify({png:sheet.toDataURL('image/png'),browser:navigator.userAgent})});
}
(async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flip-plinko-render-'));
  let receive; const result=new Promise(resolve=>receive=resolve);
  const server=http.createServer((request,response)=>{
    if(request.url==='/result') {let body='';request.on('data',c=>body+=c);request.on('end',()=>{response.end('ok');receive(JSON.parse(body));});return;}
    if(request.url==='/frames'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(frames));return;}
    const asset=assets.find(a=>request.url==='/'+a);
    if(asset){response.setHeader('Content-Type','text/javascript');response.end(fs.readFileSync(path.join(root,'js',asset)));return;}
    response.setHeader('Content-Type','text/html');
    response.end('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111}</style>'+assets.map(a=>`<script src="/${a}"></script>`).join('')+
      '<script>('+scenario.toString()+')().catch(e=>fetch("/result",{method:"POST",body:JSON.stringify({error:e.stack})}));</script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--user-data-dir='+path.join(directory,'profile'),'http://127.0.0.1:'+server.address().port],{stdio:'ignore',windowsHide:true});
  let timeout;
  try {
    const output=await Promise.race([result,new Promise((_,reject)=>timeout=setTimeout(()=>reject(new Error('Browser timeout')),45000))]);
    if(output.error) throw new Error(output.error);
    const image=path.join(directory,'plinko-phone-montage.png');
    fs.writeFileSync(image,Buffer.from(output.png.split(',')[1],'base64'));
    console.log(JSON.stringify({browser:output.browser,image}));
  } finally {clearTimeout(timeout);child.kill();server.closeAllConnections();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
