/* Learning facts and transitions. No DOM, storage or formal grading. */
(function(root){
'use strict';
const C=typeof module!=='undefined'?require('./core.js'):root.WordCore;
const copy=x=>JSON.parse(JSON.stringify(x));
const now=()=>new Date().toISOString(),uuid=()=>globalThis.crypto.randomUUID();
const text=x=>typeof x==='string'&&x.trim().length>0;
const unique=x=>Array.isArray(x)&&x.every(text)&&new Set(x).size===x.length;
function requireValue(ok,message){if(!ok)throw Error('学习记录：'+message)}
function validatePack(p){
 requireValue(p&&p.schemaVersion===1&&text(p.id)&&text(p.name)&&text(p.libraryId)&&text(p.libraryVersion),'学习包身份或版本无效');
 requireValue(unique(p.wordIds)&&p.wordIds.length>0&&p.wordIds.every(id=>id.startsWith(p.libraryId+'/word/')),'词条编号无效或重复');
 requireValue(unique(p.order)&&p.order.length===p.wordIds.length&&p.order.every(id=>p.wordIds.includes(id)),'学习顺序必须包含同一组词条');
 requireValue(p.source&&['user','teacher'].includes(p.source.type),'创建来源无效');
 requireValue(p.settings?.learnDirection==='en-zh'&&p.settings.reviewDirection==='zh-en','学习方向无效');
 const f=p.settings.finalCheck;
 requireValue(f&&f.type==='spelling'&&['full','single'].includes(f.mode)&&Number.isSafeInteger(f.timeLimit)&&f.timeLimit>=0&&f.timeLimit<=600&&typeof f.hintsAllowed==='boolean','正式检查设置无效');
 requireValue(p.settings.includeFinalCheck===undefined||typeof p.settings.includeFinalCheck==='boolean','是否包含正式检查的设置无效');
 requireValue(f.assistanceMode===undefined||['none','check','both'].includes(f.assistanceMode)&&f.hintsAllowed===(f.assistanceMode!=='none'),'提示权限设置无效');
 return p;
}
function createPack({library,words,name,profileId,settings={}}){
 const ids=words.map(w=>w.id);
 return validatePack({schemaVersion:1,id:uuid(),name:name||library.name+' · 学习包',libraryId:library.id,libraryVersion:library.version,wordIds:ids,order:[...ids],source:{type:'user',profileId},settings:{learnDirection:'en-zh',reviewDirection:'zh-en',finalCheck:{type:'spelling',mode:'single',timeLimit:settings.timeLimit??0,hintsAllowed:settings.hintsAllowed??false}}});
}
function createTeacherPack({library,words,name,assignmentId,settings}){
 requireValue(text(assignmentId),'缺少学习作业编号');
 const ids=words.map(w=>w.id);
 return validatePack({schemaVersion:1,id:'assignment:'+assignmentId,name,libraryId:library.id,libraryVersion:library.version,wordIds:ids,order:[...ids],source:{type:'teacher',assignmentId},settings:{learnDirection:'en-zh',reviewDirection:'zh-en',finalCheck:{type:'spelling',mode:settings.mode,timeLimit:settings.timeLimit,hintsAllowed:settings.hintsAllowed,...(settings.assistanceMode?{assistanceMode:settings.assistanceMode}:{})},includeFinalCheck:settings.includeFinalCheck}});
}
function resolvePack(pack,library,words){
 validatePack(pack);requireValue(library.id===pack.libraryId&&library.version===pack.libraryVersion,'词库版本已改变，请创建新学习包；旧进度仍保留');
 const byId=new Map(words.map(w=>[w.id,w]));const result=pack.order.map(id=>byId.get(id));
 requireValue(result.every(w=>w&&w.libraryId===pack.libraryId&&w.libraryVersion===pack.libraryVersion),'部分指定词条已不存在，不能替换为其他单词');
 return result;
}
function shuffled(ids,lastId){const result=C.shuffle(ids);if(result.length>1&&result[0]===lastId)result.push(result.shift());return result}
function createSession(pack,profileId,introducedIds=[]){
 validatePack(pack);requireValue(text(profileId),'缺少本地身份');
 const learnQueue=pack.order.filter(id=>!introducedIds.includes(id)),time=now();
 const s={schemaVersion:1,id:uuid(),packId:pack.id,profileId,startedAt:time,updatedAt:time,currentStage:learnQueue.length?'learn':'review',status:'in_progress',currentCardId:null,index:0,flipped:false,learnQueue,seenIds:[],exposures:[],reviewQueue:shuffled(pack.order),pendingIds:[...pack.order],reviews:[],round:1,lastReviewedId:null,checkAttemptIds:[]};
 syncCard(s);return validateSession(s,pack);
}
function syncCard(s){s.currentCardId=s.currentStage==='learn'?s.learnQueue[s.index]:s.currentStage==='review'?s.reviewQueue[s.index]:null;s.updatedAt=now();return s}
function validateSession(s,p){
 validatePack(p);requireValue(s&&s.schemaVersion===1&&text(s.id)&&s.packId===p.id&&text(s.profileId),'学习过程身份无效');
 requireValue(['learn','learn_complete','review','review_complete','check','completed'].includes(s.currentStage)&&['in_progress','completed'].includes(s.status),'阶段无效');
 requireValue(['startedAt','updatedAt'].every(k=>text(s[k])&&Number.isFinite(Date.parse(s[k])))&&typeof s.flipped==='boolean'&&Number.isSafeInteger(s.index)&&s.index>=0,'进度无效');
 for(const key of ['learnQueue','seenIds','reviewQueue','pendingIds'])requireValue(unique(s[key])&&s[key].every(id=>p.wordIds.includes(id)),'词条进度损坏');
 requireValue(s.seenIds.every(id=>s.learnQueue.includes(id))&&unique(s.checkAttemptIds),'首次学习或检查编号损坏');
 requireValue(Array.isArray(s.exposures)&&s.exposures.length===s.seenIds.length&&unique(s.exposures.map(e=>e.wordId))&&s.exposures.every(e=>s.seenIds.includes(e.wordId)&&Number.isFinite(Date.parse(e.learnedAt))),'首次翻卡事实损坏');
 requireValue(Number.isSafeInteger(s.round)&&s.round>0&&Array.isArray(s.reviews)&&unique(s.reviews.map(r=>r.id)),'复习记录损坏');
 requireValue(s.reviews.every(r=>r.sessionId===s.id&&p.wordIds.includes(r.wordId)&&r.direction==='zh-en'&&r.flipped===true&&['know','again'].includes(r.rating)&&Number.isFinite(Date.parse(r.reviewedAt))&&Number.isSafeInteger(r.round)&&r.round>0&&r.round<=s.round),'复习事实损坏');
 if(s.currentStage==='learn'||s.currentStage==='review'){
  const queue=s.currentStage==='learn'?s.learnQueue:s.reviewQueue;requireValue(s.index<queue.length&&s.currentCardId===queue[s.index],'当前卡片不匹配');
 }else requireValue(s.currentCardId===null,'阶段结束后不应仍有当前卡片');
 if(s.currentStage!=='learn')requireValue(s.seenIds.length===s.learnQueue.length,'尚未看完新词');
 requireValue(s.status==='completed'?s.currentStage==='completed':s.currentStage!=='completed','完成状态不匹配');
 return s;
}
function transition(session,pack,action){
 validateSession(session,pack);const s=copy(session),stage=s.currentStage;
 if(action==='flip'){
  requireValue(['learn','review'].includes(stage),'当前不能翻卡');s.flipped=!s.flipped;
  if(stage==='learn'&&s.flipped&&!s.seenIds.includes(s.currentCardId)){s.seenIds.push(s.currentCardId);s.exposures.push({wordId:s.currentCardId,learnedAt:now()})}
 }else if(action==='previous'){
  requireValue(stage==='learn'&&s.index>0,'没有上一张');s.index--;s.flipped=false;
 }else if(action==='next'){
  requireValue(stage==='learn'&&s.seenIds.includes(s.currentCardId),'请先翻卡查看释义');
  if(s.index===s.learnQueue.length-1){requireValue(s.seenIds.length===s.learnQueue.length,'请先看完全部新词');s.currentStage='learn_complete';s.index=0}else s.index++;
  s.flipped=false;
 }else if(action==='review'){
  requireValue(['learn_complete','review_complete','completed'].includes(stage),'当前不能开始复习');
  const ids=stage==='learn_complete'||stage==='completed'?pack.order:s.pendingIds;requireValue(ids.length>0,'本轮没有待复习词');
  if(stage!=='learn_complete')s.round++;
  s.reviewQueue=shuffled(ids,s.lastReviewedId);s.currentStage='review';s.status='in_progress';s.index=0;s.flipped=false;
 }else if(action==='know'||action==='again'){
  requireValue(stage==='review'&&s.flipped,'请先翻卡，再自评');
  const id=s.currentCardId;s.reviews.push({id:uuid(),sessionId:s.id,wordId:id,direction:'zh-en',flipped:true,rating:action,round:s.round,reviewedAt:now()});
  s.pendingIds=s.pendingIds.filter(x=>x!==id);if(action==='again')s.pendingIds.push(id);s.lastReviewedId=id;s.flipped=false;
  if(s.index===s.reviewQueue.length-1){s.currentStage='review_complete';s.index=0}else s.index++;
 }else if(action==='end-review'){
  requireValue(stage==='review','当前不在复习');
  // Unrated cards remain pending, including a voluntarily repeated completed pack.
  s.pendingIds=[...new Set([...s.pendingIds,...s.reviewQueue.slice(s.index)])];s.currentStage='review_complete';s.index=0;s.flipped=false;
 }else if(action==='check'){
  requireValue(['review_complete','completed'].includes(stage),'请先进入复习');s.currentStage='check';s.status='in_progress';s.index=0;s.flipped=false;
 }else if(action==='finish'){
  requireValue(stage==='review_complete'&&pack.settings.includeFinalCheck===false,'当前学习包尚未完成复习');s.currentStage='completed';s.status='completed';s.index=0;s.flipped=false;
 }else throw Error('未知学习操作');
 return validateSession(syncCard(s),pack);
}
// Self-ratings never create or alter a formal Attempt/Answer.
function studyStates(bundles,checks,libraryId,libraryVersion){
 const states=new Map();
 for(const {pack,session} of bundles){if(pack.libraryId!==libraryId||pack.libraryVersion!==libraryVersion)continue;
  for(const e of session.exposures)if(!states.has(e.wordId))states.set(e.wordId,{status:'learning',needsReview:true});
  for(const r of session.reviews){const prev=states.get(r.wordId);if(!prev?.reviewedAt||r.reviewedAt>=prev.reviewedAt)states.set(r.wordId,{status:'reviewing',needsReview:r.rating==='again',reviewedAt:r.reviewedAt})}
 }
 for(const {attempt,answers} of checks){if(attempt.libraryId!==libraryId||attempt.libraryVersion!==libraryVersion||attempt.status!=='completed')continue;
  for(const a of answers){const prev=states.get(a.wordId)||{};states.set(a.wordId,{...prev,status:'checked'})}
 }
 return states;
}
const api={validatePack,createPack,createTeacherPack,resolvePack,createSession,validateSession,transition,studyStates};
if(typeof module!=='undefined')module.exports=api;else root.WordLearnCore=api;
})(typeof window!=='undefined'?window:globalThis);
