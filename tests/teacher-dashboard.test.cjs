const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
function database(){const db=new DatabaseSync(':memory:');for(const file of ['0001_students.sql','0002_assignments_records.sql'])db.exec(fs.readFileSync(path.join(__dirname,'../backend/migrations',file),'utf8'));const prep=(sql,args=[])=>({bind:(...values)=>prep(sql,values),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)});return {prepare:sql=>prep(sql),close:()=>db.close()}}
async function setup(){const db=database(),now=new Date().toISOString();for(const id of [A,B])await db.prepare('INSERT INTO students(id,display_name,status,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id,id===A?'Alice':'Bob','active',now,now).run();return db}
test('teacher record query scopes by student and assignment; retries dedupe, checkpoint shows latest and pages backwards',async()=>{const {listTeacherRecords,listTeacherAssignments,createAssignment,putRecord}=await import('../backend/src/records.js'),db=await setup();try{
 const first=await createAssignment(db,{studentId:A,presetHash:'#preset=abc.def'}),second=await createAssignment(db,{studentId:B,presetHash:'#preset=xyz.def'}),time='2026-10-24T00:00:00.000Z';
 const a={kind:'session',id:'session-1',assignmentId:first.id,payload:{session:{id:'session-1',profileId:A,updatedAt:time,seenIds:[]}}};await putRecord(db,A,a);await putRecord(db,A,a);
 await putRecord(db,A,{...a,payload:{session:{...a.payload.session,updatedAt:'2026-10-24T00:00:01.000Z',seenIds:['a']}}});
 await putRecord(db,B,{kind:'daily',id:'daily-1',assignmentId:second.id,payload:{id:'daily-1',completed_at:time,answers:[]}});
 for(let i=0;i<27;i++)await putRecord(db,A,{kind:'daily',id:'daily-'+i,payload:{id:'daily-'+i,completed_at:time,answers:[]}});
 const page=await listTeacherRecords(db,{studentId:A});assert.equal(page.records.length,25);assert.ok(page.nextCursor);assert.ok(page.records.every(r=>r.id!=='daily-1'||r.assignmentId!==second.id));
 const tail=await listTeacherRecords(db,{studentId:A,before:page.nextCursor});assert.equal(tail.records.length,3);assert.equal(tail.nextCursor,null);assert.equal(tail.records.find(r=>r.id==='session-1').payload.session.seenIds[0],'a');
 assert.deepEqual((await listTeacherRecords(db,{studentId:A,assignmentId:first.id})).records.map(r=>r.id),['session-1']);assert.equal((await listTeacherRecords(db,{studentId:B})).records.length,1);
 assert.deepEqual((await listTeacherAssignments(db,A)).map(a=>a.id),[first.id]);await assert.rejects(()=>listTeacherRecords(db,{studentId:A,assignmentId:second.id}),/不匹配/);
 for(const invalid of [0,-1,1.2,Number.MAX_SAFE_INTEGER+1,'bad'])await assert.rejects(()=>listTeacherRecords(db,{studentId:A,before:invalid}),/分页位置无效/);
}finally{db.close()}});
test('teacher record routes deny unauthenticated requests and reject malformed filter before reading records',async()=>{const {handle}=await import('../backend/src/index.js'),db=await setup();try{const env={DB:db,FRONTEND_ORIGIN:'https://school.example'};
 for(const url of ['/api/teacher/records?studentId='+A,'/api/teacher/assignments?studentId='+A])assert.equal((await handle(new Request('https://api.example'+url),env)).status,403);
 assert.equal((await handle(new Request('https://api.example/api/student/records?studentId='+A),env)).status,401);
}finally{db.close()}});
