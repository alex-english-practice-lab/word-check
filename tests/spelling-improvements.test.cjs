const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const C=require('../core.js'),P=require('../preset-links.js'),V=require('../vocabulary.js');
const library=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/difficulty-100-120.v1.json'),'utf8'));
const words=V.toPracticeWords(library),level100=library.lists.find(list=>list.name.includes('100'));
test('spelling location reveals only prefix length, not an expected letter',()=>{
 assert.deepEqual(C.spellingPosition('environment','enviroment'),{prefix:6,expectedLength:11,actualLength:10,matched:false});
 assert.equal(C.spellingPosition('environment','environment').matched,true);
 assert.equal(C.spellingPosition('do not','do  not').matched,true);
});
test('letter hints cap at half of alphabetic characters and never show the last letter',()=>{
 for(const entry of ['a','ab','abc','a-b c','environment','ice cream']){
  const count=[...entry].filter(c=>/[a-z]/i.test(c)).length,hint=C.letterHint(entry,999);
  assert.equal(hint.max,Math.min(Math.floor(count/2),Math.max(0,count-1)));
  assert.equal((hint.text.match(/_/g)||[]).length,count-hint.max);
 }
 assert.equal(C.letterHint('a',1).max,0);
 assert.equal(C.letterHint('a-b c',99).text,'a - _   _');
});
test('DET Learn prefix 60 produces eight unique stable IDs and never includes position 61',()=>{
 assert.ok(level100&&level100.words.length>=61);
 const prefix=C.prefixPool(words,level100.number,60),excluded=C.prefixPool(words,level100.number,61)[60];
 assert.equal(prefix[59].id,level100.words[59].id);assert.equal(excluded.id,level100.words[60].id);
 for(let round=0;round<10;round++){
  const picked=C.sampleMixed(prefix,8);assert.equal(picked.length,8);assert.equal(new Set(picked.map(w=>w.id)).size,8);
  assert.ok(picked.every(w=>w.list===level100.number&&prefix.some(p=>p.id===w.id)&&w.id!==excluded.id));
 }
 assert.throws(()=>C.prefixPool(words,level100.number,0),/正整数/);
 assert.throws(()=>C.prefixPool(words,level100.number,level100.words.length+1),/不能超过/);
});
test('new check-only setting round-trips in fixed, random and scoped links; old bool remains',async()=>{
 const base={l:library.id,lv:library.version,m:'single',t:5,h:true},fixed={...base,v:3,w:[0,1,2]},random={...base,v:4,a:'total',r:[level100.number],n:8},scoped={...base,v:6,r:level100.number,p:60,n:8};
 for(const payload of [fixed,random,scoped]){
  assert.equal((await P.readToken(await P.createToken({...payload,u:'check'}))).u,'check');
  const old=await P.readToken(await P.createToken(payload));assert.equal(old.h,true);assert.equal(old.u,undefined);
  assert.throws(()=>P.validate({...payload,u:'invalid'}),/设置/);
 }
});
