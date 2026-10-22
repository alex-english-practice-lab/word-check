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
async function ready(page){await page.waitForFunction(()=>document.querySelectorAll('#preview tr').length===3610&& !document.getElementById('start').disabled);if(await page.locator('#goCheck').isVisible())await page.locator('#goCheck').click()}
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
 const submitBefore=await page.locator('#submit').boundingBox();await typeCorrect(page);const nextAfter=await page.locator('#next').boundingBox();if(prefix==='after')for(const key of ['x','y','width','height'])assert.ok(Math.abs(submitBefore[key]-nextAfter[key])<1,'Spelling action moved: '+key);await page.evaluate(()=>grade());assert.equal(await page.evaluate(()=>answers.length),1);
 await page.locator('#next').click();const submitBeforeHint=await page.locator('#submit').boundingBox();await page.locator('#hint').click();const submitAfterHint=await page.locator('#submit').boundingBox();if(prefix==='after')for(const key of ['x','y','width','height'])assert.ok(Math.abs(submitBeforeHint[key]-submitAfterHint[key])<1,'Hint moved spelling action: '+key);assert.match(await page.locator('#hintDisplay').innerText(),/_/);await typeCorrect(page);
 await page.locator('#next').click();await page.locator('#skip').click();await page.locator('#next').click();
 for(const id of ['independent','assisted','incorrect'])assert.equal(await page.locator('#'+id).innerText(),'1');if(prefix==='after')assert.equal(await page.locator('#checked').innerText(),'0');
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
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WORD_CHECK_CHROMIUM?{executablePath:process.env.WORD_CHECK_CHROMIUM}:{})});
 try{
  const before=await scenario(browser,origin+'/baseline/','before'),after=await scenario(browser,origin+'/word-check/','after');
  assert.match(after.results,/字母辅助答对/);log('original flows remain playable; expected assistance scoring labels have changed');
  log('setup, quiz and result screenshots captured; intentional layout changes are excluded from legacy pixel equality');
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
  await failed.goto(origin+'/word-check/');await failed.locator('#goCheck').click();await failed.locator('#loadError').waitFor({state:'visible'});assert.ok(await failed.locator('#start').isDisabled());
  await failed.unroute('**/data/catalog.json');await failed.locator('#retryLoad').click();await ready(failed);await failed.close();log('initial manifest failure recovers on retry');
  const teacher=await browser.newPage();await teacher.goto(origin+'/word-check/teacher/');await ready(teacher);
  await teacher.locator('#range').fill('1-2');await teacher.locator('#sampling').selectOption('total');await teacher.locator('#count').fill('8');await teacher.locator('#questionTime').fill('601');assert.ok(await teacher.locator('#createPreset').isDisabled());await teacher.locator('#questionTime').fill('3');await teacher.locator('#assistanceMode').selectOption('none');await teacher.locator('#createPreset').click();
  const presetUrl=await teacher.locator('#presetLink').inputValue(),payload=await teacher.evaluate(url=>WordPresetLinks.readHash(new URL(url).hash),presetUrl);
  assert.equal(payload.w.length,8);assert.equal(new Set(payload.w).size,8);assert.ok(payload.w.every(Number.isSafeInteger));assert.equal(payload.l,'lib:ielts');assert.equal(payload.t,3);assert.equal(payload.h,false);assert.ok(presetUrl.length<500);
  const presetOrders=[];for(const seedValue of [7,19]){const student=await browser.newPage();await student.addInitScript(seed=>{let state=seed;Math.random=()=>((state=(state*1664525+1013904223)>>>0)/4294967296)},seedValue);await student.goto(presetUrl);await student.locator('#quiz').waitFor({state:'visible'});assert.equal(await student.locator('#setup').isHidden(),true);assert.equal(await student.locator('#progressText').innerText(),'1 / 8');assert.equal(await student.locator('#timer').isVisible(),true);assert.equal(await student.locator('#hint').isHidden(),true);assert.deepEqual(new Set(await student.evaluate(()=>queue.map(word=>words.indexOf(word)))),new Set(payload.w));presetOrders.push(await student.evaluate(()=>queue.map(word=>word.id)));await student.close()}
  assert.notDeepEqual(presetOrders[0],presetOrders[1]);log('preset link fixes the word set, locks setup and reshuffles question order');
  await teacher.locator('#count').fill('1');await teacher.locator('#questionTime').fill('1');await teacher.locator('#createPreset').click();const timeoutUrl=await teacher.locator('#presetLink').inputValue();await teacher.close();
  const timed=await browser.newPage();await timed.goto(timeoutUrl);await timed.locator('#quiz').waitFor({state:'visible'});await timed.locator('#feedback').filter({hasText:'本题超时'}).waitFor({state:'visible',timeout:4000});assert.equal(await timed.locator('#answer').isDisabled(),true);assert.equal(await timed.locator('#next').isVisible(),true);assert.equal(await timed.locator('#timer').innerText(),'0 秒');assert.equal(await timed.evaluate(()=>answers[0].reason),'timeout');await timed.locator('#next').click();assert.match(await timed.locator('#review').innerText(),/超时/);await timed.close();log('timer expiry marks timeout, reveals the answer and waits for Next');
  const tampered=await browser.newPage(),last=presetUrl.at(-1)==='A'?'B':'A';await tampered.goto(presetUrl.slice(0,-1)+last);await tampered.locator('#presetError').waitFor({state:'visible'});assert.match(await tampered.locator('#presetErrorMessage').innerText(),/修改/);await tampered.close();log('tampered preset link fails closed');
  const v3Home=await browser.newPage({viewport:{width:1280,height:900}}),v3HomeErrors=[];v3Home.on('pageerror',e=>v3HomeErrors.push(e.message));await v3Home.goto(origin+'/word-check/');await ready(v3Home);
  assert.equal(await v3Home.locator('.practice-entry').count(),0);assert.equal(await v3Home.locator('#librarySelect option[value="practice:daily-v3"]').count(),1);
  const assertCompactHome=async label=>{const setup=await v3Home.locator('.home-setup').boundingBox(),start=await v3Home.locator('#start').boundingBox(),preview=await v3Home.locator('.home-preview-below').boundingBox();assert.ok(setup.width>1100,label+' setup should use the full content width');assert.ok(setup.height<=630,label+' settings should fit within the reference view');assert.ok(start.y+start.height<=setup.y+setup.height,label+' actions must stay inside the setup panel');assert.ok(preview.y>=setup.y+setup.height-1,label+' vocabulary preview must sit below the setup panel')};
  assert.equal(await v3Home.locator('#perListSettings').evaluate(el=>el.parentElement.id),'spellingSamplingSettings');assert.equal(await v3Home.locator('#listCounts').evaluate(el=>el.scrollHeight<=el.clientHeight),true);assert.equal(await v3Home.locator('#createPreset').isHidden(),true);assert.equal(await v3Home.locator('a[href*="teacher"]').count(),0);const spellingControls=await Promise.all(['#librarySelect','#spellingModeOptions .mode:first-of-type','#questionTime','#sampling'].map(selector=>v3Home.locator(selector).boundingBox()));assert.ok(Math.max(...spellingControls.map(box=>box.y))-Math.min(...spellingControls.map(box=>box.y))<=1,'Spelling primary controls should share a top edge');await assertCompactHome('IELTS');
  await v3Home.locator('#librarySelect').selectOption('lib:difficulty-100-120');await v3Home.waitForFunction(()=>document.getElementById('sourceBadge').textContent==='多邻国词库'&&!document.getElementById('start').disabled);await assertCompactHome('Difficulty');assert.equal(await v3Home.locator('.home-setup-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),4);assert.equal(await v3Home.locator('#detScopeSettings').isHidden(),true);assert.match(await v3Home.locator('#namedLists').innerText(),/只选一组后可设置 First N Words/);
  await v3Home.locator('[data-group="2"]').uncheck();await v3Home.locator('[data-group="3"]').uncheck();await v3Home.locator('#vocabularyScope').selectOption('prefix');assert.equal(await v3Home.locator('#prefixScopeInput').isVisible(),true);
  await v3Home.locator('#prefixCount').fill('0');assert.ok(await v3Home.locator('#start').isDisabled());assert.match(await v3Home.locator('#setupError').innerText(),/正整数/);
  await v3Home.locator('#prefixCount').fill('551');assert.match(await v3Home.locator('#setupError').innerText(),/只有 550 个词/);
  await v3Home.locator('#prefixCount').fill('60');await v3Home.locator('#sampling').selectOption('total');await v3Home.locator('#count').fill('80');assert.match(await v3Home.locator('#setupError').innerText(),/范围只有 60 个词/);
  await v3Home.locator('#count').fill('20');assert.match(await v3Home.locator('#selection').innerText(),/难度 100 · 第 1–60 个词 · 随机抽查 20 题/);await assertCompactHome('Scoped difficulty');await v3Home.locator('#start').click();assert.equal(await v3Home.locator('#progressText').innerText(),'1 / 20');assert.equal(await v3Home.evaluate(()=>new Set(queue.map(word=>word.id)).size),20);assert.equal(await v3Home.evaluate(()=>queue.every(word=>word.list===1&&word.order<60)),true);assert.equal(await v3Home.evaluate(()=>queue.some(word=>word.id==='lib:difficulty-100-120/word/1cc1fe6b-3a3b-4883-87c2-b32c89e49c26')),false);v3Home.once('dialog',dialog=>dialog.accept());await v3Home.locator('#exit').click();await v3Home.locator('#restart').click();await v3Home.setViewportSize({width:390,height:844});assert.ok(await v3Home.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await v3Home.setViewportSize({width:1280,height:900});
  await v3Home.locator('#librarySelect').selectOption('practice:daily-v3');await v3Home.waitForFunction(()=>document.getElementById('sourceBadge').textContent==='日常词汇 V3'&&!document.getElementById('start').disabled);
  assert.equal(await v3Home.locator('#spellingModeOptions').isHidden(),true);assert.equal(await v3Home.locator('#v3ModeOptions').isVisible(),true);assert.equal(await v3Home.locator('#createPreset').isHidden(),true);assert.equal(await v3Home.locator('#v3SamplingSettings').isVisible(),true);assert.match(await v3Home.locator('#selection').innerText(),/可用 309 题/);
  const alignedControls=await Promise.all(['#librarySelect','#v3ModeOptions .mode:first-of-type','#v3Category','#v3QuestionCount'].map(selector=>v3Home.locator(selector).boundingBox()));assert.ok(Math.max(...alignedControls.map(box=>box.y))-Math.min(...alignedControls.map(box=>box.y))<=1,'V3 primary controls should share a top edge');
  await v3Home.locator('#v3QuestionCount').fill('10');await v3Home.locator('#start').click();assert.equal(await v3Home.locator('#v3Options .p-option').count(),4);assert.equal(await v3Home.locator('#v3ProgressText').innerText(),'1 / 10');await v3Home.locator('#v3Options .p-option').first().click();await v3Home.locator('#v3Submit').click();assert.match(await v3Home.locator('#v3Feedback').innerText(),/正确答案/);
  v3Home.once('dialog',dialog=>dialog.accept());await v3Home.locator('#v3Exit').click();assert.match(await v3Home.locator('#v3ResultSummary').innerText(),/已作答 1 \/ 10 题/);await v3Home.locator('#v3Restart').click();await v3Home.locator('[name=v3PracticeMode][value=synonym]').check();await v3Home.locator('#v3QuestionCount').fill('5');await v3Home.locator('#start').click();assert.ok(await v3Home.locator('#v3Options .p-option').count()>=6);v3Home.once('dialog',dialog=>dialog.accept());await v3Home.locator('#v3Exit').click();assert.deepEqual(v3HomeErrors,[]);await v3Home.close();log('homepage integrates V3 Recognition and Synonym; list quantities stay in the right column');
  const teacherV3=await browser.newPage();await teacherV3.goto(origin+'/word-check/teacher/');await ready(teacherV3);await teacherV3.locator('#librarySelect').selectOption('practice:daily-v3');await teacherV3.waitForFunction(()=>document.getElementById('sourceBadge').textContent==='日常词汇 V3'&&!document.getElementById('start').disabled);
  await teacherV3.locator('#v3QuestionCount').fill('3');assert.equal(await teacherV3.locator('#createPreset').isEnabled(),true);await teacherV3.locator('#createPreset').click();const fixedV3Url=await teacherV3.locator('#presetLink').inputValue(),fixedV3Payload=await teacherV3.evaluate(url=>WordPresetLinks.readHash(new URL(url).hash),fixedV3Url);assert.equal(fixedV3Payload.v,5);assert.equal(fixedV3Payload.a,'fixed');assert.equal(fixedV3Payload.q.length,3);
  const fixedV3Student=await browser.newPage();await fixedV3Student.goto(fixedV3Url);await fixedV3Student.locator('#v3Quiz').waitFor({state:'visible'});assert.equal(await fixedV3Student.locator('#v3ProgressText').innerText(),'1 / 3');assert.equal(await fixedV3Student.locator('#setup').isHidden(),true);await fixedV3Student.close();
  await teacherV3.locator('[name=v3PracticeMode][value=synonym]').check();await teacherV3.locator('#v3QuestionCount').fill('4');await teacherV3.locator('#linkType').selectOption('random');await teacherV3.locator('#createPreset').click();const randomV3Url=await teacherV3.locator('#presetLink').inputValue(),randomV3Payload=await teacherV3.evaluate(url=>WordPresetLinks.readHash(new URL(url).hash),randomV3Url);assert.equal(randomV3Payload.m,'synonym');assert.equal(randomV3Payload.a,'random');assert.equal(randomV3Payload.n,4);
  const randomV3Student=await browser.newPage();await randomV3Student.goto(randomV3Url);await randomV3Student.locator('#v3Quiz').waitFor({state:'visible'});assert.equal(await randomV3Student.locator('#v3Options .p-option').count()>=6,true);assert.equal(await randomV3Student.locator('#v3ProgressText').innerText(),'1 / 4');await randomV3Student.close();await teacherV3.close();log('teacher links open fixed Recognition and random Synonym V3 practice directly');
  const detTeacher=await browser.newPage({viewport:{width:1280,height:900}});await detTeacher.goto(origin+'/word-check/teacher/');await ready(detTeacher);await detTeacher.locator('#librarySelect').selectOption('lib:difficulty-100-120');await detTeacher.waitForFunction(()=>document.getElementById('sourceBadge').textContent==='多邻国词库'&&!document.getElementById('start').disabled);await detTeacher.locator('[data-group="2"]').uncheck();await detTeacher.locator('[data-group="3"]').uncheck();await detTeacher.locator('#vocabularyScope').selectOption('prefix');await detTeacher.locator('#prefixCount').fill('60');await detTeacher.locator('#sampling').selectOption('total');await detTeacher.locator('#count').fill('20');await detTeacher.locator('#questionTime').fill('3');await detTeacher.locator('#assistanceMode').selectOption('none');assert.match(await detTeacher.locator('#selection').innerText(),/难度 100 · 第 1–60 个词 · 随机抽查 20 题/);
  await detTeacher.locator('#createPreset').click();const fixedDetUrl=await detTeacher.locator('#presetLink').inputValue(),fixedDetPayload=await detTeacher.evaluate(url=>WordPresetLinks.readHash(new URL(url).hash),fixedDetUrl);assert.equal(fixedDetPayload.v,3);assert.equal(fixedDetPayload.w.length,20);const fixedDetSets=[];for(const seedValue of [11,23]){const student=await browser.newPage();await student.addInitScript(seed=>{let state=seed;Math.random=()=>((state=(state*1664525+1013904223)>>>0)/4294967296)},seedValue);await student.goto(fixedDetUrl);await student.locator('#quiz').waitFor({state:'visible'});assert.equal(await student.locator('#progressText').innerText(),'1 / 20');assert.equal(await student.locator('#timer').isVisible(),true);assert.equal(await student.locator('#hint').isHidden(),true);assert.equal(await student.evaluate(()=>queue.every(word=>word.list===1&&word.order<60)),true);fixedDetSets.push((await student.evaluate(()=>queue.map(word=>word.id))).sort());await student.close()}assert.deepEqual(fixedDetSets[0],fixedDetSets[1]);
  await detTeacher.locator('#linkType').selectOption('random');await detTeacher.locator('#createPreset').click();const randomDetUrl=await detTeacher.locator('#presetLink').inputValue(),randomDetPayload=await detTeacher.evaluate(url=>WordPresetLinks.readHash(new URL(url).hash),randomDetUrl);assert.deepEqual({v:randomDetPayload.v,r:randomDetPayload.r,p:randomDetPayload.p,n:randomDetPayload.n},{v:6,r:1,p:60,n:20});const randomDetSets=[];for(const seedValue of [31,47]){const student=await browser.newPage();await student.addInitScript(seed=>{let state=seed;Math.random=()=>((state=(state*1664525+1013904223)>>>0)/4294967296)},seedValue);await student.goto(randomDetUrl);await student.locator('#quiz').waitFor({state:'visible'});const ids=await student.evaluate(()=>queue.map(word=>word.id));assert.equal(ids.length,20);assert.equal(new Set(ids).size,20);assert.equal(await student.evaluate(()=>queue.every(word=>word.list===1&&word.order<60)),true);randomDetSets.push([...ids].sort());if(seedValue===31){student.once('dialog',dialog=>dialog.accept());await student.locator('#exit').click();await student.locator('#restart').click();const replayIds=await student.evaluate(()=>queue.map(word=>word.id));assert.notDeepEqual([...ids].sort(),[...replayIds].sort());assert.equal(await student.evaluate(()=>queue.every(word=>word.list===1&&word.order<60)),true)}await student.close()}assert.notDeepEqual(randomDetSets[0],randomDetSets[1]);await detTeacher.setViewportSize({width:390,height:844});assert.ok(await detTeacher.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await detTeacher.close();log('DET First 60 scope drives normal, v3 fixed and v6 random student practice on desktop and mobile');
  const mobileTeacher=await browser.newPage({viewport:{width:390,height:844}});
  await mobileTeacher.goto(origin+'/word-check/teacher/');await ready(mobileTeacher);
  await mobileTeacher.locator('#librarySelect').selectOption('lib:difficulty-100-120');
  await mobileTeacher.waitForFunction(()=>WordCheckLibraries.activeId==='lib:difficulty-100-120'&&!document.getElementById('start').disabled);
  await mobileTeacher.locator('[data-group="2"]').uncheck();await mobileTeacher.locator('[data-group="3"]').uncheck();
  await mobileTeacher.locator('#vocabularyScope').selectOption('prefix');await mobileTeacher.locator('#prefixCount').fill('60');
  await mobileTeacher.locator('#sampling').selectOption('total');await mobileTeacher.locator('#count').fill('20');
  await mobileTeacher.locator('[name=mode][value=single]').check();await mobileTeacher.locator('#questionTime').fill('1');
  await mobileTeacher.locator('#linkType').selectOption('random');await mobileTeacher.locator('#createPreset').click();
  const mobileUrl=await mobileTeacher.locator('#presetLink').inputValue();await screenshot(mobileTeacher,'det-mobile-teacher');
  assert.ok(await mobileTeacher.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const mobileStudent=await browser.newPage({viewport:{width:390,height:844}});await mobileStudent.goto(mobileUrl);
  await mobileStudent.locator('#quiz').waitFor({state:'visible'});assert.equal(await mobileStudent.locator('#phonetic').isHidden(),true);
  assert.equal(await mobileStudent.locator('#hint').isVisible(),true);await mobileStudent.locator('#hint').click();
  await mobileStudent.waitForFunction(()=>document.getElementById('feedback').textContent.includes('本题超时'));
  assert.equal(await mobileStudent.locator('#progressText').innerText(),'1 / 20');await mobileStudent.locator('#next').click();
  assert.equal(await mobileStudent.locator('#progressText').innerText(),'2 / 20');await screenshot(mobileStudent,'det-mobile-student');
  assert.ok(await mobileStudent.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobileStudent.close();
  await mobileTeacher.route('**/data/ielts.v1.json',route=>route.fulfill({status:503,body:'offline'}));
  await mobileTeacher.locator('#librarySelect').selectOption('lib:ielts');await mobileTeacher.locator('#loadError').waitFor({state:'visible'});
  assert.equal(await mobileTeacher.evaluate(()=>WordCheckLibraries.activeId),'lib:difficulty-100-120');
  await mobileTeacher.locator('#prefixCount').fill('50');assert.ok(await mobileTeacher.locator('#createPreset').isDisabled());
  assert.ok(await mobileTeacher.locator('#presetLinkPanel').isHidden());
  await mobileTeacher.evaluate(()=>document.getElementById('createPreset').onclick());assert.ok(await mobileTeacher.locator('#presetLinkPanel').isHidden());
  await mobileTeacher.unroute('**/data/ielts.v1.json');await mobileTeacher.locator('#retryLoad').click();await ready(mobileTeacher);
  assert.ok(await mobileTeacher.locator('#createPreset').isEnabled());await mobileTeacher.close();
  log('mobile v6 Single mode, hints, timeout/next and failed-library link guard');
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
