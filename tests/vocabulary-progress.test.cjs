const test=require('node:test'),assert=require('node:assert/strict');
const G=require('../vocabulary-progress.js'),L=require('../learn-core.js'),R=require('../practice-records.js'),V=require('../vocabulary.js'),D=require('../practice-core.js'),S=require('../learn-store.js');
const library=require('../data/difficulty-100-120.v1.json'),words=V.toPracticeWords(library).slice(0,2),identity={profileId:'local-1',deviceId:'device-1',userId:null};
const T='2026-10-22T10:00:00.000Z';
function storage(){const data=new Map();return{getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),key:i=>[...data.keys()][i],get length(){return data.size},data}}
function facts(){
 const pack=L.createPack({library,words,profileId:identity.profileId});const session=L.createSession(pack,identity.profileId);
 session.exposures=[{wordId:words[0].id,learnedAt:T}];session.seenIds=[words[0].id];session.reviews=[{id:'rating-1',sessionId:session.id,wordId:words[0].id,direction:'zh-en',flipped:true,rating:'know',round:1,reviewedAt:T}];
 return {pack,session};
}
test('Know is self assessment; objective spelling is mode-specific and repeated facts dedupe',()=>{
 const learning=facts(),attempt=R.createAttempt({library,identity,questions:[{wordId:words[0].id,mode:'single'},{wordId:words[0].id,mode:'full'},{wordId:words[1].id,mode:'single'}],startedAt:T});
 const answers=attempt.questions.map((q,i)=>R.createAnswer({attempt,questionId:q.id,text:i===0?q.snapshot.text:'wrong',answeredAt:'2026-10-22T11:00:00.000Z'}));
 const closed=R.closeAttempt(attempt,answers,{completedAt:'2026-10-22T12:00:00.000Z'});
 const input={sessions:[learning,learning],checks:[{attempt:closed,answers:[...answers,...answers]}],profileId:identity.profileId,now:'2026-10-23T13:00:00.000Z'};
 const result=G.derive(input);assert.equal(result.events,5);assert.equal(result.summary.seen,2);assert.equal(result.summary.checked,2);assert.equal(result.summary.frequent,0);
 const a=result.words.find(w=>w.wordId===words[0].id);assert.equal(a.modes.length,3);assert.equal(a.modes.find(m=>m.mode==='flashcard').checks,0);assert.equal(a.modes.find(m=>m.mode==='full').wrong,1);assert.equal(a.modes.find(m=>m.mode==='single').independent,1);
});
test('day 1, day 4, day 8 spacing; Again and wrong due immediately; assisted not independent',()=>{
 const learning=facts();learning.session.reviews.push({id:'rating-2',sessionId:learning.session.id,wordId:words[0].id,direction:'zh-en',flipped:true,rating:'know',round:2,reviewedAt:'2026-10-23T10:00:00.000Z'});
 let result=G.derive({sessions:[learning],profileId:identity.profileId,now:'2026-10-24T10:00:00.000Z'});let f=result.modes[0];assert.equal(f.dueAt,'2026-10-27T10:00:00.000Z');assert.equal(result.summary.due,0);
 learning.session.reviews.push({id:'rating-3',sessionId:learning.session.id,wordId:words[0].id,direction:'zh-en',flipped:true,rating:'know',round:3,reviewedAt:'2026-10-27T10:00:00.000Z'});
 result=G.derive({sessions:[learning],profileId:identity.profileId,now:'2026-10-28T10:00:00.000Z'});assert.equal(result.modes[0].dueAt,'2026-11-04T10:00:00.000Z');
 learning.session.reviews.push({id:'rating-4',sessionId:learning.session.id,wordId:words[0].id,direction:'zh-en',flipped:true,rating:'again',round:4,reviewedAt:'2026-10-28T10:00:00.000Z'});
 result=G.derive({sessions:[learning],profileId:identity.profileId,now:'2026-10-28T10:00:00.000Z'});assert.equal(result.summary.due,1);assert.equal(result.summary.needsPractice,1);
 const attempt=R.createAttempt({library,identity,questions:[{wordId:words[1].id,mode:'single'}],startedAt:T});
 const answer=R.createAnswer({attempt,questionId:attempt.questions[0].id,text:words[1].word,spellingChecks:1,answeredAt:'2026-10-22T11:00:00.000Z'});
 result=G.derive({checks:[{attempt,answers:[answer]}],profileId:identity.profileId,now:'2026-10-23T11:00:00.000Z'});assert.equal(result.modes[0].assisted,1);assert.equal(result.modes[0].independent,0);assert.equal(result.summary.checked,1);
});
test('Daily Recognition and Synonym keep answer snapshots and distinct modes; IDs never merge by spelling',()=>{
 const daily={attempts:[{id:'v3a',library_id:'daily-common-v3',answers:[{question_id:'q1',question_type:'recognition_single',word_id:'w1',correct:false,completed_at:T,selected_option_ids:['wrong'],correct_option_ids:['right']}]},{id:'v3b',library_id:'synonym-core-v3',answers:[{question_id:'q2',question_type:'synonym_multi',word_id:'w1',correct:true,completed_at:T,selected_option_ids:['right'],correct_option_ids:['right']}]}]};
 const result=G.derive({daily,profileId:identity.profileId,now:T});assert.equal(result.summary.checked,2);assert.equal(result.summary.due,1);assert.equal(result.modes[0].wrong,1);assert.notEqual(result.words[0].libraryId,result.words[1].libraryId);
 assert.deepEqual(G.derive({daily:{attempts:[daily.attempts[0],daily.attempts[0]]},profileId:identity.profileId,now:T}).summary.checked,1);
});
test('a stable Word ID retains history across library revisions without merging other library IDs',()=>{
 const old=facts(),newer=facts();newer.pack={...newer.pack,libraryVersion:'2.0.0'};newer.session.id='another-session';newer.session.exposures=[{wordId:words[0].id,learnedAt:'2026-10-23T10:00:00.000Z'}];newer.session.reviews=[];
 const result=G.derive({sessions:[old,newer],profileId:identity.profileId,now:'2026-10-23T10:00:00.000Z'});
 assert.equal(result.words.length,1);assert.equal(result.modes.find(m=>m.mode==='flashcard').exposures,2);
});
test('Daily keeps all future facts, rejects corrupted store without overwriting and idempotently saves attempts',()=>{
 const s=storage();for(let i=0;i<102;i++)assert.equal(D.saveAttempt(s,{id:'attempt-'+i,answers:[]}),true);
 assert.equal(D.readStore(s).attempts.length,102);assert.equal(D.saveAttempt(s,{id:'attempt-0',answers:[]}),true);assert.equal(D.saveAttempt(s,{id:'attempt-0',answers:[{correct:false}]}),false);assert.equal(D.readStore(s).attempts.length,102);
 s.setItem(D.KEY,'{bad');assert.match(D.readStoreDetailed(s).warning,/损坏/);assert.equal(D.saveAttempt(s,{id:'new',answers:[]}),false);assert.equal(s.getItem(D.KEY),'{bad');
});
test('saved check history survives refresh; invalid records are skipped with visible warning',()=>{
 const s=storage(),repo=S.createRepository(()=>s),attempt=R.createAttempt({library,identity:repo.identity,questions:[{wordId:words[0].id,mode:'full'}],startedAt:T});
 const answer=R.createAnswer({attempt,questionId:attempt.questions[0].id,text:'wrong',answeredAt:'2026-10-22T11:00:00.000Z'});
 assert.equal(repo.saveCheck({attempt,answers:[answer]}),true);const reloaded=S.createRepository(()=>s);assert.equal(reloaded.checks().length,1);assert.equal(G.derive({checks:reloaded.checks(),profileId:repo.identity.profileId,now:T}).summary.checked,1);
 s.setItem(S.PREFIX+'check.'+attempt.id,'{broken');assert.equal(reloaded.checks().length,0);assert.match(reloaded.warning,/损坏/);
});
