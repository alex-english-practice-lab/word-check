const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../preset-links.js'),L=require('../learn-core.js'),V=require('../vocabulary.js'),C=require('../core.js'),R=require('../practice-records.js');
const det=require('../data/difficulty-100-120.v1.json'),ielts=require('../data/ielts.v1.json'),core100=require('../data/writing-survival-100.v1.json');
const words=V.toPracticeWords(det),first=C.prefixPool(words,1,60);
const payload={v:P.LEARNING_VERSION,l:det.id,lv:det.version,name:'Level 100 今日 8 词',w:first.slice(0,8).map(w=>w.id),m:'single',f:true,t:20,h:true,u:'check'};
const identity='profile-a';
const learnAll=(s,p)=>{while(s.currentStage==='learn'){s=L.transition(s,p,'flip');s=L.transition(s,p,'next')}return s};

test('v7 stores ordered stable Word IDs compactly, timer and assistance; same link reopens same pack',async()=>{
 const url=await P.createUrl(payload,'https://example.test/word-check/');assert.ok(url.length<650,`Unexpected link length: ${url.length}`);
 const decoded=await P.readHash(new URL(url).hash);assert.deepEqual(decoded,payload);
 const raw=JSON.parse(Buffer.from(new URL(url).hash.split('=')[1].split('.')[0],'base64url'));assert.equal(raw.v,7);assert.equal(raw.f,1);assert.equal(raw.w.split('.').length,8);assert.ok(!raw.w.includes('c15e3072-'));
 const resolved=decoded.w.map(id=>words.find(w=>w.id===id));
 const pack=L.createTeacherPack({library:det,words:resolved,name:decoded.name,assignmentId:'fixed-token',settings:{mode:decoded.m,timeLimit:decoded.t,hintsAllowed:decoded.h,assistanceMode:decoded.u,includeFinalCheck:decoded.f}});
 assert.deepEqual(L.resolvePack(pack,det,words).map(w=>w.id),decoded.w);assert.equal(pack.source.type,'teacher');
 const attempt=R.createAttempt({library:det,identity:{profileId:identity,deviceId:'device',userId:null},questions:resolved.map(w=>({wordId:w.id,mode:'single'})),source:{type:'assignment',id:pack.id}});
 assert.equal(attempt.source.type,'assignment');assert.deepEqual(new Set(attempt.questions.map(q=>q.wordId)),new Set(pack.wordIds));
 let session=learnAll(L.createSession(pack,identity,[]),pack);assert.equal(session.seenIds.length,8);assert.equal(session.currentStage,'learn_complete');
 session=L.transition(session,pack,'review');while(session.currentStage==='review'){session=L.transition(session,pack,'flip');session=L.transition(session,pack,'know')}
 assert.equal(session.checkAttemptIds.length,0);assert.equal(session.pendingIds.length,0);session=L.transition(session,pack,'check');assert.equal(session.currentStage,'check');
 assert.deepEqual((await P.readHash(new URL(url).hash)).w,decoded.w);
});

test('DET first 60 random 8 fixed IDs stay within Level 100 and never include position 61',()=>{
 assert.ok(first.length===60);const picked=C.sampleMixed(first,8),allowed=new Set(first.map(w=>w.id));
 assert.equal(new Set(picked.map(w=>w.id)).size,8);assert.ok(picked.every(w=>allowed.has(w.id)&&w.list===1));
 assert.ok(!allowed.has(C.prefixPool(words,1,61)[60].id));
});

test('IELTS and Core100 whole-list teacher packs retain IDs and do not mutate vocabulary',async()=>{
 for(const library of [ielts,core100]){
  const canonical=V.toPracticeWords(library),list=library.lists[0],chosen=canonical.filter(w=>w.listId===list.id),input={...payload,l:library.id,lv:library.version,w:chosen.slice(0,8).map(w=>w.id),u:undefined};
  const result=await P.readToken(await P.createToken(input));assert.deepEqual(result.w,input.w);
  const pack=L.createTeacherPack({library,words:chosen.slice(0,8),name:'教师指定',assignmentId:'same',settings:{mode:'single',timeLimit:0,hintsAllowed:false,assistanceMode:'none',includeFinalCheck:true}});
  assert.deepEqual(L.resolvePack(pack,library,canonical).map(w=>w.id),input.w);assert.throws(()=>L.resolvePack(pack,{...library,version:'2.0.0'},canonical),/版本/);
 }
});

test('Learn + Review only can complete without formal score; Again stays pending',async()=>{
 const p=L.createTeacherPack({library:det,words:first.slice(0,2),name:'仅背词',assignmentId:'review-only',settings:{mode:'full',timeLimit:0,hintsAllowed:false,assistanceMode:'none',includeFinalCheck:false}});
 let s=learnAll(L.createSession(p,identity,[]),p);s=L.transition(s,p,'review');s=L.transition(s,p,'flip');s=L.transition(s,p,'again');s=L.transition(s,p,'flip');s=L.transition(s,p,'know');
 assert.equal(s.pendingIds.length,1);s=L.transition(s,p,'finish');assert.equal(s.status,'completed');assert.equal(s.checkAttemptIds.length,0);
 const decoded=await P.readToken(await P.createToken({...payload,w:p.wordIds,f:false,h:false,u:undefined}));assert.equal(decoded.f,false);
});

test('v7 rejects bad IDs, versions, sizes, settings and modified tokens; old versions remain readable',async()=>{
 for(const patch of [{w:[payload.w[0],payload.w[0]]},{w:['lib:other/word/a']},{w:[]},{w:[...payload.w,...Array(100).fill('bad')]},{lv:''},{t:601},{u:'check',h:false},{f:'true'}])await assert.rejects(()=>P.createToken({...payload,...patch}));
 const token=await P.createToken(payload);await assert.rejects(()=>P.readToken(token.slice(0,-2)+'no'),/修改|损坏/);
 const v3={v:3,l:det.id,lv:det.version,m:'single',w:[0,2],t:0,h:false};assert.equal((await P.readToken(await P.createToken(v3))).v,3);
 const v4={v:4,l:det.id,lv:det.version,m:'full',a:'total',r:[1],n:8,t:0,h:true};assert.equal((await P.readToken(await P.createToken(v4))).v,4);
 const v5={v:5,l:'practice:daily-v3',lv:'3',m:'recognition',a:'random',n:5};assert.equal((await P.readToken(await P.createToken(v5))).v,5);
 const v6={v:6,l:det.id,lv:det.version,m:'full',r:1,p:60,n:8,t:0,h:true};assert.equal((await P.readToken(await P.createToken(v6))).v,6);
});
