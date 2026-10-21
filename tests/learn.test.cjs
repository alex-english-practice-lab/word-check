const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../learn-core.js'),S=require('../learn-store.js'),R=require('../practice-records.js'),V=require('../vocabulary.js');
const library=require('../data/difficulty-100-120.v1.json'),words=V.toPracticeWords(library).slice(0,3);
const pack=()=>L.createPack({library,words,profileId:'guest'});
const step=(s,p,a)=>L.transition(s,p,a);
function learnAll(s,p){while(s.currentStage==='learn'){s=step(s,p,'flip');s=step(s,p,'next')}return s}
function memoryStorage(){const map=new Map();return{getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),key:i=>[...map.keys()][i],get length(){return map.size}}}

test('learning packs preserve exact stable IDs and never reorder canonical vocabulary',()=>{
 const before=JSON.stringify(library),p=pack();assert.deepEqual(p.order,words.map(w=>w.id));assert.deepEqual(L.resolvePack(p,library,V.toPracticeWords(library)).map(w=>w.id),p.wordIds);assert.equal(JSON.stringify(library),before);
 assert.throws(()=>L.validatePack({...p,wordIds:[p.wordIds[0],p.wordIds[0]]}));
 assert.throws(()=>L.resolvePack({...p,libraryVersion:'old'},library,words));assert.throws(()=>L.resolvePack(p,library,words.slice(1)));
});
test('every unseen card must be flipped; backward navigation cannot skip unseen cards',()=>{
 const p=pack();let s=L.createSession(p,'guest');assert.throws(()=>step(s,p,'next'));assert.throws(()=>step(s,p,'review'));assert.throws(()=>step(s,p,'check'));
 s=step(s,p,'flip');s=step(s,p,'flip');assert.equal(s.seenIds.length,1);s=step(s,p,'next');s=step(s,p,'previous');s=step(s,p,'next');assert.throws(()=>step(s,p,'next'));
 s=learnAll(s,p);assert.equal(s.currentStage,'learn_complete');assert.equal(s.exposures.length,3);assert.equal(s.reviews.length,0);assert.equal(s.checkAttemptIds.length,0);
});
test('old words start with recall; mixed packs introduce only unseen stable IDs',()=>{
 const p=pack();assert.equal(L.createSession(p,'guest',p.wordIds).currentStage,'review');
 const s=L.createSession(p,'guest',[p.wordIds[0]]);assert.deepEqual(s.learnQueue,p.order.slice(1));assert.equal(s.reviewQueue.length,3);
});
test('review requires a flip; Again recurs next round and does not immediately repeat',()=>{
 const p=pack();let s=step(learnAll(L.createSession(p,'guest'),p),p,'review');assert.throws(()=>step(s,p,'know'));
 const ids=[...s.reviewQueue];for(let i=0;i<3;i++){s=step(s,p,'flip');s=step(s,p,i===0?'know':'again')}
 assert.equal(s.currentStage,'review_complete');assert.equal(s.pendingIds.length,2);assert.equal(s.reviews.length,3);
 s=step(s,p,'review');assert.equal(s.reviewQueue.length,2);assert.notEqual(s.currentCardId,ids[2]);assert.ok(!s.reviewQueue.includes(ids[0]));
 s=step(s,p,'end-review');assert.equal(s.pendingIds.length,2);s=step(s,p,'check');assert.equal(s.currentStage,'check');assert.equal(s.status,'in_progress');
});
test('one-word Again waits at round summary; repeated review can end without an infinite loop',()=>{
 const p=L.createPack({library,words:words.slice(0,1),profileId:'guest'});let s=L.createSession(p,'guest',p.wordIds);
 for(let i=0;i<5;i++){s=step(s,p,'flip');s=step(s,p,'again');assert.equal(s.currentStage,'review_complete');s=step(s,p,'review')}
 s=step(s,p,'end-review');assert.equal(s.pendingIds.length,1);assert.equal(s.reviews.length,5);
});
test('session roundtrip restores current card, exposure facts and pending words; corruption fails validation',()=>{
 const p=pack();let s=L.createSession(p,'guest');s=step(s,p,'flip');s=step(s,p,'next');
 const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(L.validateSession(restored,p),s);assert.throws(()=>step(restored,p,'next'));
 assert.throws(()=>L.validateSession({...s,currentStage:'review_complete',currentCardId:null},p));assert.throws(()=>L.validateSession({...s,currentCardId:'unknown'},p));
});
test('Know is not a correct answer: objective Check can be 1/3 after all three Know ratings',()=>{
 const p=pack();let s=L.createSession(p,'guest',p.wordIds);while(s.currentStage==='review'){s=step(s,p,'flip');s=step(s,p,'know')}
 assert.equal(s.pendingIds.length,0);const states=L.studyStates([{pack:p,session:s}],[],library.id,library.version);assert.ok([...states.values()].every(x=>x.status==='reviewing'));assert.equal(s.checkAttemptIds.length,0);
 const attempt=R.createAttempt({library,identity:{profileId:'guest',deviceId:'device',userId:null},questions:words.map(w=>({wordId:w.id,mode:'single'}))});
 const answers=attempt.questions.map((q,i)=>R.createAnswer({attempt,questionId:q.id,text:i===0?q.snapshot.text:'incorrect'}));
 assert.equal(answers.filter(a=>a.result.outcome==='correct').length,1);const closed=R.closeAttempt(attempt,answers);
 assert.ok([...L.studyStates([{pack:p,session:s}],[{attempt:closed,answers}],library.id,library.version).values()].every(x=>x.status==='checked'));
 assert.ok([...L.studyStates([{pack:p,session:s}],[{attempt:R.closeAttempt(attempt,answers.slice(0,1),{status:'abandoned'}),answers:answers.slice(0,1)}],library.id,library.version).values()].every(x=>x.status==='reviewing'));
});
test('storage denial, quota errors, malformed and unknown-schema records allow new learning',()=>{
 const storage=memoryStorage(),repo=S.createRepository(()=>storage),p=pack(),s=L.createSession(p,repo.identity.profileId);repo.saveSession({pack:p,session:s});assert.deepEqual(S.createRepository(()=>storage).loadActive().session,s);
 const unavailable=S.createRepository(()=>{throw Error('denied')});const b={pack:p,session:L.createSession(p,unavailable.identity.profileId)};assert.equal(unavailable.saveSession(b),false);assert.ok(unavailable.warning);assert.deepEqual(unavailable.loadActive(),b);
 storage.setItem(S.PREFIX+'session.'+s.id,'{bad');assert.equal(repo.loadActive(),null);assert.ok(repo.warning);repo.saveSession({pack:p,session:s});
 storage.setItem(S.PREFIX+'session.'+s.id,JSON.stringify({pack:p,session:{...s,schemaVersion:99}}));assert.equal(repo.loadActive(),null);repo.saveSession({pack:p,session:s});
 storage.setItem=()=>{throw Error('quota')};const next={pack:p,session:step(s,p,'flip')};assert.equal(repo.saveSession(next),false);assert.deepEqual(repo.loadActive(),next);
});

test('corrupt identity regenerates a usable guest profile; study states stay version and ID scoped',()=>{
 const storage=memoryStorage();storage.setItem(S.PREFIX+'identity',JSON.stringify({profileId:'',deviceId:'',userId:'unexpected'}));const repo=S.createRepository(()=>storage);assert.ok(repo.identity.profileId);assert.equal(repo.identity.userId,null);
 const p=pack(),s=learnAll(L.createSession(p,repo.identity.profileId),p),bundles=[{pack:p,session:s}];assert.equal(L.studyStates(bundles,[],library.id,library.version).size,3);
 assert.equal(L.studyStates(bundles,[],'lib:other',library.version).size,0);assert.equal(L.studyStates(bundles,[],library.id,'updated').size,0);
});
