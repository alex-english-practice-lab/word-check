const {chromium}=require('playwright');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
async function main(){
 const {handle}=await import('../backend/src/index.js'),{createStudent}=await import('../backend/src/identity.js'),{createAssignment,putRecord}=await import('../backend/src/records.js');
 const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync(path.join(root,'backend/migrations')).sort())sql.exec(fs.readFileSync(path.join(root,'backend/migrations',file),'utf8'));
 const prep=(query,args=[])=>({bind:(...a)=>prep(query,a),first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>sql.prepare(query).run(...args)});
 const DB={prepare:prep,batch:async statements=>{sql.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());sql.exec('COMMIT');return r}catch(e){sql.exec('ROLLBACK');throw e}}};
 const person=await createStudent(DB,{displayName:'Student A',aliases:['a','alpha']}),other=await createStudent(DB,{displayName:'Student B',aliases:['b']});
 const task=await createAssignment(DB,{studentId:person.id,presetHash:'#preset=abc'});
 await putRecord(DB,person.id,{id:'old-result',kind:'daily',assignmentId:task.id,payload:{id:'old-result',completed_at:new Date().toISOString(),answers:[]}});
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test';
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),issuer='https://teacher.example',claims={iss:issuer,aud:'test',email:'teacher@example.test',exp:Math.floor(Date.now()/1000)+3600},data=enc({alg:'RS256',kid:'test'})+'.'+enc(claims),jwt=data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data))).toString('base64url');

 const origin='https://practice.test',errors=[];let browser;
 const library=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/second-library.json'),'utf8'));library.source.type='builtin';library.lists=library.lists.slice(0,1);library.lists[0].number=1;
 const template=library.lists[0].words[0];library.lists[0].words=Array.from({length:12},(_,i)=>({...template,id:library.id+'/word/'+i,order:i,text:'word'+i,acceptedAnswers:['word'+i],senses:['meaning '+i]}));
 const entries=library.lists[0].words.map(w=>({id:w.id,term_en:w.text,meaning_zh:w.senses[0],sections:['test']}));
 const questions=entries.map((w,i)=>({id:'q'+i,question_type:'recognition_single',word_id:w.id,tested_sense_id:'sense'+i,prompt_en:w.term_en,category:'test',options:['a','b','c','d'].map((id,j)=>({id,text:'option '+j})),correct_option_id:'a'}));
 const jsonFiles={'data/catalog.json':{schemaVersion:1,defaultLibraryId:library.id,libraries:[{id:library.id,name:'Test library',version:library.version,url:'fixture.json'}]},'data/fixture.json':library,'data/daily_v3_master.json':{entries},'data/recognition_v3_pilot.json':{questions},'data/synonyms_v3_questions.json':{questions:questions.map(q=>({...q,question_type:'synonym_multi',headword:q.prompt_en,correct_option_ids:['a','b']}))}};
 try{
  browser=await chromium.launch({headless:true,...(process.env.WORD_CHECK_CHROMIUM?{executablePath:process.env.WORD_CHECK_CHROMIUM}:{})});
  const context=await browser.newContext();context.setDefaultTimeout(10000);context.setDefaultNavigationTimeout(10000);await context.route('**/*',async route=>{try{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.startsWith('/api/')){const headers=new Headers(request.headers());if(url.pathname.startsWith('/api/teacher/'))headers.set('Cf-Access-Jwt-Assertion',jwt);
    const response=await handle(new Request(url,{method:request.method(),headers,...(request.postData()?{body:request.postData()}:{})}),{DB,SELECT_LIMITER:{limit:async()=>({success:true})},FRONTEND_ORIGIN:origin,ACCESS_ISSUER:issuer,ACCESS_AUD:'test',TEACHER_EMAIL:claims.email},{fetcher:async()=>new Response(JSON.stringify({keys:[jwk]}))});
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});return}
   let name=url.pathname.slice(1);if(!name||name.endsWith('/'))name+='index.html';
   if(name==='student-config.js'){await route.fulfill({contentType:'text/javascript',body:'window.WordCheckStudentConfig={apiBase:location.origin,studentHome:location.origin+"/"};'});return}
   if(jsonFiles[name]){await route.fulfill({contentType:'application/json',body:JSON.stringify(jsonFiles[name])});return}
   const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){await route.fulfill({status:404,body:''});return}
   await route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file,'utf8')});
  }catch(e){errors.push(e.message);await route.fulfill({status:500,body:''})}});
  const teacher=await context.newPage();teacher.on('pageerror',e=>errors.push(e.message));await teacher.goto(origin+'/teacher/');await teacher.locator('#assignmentStudent').selectOption(person.id);
  await teacher.locator('#sampling').selectOption('total');await teacher.locator('#count').fill('2');await teacher.locator('#linkType').selectOption('random');
  async function generate(){const previous=await teacher.locator('#presetLink').inputValue();await teacher.locator('#createPreset').click();await teacher.waitForFunction(old=>document.querySelector('#presetLink').value!==old,previous);return teacher.locator('#presetLink').inputValue()}
  const link=await generate();assert.match(link,/#assigned=/);
  const student=await context.newPage();student.on('pageerror',e=>errors.push(e.message));student.on('dialog',d=>d.accept());
  // Two deterministic RNG values make different subsets, avoiding probabilistic assertions.
  await student.addInitScript(()=>{Math.random=()=>Number(sessionStorage.getItem('test-rng')||'0.1')});
  await student.goto(link);await student.locator('#quiz').waitFor({state:'visible'});assert.equal(await student.evaluate(()=>WordStudentIdentity.current.id),person.id);
  const first=await student.evaluate(()=>queue.map(w=>w.id).sort());const aid=await student.evaluate(()=>WordStudentIdentity.assignmentId);
  async function finishSpelling(){for(let i=0;i<2;i++){await student.locator('#answer').fill('wrong');await student.locator('#submit').click();await student.locator('#next').click()}await student.evaluate(()=>WordCloudSync.queue())}
  await finishSpelling();await student.evaluate(()=>sessionStorage.setItem('test-rng','0.9'));await student.reload();await student.locator('#quiz').waitFor({state:'visible'});const second=await student.evaluate(()=>queue.map(w=>w.id).sort());assert.notDeepEqual(second,first);await finishSpelling();
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM student_records WHERE assignment_id=? AND kind='check'").get(aid).n,2);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM student_records WHERE student_id=?').get(other.id).n,0);
  await student.locator('#restart').click();await student.locator('#quiz').waitFor({state:'visible'});await finishSpelling();assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM student_records WHERE assignment_id=? AND kind='check'").get(aid).n,3);
  // Daily Recognition and Synonym use the same assigned recipe path.
  await teacher.locator('#librarySelect').selectOption('practice:daily-v3');await teacher.locator('#v3QuestionCount').fill('2');
  for(const mode of ['recognition','synonym']){
   await teacher.locator('[name=v3PracticeMode][value='+mode+']').check();const dailyLink=await generate();
   await student.evaluate(()=>sessionStorage.setItem('test-rng','0.1'));await student.goto('about:blank');await student.goto(dailyLink);await student.locator('#v3Quiz').waitFor({state:'visible'});const dailyId=await student.evaluate(()=>WordStudentIdentity.assignmentId);
   async function finishDaily(){for(let i=0;i<2;i++){await student.locator('#v3Skip').click();await student.locator('#v3Next').click()}await student.evaluate(()=>WordCloudSync.queue())}
   await finishDaily();await student.evaluate(()=>sessionStorage.setItem('test-rng','0.9'));await student.reload();await student.locator('#v3Quiz').waitFor({state:'visible'});await finishDaily();
   const rows=sql.prepare("SELECT payload_json FROM student_records WHERE assignment_id=? AND kind='daily' ORDER BY rowid").all(dailyId);assert.equal(rows.length,2);const ids=r=>JSON.parse(r.payload_json).answers.map(a=>a.question_id).sort();assert.notDeepEqual(ids(rows[0]),ids(rows[1]));
  }
  // Fixed assignment remains fixed across opens.
  await teacher.locator('#linkType').selectOption('fixed');const fixed=await generate();
  for(const random of ['0.1','0.9']){await student.evaluate(v=>sessionStorage.setItem('test-rng',v),random);await student.goto('about:blank');await student.goto(fixed);await student.locator('#v3Quiz').waitFor({state:'visible'});for(let i=0;i<2;i++){await student.locator('#v3Skip').click();await student.locator('#v3Next').click()}await student.evaluate(()=>WordCloudSync.queue())}
  const fixedId=await student.evaluate(()=>WordStudentIdentity.assignmentId),fixedRows=sql.prepare("SELECT payload_json FROM student_records WHERE assignment_id=? AND kind='daily'").all(fixedId);assert.equal(fixedRows.length,2);assert.deepEqual(...fixedRows.map(r=>JSON.parse(r.payload_json).answers.map(a=>a.question_id).sort()));
  assert.deepEqual(errors,[]);console.log('PASS assigned recurring spelling, Recognition, Synonym: repeated opens, resampling, separate results, student isolation, fixed-link regression');
 }finally{await browser?.close();sql.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});

