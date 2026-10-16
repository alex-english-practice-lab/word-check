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
 assert.equal(await page.locator('#customImport').isHidden(),true);
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
 await page.evaluate(()=>loadDefault());await ready(page);
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
  for(const key of ['resultImage','mobileQuiz']){assert.ok(after[key].equals(before[key]),key+' screenshot changed');log(key+' pixel-identical screenshot')}
  log('setup screenshots captured; expected preset-link controls are excluded from legacy pixel equality');
  const page=await browser.newPage();await page.goto(origin+'/word-check/');await ready(page);
  await page.evaluate(async library=>{WordCheckLibraries.register({id:library.id,data:library});await WordCheckLibraries.switchLibrary(library.id)},second);
  assert.equal(await page.locator('#preview tr').count(),3);assert.equal(await page.evaluate(()=>WordCheckLibraries.activeId),second.id);
  await page.locator('#start').click();assert.ok(await page.evaluate(()=>queue.every(w=>w.libraryId==='lib:test-only')));
  assert.equal(await page.evaluate(async()=>{try{await WordCheckLibraries.switchLibrary('lib:ielts');return false}catch{return true}}),true);
  page.once('dialog',d=>d.accept());await page.locator('#exit').click();await page.locator('#restart').click();
  log('second library switch, independent lists, stable question IDs and active-session switch guard');
  await page.route('**/data/ielts.v1.json',route=>route.fulfill({status:503,body:'offline'}));
  await page.evaluate(()=>loadDefault());await page.locator('#loadError').waitFor({state:'visible'});
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
  const teacher=await browser.newPage();await teacher.goto(origin+'/word-check/');await ready(teacher);
  await teacher.locator('#range').fill('1-2');await teacher.locator('#sampling').selectOption('total');await teacher.locator('#count').fill('8');await teacher.locator('#questionTime').fill('601');assert.ok(await teacher.locator('#createPreset').isDisabled());await teacher.locator('#questionTime').fill('3');await teacher.locator('#allowHints').uncheck();await teacher.locator('#createPreset').click();
  const presetUrl=await teacher.locator('#presetLink').inputValue(),payload=await teacher.evaluate(url=>WordPresetLinks.readHash(new URL(url).hash),presetUrl);
  assert.equal(payload.w.length,8);assert.equal(new Set(payload.w).size,8);assert.ok(payload.w.every(Number.isSafeInteger));assert.equal(payload.l,'lib:ielts');assert.equal(payload.t,3);assert.equal(payload.h,false);assert.ok(presetUrl.length<500);
  const presetOrders=[];for(const seedValue of [7,19]){const student=await browser.newPage();await student.addInitScript(seed=>{let state=seed;Math.random=()=>((state=(state*1664525+1013904223)>>>0)/4294967296)},seedValue);await student.goto(presetUrl);await student.locator('#quiz').waitFor({state:'visible'});assert.equal(await student.locator('#setup').isHidden(),true);assert.equal(await student.locator('#progressText').innerText(),'1 / 8');assert.equal(await student.locator('#timer').isVisible(),true);assert.equal(await student.locator('#hint').isHidden(),true);assert.deepEqual(new Set(await student.evaluate(()=>queue.map(word=>words.indexOf(word)))),new Set(payload.w));presetOrders.push(await student.evaluate(()=>queue.map(word=>word.id)));await student.close()}
  assert.notDeepEqual(presetOrders[0],presetOrders[1]);log('preset link fixes the word set, locks setup and reshuffles question order');
  await teacher.locator('#count').fill('1');await teacher.locator('#questionTime').fill('1');await teacher.locator('#createPreset').click();const timeoutUrl=await teacher.locator('#presetLink').inputValue();await teacher.close();
  const timed=await browser.newPage();await timed.goto(timeoutUrl);await timed.locator('#quiz').waitFor({state:'visible'});await timed.locator('#feedback').filter({hasText:'本题超时'}).waitFor({state:'visible',timeout:4000});assert.equal(await timed.locator('#answer').isDisabled(),true);assert.equal(await timed.locator('#next').isVisible(),true);assert.equal(await timed.locator('#timer').innerText(),'0 秒');assert.equal(await timed.evaluate(()=>answers[0].reason),'timeout');await timed.locator('#next').click();assert.match(await timed.locator('#review').innerText(),/超时/);await timed.close();log('timer expiry marks timeout, reveals the answer and waits for Next');
  const tampered=await browser.newPage(),last=presetUrl.at(-1)==='A'?'B':'A';await tampered.goto(presetUrl.slice(0,-1)+last);await tampered.locator('#presetError').waitFor({state:'visible'});assert.match(await tampered.locator('#presetErrorMessage').innerText(),/修改/);await tampered.close();log('tampered preset link fails closed');
  const v3Home=await browser.newPage();await v3Home.goto(origin+'/word-check/');await ready(v3Home);assert.equal(await v3Home.locator('.practice-entry').isVisible(),true);assert.equal(await v3Home.locator('.practice-entry-link').getAttribute('href'),'practice.html');await v3Home.close();log('home page exposes the Daily Vocabulary V3 category');
  const v3=await browser.newPage({viewport:{width:1280,height:900}}),v3Errors=[];v3.on('pageerror',e=>v3Errors.push(e.message));await v3.goto(origin+'/word-check/practice.html');await v3.waitForFunction(()=>!document.getElementById('start').disabled);assert.match(await v3.locator('#loadStatus').innerText(),/1172 词 · 309 识别题 · 46 近义词题/);assert.match(await v3.locator('#selectionSummary').innerText(),/309 题/);
  await v3.setViewportSize({width:1280,height:768});
  const setupPanelBox=await v3.locator('.p-setup-panel').boundingBox(),startButtonBox=await v3.locator('#start').boundingBox(),previewPanelBox=await v3.locator('.p-preview-below').boundingBox();
  assert.ok(startButtonBox.y+startButtonBox.height<=768,'all setup controls must fit in the initial desktop viewport');
  assert.ok(previewPanelBox.y>=setupPanelBox.y+setupPanelBox.height-1,'vocabulary preview must sit below the setup panel');
  assert.ok(setupPanelBox.width>1100,'desktop setup panel should use the full content width');
  await v3.locator('#wordSearch').fill('archery');assert.match(await v3.locator('#wordRows').innerText(),/archery/i);await v3.locator('#questionCount').fill('10');await v3.locator('#start').click();assert.equal(await v3.locator('#options .p-option').count(),4);assert.equal(await v3.locator('#progressText').innerText(),'1 / 10');
  const wrongRecognitionId=await v3.evaluate(async()=>{const bank=await fetch('data/recognition_v3_pilot.json').then(r=>r.json()),prompt=document.getElementById('headword').textContent,q=bank.questions.find(item=>item.prompt_en===prompt);return q.options.find(option=>option.id!==q.correct_option_id).id});await v3.locator(`[data-option-id="${wrongRecognitionId}"]`).click();await v3.locator('#submit').click();assert.match(await v3.locator('#feedback').innerText(),/正确答案/);assert.equal(await v3.locator('#options').getAttribute('aria-disabled'),'true');
  v3.once('dialog',d=>d.accept());await v3.locator('#exit').click();assert.match(await v3.locator('#resultSummary').innerText(),/已作答 1 \/ 10 题/);assert.equal(await v3.evaluate(()=>JSON.parse(localStorage.getItem('wordcheck.v3.practice.local.v1')).attempts.length),1);await v3.locator('#restart').click();await v3.locator('#reviewOnly').check();await v3.locator('#start').click();assert.equal(await v3.locator('#progressText').innerText(),'1 / 1');v3.once('dialog',d=>d.accept());await v3.locator('#exit').click();await v3.locator('#restart').click();
  await v3.locator('[name=practiceMode][value=synonym]').check();assert.equal(await v3.locator('#categoryWrap').isHidden(),true);await v3.locator('#reviewOnly').uncheck();await v3.locator('#questionCount').fill('10');await v3.locator('#start').click();assert.ok(await v3.locator('#options .p-option').count()>=6);await v3.locator('#options .p-option').first().click();assert.equal(await v3.locator('#options .p-option').first().getAttribute('aria-pressed'),'true');await v3.locator('#submit').click();assert.match(await v3.locator('#feedback').innerText(),/正确答案/);v3.once('dialog',d=>d.accept());await v3.locator('#exit').click();assert.match(await v3.locator('#resultSummary').innerText(),/同义词多选/);
  // The primary action must keep its screen position when feedback appears.
  for (const width of [1280,390]) {
    await v3.setViewportSize({width,height:844});
    await v3.locator('#restart').click();
    await v3.locator('#questionCount').fill('15');
    assert.match(await v3.locator('#selectionSummary').innerText(),/本轮 15 题/);
    await v3.locator('#start').click();
    assert.equal(await v3.locator('#progressText').innerText(),'1 / 15');
    await v3.locator('#options .p-option').first().click();
    await v3.locator('#submit').scrollIntoViewIfNeeded();
    const before=await v3.locator('#submit').boundingBox();
    await v3.locator('#submit').click();
    const after=await v3.locator('#next').boundingBox();
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[key]-after[key])<1, 'Action moved: '+key);
    v3.once('dialog',d=>d.accept());await v3.locator('#exit').click();
  }
  await v3.setViewportSize({width:390,height:844});await v3.locator('#restart').click();assert.ok(await v3.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(v3Errors,[]);await v3.close();log('V3 recognition, exact-set synonym selection, local review pool and mobile layout');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
