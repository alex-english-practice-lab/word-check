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
function settings(input){if(!Number.isSafeInteger(input.t)||input.t<0||input.t>600||typeof input.h!=='boolean')throw Error('作业链接中的答题设置无效。');return{t:input.t,h:input.h}}
function compact(input){
 if(!input||input.v!==VERSION||!nonempty(input.l)||!nonempty(input.lv)||!['full','single'].includes(input.m)||!Array.isArray(input.w)||!input.w.length)throw Error('作业链接内容不完整。');
 if(input.w.length>100)throw Error('学生链接最多支持 100 题，请减少题量。');
 const indexes=[...input.w].sort((a,b)=>a-b),seen=new Set();for(const index of indexes){if(!Number.isSafeInteger(index)||index<0||seen.has(index))throw Error('作业链接中的单词编号无效。');seen.add(index)}
 let previous=0;const q=indexes.map((index,i)=>{const value=i?index-previous:index;previous=index;return value.toString(36)}).join('.'),answer=settings(input);
 return{v:VERSION,l:input.l,x:input.lv,m:input.m==='full'?0:1,q,t:answer.t,h:answer.h?1:0};
}
function expand(input){
 if(!input||input.v!==VERSION||!nonempty(input.l)||!nonempty(input.x)||![0,1].includes(input.m)||!nonempty(input.q)||!Number.isSafeInteger(input.t)||input.t<0||input.t>600||![0,1].includes(input.h))throw Error('作业链接内容不完整。');
 const parts=input.q.split('.');if(!parts.length||parts.length>100)throw Error('学生链接最多支持 100 题，请减少题量。');
 let current=0;const indexes=parts.map((part,i)=>{if(!/^(?:0|[1-9a-z][0-9a-z]*)$/.test(part))throw Error('作业链接中的单词编号无效。');const value=parseInt(part,36);if(!Number.isSafeInteger(value)||(i&&value<1))throw Error('作业链接中的单词编号无效。');current=i?current+value:value;if(!Number.isSafeInteger(current))throw Error('作业链接中的单词编号无效。');return current});
 return{v:VERSION,l:input.l,lv:input.x,m:input.m?'single':'full',w:indexes,t:input.t,h:Boolean(input.h)};
}
function validate(input){return input?.v===VERSION?compact(input):validateLegacy(input)}
async function createToken(input){
 const payload=validate(input),encoded=encodeBytes(encoder.encode(JSON.stringify(payload)));
 return encoded+'.'+await fingerprint(encoded);
}
async function readToken(token){
 const parts=String(token).split('.');if(parts.length!==2||!parts[0]||!parts[1])throw Error('作业链接格式无效。');
 const expected=await fingerprint(parts[0]);if(expected!==parts[1])throw Error('作业链接已损坏或被修改。');
 let parsed;try{parsed=JSON.parse(decoder.decode(decodeBytes(parts[0])))}catch{throw Error('作业链接内容无法读取。')}
 return parsed?.v===VERSION?expand(parsed):validateLegacy(parsed);
}
async function createUrl(input,href=root.location?.href){
 const url=new URL(href);url.search='';url.hash='preset='+await createToken(input);return url.href;
}
async function readHash(hash=root.location?.hash||''){
 const value=new URLSearchParams(String(hash).replace(/^#/, '')).get('preset');if(!value)throw Error('没有找到作业设置。');return readToken(value);
}
const api={VERSION,validate,createToken,readToken,createUrl,readHash};
if(typeof module!=='undefined')module.exports=api;else root.WordPresetLinks=api;
})(typeof window!=='undefined'?window:globalThis);
