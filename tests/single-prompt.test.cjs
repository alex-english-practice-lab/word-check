const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),R=require('../practice-records.js'),P=require('../preset-links.js');
const library=require('./fixtures/second-library.json'),word=library.lists[0].words[0];
const identity={profileId:'guest:test',deviceId:'device:test',userId:null};
test('one selected sense, POS and one initial are a single materialized prompt; the cue is not assistance',()=>{
 const multi=structuredClone(library);multi.lists[0].words[0].senses=['皇帝','君主'];const target=multi.lists[0].words[0];
 const p=C.spellingPrompt(target,'single',1),attempt=R.createAttempt({library:multi,identity,questions:[{wordId:target.id,mode:'single',prompt:p}]});
 assert.equal(p.meaning,target.senses[1]);assert.equal(p.pos,target.pos);assert.equal(p.initial,'e');assert.equal(p.initialShown,true);assert.equal(p.phonetic,'');
 assert.deepEqual(attempt.questions[0].prompt,p);
 const response=(options={})=>R.createAnswer({attempt,questionId:attempt.questions[0].id,text:'emperor',...options});
 const independent=response();assert.equal(independent.result.outcome,'correct');assert.equal(independent.response.hintCount,0);
 assert.equal(response({spellingChecks:1}).result.outcome,'checked');assert.equal(response({hintCount:1,spellingChecks:1}).result.outcome,'letter_assisted');
 assert.equal(R.createAnswer({attempt,questionId:attempt.questions[0].id,text:'',skipped:true}).result.outcome,'wrong');
 const changed=structuredClone(attempt);changed.questions[0].prompt.initial='x';assert.throws(()=>R.validateAttempt(changed),/prompt\/mode/);
});
test('no cue shows POS; legacy and one-letter targets reveal no whole answer',()=>{
 assert.deepEqual(C.spellingPrompt(word,'single',0,{showFirstLetter:false}),{meaning:word.senses[0],phonetic:'',pos:word.pos,format:'single-cue-v1',initialShown:false,initial:''});
 assert.deepEqual(C.spellingPrompt(word,'single',0,{legacy:true}),{meaning:word.senses[0],phonetic:'',pos:''});
 const phrase=C.spellingPrompt({word:'turn over',senses:['翻转'],pos:'v.',phonetic:''},'single');assert.equal(phrase.initial,'t');assert.ok(!JSON.stringify(phrase).includes('turn over'));
 const short=C.spellingPrompt({word:'a',senses:['一个'],pos:'art.',phonetic:''},'single');assert.equal(short.initialShown,false);assert.equal(short.initial,'');
 assert.equal(C.spellingPrompt(word,'full').initialShown,undefined);
});
test('fixed, random, scoped and learning links preserve explicit on/off while old links stay missing',async()=>{
 const common={l:'lib:ielts',lv:'1.0.0',m:'single',t:10,h:false};
 const variants=[{v:3,w:[2,4]},{v:4,a:'total',r:[1],n:2},{v:6,r:1,p:60,n:2},{v:7,w:[word.id],name:'今日词汇',f:true,l:library.id,lv:library.version}];
 for(const variant of variants){const source={...common,...variant};for(const i of [true,false]){const roundtrip=await P.readToken(await P.createToken({...source,i}));assert.equal(roundtrip.i,i,`v${variant.v}`)}
  const legacy=await P.readToken(await P.createToken(source));assert.equal(legacy.i,undefined,`old v${variant.v}`);
  await assert.rejects(()=>P.createToken({...source,i:'true'}),/设置|完整/);
 }
 await assert.rejects(()=>P.createToken({...common,v:3,w:[1],m:'full',i:true}),/设置/);
});
