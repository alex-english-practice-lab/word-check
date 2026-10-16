const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../preset-links.js'),C=require('../core.js');
const recipe={v:4,l:'lib:ielts',lv:'1.0.0',m:'single',a:'total',r:[1,2],n:5,t:20,h:false};
const words=Array.from({length:40},(_,i)=>({id:'w'+i,list:i<20?1:2}));
test('random recipe round trips with no fixed words',async()=>{
 const token=await P.createToken(recipe);assert.deepEqual(await P.readToken(token),recipe);
 assert.ok(!('w' in await P.readToken(token)));
 const fixed=await P.createUrl({v:3,l:recipe.l,lv:recipe.lv,m:'full',w:Array.from({length:50},(_,i)=>i*70),t:20,h:false},'https://example.test/word-check/');
 const random=await P.createUrl({...recipe,n:50},'https://example.test/word-check/');
 assert.ok(random.length<fixed.length);
});
test('random selection respects per-list quotas and no duplicates',()=>{
 const p={...recipe,a:'per-list',c:[2,3]};delete p.n;
 const pool=P.sampleRandom(p,words,C);assert.equal(pool.length,5);
 assert.equal(pool.filter(w=>w.list===1).length,2);assert.equal(new Set(pool.map(w=>w.id)).size,5);
 assert.equal(P.sampleRandom({...recipe,n:0},words,C).length,40);
});
test('invalid, missing, oversized and empty recipes fail closed',()=>{
 for(const p of [{...recipe,r:[1,1]},{...recipe,r:[]},{...recipe,n:-1},{...recipe,n:101},{...recipe,t:601},{...recipe,h:1},{...recipe,a:'other'},{...recipe,a:'per-list',c:[0,0]}])assert.throws(()=>P.validateRandom(p));
 assert.throws(()=>P.sampleRandom({...recipe,r:[3]},words,C));
 assert.throws(()=>P.sampleRandom({...recipe,n:50},words,C));
 assert.throws(()=>P.sampleRandom({...recipe,n:0},Array.from({length:101},(_,id)=>({id,list:1})),C));
});
test('separate opens invoke the sampler again',()=>{
 let calls=0;const core={sampleMixed:(pool,n)=>{calls++;return calls===1?pool.slice(0,n):pool.slice(-n)}};
 const first=P.sampleRandom(recipe,words,core),second=P.sampleRandom(recipe,words,core);
 assert.notDeepEqual(first,second);assert.equal(calls,2);
});
