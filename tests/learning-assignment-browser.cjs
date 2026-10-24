// Run with an externally available Playwright/Chromium; no project dependency.
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let name=new URL(req.url,'http://localhost').pathname.replace(/^\/word-check\//,'');if(!name||name.endsWith('/'))name+='index.html';const file=path.resolve(root,decodeURIComponent(name));if(!file.startsWith(root+path.sep))throw Error('invalid path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end('missing')}});
const bundle=page=>page.evaluate(()=>WordCheckLearning.activeSession);
async function learn(page){while((await bundle(page)).session.currentStage==='learn'){await page.locator('#flashcard').click();await page.locator('#learnNext').click()}}
async function review(page){while((await bundle(page)).session.currentStage==='review'){await page.locator('#flashcard').click();await page.locator('#reviewKnow').click()}}
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let browser;
 try{
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WORD_CHECK_CHROMIUM?{executablePath:process.env.WORD_CHECK_CHROMIUM}:{})});
  const teacher=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];teacher.on('pageerror',e=>errors.push(e.message));
  await teacher.goto(origin+'/word-check/teacher/');await teacher.locator('#assignmentType').selectOption('learning');await teacher.waitForFunction(()=>!document.getElementById('tlGenerate').disabled);
  assert.ok(await teacher.locator('#setup').isHidden());await teacher.locator('#tlLibrary').selectOption('lib:difficulty-100-120');await teacher.waitForFunction(()=>!document.getElementById('tlGroup').disabled);
  await teacher.locator('#tlSelection').selectOption('range');await teacher.locator('#tlScope').selectOption('prefix');await teacher.locator('#tlPrefix').fill('60');await teacher.locator('#tlCount').fill('8');await teacher.locator('#tlTime').fill('25');await teacher.locator('#tlAssistance').selectOption('check');await teacher.waitForFunction(()=>!document.getElementById('tlGenerate').disabled);await teacher.locator('#tlGenerate').click();
  const scopedUrl=await teacher.locator('#tlLink').inputValue(),scoped=await teacher.evaluate(hash=>WordPresetLinks.readHash(hash),new URL(scopedUrl).hash);assert.equal(scoped.w.length,8);assert.equal(new Set(scoped.w).size,8);
  const first60=await teacher.evaluate(async()=>{const library=await (await fetch('data/difficulty-100-120.v1.json')).json();return WordCore.prefixPool(WordVocabulary.toPracticeWords(library),1,60).map(w=>w.id)});
  assert.ok(scoped.w.every(id=>first60.includes(id)));
  await teacher.locator('#tlSelection').selectOption('manual');await teacher.locator('#tlSearch').fill('a');const visible=teacher.locator('#tlWordChoices input[type=checkbox]');assert.ok(await visible.count()>=8);
  for(let i=0;i<8;i++)await visible.nth(i).check();assert.match(await teacher.locator('#tlManualCount').innerText(),/已勾选 8 个/);
  await teacher.locator('#tlSearch').fill('');await teacher.locator('#tlGenerate').click();const url=await teacher.locator('#tlLink').inputValue(),preset=await teacher.evaluate(hash=>WordPresetLinks.readHash(hash),new URL(url).hash);assert.equal(preset.w.length,8);assert.ok(!errors.length,errors.join('\n'));
  const student=await browser.newPage({viewport:{width:1280,height:900}});student.on('pageerror',e=>errors.push(e.message));await student.goto(url);await student.locator('#learnCards').waitFor({state:'visible'});let initial=await bundle(student);assert.deepEqual(initial.pack.wordIds,preset.w);assert.equal(initial.session.currentStage,'learn');assert.ok(await student.locator('#learnSetup').isHidden());
  await student.locator('#flashcard').click();await student.locator('#learnNext').click();const saved=await bundle(student);await student.reload();await student.locator('#learnCards').waitFor({state:'visible'});assert.deepEqual((await bundle(student)).session.seenIds,saved.session.seenIds);
  await learn(student);await student.locator('#learnContinue').click();await review(student);await student.locator('#learnCheck').click();await student.locator('#quiz').waitFor({state:'visible'});assert.deepEqual(new Set(await student.evaluate(()=>queue.map(w=>w.id))),new Set(preset.w));assert.equal(await student.locator('#timer').isVisible(),true);assert.equal(await student.locator('#hint').isHidden(),true);assert.equal(await student.locator('#checkSpelling').isVisible(),true);
  for(let i=0;i<8;i++){await student.locator('#answer').fill(i===0?await student.evaluate(()=>queue[index].word):'incorrect');await student.locator('#submit').click();await student.locator('#next').click()}
  assert.equal(await student.locator('#independent').innerText(),'1');assert.equal(await student.locator('#incorrect').innerText(),'7');assert.equal((await bundle(student)).session.status,'completed');
  const teacherAttempt=await student.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('word-check.learn.v1.check.')).map(k=>JSON.parse(localStorage.getItem(k)).attempt).find(a=>a.source.type==='assignment'));assert.equal(teacherAttempt.source.id,initial.pack.id);
  const mobile=await browser.newPage({viewport:{width:390,height:844}});await mobile.goto(url);await mobile.locator('#learnCards').waitFor({state:'visible'});assert.deepEqual((await bundle(mobile)).pack.wordIds,preset.w);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await teacher.locator('#tlFinal').uncheck();await teacher.locator('#tlGenerate').click();const reviewOnly=await browser.newPage();await reviewOnly.goto(await teacher.locator('#tlLink').inputValue());await reviewOnly.locator('#learnCards').waitFor({state:'visible'});await learn(reviewOnly);await reviewOnly.locator('#learnContinue').click();await review(reviewOnly);assert.ok(await reviewOnly.locator('#learnCheck').isHidden());await reviewOnly.locator('#learnFinish').click();assert.equal((await bundle(reviewOnly)).session.status,'completed');
  const mobileTeacher=await browser.newPage({viewport:{width:390,height:844}});await mobileTeacher.goto(origin+'/word-check/teacher/');await mobileTeacher.locator('#assignmentType').selectOption('learning');await mobileTeacher.waitForFunction(()=>!document.getElementById('tlGenerate').disabled);assert.ok(await mobileTeacher.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await teacher.locator('#assignmentType').selectOption('checking');assert.ok(await teacher.locator('#setup').isVisible());assert.ok(await teacher.locator('#createPreset').isVisible());
  const old=await teacher.evaluate(()=>WordPresetLinks.createUrl({v:3,l:'lib:ielts',lv:'1.0.0',m:'full',w:[0],t:0,h:false},new URL('./',document.baseURI).href));
  const oldStudent=await browser.newPage();await oldStudent.goto(old);await oldStudent.locator('#quiz').waitFor({state:'visible'});assert.deepEqual(errors,[]);
  console.log('PASS teacher range/manual fixed IDs, student Learn → Review → Check and resume, old v3 link, desktop/mobile layouts');
 }finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
