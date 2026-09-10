'use strict';
// Native Chromium Web Locks + IndexedDB + a real page reload. No network
// libraries or packages are downloaded; CHROME_PATH selects an installed browser.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const root = path.resolve(__dirname,'..');
const executable = process.env.CHROME_PATH;
if (!executable || !fs.existsSync(executable)) throw new Error('Set CHROME_PATH to installed Chromium');
const script = async function () {
  const app=FlipgameV112;await app.ready;
  function check(value,message){if(!value)throw new Error(message);}
  check(app.snapshot().writer.writable,'native Web Locks writer');
  check(!FlipgameV111Stats.defaultStore.usingFallback(),'native IndexedDB available');
  if (!sessionStorage.getItem('qualified')) {
    const before=app.snapshot().profile.fcBalance;
    app.purchaseCosmetic('finish.porcelain');
    check(app.snapshot().profile.fcBalance===before-225,'durable Store purchase');
    let frame,wake;
    app.attachPhysics({snapshot:()=>frame,subscribe:fn=>{wake=fn;return()=>{};}});
    app.beginSession({activityId:'practice',roster:[{name:'Player One'}]});
    frame={launchId:'native-data-shot',atMs:0,qualified:true,manual:true,grounded:false};wake();
    frame={...frame,atMs:700,grounded:true};wake();frame={...frame,atMs:720};wake();
    frame={...frame,atMs:1400,landing:{result:'MAKE',pose:'upright',reason:'engine-settled',stableForMs:600}};wake();
    const immediate=await app.statistics.query({includeTestData:true});
    check(immediate.flips.length===1,'immediate read waits for queued V2 write');
    app.abandonSession();await app.statistics.flush();
    check((await FlipgameV111Stats.defaultStore.query({includeTestData:true})).matches.length===1,
      'legacy Stats Lab reads the same private-session writer');
    sessionStorage.setItem('qualified',JSON.stringify({balance:before-225,fxp:app.snapshot().profile.fxp}));
    location.reload();return;
  }
  const expected=JSON.parse(sessionStorage.getItem('qualified'));
  const records=await app.statistics.query({includeTestData:true});
  check(records.flips.length===1&&records.matches.length===1,'IndexedDB survives reload');
  check(records.flips[0].schema==='FlipRecordV2'&&records.matches[0].schema==='MatchRecordV2','V2 schemas retained');
  check(records.flips[0].activityId==='practice'&&records.flips[0].testData,'practice isolated');
  check((await app.statistics.query()).flips.length===0,'test data excluded by default');
  check(app.snapshot().profile.fcBalance===expected.balance&&app.snapshot().profile.fxp===expected.fxp,'profile survives reload');
  check(app.isCosmeticAvailable('finish.porcelain'),'purchased cosmetic immediately queryable after reload');
  const archive=await app.statistics.exportJSON({includeTestData:true});
  await app.statistics.importJSON(archive);
  check((await app.statistics.query({includeTestData:true})).flips.length===1,'native-store import UUID dedup');
  await fetch('/result',{method:'POST',body:JSON.stringify({nativeIndexedDB:true,nativeWebLocks:true,
    sharedStatsWriter:true,reloadPersistence:true,flipSchema:records.flips[0].schema,matchSchema:records.matches[0].schema,
    balance:expected.balance,fxp:expected.fxp})});
};
async function main(){
  let finish;const result=new Promise(resolve=>{finish=resolve;});
  const assets=['v111-interfaces','v111-runtime','v111-name-policy','v111-stats','v112-browser-bundle'];
  const server=http.createServer((req,res)=>{
    if(req.url==='/result'&&req.method==='POST'){
      let body='';req.on('data',part=>{body+=part;});req.on('end',()=>{res.end('ok');finish(JSON.parse(body));});return;
    }
    const asset=assets.find(id=>req.url==='/'+id+'.js');
    if(asset){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,'js',asset+'.js')));return;}
    if(req.url!=='/'){res.statusCode=404;res.end();return;}
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><title>V2 local storage qualification</title><script>if(!localStorage.getItem("flipgame.profile.v4")){localStorage.setItem("flipgame.progression.v3",JSON.stringify({qualifyingWins:20}));}</script>'+
      assets.map(id=>'<script src="/'+id+'.js"></script>').join('')+'<script>('+script.toString()+')().catch(error=>fetch("/result",{method:"POST",body:JSON.stringify({error:error.stack})}));</script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'flipgame-data-browser-'));
  const child=spawn(executable,['--headless=new','--no-first-run','--disable-extensions','--disable-background-networking',
    '--no-default-browser-check','--disable-sync','--user-data-dir='+directory,'http://127.0.0.1:'+server.address().port],
    {windowsHide:true,stdio:'ignore'});
  let timeout;
  try{
    const received=await Promise.race([result,new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(new Error('Native data qualification timed out')),45000);child.once('error',reject);
    })]);
    assert.equal(received.error,undefined,received.error);console.log(JSON.stringify(received,null,2));
  }finally{clearTimeout(timeout);child.kill();server.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
