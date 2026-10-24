// Optional: run with Playwright and installed Chromium; backend responses are mocked.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{try{let name=new URL(req.url,'http://localhost').pathname.replace(/^\/word-check\//,'');if(!name||name.endsWith('/'))name+='index.html';const file=path.resolve(root,decodeURIComponent(name));if(!file.startsWith(root+path.sep))throw Error('path');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file))}catch{res.writeHead(404);res.end('missing')}});
async function main(){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.WORD_CHECK_CHROMIUM?{executablePath:process.env.WORD_CHECK_CHROMIUM}:{})});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/student-config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.WordCheckStudentConfig={apiBase:"https://api.example.test"};'}));
  await page.route('https://api.example.test/**',async route=>{const request=route.request(),url=new URL(request.url());if(url.pathname==='/api/student/select'){
   const alias=JSON.parse(request.postData()).alias.trim().toLowerCase(),z=['zining','isabella'].includes(alias);
   const payload=z?{student:{id:'11111111-1111-4111-8111-111111111111',displayName:'Zining'},accessToken:'a'.repeat(43)}:alias==='irving'?{student:{id:'22222222-2222-4222-8222-222222222222',displayName:'Irving'},accessToken:'b'.repeat(43)}:{error:'找不到该 Student ID'};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(payload),status:z||alias==='irving'?200:404})}
   if(url.pathname==='/api/student/records')return route.fulfill({contentType:'application/json',body:request.method()==='GET'?'{"records":[],"nextCursor":null}':'{"saved":true}'});
   return route.fulfill({contentType:'application/json',body:'{"ok":true}'})});
  const url=`http://127.0.0.1:${server.address().port}/word-check/`;
  await page.goto(url);assert.ok(await page.locator('#identityDialog').isVisible());await page.locator('#studentAlias').fill('unknown');await page.locator('#identitySelect').click();assert.match(await page.locator('#identityError').innerText(),/找不到/);
  await page.locator('#studentAlias').fill(' Isabella ');await page.locator('#identitySelect').click();await page.waitForFunction(()=>window.WordStudentIdentity?.current?.id==='11111111-1111-4111-8111-111111111111');
  await page.locator('#goLearn').click();await page.locator('#learnLibrary').selectOption('lib:difficulty-100-120');await page.waitForFunction(()=>!document.querySelector('#learnStart').disabled);
  await page.locator('#learnCount').fill('1');await page.locator('#learnStart').click();await page.locator('#flashcard').click();
  await page.locator('#learnPause').click();await page.locator('#identityTrigger').click();await page.locator('#identitySwitch').click();await page.locator('#studentAlias').fill('irving');await page.locator('#identitySelect').click();
  await page.waitForFunction(()=>window.WordStudentIdentity?.current?.id==='22222222-2222-4222-8222-222222222222');await page.locator('#goLearn').click();assert.equal(await page.locator('#metricSeen').innerText(),'0');
  await page.locator('#identityTrigger').click();await page.locator('#identityNoRecord').click();await page.waitForFunction(()=>window.WordStudentIdentity?.mode==='guest');
  assert.equal(await page.evaluate(()=>WordStudentIdentity.storage.getItem('wordcheck.v3.practice.local.v1')),null);assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('11111111-1111-4111-8111-111111111111'))));
  const assignedUrl=await page.evaluate(()=>WordPresetLinks.createUrl({v:3,l:'lib:ielts',lv:'1.0.0',m:'full',w:[0],t:0,h:false},new URL('./',document.baseURI).href));
  const assignedContext=await browser.newContext({viewport:{width:390,height:844}}),assigned=await assignedContext.newPage();await assigned.route('**/student-config.js*',route=>route.fulfill({contentType:'text/javascript',body:'window.WordCheckStudentConfig={apiBase:"https://api.example.test"};'}));
  await assigned.goto(assignedUrl);await assigned.locator('#quiz').waitFor({state:'visible'});assert.ok(await assigned.locator('#identityDialog').isHidden());assert.ok(await assigned.locator('#setup').isHidden());assert.equal(await assigned.evaluate(()=>WordStudentIdentity.mode),'guest');assert.ok(await assigned.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await assignedContext.close();
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
  assert.deepEqual(errors,[]);await page.close();process.stdout.write('Student identity, Guest, legacy assigned link, and desktop/mobile isolation passed\n');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}}
main().catch(error=>{console.error(error);process.exitCode=1});
