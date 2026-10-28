(function(root){
'use strict';
const VERSION=3;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const nonempty=value=>typeof value==='string'&&value.length>0;
function encodeBytes(bytes){
 let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeBytes(text){
 if(!/^[A-Za-z0-9_-]+$/.test(text))throw Error('作业链接编码无效。');
 const base64=text.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-text.length%4)%4),binary=atob(base64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;
}
async function fingerprint(text){
 if(!root.crypto?.subtle)throw Error('当前浏览器不支持生成或验证作业链接。');
 return encodeBytes(new Uint8Array(await root.crypto.subtle.digest('SHA-256',encoder.encode(text))));
}
function validateLegacy(input){
 if(!input||![1,2].includes(input.v)||!nonempty(input.l)||!nonempty(input.lv)||!['full','single'].includes(input.m)||!nonempty(input.s)||!Array.isArray(input.w)||!input.w.length)throw Error('作业链接内容不完整。');
 if(input.s.length>500||input.w.length>100)throw Error('学生链接最多支持 100 题，请减少题量。');
 const ids=new Set();for(const id of input.w){if(!nonempty(id)||!id.startsWith(input.l+'/word/')||ids.has(id))throw Error('作业链接中的单词编号无效。');ids.add(id)}
 const payload={v:input.v,l:input.l,lv:input.lv,m:input.m,s:input.s,w:[...input.w]};
 if(input.v===2){if(!Number.isSafeInteger(input.t)||input.t<0||input.t>600||typeof input.h!=='boolean')throw Error('作业链接中的答题设置无效。');payload.t=input.t;payload.h=input.h}
 return payload;
}
function settings(input){if(!Number.isSafeInteger(input.t)||input.t<0||input.t>600||typeof input.h!=='boolean'||input.u!==undefined&&(input.u!=='check'||!input.h)||input.i!==undefined&&(input.m!=='single'||typeof input.i!=='boolean'))throw Error('作业链接中的答题设置无效。');return{t:input.t,h:input.h,...(input.u?{u:input.u}:{}),...(input.i!==undefined?{i:input.i}:{})}}
function compact(input){
 if(!input||input.v!==VERSION||!nonempty(input.l)||!nonempty(input.lv)||!['full','single'].includes(input.m)||!Array.isArray(input.w)||!input.w.length)throw Error('作业链接内容不完整。');
 if(input.w.length>100)throw Error('学生链接最多支持 100 题，请减少题量。');
 const indexes=[...input.w].sort((a,b)=>a-b),seen=new Set();for(const index of indexes){if(!Number.isSafeInteger(index)||index<0||seen.has(index))throw Error('作业链接中的单词编号无效。');seen.add(index)}
 let previous=0;const q=indexes.map((index,i)=>{const value=i?index-previous:index;previous=index;return value.toString(36)}).join('.'),answer=settings(input);
 return{v:VERSION,l:input.l,x:input.lv,m:input.m==='full'?0:1,q,t:answer.t,h:answer.h?1:0,...(answer.u?{u:answer.u}:{}),...(answer.i!==undefined?{i:answer.i?1:0}:{})};
}
function expand(input){
 if(!input||input.v!==VERSION||!nonempty(input.l)||!nonempty(input.x)||![0,1].includes(input.m)||!nonempty(input.q)||!Number.isSafeInteger(input.t)||input.t<0||input.t>600||![0,1].includes(input.h)||input.u!==undefined&&(input.u!=='check'||!input.h)||input.i!==undefined&&(input.m!==1||![0,1].includes(input.i)))throw Error('作业链接内容不完整。');
 const parts=input.q.split('.');if(!parts.length||parts.length>100)throw Error('学生链接最多支持 100 题，请减少题量。');
 let current=0;const indexes=parts.map((part,i)=>{if(!/^(?:0|[1-9a-z][0-9a-z]*)$/.test(part))throw Error('作业链接中的单词编号无效。');const value=parseInt(part,36);if(!Number.isSafeInteger(value)||(i&&value<1))throw Error('作业链接中的单词编号无效。');current=i?current+value:value;if(!Number.isSafeInteger(current))throw Error('作业链接中的单词编号无效。');return current});
 return{v:VERSION,l:input.l,lv:input.x,m:input.m?'single':'full',w:indexes,t:input.t,h:Boolean(input.h),...(input.u?{u:input.u}:{}),...(input.i!==undefined?{i:Boolean(input.i)}:{})};
}

const DAILY_VERSION=5;
function encodeIndexes(values,label){
 const indexes=[...values].sort((a,b)=>a-b),seen=new Set();
 for(const index of indexes){if(!Number.isSafeInteger(index)||index<0||seen.has(index))throw Error(label+'编号无效。');seen.add(index)}
 let previous=0;return indexes.map((index,i)=>{const value=i?index-previous:index;previous=index;return value.toString(36)}).join('.');
}
function decodeIndexes(value,label){
 if(!nonempty(value))throw Error(label+'编号无效。');
 const parts=value.split('.');if(!parts.length||parts.length>100)throw Error('学生链接最多支持 100 题，请减少题量。');
 let current=0;return parts.map((part,i)=>{if(!/^(?:0|[1-9a-z][0-9a-z]*)$/.test(part))throw Error(label+'编号无效。');const delta=parseInt(part,36);if(!Number.isSafeInteger(delta)||(i&&delta<1))throw Error(label+'编号无效。');current=i?current+delta:delta;if(!Number.isSafeInteger(current))throw Error(label+'编号无效。');return current});
}
function compactDaily(input){
 if(!input||input.v!==DAILY_VERSION||input.l!=='practice:daily-v3'||!nonempty(input.lv)||!['recognition','synonym'].includes(input.m)||!['fixed','random'].includes(input.a))throw Error('日常词汇练习设置不完整。');
 if(input.g!==undefined&&typeof input.g!=='string'||typeof input.g==='string'&&input.g.length>100||input.m==='synonym'&&input.g)throw Error('日常词汇分类无效。');
 const out={v:DAILY_VERSION,l:input.l,x:input.lv,m:input.m==='recognition'?0:1,a:input.a==='fixed'?0:1};
 if(input.g)out.g=input.g;
 if(input.a==='fixed'){
  if(!Array.isArray(input.q)||!input.q.length||input.q.length>100)throw Error('学生链接的固定题量需在 1–100 之间。');
  out.q=encodeIndexes(input.q,'日常词汇题目');
 }else{
  if(!Number.isSafeInteger(input.n)||input.n<0||input.n>100)throw Error('学生链接最多支持 100 题；0 表示当前范围全部。');
  out.n=input.n;
 }
 return out;
}
function expandDaily(input){
 if(!input||input.v!==DAILY_VERSION||input.l!=='practice:daily-v3'||!nonempty(input.x)||![0,1].includes(input.m)||![0,1].includes(input.a))throw Error('日常词汇练习设置不完整。');
 if(input.g!==undefined&&typeof input.g!=='string'||typeof input.g==='string'&&input.g.length>100||input.m===1&&input.g)throw Error('日常词汇分类无效。');
 const out={v:DAILY_VERSION,l:input.l,lv:input.x,m:input.m?'synonym':'recognition',a:input.a?'random':'fixed',g:input.g||''};
 if(input.a){
  if(!Number.isSafeInteger(input.n)||input.n<0||input.n>100)throw Error('学生链接最多支持 100 题；0 表示当前范围全部。');
  out.n=input.n;
 }else out.q=decodeIndexes(input.q,'日常词汇题目');
 return out;
}

const RANDOM_VERSION=4;
// v4 stores a sampling recipe, not word indexes. This checksum is not authentication.
function validateRandom(input){
 if(!input||input.v!==RANDOM_VERSION||!nonempty(input.l)||!nonempty(input.lv)||!['full','single'].includes(input.m)||!['total','per-list'].includes(input.a)||!Array.isArray(input.r)||!input.r.length||input.r.length>100)throw Error('随机练习设置不完整。');
 const seen=new Set();for(const n of input.r){if(!Number.isSafeInteger(n)||n<1||seen.has(n))throw Error('List 编号无效或重复。');seen.add(n)}
 const out={v:RANDOM_VERSION,l:input.l,lv:input.lv,m:input.m,a:input.a,r:[...input.r],...settings(input)};
 if(input.a==='total'){
  if(!Number.isSafeInteger(input.n)||input.n<0||input.n>100)throw Error('学生链接最多支持 100 题；0 表示全部。');
  out.n=input.n;
 }else{
  if(!Array.isArray(input.c)||input.c.length!==input.r.length||input.c.some(n=>!Number.isSafeInteger(n)||n<0)||input.c.reduce((a,b)=>a+b,0)<1||input.c.reduce((a,b)=>a+b,0)>100)throw Error('各 List 题量无效；总题量需在 1–100 之间。');
  out.c=[...input.c];
 }
 return out;
}
function sampleRandom(input,words,core){
 const p=validateRandom(input);
 if(p.r.some(list=>!words.some(word=>word.list===list)))throw Error('词库中缺少指定 List，请老师重新生成链接。');
 const selected=words.filter(word=>p.r.includes(word.list));
 const pool=p.a==='total'?core.sampleMixed(selected,p.n):core.sampleByList(selected,p.r.map((list,i)=>({list,count:p.c[i]})));
 if(!pool.length||pool.length>100)throw Error('学生链接的实际题量需在 1–100 之间。');
 return pool;
}

const SCOPED_RANDOM_VERSION=6;
// v6 stores one named group's canonical prefix plus a total random question count.
function validateScopedRandom(input){
 if(!input||input.v!==SCOPED_RANDOM_VERSION||!nonempty(input.l)||!nonempty(input.lv)||!['full','single'].includes(input.m))throw Error('限定范围随机练习设置不完整。');
 if(!Number.isSafeInteger(input.r)||input.r<1)throw Error('难度分组编号无效。');
 if(!Number.isSafeInteger(input.p)||input.p<1||input.p>10000)throw Error('前 N 个词中的 N 必须为 1–10000 的整数。');
 if(!Number.isSafeInteger(input.n)||input.n<0||input.n>100)throw Error('学生链接最多支持 100 题；0 表示限定范围全部。');
 return{v:SCOPED_RANDOM_VERSION,l:input.l,lv:input.lv,m:input.m,r:input.r,p:input.p,n:input.n,...settings(input)};
}
function sampleScopedRandom(input,words,core){
 const recipe=validateScopedRandom(input),eligible=core.prefixPool(words,recipe.r,recipe.p);
 if(new Set(eligible.map(word=>word.id)).size!==eligible.length)throw Error('限定范围中存在重复单词编号。');
 const pool=core.sampleMixed(eligible,recipe.n);
 if(!pool.length||pool.length>100)throw Error('学生链接的实际题量需在 1–100 之间。');
 if(new Set(pool.map(word=>word.id)).size!==pool.length)throw Error('随机抽题结果包含重复单词。');
 return pool;
}

const LEARNING_VERSION=7;
// Store ordered, stable Word ID suffixes. UUIDs use 16 bytes rather than 36 characters.
function encodeWordId(id,libraryId){
 const suffix=id.slice((libraryId+'/word/').length),uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(uuid.test(suffix))return 'u'+encodeBytes(Uint8Array.from(suffix.replace(/-/g,'').match(/../g).map(n=>parseInt(n,16))));
 return 's'+encodeBytes(encoder.encode(suffix));
}
function decodeWordId(encoded,libraryId){
 if(!/^[us][A-Za-z0-9_-]+$/.test(encoded))throw Error('学习作业词条编号无效。');
 const bytes=decodeBytes(encoded.slice(1));let suffix;
 if(encoded[0]==='u'){
  if(bytes.length!==16)throw Error('学习作业词条编号无效。');
  const h=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');suffix=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
 }else{suffix=decoder.decode(bytes);if(!suffix||suffix.includes('/')||encodeWordId(libraryId+'/word/'+suffix,libraryId)!==encoded)throw Error('学习作业词条编号无效。')}
 return libraryId+'/word/'+suffix;
}
function validateLearning(input){
 if(!input||input.v!==LEARNING_VERSION||!nonempty(input.l)||!nonempty(input.lv)||!Array.isArray(input.w)||!input.w.length||input.w.length>100||!['full','single'].includes(input.m)||typeof input.f!=='boolean'||!nonempty(input.name?.trim())||input.name.length>80)throw Error('学习作业设置不完整；最多支持 100 个词。');
 const seen=new Set();for(const id of input.w){if(!nonempty(id)||!id.startsWith(input.l+'/word/')||id.length>180||id.slice((input.l+'/word/').length).includes('/')||seen.has(id))throw Error('学习作业词条编号无效或重复。');seen.add(id)}
 return{v:LEARNING_VERSION,l:input.l,lv:input.lv,w:[...input.w],m:input.m,f:input.f,name:input.name,...settings(input)};
}
function compactLearning(input){
 const p=validateLearning(input);return{v:LEARNING_VERSION,l:p.l,x:p.lv,w:p.w.map(id=>encodeWordId(id,p.l)).join('.'),m:p.m==='full'?0:1,f:p.f?1:0,n:p.name,t:p.t,h:p.h?1:0,...(p.u?{u:p.u}:{}),...(p.i!==undefined?{i:p.i?1:0}:{})};
}
function expandLearning(input){
 if(!input||input.v!==LEARNING_VERSION||!nonempty(input.l)||!nonempty(input.x)||!nonempty(input.w)||![0,1].includes(input.m)||![0,1].includes(input.f)||!nonempty(input.n)||!Number.isSafeInteger(input.t)||![0,1].includes(input.h)||input.i!==undefined&&(input.m!==1||![0,1].includes(input.i)))throw Error('学习作业设置不完整。');
 if(input.w.split('.').length>100)throw Error('学习作业最多支持 100 个词。');
 return validateLearning({v:LEARNING_VERSION,l:input.l,lv:input.x,w:input.w.split('.').map(id=>decodeWordId(id,input.l)),m:input.m?'single':'full',f:Boolean(input.f),name:input.n,t:input.t,h:Boolean(input.h),...(input.u?{u:input.u}:{}),...(input.i!==undefined?{i:Boolean(input.i)}:{})});
}

function validate(input){return input?.v===LEARNING_VERSION?compactLearning(input):input?.v===SCOPED_RANDOM_VERSION?validateScopedRandom(input):input?.v===DAILY_VERSION?compactDaily(input):input?.v===RANDOM_VERSION?validateRandom(input):input?.v===VERSION?compact(input):validateLegacy(input)}
async function createToken(input){
 const payload=validate(input),encoded=encodeBytes(encoder.encode(JSON.stringify(payload)));
 return encoded+'.'+await fingerprint(encoded);
}
async function readToken(token){
 const parts=String(token).split('.');if(parts.length!==2||!parts[0]||!parts[1])throw Error('作业链接格式无效。');
 const expected=await fingerprint(parts[0]);if(expected!==parts[1])throw Error('作业链接已损坏或被修改。');
 let parsed;try{parsed=JSON.parse(decoder.decode(decodeBytes(parts[0])))}catch{throw Error('作业链接内容无法读取。')}
 return parsed?.v===LEARNING_VERSION?expandLearning(parsed):parsed?.v===SCOPED_RANDOM_VERSION?validateScopedRandom(parsed):parsed?.v===DAILY_VERSION?expandDaily(parsed):parsed?.v===RANDOM_VERSION?validateRandom(parsed):parsed?.v===VERSION?expand(parsed):validateLegacy(parsed);
}
async function createUrl(input,href=root.location?.href){
 const url=new URL(href);url.search='';url.hash='preset='+await createToken(input);return url.href;
}
async function readHash(hash=root.location?.hash||''){
 const value=new URLSearchParams(String(hash).replace(/^#/, '')).get('preset');if(!value)throw Error('没有找到作业设置。');return readToken(value);
}
const api={VERSION,RANDOM_VERSION,DAILY_VERSION,SCOPED_RANDOM_VERSION,LEARNING_VERSION,validateLearning,compactLearning,expandLearning,validateRandom,sampleRandom,validateScopedRandom,sampleScopedRandom,compactDaily,expandDaily,validate,createToken,readToken,createUrl,readHash};
if(typeof module!=='undefined')module.exports=api;else root.WordPresetLinks=api;
})(typeof window!=='undefined'?window:globalThis);
