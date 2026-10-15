(function(root){
'use strict';
// Pure Phase 1 data logic. No storage, network, DOM, or automatic UI recording.
const C=typeof module!=='undefined'?require('./core.js'):root.WordCore;
const V=typeof module!=='undefined'?require('./vocabulary.js'):root.WordVocabulary;
const copy=value=>JSON.parse(JSON.stringify(value));
const uuid=()=>globalThis.crypto.randomUUID();
const modes=['full','single'];
function check(ok,message){if(!ok)throw Error('Practice v1: '+message)}
function text(value){return typeof value==='string'&&value.trim().length>0}
function time(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value}
function stable(value){return JSON.stringify(canonical(value))}
const compare=(a,b)=>a<b?-1:a>b?1:0;
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value}
function validateAttempt(a){
 check(a&&a.schemaVersion===1&&text(a.id),'invalid attempt identity/schema');
 check(a.identity&&text(a.identity.profileId)&&text(a.identity.deviceId)&&(a.identity.userId===null||text(a.identity.userId)),'invalid identity');
 check(text(a.libraryId)&&text(a.libraryVersion),'library/version required');
 check(Array.isArray(a.listIds)&&a.listIds.length>0&&new Set(a.listIds).size===a.listIds.length&&a.listIds.every(x=>text(x)&&x.startsWith(a.libraryId+'/list/')),'invalid list IDs');
 check(['full','single','mixed'].includes(a.mode)&&['in_progress','completed','abandoned'].includes(a.status),'invalid mode/status');
 check(time(a.startedAt)&&(a.completedAt===null||time(a.completedAt)),'invalid time');
 check(a.status==='in_progress'?a.completedAt===null:a.completedAt!==null&&a.completedAt>=a.startedAt,'invalid lifecycle');
 check(a.source&&['free','preset','assignment'].includes(a.source.type),'invalid practice source');
 check(a.source.type==='free'?a.source.id===null:text(a.source.id),'source reference required');
 check(a.parentAttemptId===null||text(a.parentAttemptId),'invalid retry reference');
 check(Array.isArray(a.questions)&&a.questions.length>0&&a.questionCount===a.questions.length,'questionCount must be actual materialized count');
 const seen=new Set();
 for(const q of a.questions){
  check(text(q.id)&&!seen.has(q.id),'duplicate/missing question ID');seen.add(q.id);
  check(text(q.wordId)&&q.wordId.startsWith(a.libraryId+'/word/')&&a.listIds.includes(q.listId),'question relationship mismatch');
  check(Number.isSafeInteger(q.wordRevision)&&q.wordRevision>=1&&modes.includes(q.mode),'invalid question revision/mode');
  const s=q.snapshot;
  check(s&&text(s.text)&&typeof s.phonetic==='string'&&typeof s.pos==='string'&&Array.isArray(s.senses)&&s.senses.length>0&&s.senses.every(text),'word snapshot required');
  check(Array.isArray(s.acceptedAnswers)&&s.acceptedAnswers.includes(s.text)&&s.acceptedAnswers.every(text),'answer snapshot required');
  check(q.prompt&&typeof q.prompt.meaning==='string'&&typeof q.prompt.phonetic==='string'&&typeof q.prompt.pos==='string','prompt snapshot required');
  check(q.mode==='full'?(q.prompt.meaning===s.senses.join('；')&&q.prompt.phonetic===s.phonetic&&q.prompt.pos===s.pos):(s.senses.includes(q.prompt.meaning)&&q.prompt.phonetic===''&&q.prompt.pos===''),'prompt/mode mismatch');
 }
 const actualMode=new Set(a.questions.map(q=>q.mode)).size===1?a.questions[0].mode:'mixed';
 check(a.mode===actualMode,'attempt mode does not match questions');
 return a;
}
function createAttempt({library,identity,questions,listIds,source={type:'free',id:null},parentAttemptId=null,id=uuid(),startedAt=new Date().toISOString(),idFactory=uuid}){
 V.validate(library);const words=new Map(library.lists.flatMap(l=>l.words.map(w=>[w.id,w])));
 check(Array.isArray(questions)&&questions.length>0,'questions required');
 const materialized=questions.map(request=>{
  const w=words.get(request.wordId);check(w,'unknown word');check(modes.includes(request.mode),'unknown mode');
  const senseIndex=request.senseIndex??0;
  check(Number.isInteger(senseIndex)&&senseIndex>=0&&senseIndex<w.senses.length,'invalid sense index');
  return {id:idFactory(),wordId:w.id,listId:w.listId,wordRevision:w.revision,mode:request.mode,
   snapshot:{text:w.text,phonetic:w.phonetic,pos:w.pos,senses:[...w.senses],acceptedAnswers:[...w.acceptedAnswers]},
   prompt:{meaning:request.mode==='single'?w.senses[senseIndex]:w.senses.join('；'),phonetic:request.mode==='full'?w.phonetic:'',pos:request.mode==='full'?w.pos:''}};
 });
 const selected=listIds||[...new Set(materialized.map(q=>q.listId))];
 check(selected.every(id=>library.lists.some(l=>l.id===id)),'unknown selected list');
 return validateAttempt({schemaVersion:1,id,identity:copy(identity),libraryId:library.id,libraryVersion:library.version,listIds:[...selected],mode:new Set(materialized.map(q=>q.mode)).size===1?materialized[0].mode:'mixed',questionCount:materialized.length,startedAt,completedAt:null,status:'in_progress',source:copy(source),parentAttemptId,questions:materialized});
}
function grading(question,response){
 const normalizedAnswer=C.normalize(response.text),acceptedAnswers=question.snapshot.acceptedAnswers.map(C.normalize);
 const isCorrect=!response.skipped&&acceptedAnswers.includes(normalizedAnswer);
 return {isCorrect,outcome:isCorrect?(response.hintCount?'assisted':'correct'):'wrong',grading:{algorithm:'legacy-spelling-v1',normalizedAnswer,acceptedAnswers}};
}
function validateAnswer(answer,attempt){
 validateAttempt(attempt);
 check(answer&&answer.schemaVersion===1&&text(answer.id)&&answer.attemptId===attempt.id,'answer identity mismatch');
 const q=attempt.questions.find(q=>q.id===answer.questionId);check(q,'unknown question');
 check(answer.wordId===q.wordId&&answer.mode===q.mode,'answer word/mode mismatch');
 const r=answer.response;
 check(r&&typeof r.text==='string'&&typeof r.skipped==='boolean'&&Number.isSafeInteger(r.hintCount)&&r.hintCount>=0,'invalid response');
 check(r.skipped||r.text.trim().length>0,'empty answer must be explicitly skipped');
 check(time(answer.answeredAt)&&answer.answeredAt>=attempt.startedAt&&(attempt.completedAt===null||answer.answeredAt<=attempt.completedAt),'answer outside attempt time');
 check(answer.durationMs===null||Number.isSafeInteger(answer.durationMs)&&answer.durationMs>=0,'invalid answer duration');
 check(stable(answer.result)===stable(grading(q,r)),'grading trace mismatch');
 return answer;
}
function createAnswer({attempt,questionId,text='',skipped=false,hintCount=0,answeredAt=new Date().toISOString(),durationMs=null}){
 validateAttempt(attempt);check(attempt.status==='in_progress','attempt already closed');
 const q=attempt.questions.find(q=>q.id===questionId);check(q,'unknown question');
 const response={text,skipped,hintCount};
 return validateAnswer({schemaVersion:1,id:attempt.id+'/answer/'+q.id,attemptId:attempt.id,questionId:q.id,wordId:q.wordId,mode:q.mode,response,result:grading(q,response),answeredAt,durationMs},attempt);
}
function mergeAnswers(...batches){
 const ids=new Map(),slots=new Map();
 for(const answer of batches.flat()){
  check(answer&&text(answer.id)&&text(answer.attemptId)&&text(answer.questionId),'invalid answer identity');
  const slot=stable([answer.attemptId,answer.questionId]);
  check(!slots.has(slot)||slots.get(slot)===answer.id,'conflicting answer for same question');slots.set(slot,answer.id);
  check(!ids.has(answer.id)||stable(ids.get(answer.id))===stable(answer),'conflicting answer payload; never last-write-wins');ids.set(answer.id,copy(answer));
 }
 return [...ids.values()].sort((a,b)=>compare(a.answeredAt,b.answeredAt)||compare(a.id,b.id));
}
function mergeAttempts(...batches){
 const map=new Map();
 for(const candidate of batches.flat()){
  validateAttempt(candidate);const previous=map.get(candidate.id);
  if(previous){
   const base=a=>({...a,status:null,completedAt:null});
   check(stable(base(previous))===stable(base(candidate)),'conflicting attempt definition');
   if(previous.status!=='in_progress'&&candidate.status!=='in_progress')check(stable(previous)===stable(candidate),'conflicting terminal attempt');
   if(previous.status!=='in_progress')continue;
  }
  map.set(candidate.id,copy(candidate));
 }
 return [...map.values()].sort((a,b)=>compare(a.id,b.id));
}
function closeAttempt(attempt,answers,{status='completed',completedAt=new Date().toISOString()}={}){
 validateAttempt(attempt);check(attempt.status==='in_progress','attempt already closed');
 check(['completed','abandoned'].includes(status),'terminal state required');
 const closed=validateAttempt({...copy(attempt),status,completedAt});
 const facts=mergeAnswers(answers);facts.forEach(a=>validateAnswer(a,closed));
 check(status!=='completed'||facts.length===attempt.questionCount,'completed attempt requires every answer');
 return closed;
}
function deriveProgress(attempts,answers){
 const byAttempt=new Map(mergeAttempts(attempts).map(a=>[a.id,a])),facts=mergeAnswers(answers),progress=new Map(),counts=new Map();
 for(const answer of facts){
  const attempt=byAttempt.get(answer.attemptId);check(attempt,'orphan answer');validateAnswer(answer,attempt);
  counts.set(attempt.id,(counts.get(attempt.id)||0)+1);
  const key=stable([attempt.identity.profileId,answer.wordId,answer.mode]);
  let state=progress.get(key);
  if(!state){state={schemaVersion:1,profileId:attempt.identity.profileId,wordId:answer.wordId,libraryId:attempt.libraryId,mode:answer.mode,practiceCount:0,wrongCount:0,assistedCount:0,independentCorrectCount:0,lastAnsweredAt:null,lastAnswerId:null,lastResult:null,review:{status:'unseen',dueAt:null,algorithm:null}};progress.set(key,state)}
  state.practiceCount++;state.wrongCount+=answer.result.isCorrect?0:1;state.assistedCount+=answer.result.outcome==='assisted'?1:0;state.independentCorrectCount+=answer.result.outcome==='correct'?1:0;
  state.lastAnsweredAt=answer.answeredAt;state.lastAnswerId=answer.id;state.lastResult=copy(answer.result);
  state.review.status=answer.result.outcome==='correct'?'ready':'needs_review';
 }
 for(const attempt of byAttempt.values())check(attempt.status!=='completed'||counts.get(attempt.id)===attempt.questionCount,'completed attempt missing answer facts');
 return [...progress.entries()].sort(([a],[b])=>compare(a,b)).map(([,value])=>value);
}
const api={createAttempt,validateAttempt,createAnswer,validateAnswer,mergeAnswers,mergeAttempts,closeAttempt,deriveProgress};
if(typeof module!=='undefined')module.exports=api;else root.WordPracticeRecords=api;
})(typeof window!=='undefined'?window:globalThis);
