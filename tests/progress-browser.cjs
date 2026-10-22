// Optional desktop/mobile regression: NODE_PATH=... WORD_CHECK_CHROMIUM=... npm run test:progress-browser
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let name=new URL(req.url,'http://localhost').pathname.replace(/^\/word-check\//,'');if(!name||name.endsWith('/'))name+='index.html';const file=path.resolve(root,decodeURIComponent(name));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end('missing')}});
async function main(){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WORD_CHECK_CHROMIUM?{executablePath:process.env.WORD_CHECK_CHROMIUM}:{})});
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}/word-check/`;
  await page.goto(url);await page.locator('#goLearn').click();await page.locator('#learnStart').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#learnStart').disabled);
  assert.equal(await page.locator('#metricSeen').innerText(),'0');
  await page.locator('#learnLibrary').selectOption('lib:difficulty-100-120');await page.waitForFunction(()=>!document.querySelector('#learnStart').disabled);
  await page.locator('#learnCount').fill('2');await page.locator('#learnStart').click();
  while(await page.locator('#learnCards').isVisible()){const stage=await page.evaluate(()=>WordCheckLearning.activeSession.session.currentStage);if(stage!=='learn')break;await page.locator('#flashcard').click();await page.locator('#learnNext').click()}
  await page.locator('#learnContinue').click();while(await page.locator('#learnCards').isVisible()){const stage=await page.evaluate(()=>WordCheckLearning.activeSession.session.currentStage);if(stage!=='review')break;await page.locator('#flashcard').click();await page.locator('#reviewKnow').click()}
  await page.locator('#learnCheck').click();await page.locator('#answer').fill('incorrect-spelling');await page.locator('#submit').click();await page.locator('#next').click();await page.locator('#skip').click();await page.locator('#next').click();
  await page.locator('#returnToLearn').click();await page.locator('#learnBack').click();assert.equal(await page.locator('#metricSeen').innerText(),'2');assert.equal(await page.locator('#metricChecked').innerText(),'2');
  const download=page.waitForEvent('download');await page.locator('#learnExport').click();const file=await download;const backup=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.equal(backup.checks.length,1);assert.equal(backup.sessions.length,1);assert.equal(backup.schemaVersion,1);
  await page.reload();await page.locator('#goLearn').click();assert.equal(await page.locator('#metricChecked').innerText(),'2');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Learn dashboard overflows mobile viewport');
  assert.deepEqual(errors,[]);await page.close();process.stdout.write('Progress desktop/mobile, local reload and JSON export passed\n');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}}
main().catch(error=>{console.error(error);process.exitCode=1});
