const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
let handle,normalizeAlias;const ready=Promise.all([import('../backend/src/index.js'),import('../backend/src/identity.js')]).then(([api,id])=>{handle=api.handle;normalizeAlias=id.normalizeAlias});
function database(){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(path.join(__dirname,'../backend/migrations/0001_students.sql'),'utf8'));
 const prepared=(sql,params=[])=>({bind:(...values)=>prepared(sql,values),first:async()=>db.prepare(sql).get(...params)||null,all:async()=>({results:db.prepare(sql).all(...params)}),run:async()=>db.prepare(sql).run(...params)});
 return {prepare:sql=>prepared(sql),async batch(statements){db.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}},close:()=>db.close()};
}
const base='https://api.example.test',origin='https://alex-english-practice-lab.github.io';
function req(p,method='GET',data,headers={}){return new Request(base+p,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})})}
async function sign(privateKey,claims,kid='test-key'){
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),h=enc({alg:'RS256',typ:'JWT',kid}),p=enc(claims),data=h+'.'+p;
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(data));return data+'.'+Buffer.from(signature).toString('base64url');
}
async function setup(){await ready;const DB=database(),pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='test-key';
 const env={DB,SELECT_LIMITER:{limit:async()=>({success:true})},FRONTEND_ORIGIN:origin,ACCESS_ISSUER:'https://classroom.cloudflareaccess.com',ACCESS_AUD:'test-aud',TEACHER_EMAIL:'teacher@example.test'};
 const fetcher=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200});
 const claims={iss:env.ACCESS_ISSUER,aud:env.ACCESS_AUD,email:env.TEACHER_EMAIL,exp:Math.floor(Date.now()/1000)+3600,sub:'teacher'};
 const token=await sign(pair.privateKey,claims),teacher={'Cf-Access-Jwt-Assertion':token};
 const call=(r)=>handle(r,env,{fetcher});return{DB,env,call,teacher,pair,claims,fetcher};
}
test('aliases normalize to a single UUID; unknown IDs do not self-register; sessions revoke',async()=>{const {DB,call,teacher}=await setup();try{
 const created=await call(req('/api/teacher/students','POST',{displayName:'Zining',aliases:['zining','isabella']},teacher));assert.equal(created.status,201);const student=(await created.json()).student;assert.match(student.id,/^[0-9a-f-]{36}$/i);
 assert.equal(normalizeAlias(' ＩＳＡＢＥＬＬＡ '),'isabella');
 for(const alias of ['zining','isabella',' Isabella ']){const response=await call(req('/api/student/select','POST',{alias}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.student.id,student.id);assert.ok(result.accessToken.length>40);
  const profile=await call(req('/api/student/profile','GET',null,{Authorization:'Bearer '+result.accessToken}));assert.equal((await profile.json()).student.id,student.id);
  assert.equal((await call(req('/api/student/logout','POST',null,{Authorization:'Bearer '+result.accessToken}))).status,200);
  assert.equal((await call(req('/api/student/profile','GET',null,{Authorization:'Bearer '+result.accessToken}))).status,401);
 }
 assert.equal((await call(req('/api/student/select','POST',{alias:'unlisted'}))).status,404);
 assert.equal((await call(req('/api/teacher/students','POST',{displayName:'Other',aliases:['ISABELLA']},teacher))).status,409);
 assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM students').first()).n,1);
}finally{DB.close()}});
test('teacher APIs require signed Access JWT, matching audience, issuer and teacher email',async()=>{const {DB,call,env,pair,claims,fetcher,teacher}=await setup();try{
 assert.equal((await call(req('/api/teacher/students'))).status,403);
 assert.equal((await call(req('/api/teacher/students','GET',null,{'Cf-Access-Jwt-Assertion':'forged'}))).status,403);
 const wrong=await sign(pair.privateKey,{...claims,aud:'other'});assert.equal((await handle(req('/api/teacher/students','GET',null,{'Cf-Access-Jwt-Assertion':wrong}),env,{fetcher})).status,403);
 const expired=await sign(pair.privateKey,{...claims,exp:Math.floor(Date.now()/1000)-1});assert.equal((await handle(req('/api/teacher/students','GET',null,{'Cf-Access-Jwt-Assertion':expired}),env,{fetcher})).status,403);
 const email=await sign(pair.privateKey,{...claims,email:'other@example.test'});assert.equal((await handle(req('/api/teacher/students','GET',null,{'Cf-Access-Jwt-Assertion':email}),env,{fetcher})).status,403);
 assert.equal((await call(req('/api/teacher/students','GET',null,teacher))).status,200);
}finally{DB.close()}});
test('alias edits preserve historical ownership; disabled student and rate limits fail closed',async()=>{const {DB,call,teacher,env,fetcher}=await setup();try{
 const created=await call(req('/api/teacher/students','POST',{displayName:'Zining',aliases:['zining','isabella']},teacher));const id=(await created.json()).student.id;
 const edited=await call(req('/api/teacher/students/'+id,'PATCH',{displayName:'Isabella',aliases:['isabella'],status:'active'},teacher));assert.equal(edited.status,200);
 assert.equal((await call(req('/api/student/select','POST',{alias:'zining'}))).status,404);
 assert.equal((await call(req('/api/teacher/students','POST',{displayName:'Other',aliases:['zining']},teacher))).status,409);
 assert.equal((await call(req('/api/teacher/students/'+id,'PATCH',{status:'disabled'},teacher))).status,200);
 assert.equal((await call(req('/api/student/select','POST',{alias:'isabella'}))).status,404);
 env.SELECT_LIMITER={limit:async()=>({success:false})};assert.equal((await handle(req('/api/student/select','POST',{alias:'isabella'}),env,{fetcher})).status,429);
 assert.equal((await call(req('/api/student/select','POST',{alias:'isabella'},{Origin:'https://wrong.example'}))).status,403);
}finally{DB.close()}});
