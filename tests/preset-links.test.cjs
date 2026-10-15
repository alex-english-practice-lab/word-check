const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../preset-links.js');
const input={v:3,l:'lib:ielts',lv:'1.0.0',m:'full',w:[3150,8,100],t:20,h:false};
const decodedInput={...input,w:[8,100,3150]};

test('preset token preserves the exact word set and assignment settings',async()=>{
 const token=await P.createToken(input),decoded=await P.readToken(token);
 assert.deepEqual(decoded,decodedInput);
 const raw=JSON.parse(Buffer.from(token.split('.')[0],'base64url').toString());
 assert.equal(raw.q,'8.2k.2cq');assert.equal(raw.x,input.lv);assert.equal(raw.m,0);assert.ok(!('w' in raw));assert.ok(!('s' in raw));
});

test('preset token rejects edits, duplicates and malformed relationships',async()=>{
 const token=await P.createToken(input),last=token.at(-1)==='A'?'B':'A';
 await assert.rejects(()=>P.readToken(token.slice(0,-1)+last),/修改/);
 await assert.rejects(()=>P.createToken({...input,w:[8,8]}),/编号/);
 await assert.rejects(()=>P.createToken({...input,w:[-1]}),/编号/);
 await assert.rejects(()=>P.createToken({...input,w:[1.5]}),/编号/);
 await assert.rejects(()=>P.createToken({...input,w:Array.from({length:101},(_,i)=>i)}),/100 题/);
 await assert.rejects(()=>P.createToken({...input,t:601}),/答题设置/);
 await assert.rejects(()=>P.createToken({...input,h:'false'}),/答题设置/);
});

test('version 1 and 2 links remain readable',async()=>{
 const base={l:input.l,lv:input.lv,m:input.m,s:'List 1–2 · 10 题',w:['lib:ielts/word/a','lib:ielts/word/b']};
 const v1={v:1,...base},v2={v:2,...base,t:20,h:false};
 assert.deepEqual(await P.readToken(await P.createToken(v1)),v1);
 assert.deepEqual(await P.readToken(await P.createToken(v2)),v2);
});

test('preset URL uses a fragment and discards unrelated query parameters',async()=>{
 const url=new URL(await P.createUrl(input,'https://example.test/word-check/?debug=1'));
 assert.equal(url.search,'');assert.match(url.hash,/^#preset=/);assert.deepEqual(await P.readHash(url.hash),decodedInput);
});

test('a typical 50-word classroom link stays under 500 characters',async()=>{
 const indexes=Array.from({length:50},(_,i)=>(i*71+357)%3610);
 const url=await P.createUrl({...input,w:indexes},'https://alex-english-practice-lab.github.io/word-check-preview/');
 assert.ok(url.length<500,`expected compact URL, received ${url.length} characters`);
 assert.deepEqual((await P.readHash(new URL(url).hash)).w,[...indexes].sort((a,b)=>a-b));
});
