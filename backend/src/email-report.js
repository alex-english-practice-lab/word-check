import {digest} from './auth.js';

const DEFAULT_FROM='Word Check <onboarding@resend.dev>';
const now=()=>new Date().toISOString();
const changes=result=>result?.meta?.changes??result?.changes??0;
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
const date=value=>{const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':clean(value)};

export function emailReportConfiguration(env){
 const enabled=env.REPORT_EMAIL_ENABLED==='true',to=env.REPORT_TO_EMAIL||env.TEACHER_EMAIL||'',from=env.REPORT_FROM_EMAIL||DEFAULT_FROM;
 return {enabled,configured:enabled&&Boolean(env.RESEND_API_KEY&&to&&from),to,from};
}

function completed(kind,payload){
 if(kind==='check')return payload?.attempt?.status==='completed';
 if(kind==='daily')return payload?.finished===true;
 return payload?.session?.status==='completed'&&payload?.pack?.settings?.includeFinalCheck===false;
}

export async function queueEmailReport(db,studentId,input,env){
 const config=emailReportConfiguration(env);
 if(!config.enabled||!input?.assignmentId||!completed(input.kind,input.payload))return {status:'disabled'};
 const time=now();
 const result=await db.prepare("INSERT OR IGNORE INTO email_reports(student_id,kind,record_id,assignment_id,status,attempts,next_attempt_at,created_at,updated_at) VALUES(?,?,?,?, 'pending',0,?,?,?)")
  .bind(studentId,input.kind,input.id,input.assignmentId,time,time,time).run();
 if(changes(result)>0)return {status:'queued'};
 const prior=await db.prepare('SELECT status FROM email_reports WHERE student_id=? AND kind=? AND record_id=?').bind(studentId,input.kind,input.id).first();
 return {status:prior?.status||'queued'};
}

function detailsForCheck(payload){
 const answers=Array.isArray(payload.answers)?payload.answers:[],questions=new Map((payload.attempt?.questions||[]).map(question=>[question.id,question]));
 const correct=answers.filter(answer=>answer.result?.isCorrect===true).length;
 const outcomes={correct:0,checked:0,letter_assisted:0,assisted:0,wrong:0};
 for(const answer of answers)if(answer.result?.outcome in outcomes)outcomes[answer.result.outcome]++;
 const mistakes=answers.filter(answer=>answer.result?.isCorrect!==true).map(answer=>{const question=questions.get(answer.questionId);return {prompt:question?.prompt?.meaning||question?.snapshot?.senses?.join('；')||answer.wordId||answer.questionId,answer:answer.response?.skipped?'跳过':answer.response?.text||'未作答',expected:(question?.snapshot?.acceptedAnswers||[]).join(' / ')||question?.snapshot?.text||''}});
 return {label:'Spelling 正式检查',completedAt:payload.attempt?.completedAt,total:answers.length,correct,summary:`独立正确 ${outcomes.correct}，拼写检查后正确 ${outcomes.checked}，提示后正确 ${outcomes.letter_assisted+outcomes.assisted}，错误 ${outcomes.wrong}`,mistakes};
}

function optionLabels(answer,ids){const options=new Map((answer.displayed_options||[]).map(option=>[option.id,option.text]));return (ids||[]).map(id=>options.get(id)||id).join(' / ')||'未选择'}
function detailsForDaily(payload){
 const answers=Array.isArray(payload.answers)?payload.answers:[],correct=answers.filter(answer=>answer.correct===true).length;
 const mistakes=answers.filter(answer=>answer.correct!==true).map(answer=>({prompt:answer.prompt||answer.question_id||'题目',answer:optionLabels(answer,answer.selected_option_ids),expected:optionLabels(answer,answer.correct_option_ids)}));
 return {label:payload.question_type==='synonym'?'Synonym 正式检查':'Recognition 正式检查',completedAt:payload.completed_at,total:answers.length,correct,summary:`正确 ${correct}，错误或跳过 ${answers.length-correct}`,mistakes};
}

function detailsForSession(payload){
 const session=payload.session||{},reviews=Array.isArray(session.reviews)?session.reviews:[],know=reviews.filter(review=>review.rating==='know').length,again=reviews.filter(review=>review.rating==='again').length,total=Array.isArray(payload.pack?.wordIds)?payload.pack.wordIds.length:session.seenIds?.length||0;
 return {label:'Learn / Review 学习任务',completedAt:session.updatedAt,total,correct:null,summary:`学习 ${total} 个词；复习标记 Know ${know} 次、Again ${again} 次`,mistakes:[]};
}

export function buildEmailReport(row){
 const payload=JSON.parse(row.payload_json),data=row.kind==='check'?detailsForCheck(payload):row.kind==='daily'?detailsForDaily(payload):detailsForSession(payload);
 const score=data.correct===null?'已完成':`${data.correct}/${data.total}（${data.total?Math.round(data.correct/data.total*100):0}%）`,name=clean(row.display_name)||'学生',subject=`[Word Check] ${name} ${data.label}：${score}`;
 const mistakes=data.mistakes.slice(0,100),plainMistakes=mistakes.length?'\n\n错题：\n'+mistakes.map((item,index)=>`${index+1}. ${clean(item.prompt)}\n   学生答案：${clean(item.answer)}\n   正确答案：${clean(item.expected)}`).join('\n'):'\n\n本次没有错题。';
 const text=`学生：${name}\n完成时间：${date(data.completedAt)}\n任务：${data.label}\n成绩：${score}\n详情：${data.summary}\n作业编号：${row.assignment_id}${plainMistakes}\n\n成绩由学生端提交，邮件仅用于及时通知；完整记录请以教师后台为准。`;
 const rows=mistakes.map((item,index)=>`<tr><td>${index+1}</td><td>${escape(item.prompt)}</td><td>${escape(item.answer)}</td><td>${escape(item.expected)}</td></tr>`).join('');
 const table=rows?`<h2 style="font-size:18px;margin:24px 0 8px">错题</h2><table style="border-collapse:collapse;width:100%"><thead><tr><th>#</th><th>题目</th><th>学生答案</th><th>正确答案</th></tr></thead><tbody>${rows}</tbody></table>`:'<p style="margin-top:24px;color:#176b3a"><strong>本次没有错题。</strong></p>';
 const html=`<!doctype html><html><body style="font-family:Arial,'Microsoft YaHei',sans-serif;color:#102044;line-height:1.55"><main style="max-width:720px;margin:auto"><h1 style="font-size:24px">学生已完成作业</h1><p><strong>学生：</strong>${escape(name)}<br><strong>完成时间：</strong>${escape(date(data.completedAt))}<br><strong>任务：</strong>${escape(data.label)}<br><strong>成绩：</strong>${escape(score)}<br><strong>详情：</strong>${escape(data.summary)}</p>${table}<p style="margin-top:24px;color:#5d6b89;font-size:13px">作业编号：${escape(row.assignment_id)}<br>成绩由学生端提交，邮件仅用于及时通知；完整记录请以教师后台为准。</p></main></body></html>`;
 return {subject,text,html};
}

async function loadRow(db,key){return db.prepare('SELECT r.student_id,r.kind,r.record_id,r.assignment_id,r.status,r.attempts,sr.payload_json,s.display_name FROM email_reports r JOIN student_records sr ON sr.student_id=r.student_id AND sr.kind=r.kind AND sr.record_id=r.record_id JOIN students s ON s.id=r.student_id WHERE r.student_id=? AND r.kind=? AND r.record_id=?').bind(key.studentId,key.kind,key.recordId).first()}

export async function deliverEmailReport(env,key,{fetcher=fetch}={}){
 const config=emailReportConfiguration(env);if(!config.configured)return {status:config.enabled?'misconfigured':'disabled'};
 const time=now(),lease=new Date(Date.now()+120000).toISOString();
 const claimed=await env.DB.prepare("UPDATE email_reports SET status='sending',attempts=attempts+1,lease_until=?,updated_at=? WHERE student_id=? AND kind=? AND record_id=? AND status!='sent' AND ((status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?))")
  .bind(lease,time,key.studentId,key.kind,key.recordId,time,time).run();
 if(changes(claimed)===0){const prior=await env.DB.prepare('SELECT status FROM email_reports WHERE student_id=? AND kind=? AND record_id=?').bind(key.studentId,key.kind,key.recordId).first();return {status:prior?.status||'missing'}}
 const row=await loadRow(env.DB,key);
 try{
  const report=buildEmailReport(row),idempotencyKey='word-check/'+await digest(`${row.student_id}/${row.kind}/${row.record_id}`);
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from:config.from,to:[config.to],subject:report.subject,text:report.text,html:report.html})});
  let result={};try{result=await response.json()}catch{}
  if(!response.ok||typeof result.id!=='string')throw Error(result.message||`Resend HTTP ${response.status}`);
  const sent=now();await env.DB.prepare("UPDATE email_reports SET status='sent',provider_id=?,last_error=NULL,lease_until=NULL,sent_at=?,updated_at=? WHERE student_id=? AND kind=? AND record_id=? AND status='sending'").bind(result.id,sent,sent,row.student_id,row.kind,row.record_id).run();
  return {status:'sent',providerId:result.id};
 }catch(error){
  const attempts=Number(row?.attempts||0)+1,delay=Math.min(360,Math.max(5,2**Math.min(attempts,8))),retryAt=new Date(Date.now()+delay*60000).toISOString(),message=clean(error?.message||error).slice(0,500);
  await env.DB.prepare("UPDATE email_reports SET status='pending',next_attempt_at=?,lease_until=NULL,last_error=?,updated_at=? WHERE student_id=? AND kind=? AND record_id=? AND status='sending'").bind(retryAt,message,now(),key.studentId,key.kind,key.recordId).run();
  console.error('Email report delivery failed',key.kind,key.recordId,message);
  return {status:'pending',error:message};
 }
}

export async function processPendingEmailReports(env,{fetcher=fetch,limit=10}={}){
 const config=emailReportConfiguration(env);if(!config.configured)return {processed:0,status:config.enabled?'misconfigured':'disabled'};
 const time=now(),rows=(await env.DB.prepare("SELECT student_id,kind,record_id FROM email_reports WHERE (status='pending' AND next_attempt_at<=?) OR (status='sending' AND lease_until<=?) ORDER BY next_attempt_at LIMIT ?").bind(time,time,limit).all()).results;
 const results=[];for(const row of rows)results.push(await deliverEmailReport(env,{studentId:row.student_id,kind:row.kind,recordId:row.record_id},{fetcher}));
 return {processed:results.length,sent:results.filter(result=>result.status==='sent').length};
}
