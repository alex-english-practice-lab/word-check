/* Local learning persistence; separate keys for self-ratings and objective checks. */
(function(root){
'use strict';
const L=typeof module!=='undefined'?require('./learn-core.js'):root.WordLearnCore;
const R=typeof module!=='undefined'?require('./practice-records.js'):root.WordPracticeRecords;
const PREFIX='word-check.learn.v1.';
function createRepository(getStorage){
 const memory=new Map(),dirty=new Set();let warning='';
 const fail=()=>{warning='本浏览器无法保存学习记录；本页可继续，关闭或刷新后进度可能丢失。'};
 function read(key){if(dirty.has(key))return memory.get(key)??null;try{const value=getStorage().getItem(PREFIX+key);if(value!==null)memory.set(key,value);return value??memory.get(key)??null}catch{fail();return memory.get(key)??null}}
 function write(key,value){memory.set(key,value);try{getStorage().setItem(PREFIX+key,value);dirty.delete(key);return true}catch{dirty.add(key);fail();return false}}
 function parse(key){const raw=read(key);if(raw===null)return null;try{return JSON.parse(raw)}catch{warning='部分本地学习记录已损坏，无法恢复；可以开始新学习包。';return null}}
 let identity=parse('identity');
 if(!identity||typeof identity.profileId!=='string'||!identity.profileId.trim()||typeof identity.deviceId!=='string'||!identity.deviceId.trim()||identity.userId!==null){
  identity={profileId:globalThis.crypto.randomUUID(),deviceId:globalThis.crypto.randomUUID(),userId:null};write('identity',JSON.stringify(identity));
 }
 function validBundle(bundle){L.validateSession(bundle.session,bundle.pack);if(bundle.session.profileId!==identity.profileId)throw Error('本地身份不匹配');return bundle}
 function loadSession(id){const b=parse('session.'+id);if(!b)return null;try{return validBundle(b)}catch{warning='部分本地学习记录已损坏，无法恢复；可以开始新学习包。';return null}}
 function saveSession(bundle){validBundle(bundle);const saved=write('session.'+bundle.session.id,JSON.stringify(bundle));write('active',JSON.stringify(bundle.session.id));return saved}
 function loadActive(){const id=parse('active');return typeof id==='string'?loadSession(id):null}
 function keys(part){const result=new Set([...memory.keys()].filter(k=>k.startsWith(part)));try{const s=getStorage();for(let i=0;i<s.length;i++){const k=s.key(i);if(k?.startsWith(PREFIX+part))result.add(k.slice(PREFIX.length))}}catch{fail()}return [...result]}
 function sessions(){return keys('session.').map(k=>loadSession(k.slice(8))).filter(Boolean)}
 function validCheck(bundle){R.validateAttempt(bundle.attempt);if(bundle.attempt.identity.profileId!==identity.profileId)throw Error('本地身份不匹配');const answers=R.mergeAnswers(bundle.answers);answers.forEach(a=>R.validateAnswer(a,bundle.attempt));if(bundle.attempt.status==='completed'&&answers.length!==bundle.attempt.questionCount)throw Error('检查记录不完整');return bundle}
 function saveCheck(bundle){validCheck(bundle);return write('check.'+bundle.attempt.id,JSON.stringify(bundle))}
 function checks(){return keys('check.').map(k=>{try{const b=parse(k);return b?validCheck(b):null}catch{warning='部分检查记录已损坏，未计入学习状态。';return null}}).filter(Boolean)}
 return {identity,loadActive,loadSession,saveSession,sessions,saveCheck,checks,get warning(){return warning}};
}
const api={PREFIX,createRepository};if(typeof module!=='undefined')module.exports=api;else root.WordLearnStore=api;
})(typeof window!=='undefined'?window:globalThis);
