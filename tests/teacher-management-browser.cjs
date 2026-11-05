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
 const origin='http://teacher.test';let browser;const errors=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.WORD_CHECK_CHROMIUM?{executablePath:process.env.WORD_CHECK_CHROMIUM}:{})});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  // Fulfil browser requests in-process so the test also works in network-restricted runners.
  await page.route('**/*',async route=>{try{const request=route.request(),url=new URL(request.url());
   if(url.pathname.startsWith('/api/')){const headers=new Headers(request.headers());headers.set('Cf-Access-Jwt-Assertion',jwt);const response=await handle(new Request(url,{method:request.method(),headers,...(request.postData()?{body:request.postData()}:{})}),{DB,FRONTEND_ORIGIN:origin,ACCESS_ISSUER:issuer,ACCESS_AUD:'test',TEACHER_EMAIL:claims.email},{fetcher:async()=>new Response(JSON.stringify({keys:[jwk]}))});await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});return}
   if(url.pathname==='/student-config.js'){await route.fulfill({contentType:'text/javascript',body:'window.WordCheckStudentConfig={apiBase:location.origin};'});return}
   const name=url.pathname==='/teacher/dashboard'?'teacher/dashboard.html':url.pathname.slice(1);if(!['teacher/dashboard.html','teacher/dashboard.js','teacher/dashboard.css','style.css','cloud-sync.js'].includes(name)){await route.fulfill({status:404,body:''});return}await route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(path.join(root,name),'utf8')});
  }catch(e){errors.push(e.message);await route.fulfill({status:500,body:''})}});
  await page.goto(origin+'/teacher/dashboard');await page.locator('#dashStudent').selectOption(person.id);await page.getByText('学生档案与作业管理',{exact:true}).click();
  await page.getByLabel('显示名称',{exact:true}).fill('Renamed A');await page.getByLabel('登录 ID（多个用英文逗号分隔）').fill('alpha, new-a');await page.getByRole('button',{name:'保存档案',exact:true}).click();await page.getByText('学生档案已保存。',{exact:true}).waitFor();
  assert.equal(sql.prepare('SELECT display_name FROM students WHERE id=?').get(person.id).display_name,'Renamed A');
  await page.getByLabel('登录 ID（多个用英文逗号分隔）').fill('b');await page.getByRole('button',{name:'保存档案',exact:true}).click();await page.getByText('Student ID 已被其他学生使用或保留',{exact:true}).waitFor();
  assert.equal(sql.prepare('SELECT student_id FROM student_aliases WHERE normalized_alias=?').get('b').student_id,other.id);
  await page.getByRole('button',{name:'停用学生',exact:true}).click();await page.getByText('学生已停用，已有成绩保留。',{exact:true}).waitFor();await page.getByRole('button',{name:'重新启用学生',exact:true}).click();await page.getByText('学生已重新启用，请重新登录。',{exact:true}).waitFor();
  const d=new Date(Date.now()+2*86400000),local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);await page.getByLabel('到期时间（本机时区）').fill(local);await page.getByRole('button',{name:'保存到期时间',exact:true}).click();await page.getByText('到期时间已保存。',{exact:true}).waitFor();
  await page.getByRole('button',{name:'撤销链接',exact:true}).click();await page.getByText('链接已撤销，已有成绩保留。',{exact:true}).waitFor();assert.ok(sql.prepare('SELECT revoked_at FROM assignments WHERE id=?').get(task.id).revoked_at);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM student_records').get().n,1);
  await page.locator('#dashAssignment').selectOption(task.id);await page.getByText('1 条已加载记录',{exact:false}).waitFor();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setContent('<body data-teacher="true"><select id="assignmentStudent"></select><p id="assignmentStudentNotice"></p></body>');
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'teacher-assigned.js'),'utf8')});await page.locator('#assignmentStudent').selectOption(person.id);await page.locator('#assignmentExpiryDays').fill('7');
  const issued=await page.evaluate(()=>WordAssignedTeacher.wrap('https://student.test/#preset=abc'));assert.match(issued,/#assigned=/);const created=sql.prepare('SELECT expires_at FROM assignments ORDER BY created_at DESC LIMIT 1').get();assert.ok(Math.abs(Date.parse(created.expires_at)-Date.now()-7*86400000)<10000);
  await page.locator('#assignmentExpiryDays').fill('0');assert.equal(await page.evaluate(async()=>{try{await WordAssignedTeacher.wrap('https://student.test/#preset=abc');return false}catch{return true}}),true);
  await page.evaluate(()=>delete document.body.dataset.teacher);
  // A rejected old assignment must not prevent another assignment's records from syncing.
  await page.evaluate(()=>{document.body.innerHTML='<section id="results"></section>';const attempts=[{id:'blocked',assignmentId:'old'},{id:'valid',assignmentId:'new'}];window.WordStudentIdentity={mode:'named',token:'test',apiBase:'',current:{id:'a'},storage:{length:0}};window.WordCheckPracticeCore={readStoreDetailed:()=>({store:{attempts}})};window.sent=[];window.fetch=async(url,options)=>{if(options.method==='GET')return new Response(JSON.stringify({records:[],nextCursor:null}));const record=JSON.parse(options.body);window.sent.push(record.id);return new Response(JSON.stringify(record.id==='blocked'?{error:'已撤销'}:{saved:true}),{status:record.id==='blocked'?410:200})}});
  await page.addScriptTag({url:origin+'/cloud-sync.js'});const sync=await page.evaluate(()=>WordCloudSync.ready);assert.equal(sync.status,'blocked');assert.deepEqual(await page.evaluate(()=>sent),['blocked','valid']);await page.getByText('其他记录已同步。',{exact:false}).waitFor();assert.deepEqual(errors,[]);console.log('Teacher management browser passed: edit/conflict/disable/enable/expiry/revoke/history/mobile/blocked sync');
 }finally{await browser?.close();sql.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
