const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const LearnStore=require('../learn-store.js');
let api,records,identity;const ready=Promise.all([import('../backend/src/index.js'),import('../backend/src/records.js'),import('../backend/src/identity.js')]).then(([a,r,i])=>{api=a;records=r;identity=i});
function database(){const db=new DatabaseSync(':memory:');for(const name of ['0001_students.sql','0002_assignments_records.sql'])db.exec(fs.readFileSync(path.join(__dirname,'../backend/migrations',name),'utf8'));
 const prep=(sql,args=[])=>({bind:(...values)=>prep(sql,values),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)});
 return {prepare:sql=>prep(sql),async batch(statements){db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}},close:()=>db.close()};
}
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',now=()=>new Date().toISOString();
async function setup(){await ready;const db=database(),at=now();for(const [id,name,alias] of [[A,'Zining','isabella'],[B,'Irving','irving']]){await db.prepare('INSERT INTO students(id,display_name,status,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,name,'active',at,at).run();await db.prepare('INSERT INTO student_aliases(normalized_alias,student_id,active,created_at) VALUES(?,?,1,?)').bind(alias,id,at).run()}return db}
test('assigned token opens only the named student, expires, and never exposes the teacher preset to a guessed token',async()=>{const db=await setup();try{
 const created=await records.createAssignment(db,{studentId:A,presetHash:'#preset=Abc_def.0123',expiresInDays:1});assert.match(created.token,/^[A-Za-z0-9_-]{40,64}$/);assert.equal(created.expiresAt.length,24);
 const opened=await records.openAssignment(db,created.token);assert.equal(opened.student.id,A);assert.equal(opened.alias,'isabella');assert.equal(opened.presetHash,'#preset=Abc_def.0123');assert.ok(opened.accessToken.length>=40);
 await assert.rejects(()=>records.openAssignment(db,'x'.repeat(43)),/过期或不可用/);
 await db.prepare('UPDATE assignments SET expires_at=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',created.id).run();await assert.rejects(()=>records.openAssignment(db,created.token),/过期或不可用/);
 await assert.rejects(()=>records.createAssignment(db,{studentId:B,presetHash:'#preset=bad query'}),/格式无效/);
}finally{db.close()}});
test('immutable answer records dedupe, session checkpoint advances, student and assignment IDs are enforced',async()=>{const db=await setup();try{
 const assignment=await records.createAssignment(db,{studentId:A,presetHash:'#preset=abc.def'});
 const session={session:{id:'session-1',profileId:A,updatedAt:'2026-10-24T00:00:00.000Z'},pack:{id:'pack-1'}};
 const input={kind:'session',id:'session-1',payload:session,assignmentId:assignment.id};assert.deepEqual(await records.putRecord(db,A,input),{saved:true,duplicate:false});assert.deepEqual(await records.putRecord(db,A,input),{saved:false,duplicate:true});
 await assert.rejects(()=>records.putRecord(db,B,input),/作业与当前学生不匹配/);
 await assert.rejects(()=>records.putRecord(db,A,{...input,payload:{session:{...session.session,profileId:B}}}),/学生不匹配/);
 const newer={...input,payload:{...session,session:{...session.session,updatedAt:'2026-10-24T00:00:01.000Z'}}};assert.equal((await records.putRecord(db,A,newer)).saved,true);
 await assert.rejects(()=>records.putRecord(db,A,{...input,payload:{...session,session:{...session.session,updatedAt:'2026-10-24T00:00:01.000Z',flipped:true}}}),/内容冲突/);
 const check={attempt:{id:'attempt-1',status:'completed',completedAt:now(),identity:{userId:A}},answers:[{id:'answer-1'}]};
 assert.equal((await records.putRecord(db,A,{kind:'check',id:'attempt-1',payload:check,assignmentId:assignment.id})).saved,true);
 await assert.rejects(()=>records.putRecord(db,A,{kind:'check',id:'attempt-1',payload:{...check,answers:[]},assignmentId:assignment.id}),/内容冲突/);
 await assert.rejects(()=>records.putRecord(db,B,{kind:'check',id:'attempt-2',payload:check}),/编号或时间/);
 const listed=await records.listRecords(db,A);assert.deepEqual(listed.records.map(r=>r.kind),['session','check']);assert.equal(listed.records[0].payload.session.updatedAt,newer.payload.session.updatedAt);assert.deepEqual((await records.listRecords(db,B)).records,[]);
}finally{db.close()}});
test('student record routes require the student bearer; teacher assignment route requires Access',async()=>{const db=await setup();try{
 const env={DB:db,SELECT_LIMITER:{limit:async()=>({success:true})},FRONTEND_ORIGIN:'https://example.test'};
 const req=(path,method='GET',value,headers={})=>new Request('https://api.example.test'+path,{method,headers:{...(value?{'Content-Type':'application/json'}:{}),...headers},...(value?{body:JSON.stringify(value)}:{})});
 assert.equal((await api.handle(req('/api/student/records'),env)).status,401);
 assert.equal((await api.handle(req('/api/teacher/assignments','POST',{studentId:A,presetHash:'#preset=abc.def'}),env)).status,403);
 const session=await api.handle(req('/api/student/select','POST',{alias:'isabella'}),env),token=(await session.json()).accessToken;
 const record={kind:'daily',id:'daily-1',payload:{id:'daily-1',completed_at:now(),answers:[]}};
 assert.equal((await api.handle(req('/api/student/records','POST',record,{Authorization:'Bearer '+token}),env)).status,200);
 assert.equal((await api.handle(req('/api/student/records','POST',record,{Authorization:'Bearer '+token}),env)).status,200);
 const got=await api.handle(req('/api/student/records','GET',null,{Authorization:'Bearer '+token}),env);assert.equal((await got.json()).records.length,1);
 assert.equal((await api.handle(req('/api/student/records?after=bad','GET',null,{Authorization:'Bearer '+token}),env)).status,400);
}finally{db.close()}});
test('previous named browser profile migrates within its UUID namespace with original bytes backed up',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i]??null,get length(){return map.size}};
 const old='old-device-profile',prefix=LearnStore.PREFIX,identity={profileId:old,deviceId:'device-1',userId:null};
 const session={session:{id:'session-1',profileId:old},pack:{id:'pack-1'}},check={attempt:{id:'attempt-1',identity:{profileId:old,userId:null}},answers:[]};
 storage.setItem(prefix+'identity',JSON.stringify(identity));storage.setItem(prefix+'session.session-1',JSON.stringify(session));storage.setItem(prefix+'check.attempt-1',JSON.stringify(check));
 const previous=globalThis.WordStudentIdentity;globalThis.WordStudentIdentity={mode:'named',current:{id:A}};
 try{const repo=LearnStore.createRepository(()=>storage);assert.equal(repo.identity.profileId,A);assert.equal(repo.identity.userId,A);
  assert.equal(JSON.parse(storage.getItem(prefix+'session.session-1')).session.profileId,A);assert.equal(JSON.parse(storage.getItem(prefix+'check.attempt-1')).attempt.identity.userId,A);
  const backup=JSON.parse(storage.getItem(prefix+'identity-migration-backup.'+old));assert.deepEqual(backup.identity,identity);assert.equal(backup.originals.length,2);
 }finally{if(previous===undefined)delete globalThis.WordStudentIdentity;else globalThis.WordStudentIdentity=previous}
});
test('cloud history pages beyond 100 records without dropping a student fact',async()=>{const db=await setup();try{
 for(let i=0;i<102;i++)await records.putRecord(db,A,{kind:'daily',id:'daily-'+i,payload:{id:'daily-'+i,completed_at:now(),answers:[]}});
 const first=await records.listRecords(db,A);assert.equal(first.records.length,100);assert.ok(first.nextCursor>0);
 const second=await records.listRecords(db,A,first.nextCursor);assert.equal(second.records.length,2);assert.equal(second.nextCursor,null);
 assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,102);
 assert.deepEqual((await records.listRecords(db,B)).records,[]);
}finally{db.close()}});
