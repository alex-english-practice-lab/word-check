/* Derived local progress. History remains in Learn and Daily practice stores. */
(function(root){
'use strict';
const DAY=86400000,INTERVALS=[1,4,8];
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const nextDay=(at,days)=>new Date(Date.parse(at)+days*DAY).toISOString();
function derive({sessions=[],checks=[],daily={attempts:[]},profileId,now=new Date().toISOString()}={}){
 const events=[],seen=new Set(),states=new Map();
 function add(e){if(!e.id||seen.has(e.id)||!e.wordId||!iso(e.at)||!e.mode)return;seen.add(e.id);events.push(e)}
 for(const {pack,session} of sessions){if(session.profileId!==profileId)continue;
  for(const e of session.exposures)add({id:'exposure:'+session.id+':'+e.wordId,wordId:e.wordId,libraryId:pack.libraryId,libraryVersion:pack.libraryVersion,mode:'flashcard',kind:'exposure',at:e.learnedAt});
  for(const r of session.reviews)add({id:'review:'+r.id,wordId:r.wordId,libraryId:pack.libraryId,libraryVersion:pack.libraryVersion,mode:'flashcard',kind:r.rating,at:r.reviewedAt});
 }
 for(const {attempt,answers} of checks){if(attempt.identity.profileId!==profileId)continue;
  for(const a of answers)add({id:'answer:'+a.id,wordId:a.wordId,libraryId:attempt.libraryId,libraryVersion:attempt.libraryVersion,mode:a.mode,kind:a.result.outcome==='correct'?'independent':a.result.isCorrect?'assisted':'wrong',at:a.answeredAt,objective:true});
 }
 for(const attempt of daily.attempts||[]){
  if(!attempt||!Array.isArray(attempt.answers)||typeof attempt.id!=='string'||!['daily-common-v3','synonym-core-v3'].includes(attempt.library_id))continue;
  for(const a of attempt.answers){if(!a||typeof a.question_id!=='string'||!['recognition_single','synonym_multi'].includes(a.question_type)||typeof a.correct!=='boolean')continue;
   add({id:'daily:'+attempt.id+':'+a.question_type+':'+a.question_id,wordId:a.word_id,libraryId:attempt.library_id,libraryVersion:'3',mode:a.question_type,kind:a.correct?'independent':'wrong',at:a.completed_at,objective:true})}
 }
 events.sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
 for(const e of events){
  const key=JSON.stringify([e.libraryId,e.wordId,e.mode]);let s=states.get(key);
  if(!s){s={libraryId:e.libraryId,libraryVersion:e.libraryVersion,wordId:e.wordId,mode:e.mode,status:'unseen',exposures:0,reviews:0,checks:0,wrong:0,independent:0,assisted:0,lastAt:null,lastResult:null,dueAt:null,step:0};states.set(key,s)}
  s.lastAt=e.at;s.lastResult=e.kind;
  if(e.kind==='exposure'){s.exposures++;s.status='learning';s.dueAt=nextDay(e.at,1)}
  else if(e.kind==='know'){s.reviews++;s.status='reviewing';s.step=Math.min(INTERVALS.length,s.step+1);s.dueAt=nextDay(e.at,INTERVALS[s.step-1])}
  else if(e.kind==='again'){s.reviews++;s.status='needs_review';s.step=0;s.dueAt=e.at}
  else if(e.objective){s.checks++;if(e.kind==='wrong'){s.wrong++;s.step=0;s.status='needs_review';s.dueAt=e.at}
   else if(e.kind==='independent'){s.independent++;s.step=Math.min(INTERVALS.length,s.step+1);s.status='checked';s.dueAt=nextDay(e.at,INTERVALS[s.step-1])}
   else{s.assisted++;s.status='checked';s.dueAt=nextDay(e.at,1)}
  }
 }
 const rows=[...states.values()],byWord=new Map();
 for(const row of rows){const key=JSON.stringify([row.libraryId,row.wordId]);let word=byWord.get(key);
  if(!word){word={libraryId:row.libraryId,wordId:row.wordId,libraryVersion:row.libraryVersion,modes:[],lastAt:null,seen:false,checked:false,needsPractice:false,due:false,frequent:false};byWord.set(key,word)}
  word.modes.push(row);word.seen ||= row.exposures>0||row.reviews>0||row.checks>0;word.checked ||= row.checks>0;
  word.needsPractice ||= row.lastResult==='again'||row.lastResult==='wrong';word.due ||= !!row.dueAt&&row.dueAt<=now;word.frequent ||= row.wrong>=2;
  if(!word.lastAt||row.lastAt>word.lastAt)word.lastAt=row.lastAt;
 }
 const words=[...byWord.values()],lastAt=words.map(w=>w.lastAt).sort().at(-1)||null;
 return {modes:rows,words,summary:{seen:words.filter(w=>w.seen).length,checked:words.filter(w=>w.checked).length,due:words.filter(w=>w.due).length,needsPractice:words.filter(w=>w.needsPractice).length,frequent:words.filter(w=>w.frequent).length,lastAt},events:events.length};
}
const api={derive,INTERVALS};if(typeof module!=='undefined')module.exports=api;else root.WordVocabularyProgress=api;
})(typeof window!=='undefined'?window:globalThis);
