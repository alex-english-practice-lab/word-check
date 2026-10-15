const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../preset-links.js');
const input={v:1,l:'lib:ielts',lv:'1.0.0',m:'full',s:'List 1–2 · 10 题',w:['lib:ielts/word/a','lib:ielts/word/b']};

test('preset token preserves the exact word set and assignment settings',async()=>{
 const token=await P.createToken(input),decoded=await P.readToken(token);
 assert.deepEqual(decoded,input);assert.ok(!token.includes('List 1'));
});

test('preset token rejects edits, duplicates and malformed relationships',async()=>{
 const token=await P.createToken(input),last=token.at(-1)==='A'?'B':'A';
 await assert.rejects(()=>P.readToken(token.slice(0,-1)+last),/修改/);
 await assert.rejects(()=>P.createToken({...input,w:[input.w[0],input.w[0]]}),/编号/);
 await assert.rejects(()=>P.createToken({...input,w:['lib:other/word/a']}),/编号/);
 await assert.rejects(()=>P.createToken({...input,w:Array.from({length:101},(_,i)=>'lib:ielts/word/'+i)}),/100 题/);
});

test('preset URL uses a fragment and discards unrelated query parameters',async()=>{
 const url=new URL(await P.createUrl(input,'https://example.test/word-check/?debug=1'));
 assert.equal(url.search,'');assert.match(url.hash,/^#preset=/);assert.deepEqual(await P.readHash(url.hash),input);
});
