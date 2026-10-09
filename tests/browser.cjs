// Optional regression harness. Uses an externally installed Playwright, not a runtime dependency.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),baseline='08e12efd991e425710d496e30f3f0a73b9c02605';
const artifacts=path.join(root,'test-artifacts');fs.mkdirSync(artifacts,{recursive:true});
const second=require('./fixtures/second-library.json');
const server=http.createServer((req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost'),old=url.pathname.startsWith('/baseline/');
  let name=decodeURIComponent(url.pathname.replace(/^\/(?:baseline|word-check)\//,''))||'index.html';
  if(name.endsWith('/'))name+='index.html';
  const filename=path.resolve(root,name);if(!filename.startsWith(root+path.sep))throw Error('Invalid path');
  const body=old?execFileSync('git',['show',baseline+':'+name],{cwd:root,maxBuffer:4*1024*1024,stdio:['ignore','pipe','ignore']}):fs.readFileSync(filename);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.txt':'text/plain'})[path.extname(name)]||'application/octet-stream');res.end(body);
 }catch{res.statusCode=404;res.end('Not found')}
});
function log(message){console.log('PASS '+message)}
async function screenshot(page,name){return page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true,animations:'disabled'})}
async function ready(page){await page.waitForFunction(()=>document.querySelectorAll('#preview tr').length===3610&& !document.getElementById('start').disabled)}
async function typeCorrect(page){const word=await page.evaluate(()=>queue[index].word);await page.locator('#answer').fill('  '+word.toUpperCase()+'  ');await page.locator('#submit').click()}
async function scenario(browser,url,prefix){
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{let seed=42;Math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)});
 await page.addInitScript(()=>{window.testTools={};Object.defineProperty(document,'modelContext',{value:{registerTool(tool){window.testTools[tool.name]=tool}}})});
 await page.goto(url);await ready(page);
 assert.equal(await page.evaluate(()=>testTools.read_vocabulary_summary.execute().words),3610);
 const desktop=await screenshot(page,prefix+'-desktop');
 assert.equal(await page.locator('#sourceBadge').innerText(),'IELTS 默认词库');
 assert.match(await page.locator('#selection').innerText(),/40 题/);
 await page.locator('#range').fill('29,30');await page.locator('#sampling').selectOption('total');await page.locator('#count').fill('3');await page.locator('#start').click();
 assert.equal(await page.evaluate(()=>{try{testTools.start_vocabulary_check.execute({lists:'1',mode:'full',count:1});return false}catch{return true}}),true);
 assert.equal(await page.locator('#progressText').innerText(),'1 / 3');
 // Empty submission is not counted; duplicate grading cannot create another answer.
 await page.locator('#submit').click();assert.equal(await page.evaluate(()=>answers.length),0);
 await typeCorrect(page);await page.evaluate(()=>grade());assert.equal(await page.evaluate(()=>answers.length),1);
 await page.locator('#next').click();await page.locator('#hint').click();assert.match(await page.locator('#hintDisplay').innerText(),/_/);await typeCorrect(page);
 await page.locator('#next').click();await page.locator('#skip').click();await page.locator('#next').click();
 for(const id of ['independent','assisted','incorrect'])assert.equal(await page.locator('#'+id).innerText(),'1');
 const results=await page.locator('#results').innerText();const resultImage=await screenshot(page,prefix+'-results');
 await page.locator('#retry').click();assert.equal(await page.locator('#progressText').innerText(),'1 / 2');
 page.once('dialog',d=>d.accept());await page.locator('#exit').click();assert.match(await page.locator('#resultScope').innerText(),/已完成 0 \/ 2/);
 await page.locator('#restart').click();await page.locator('[name=mode][value=single]').check();await page.locator('#count').fill('1');await page.locator('#start').click();
 assert.equal(await page.locator('#phonetic').isVisible(),false);assert.equal(await page.locator('#pos').isVisible(),false);
 await page.locator('#answer').fill('wrong');await page.locator('#submit').click();assert.match(await page.locator('#feedback').innerText(),/同义词/);
 await page.locator('#next').click();await page.locator('#restart').click();
 const text='Word List 29\nexact /ɪgˈzækt/ a. 准确的\nWord List 61\nbank n. 银行；河岸';
 await page.locator('#file').setInputFiles({name:'test.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
 await page.waitForFunction(()=>document.querySelectorAll('#preview tr').length===2);
 assert.equal(await page.locator('#range').inputValue(),'29,61');
 await page.locator('#sampling').selectOption('per-list');assert.equal(await page.locator('#listCounts input').count(),2);
 await page.locator('#list-count-29').fill('0');await page.locator('#list-count-61').fill('1');await page.locator('#start').click();
 assert.equal(await page.locator('#questionList').innerText(),'LIST 61');
 await typeCorrect(page);await page.locator('#next').click();await page.locator('#restart').click();
 await page.locator('#restoreDefault').click();await ready(page);
 // Compare the original mobile setup and question layouts at the same deterministic state.
 await page.setViewportSize({width:390,height:844});const mobile=await screenshot(page,prefix+'-mobile');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#range').fill('1');await page.locator('#sampling').selectOption('total');await page.locator('#count').fill('1');await page.locator('#start').click();
 const mobileQuiz=await screenshot(page,prefix+'-mobile-quiz');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 page.once('dialog',d=>d.accept());await page.locator('#exit').click();await page.locator('#restart').click();
 assert.deepEqual(errors,[]);await page.close();return {desktop,results,resultImage,mobile,mobileQuiz};
}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const before=await scenario(browser,origin+'/baseline/','before'),after=await scenario(browser,origin+'/word-check/','after');
  assert.equal(after.results,before.results);log('original and refactored quiz results/text match exactly');
  for(const key of ['desktop','resultImage','mobile','mobileQuiz']){assert.ok(after[key].equals(before[key]),key+' screenshot changed');log(key+' pixel-identical screenshot')}
  const page=await browser.newPage();await page.goto(origin+'/word-check/');await ready(page);
  await page.evaluate(async library=>{WordCheckLibraries.register({id:library.id,data:library});await WordCheckLibraries.switchLibrary(library.id)},second);
  assert.equal(await page.locator('#preview tr').count(),3);assert.equal(await page.evaluate(()=>WordCheckLibraries.activeId),second.id);
  await page.locator('#start').click();assert.ok(await page.evaluate(()=>queue.every(w=>w.libraryId==='lib:test-only')));
  assert.equal(await page.evaluate(async()=>{try{await WordCheckLibraries.switchLibrary('lib:ielts');return false}catch{return true}}),true);
  page.once('dialog',d=>d.accept());await page.locator('#exit').click();await page.locator('#restart').click();
  log('second library switch, independent lists, stable question IDs and active-session switch guard');
  await page.route('**/data/ielts.v1.json',route=>route.fulfill({status:503,body:'offline'}));
  await page.locator('#restoreDefault').click();await page.locator('#loadError').waitFor({state:'visible'});
  assert.equal(await page.locator('#preview tr').count(),3);assert.equal(await page.evaluate(()=>WordCheckLibraries.activeId),second.id);
  await page.unroute('**/data/ielts.v1.json');await page.locator('#retryLoad').click();await ready(page);log('failed loading retains current library; retry restores default');
  // A slow default load must never override a later user import.
  let release,requested;const gate=new Promise(r=>release=r),pending=new Promise(r=>requested=r);
  await page.route('**/data/ielts.v1.json',async route=>{requested();await gate;await route.continue()});
  await page.evaluate(()=>{window.pendingLoad=WordCheckLibraries.switchLibrary('lib:ielts')});await pending;
  await page.locator('#file').setInputFiles({name:'new.txt',mimeType:'text/plain',buffer:Buffer.from('List 77\nnew n. 新词')});
  await page.waitForFunction(()=>document.getElementById('sourceBadge').textContent==='new.txt');release();await page.evaluate(()=>window.pendingLoad);
  assert.equal(await page.locator('#preview tr').count(),1);assert.equal(await page.locator('#sourceBadge').innerText(),'new.txt');log('stale async load cannot overwrite newer import');
  await page.unroute('**/data/ielts.v1.json');
  await page.locator('#file').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not a list')});
  assert.equal(await page.locator('#preview tr').count(),1);assert.match(await page.locator('#importNotice').innerText(),/没有识别到词条/);log('invalid TXT preserves current library');
  const gb=Buffer.concat([Buffer.from('Word List 88\nbank n. '),Buffer.from([0xd2,0xf8,0xd0,0xd0])]);
  await page.locator('#file').setInputFiles({name:'gb.txt',mimeType:'text/plain',buffer:gb});
  await page.waitForFunction(()=>document.getElementById('sourceBadge').textContent==='gb.txt');
  assert.match(await page.locator('#importNotice').innerText(),/GB18030/);assert.match(await page.locator('#preview').innerText(),/银行/);
  await page.locator('#file').setInputFiles({name:'large.txt',mimeType:'text/plain',buffer:Buffer.alloc(2*1024*1024+1)});
  await page.waitForFunction(()=>document.getElementById('importNotice').textContent.includes('2 MB'));
  assert.match(await page.locator('#preview').innerText(),/银行/);log('GB18030 fallback and 2 MB import limit preserved');
  await page.close();
  const failed=await browser.newPage();await failed.route('**/data/catalog.json',route=>route.fulfill({status:503,body:'offline'}));
  await failed.goto(origin+'/word-check/');await failed.locator('#loadError').waitFor({state:'visible'});assert.ok(await failed.locator('#start').isDisabled());
  await failed.unroute('**/data/catalog.json');await failed.locator('#retryLoad').click();await ready(failed);await failed.close();log('initial manifest failure recovers on retry');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
