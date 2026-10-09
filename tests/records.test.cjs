const {test}=require('node:test'),assert=require('node:assert/strict');
const R=require('../practice-records'),library=require('./fixtures/second-library.json');
const word=library.lists[0].words[0],identity={profileId:'guest:example',userId:null,deviceId:'device:a'};
const startedAt='2026-10-09T10:00:00.000Z',answeredAt='2026-10-09T10:00:01.000Z',completedAt='2026-10-09T10:00:02.000Z';
const attempt=(extra={})=>R.createAttempt({library,identity,startedAt,questions:[{wordId:word.id,mode:'full'},{wordId:word.id,mode:'full'},{wordId:word.id,mode:'single'}],...extra});
const answer=(a,i,text,extra={})=>R.createAnswer({attempt:a,questionId:a.questions[i].id,text,answeredAt,...extra});
test('D: correct, wrong, assisted, repeated words and separate modes are traceable',()=>{
 const a=attempt(),facts=[answer(a,0,' EMPEROR '),answer(a,1,'wrong'),answer(a,2,'emperor',{hintCount:1})];
 assert.equal(a.mode,'mixed');assert.equal(a.questionCount,3);assert.equal(a.completedAt,null);
 assert.equal(new Set(facts.map(f=>f.id)).size,3);
 const closed=R.closeAttempt(a,facts,{completedAt}),states=R.deriveProgress([closed],facts);
 const full=states.find(s=>s.mode==='full'),single=states.find(s=>s.mode==='single');
 assert.equal(full.practiceCount,2);assert.equal(full.wrongCount,1);assert.equal(full.independentCorrectCount,1);
 assert.equal(single.practiceCount,1);assert.equal(single.wrongCount,0);assert.equal(single.assistedCount,1);assert.equal(single.review.status,'needs_review');
 assert.equal(closed.status,'completed');assert.equal(a.status,'in_progress');
 assert.equal(facts[0].result.grading.normalizedAnswer,'emperor');
});
test('repeat attempts and multi-device uploads deduplicate without merging distinct practice',()=>{
 const a=attempt(),first=answer(a,0,'wrong');
 const b=attempt({identity:{...identity,deviceId:'device:b'},parentAttemptId:a.id}),second=answer(b,0,'emperor');
 assert.equal(R.mergeAnswers([first,second],[first]).length,2);
 const progress=R.deriveProgress([a,b,a],[first,second,first]);assert.equal(progress[0].practiceCount,2);
 assert.deepEqual(R.deriveProgress([b,a],[second,first]),progress);
 const conflict=structuredClone(first);conflict.response.text='changed';assert.throws(()=>R.mergeAnswers([first,conflict]),/conflicting/);
 conflict.id='different-id';assert.throws(()=>R.mergeAnswers([first,conflict]),/same question/);
});
test('partial, zero-answer, explicit skip, invalid timing and repeated terminal submission',()=>{
 const a=attempt(),skip=answer(a,0,'',{skipped:true});assert.equal(skip.result.isCorrect,false);
 assert.throws(()=>answer(a,0,''),/empty/);assert.throws(()=>R.closeAttempt(a,[skip],{completedAt}),/every answer/);
 const closed=R.closeAttempt(a,[skip],{status:'abandoned',completedAt});assert.equal(R.deriveProgress([closed],[skip])[0].wrongCount,1);
 const empty=R.closeAttempt(a,[],{status:'abandoned',completedAt});assert.deepEqual(R.deriveProgress([empty],[]),[]);
 assert.throws(()=>answer(a,0,'emperor',{answeredAt:'2026-10-09T09:00:00.000Z'}),/time/);
 assert.throws(()=>answer(closed,0,'emperor'),/closed/);assert.throws(()=>R.closeAttempt(closed,[skip],{completedAt}),/closed/);
 assert.deepEqual(R.mergeAttempts([a,closed],[a,closed]),[closed]);
 assert.deepEqual(R.mergeAttempts([closed],[a]),[closed]);
 assert.throws(()=>R.mergeAttempts([closed,{...closed,completedAt:'2026-10-09T10:00:03.000Z'}]),/terminal/);
});
test('library edits cannot rewrite historical prompts or grading; corrupt snapshots/answers rejected',()=>{
 const a=attempt(),correct=answer(a,0,'emperor'),updated=structuredClone(library);
 updated.version='2.0.0';updated.lists[0].words[0].text='changed';
 assert.equal(a.questions[0].snapshot.text,'emperor');assert.equal(a.libraryVersion,'1.0.0');
 assert.equal(R.validateAnswer(correct,a).result.isCorrect,true);
 const tampered=structuredClone(correct);tampered.result.isCorrect=false;assert.throws(()=>R.validateAnswer(tampered,a),/grading/);
 assert.throws(()=>R.deriveProgress([], [correct]),/orphan/);
 assert.throws(()=>R.validateAttempt({...a,questionCount:999}),/count/i);
 assert.throws(()=>R.validateAttempt({...a,listIds:[]}),/list/);
 const broken=structuredClone(a);broken.questions[1].id=broken.questions[0].id;assert.throws(()=>R.validateAttempt(broken),/duplicate/);
});
test('source references, independent profiles and immutable complete-history requirements',()=>{
 const a=attempt({source:{type:'assignment',id:'assignment:future'}}),b=attempt({identity:{...identity,profileId:'guest:other'}});
 assert.equal(R.deriveProgress([a,b],[answer(a,0,'emperor'),answer(b,0,'wrong')]).length,2);
 assert.throws(()=>attempt({source:{type:'preset',id:null}}),/reference/);
 const facts=a.questions.map((q,i)=>answer(a,i,'emperor')),closed=R.closeAttempt(a,facts,{completedAt});
 assert.throws(()=>R.deriveProgress([closed],facts.slice(1)),/missing/);
 assert.deepEqual(R.mergeAnswers(facts,facts),R.mergeAnswers(facts));
});
test('historical progress survives a new library revision of the same word ID',()=>{
 const a=attempt(),first=answer(a,0,'wrong'),updated=structuredClone(library);
 updated.version='1.0.1';updated.lists[0].words[0].revision=2;updated.lists[0].words[0].senses=['君主'];
 const b=attempt({library:updated}),second=answer(b,0,'emperor',{answeredAt:'2026-10-09T10:00:02.000Z'});
 const state=R.deriveProgress([a,b],[first,second])[0];
 assert.equal(state.practiceCount,2);assert.equal(state.wrongCount,1);assert.equal(state.review.status,'ready');
 assert.equal(a.questions[0].snapshot.senses[0],'皇帝');assert.equal(b.questions[0].snapshot.senses[0],'君主');
 assert.equal(a.questions[0].wordRevision,1);assert.equal(b.questions[0].wordRevision,2);
});
