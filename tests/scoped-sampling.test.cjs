const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../core.js'),V=require('../vocabulary.js'),P=require('../preset-links.js');

const library=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/difficulty-100-120.v1.json'),'utf8'));
const words=V.toPracticeWords(library),level100=library.lists.find(list=>list.name==='难度 100');
const recipe={v:P.SCOPED_RANDOM_VERSION,l:library.id,lv:library.version,m:'full',r:level100.number,p:60,n:20,t:15,h:true};
const id60='lib:difficulty-100-120/word/43d1ec3e-12fc-4192-836f-1b9a00f6b069';
const id61='lib:difficulty-100-120/word/1cc1fe6b-3a3b-4883-87c2-b32c89e49c26';

test('Level 100 canonical prefix has a stable 60/61 boundary',()=>{
 assert.ok(level100.words.length>=60);assert.equal(level100.words[59].id,id60);assert.equal(level100.words[60].id,id61);
 const eligible=C.prefixPool(words,level100.number,60);assert.equal(eligible.length,60);assert.equal(eligible.at(-1).id,id60);assert.ok(!eligible.some(word=>word.id===id61));
 assert.deepEqual(C.prefixPool([...words].reverse(),level100.number,60),eligible,'canonical order must not depend on incoming array order');
});

test('scoped random samples 20 unique words only from the first 60',()=>{
 const eligibleIds=new Set(C.prefixPool(words,level100.number,60).map(word=>word.id));
 for(let run=0;run<20;run++){
  const pool=P.sampleScopedRandom(recipe,words,C);assert.equal(pool.length,20);assert.equal(new Set(pool.map(word=>word.id)).size,20);assert.ok(pool.every(word=>eligibleIds.has(word.id)));assert.ok(!pool.some(word=>word.id===id61));
 }
 assert.equal(P.sampleScopedRandom({...recipe,n:0},words,C).length,60);
});

test('v6 recipe round trips and re-samples inside the same prefix',async()=>{
 assert.deepEqual(await P.readToken(await P.createToken(recipe)),recipe);assert.ok((await P.createUrl(recipe,'https://example.test/word-check/')).length<500);
 let calls=0;const controlled={prefixPool:C.prefixPool,sampleMixed:(pool,n)=>{calls++;return calls===1?pool.slice(0,n):pool.slice(-n)}};
 const first=P.sampleScopedRandom(recipe,words,controlled),second=P.sampleScopedRandom(recipe,words,controlled);
 assert.notDeepEqual(first.map(word=>word.id),second.map(word=>word.id));assert.ok([...first,...second].every(word=>word.order<60));
});

test('a v3 fixed link preserves the sampled Word ID set',async()=>{
 const sampled=P.sampleScopedRandom(recipe,words,C),byId=new Map(words.map((word,index)=>[word.id,index]));
 const fixed={v:P.VERSION,l:library.id,lv:library.version,m:'full',w:sampled.map(word=>byId.get(word.id)),t:15,h:true};
 const first=await P.readToken(await P.createToken(fixed)),second=await P.readToken(await P.createToken(fixed));
 assert.deepEqual(first.w,second.w);assert.deepEqual(new Set(first.w.map(index=>words[index].id)),new Set(sampled.map(word=>word.id)));
});

test('v6 rejects invalid group, prefix and oversized question count',()=>{
 for(const invalid of [{...recipe,r:0},{...recipe,r:100},{...recipe,p:0},{...recipe,p:551},{...recipe,n:61},{...recipe,n:101}])assert.throws(()=>P.sampleScopedRandom(invalid,words,C));
 assert.throws(()=>P.validateScopedRandom({...recipe,p:1.5}));assert.throws(()=>P.validateScopedRandom({...recipe,h:1}));
});

test('legacy v4 DET scope remains the whole group, independent of prefix settings',()=>{
 const legacy={v:4,l:library.id,lv:library.version,m:'single',a:'total',r:[level100.number],n:20,t:0,h:true};
 let size=0;
 const pool=P.sampleRandom(legacy,words,{sampleMixed:(eligible,n)=>{size=eligible.length;return eligible.slice(-n)}});
 assert.equal(size,550);assert.ok(pool.every(word=>word.order>=60));assert.equal(pool.length,20);
});
