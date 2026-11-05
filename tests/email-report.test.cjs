const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');

function database(){
 const sql=new DatabaseSync(':memory:');
 for(const file of fs.readdirSync(path.join(__dirname,'../backend/migrations')).sort())sql.exec(fs.readFileSync(path.join(__dirname,'../backend/migrations',file),'utf8'));
 const prep=(query,args=[])=>({bind:(...values)=>prep(query,values),first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>sql.prepare(query).run(...args)});
 return {prepare:prep,batch:async statements=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}},close:()=>sql.close()};
}

async function fixture(){
 const [{createStudent},{createAssignment,putRecord},reports]=await Promise.all([import('../backend/src/identity.js'),import('../backend/src/records.js'),import('../backend/src/email-report.js')]),DB=database();
 const student=await createStudent(DB,{displayName:'Ruoya',aliases:['ruoya']}),assignment=await createAssignment(DB,{studentId:student.id,presetHash:'#preset=abc'});
 const env={DB,REPORT_EMAIL_ENABLED:'true',RESEND_API_KEY:'re_test',TEACHER_EMAIL:'teacher@example.test'};
 return {DB,student,assignment,putRecord,reports,env};
}

function daily(id,assignmentId,finished=true){return {kind:'daily',id,assignmentId,payload:{id,question_type:'recognition',completed_at:new Date().toISOString(),finished,answers:[{question_id:'q1',prompt:'apple',displayed_options:[{id:'a',text:'苹果'},{id:'b',text:'香蕉'}],selected_option_ids:['b'],correct_option_ids:['a'],correct:false}]}}}

test('completed assigned work sends one idempotent report to the teacher',async()=>{const f=await fixture();try{
 const input=daily('daily-report-1',f.assignment.id);await f.putRecord(f.DB,f.student.id,input);
 assert.deepEqual(await f.reports.queueEmailReport(f.DB,f.student.id,input,f.env),{status:'queued'});
 const calls=[],fetcher=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({id:'email-1'}),{status:200,headers:{'Content-Type':'application/json'}})};
 const first=await f.reports.deliverEmailReport(f.env,{studentId:f.student.id,kind:input.kind,recordId:input.id},{fetcher});assert.equal(first.status,'sent');assert.equal(calls.length,1);
 const request=JSON.parse(calls[0].options.body);assert.equal(calls[0].url,'https://api.resend.com/emails');assert.deepEqual(request.to,['teacher@example.test']);assert.match(request.subject,/Ruoya/);assert.match(request.subject,/0\/1/);assert.match(request.text,/apple/);assert.match(calls[0].options.headers['Idempotency-Key'],/^word-check\/[a-f0-9]{64}$/);
 assert.equal((await f.reports.deliverEmailReport(f.env,{studentId:f.student.id,kind:input.kind,recordId:input.id},{fetcher})).status,'sent');assert.equal(calls.length,1);
 assert.deepEqual(await f.reports.queueEmailReport(f.DB,f.student.id,input,f.env),{status:'sent'});
}finally{f.DB.close()}});

test('failed delivery remains queued and the scheduled processor retries it',async()=>{const f=await fixture();try{
 const input=daily('daily-report-retry',f.assignment.id);await f.putRecord(f.DB,f.student.id,input);await f.reports.queueEmailReport(f.DB,f.student.id,input,f.env);
 const key={studentId:f.student.id,kind:input.kind,recordId:input.id};
 const failed=await f.reports.deliverEmailReport(f.env,key,{fetcher:async()=>new Response(JSON.stringify({message:'temporary failure'}),{status:503,headers:{'Content-Type':'application/json'}})});assert.equal(failed.status,'pending');
 let row=await f.DB.prepare('SELECT status,attempts,last_error FROM email_reports WHERE record_id=?').bind(input.id).first();assert.equal(row.status,'pending');assert.equal(row.attempts,1);assert.equal(row.last_error,'temporary failure');
 await f.DB.prepare('UPDATE email_reports SET next_attempt_at=? WHERE record_id=?').bind('2000-01-01T00:00:00.000Z',input.id).run();
 const retried=await f.reports.processPendingEmailReports(f.env,{fetcher:async()=>new Response(JSON.stringify({id:'email-retry'}),{status:200,headers:{'Content-Type':'application/json'}})});assert.deepEqual(retried,{processed:1,sent:1});
 row=await f.DB.prepare('SELECT status,attempts,provider_id FROM email_reports WHERE record_id=?').bind(input.id).first();assert.equal(row.status,'sent');assert.equal(row.attempts,2);assert.equal(row.provider_id,'email-retry');
}finally{f.DB.close()}});

test('free practice, unfinished work and learning links with a final check do not send reports',async()=>{const f=await fixture();try{
 const cases=[daily('unfinished',f.assignment.id,false),{...daily('free',null),assignmentId:null},{kind:'session',id:'learning-progress',assignmentId:f.assignment.id,payload:{session:{id:'learning-progress',profileId:f.student.id,status:'completed',updatedAt:new Date().toISOString(),reviews:[]},pack:{wordIds:['w1'],settings:{includeFinalCheck:true}}}}];
 for(const input of cases){await f.putRecord(f.DB,f.student.id,input);assert.equal((await f.reports.queueEmailReport(f.DB,f.student.id,input,f.env)).status,'disabled')}
 assert.equal((await f.DB.prepare('SELECT COUNT(*) AS count FROM email_reports').first()).count,0);
}finally{f.DB.close()}});

test('email reporting stays off until its Worker secrets are enabled',async()=>{const f=await fixture();try{
 const input=daily('disabled-report',f.assignment.id);await f.putRecord(f.DB,f.student.id,input);delete f.env.REPORT_EMAIL_ENABLED;
 assert.equal((await f.reports.queueEmailReport(f.DB,f.student.id,input,f.env)).status,'disabled');assert.equal(f.reports.emailReportConfiguration(f.env).configured,false);
}finally{f.DB.close()}});
