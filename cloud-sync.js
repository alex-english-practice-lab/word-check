/* PR15-B: scoped local records are the retry queue; server facts are per Student UUID. */
(function(root){
'use strict';
if(document.body.dataset.teacher==='true')return;
const identity=()=>root.WordStudentIdentity,storage=()=>identity()?.storage;
const PREFIX='word-check.learn.v1.',DAILY=root.WordCheckPracticeCore;
let chain=Promise.resolve(),scheduled=null,lastError='',synced=false,panels=[];
function attach(){panels=['learnSetup','learnSummary','results','v3Results'].map(id=>document.getElementById(id)).filter(Boolean);for(const panel of panels){if(panel.querySelector('[data-cloud-status]'))continue;const note=document.createElement('p'),retry=document.createElement('button');note.className='small';note.setAttribute('role','status');note.dataset.cloudStatus='';retry.type='button';retry.className='text-button';retry.textContent='重试提交';retry.hidden=true;retry.onclick=()=>queue();panel.append(note,retry)}}
attach();document.addEventListener('DOMContentLoaded',attach);
function paint(message='',failed=false){for(const panel of panels){const note=panel.querySelector('[data-cloud-status]'),retry=note?.nextElementSibling;if(note)note.textContent=message;if(retry)retry.hidden=!failed}}
async function request(method,path,payload){const ctrl=identity();if(ctrl?.mode!=='named'||!ctrl.token)throw Error('学生身份尚未验证，记录仍在本机。');
 const response=await root.fetch(ctrl.apiBase+path,{method,headers:{Authorization:'Bearer '+ctrl.token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
 let data;try{data=await response.json()}catch{throw Error('服务端响应无效')}
 if(!response.ok)throw Error(data.error||'提交失败 (HTTP '+response.status+')');return data;
}
function readLocal(){
 const s=storage(),records=[];
 for(let i=0;i<s.length;i++){const key=s.key(i);if(!key?.startsWith(PREFIX+'session.')&&!key?.startsWith(PREFIX+'check.'))continue;
  try{const b=JSON.parse(s.getItem(key)),kind=key.startsWith(PREFIX+'session.')?'session':'check';
   if(kind==='session'){root.WordLearnCore.validateSession(b.session,b.pack);if(b.session.profileId!==identity().current.id)continue;records.push({kind,id:b.session.id,payload:b,assignmentId:b.assignmentId||null})}
   else{root.WordPracticeRecords.validateAttempt(b.attempt);if(b.attempt.status==='in_progress'||b.attempt.identity.userId!==identity().current.id)continue;b.answers.forEach(a=>root.WordPracticeRecords.validateAnswer(a,b.attempt));records.push({kind,id:b.attempt.id,payload:b,assignmentId:b.assignmentId||null})}
  }catch{}
 }
 const daily=DAILY.readStoreDetailed(s);if(daily.warning)throw Error(daily.warning);
 for(const attempt of daily.store.attempts)records.push({kind:'daily',id:attempt.id,payload:attempt,assignmentId:attempt.assignmentId||null});
 return records;
}
async function remoteRecords(){let after=0,result=[];for(let pages=0;pages<100;pages++){
 const data=await request('GET','/api/student/records?after='+after),rows=data.records;if(!Array.isArray(rows))throw Error('云端记录列表无效');result.push(...rows);
 if(data.nextCursor===null)return result;if(!Number.isSafeInteger(data.nextCursor)||data.nextCursor<=after)throw Error('云端分页位置无效');after=data.nextCursor;
 }throw Error('云端记录超过当前分页上限，请联系老师');}
function hydrate(rows){const s=storage();for(const row of rows){
  if(row.kind==='session'){
   const key=PREFIX+'session.'+row.id,raw=s.getItem(key);let local=null;try{local=JSON.parse(raw)}catch{}
   root.WordLearnCore.validateSession(row.payload.session,row.payload.pack);
   if(row.payload.session.profileId!==identity().current.id)continue;
   if(!local||row.payload.session.updatedAt>local.session?.updatedAt){s.setItem(key,JSON.stringify(row.payload));if(!s.getItem(PREFIX+'active')&&row.payload.session.status==='in_progress')s.setItem(PREFIX+'active',JSON.stringify(row.id))}
  }else if(row.kind==='check'){
   const key=PREFIX+'check.'+row.id;if(s.getItem(key)!==null)continue;
   root.WordPracticeRecords.validateAttempt(row.payload.attempt);if(row.payload.attempt.identity.userId!==identity().current.id)continue;
   row.payload.answers.forEach(a=>root.WordPracticeRecords.validateAnswer(a,row.payload.attempt));s.setItem(key,JSON.stringify(row.payload));
  }else if(row.kind==='daily'){
   const local=DAILY.readStoreDetailed(s);if(local.warning)throw Error(local.warning);
   const prior=local.store.attempts.find(a=>a.id===row.id);
   if(prior){if(JSON.stringify(canonical(prior))!==JSON.stringify(canonical(row.payload)))throw Error('相同选择题编号有不同记录；请先导出本机备份');continue}
   if(!DAILY.saveAttempt(s,row.payload))throw Error('选择题历史无法合并；请先导出本机备份');
  }
 }}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value}
async function perform(){const ctrl=identity();if(ctrl?.mode!=='named')return {status:'guest'};
 if(ctrl.ready)await ctrl.ready;if(root.WordAssignedReady)await root.WordAssignedReady;
 if(!ctrl.token)throw Error('学生身份尚未验证；学习记录只保存在本机');
 const rows=await remoteRecords();hydrate(rows);
 for(const record of readLocal())await request('POST','/api/student/records',record);
 lastError='';synced=true;paint('已同步到学生云端记录。');return {status:'synced'};
}
function queue(){if(scheduled)return scheduled;if(identity()?.mode==='named')paint('正在提交云端记录…');
 scheduled=new Promise(resolve=>root.setTimeout(resolve,250)).then(()=>{scheduled=null;chain=chain.catch(()=>{}).then(perform).catch(error=>{lastError=error.message;synced=false;paint('尚未提交到云端：'+lastError+'。本机记录保留，联网后可重试。',true);return {status:'pending',error:lastError}});return chain});return scheduled}
const ready=new Promise(resolve=>root.setTimeout(resolve,0)).then(()=>queue());
root.addEventListener('online',()=>queue());
root.WordCloudSync={ready,queue,get lastError(){return lastError},get synced(){return synced}};
})(window);
