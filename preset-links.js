(function(root){
'use strict';
const VERSION=1;
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
function validate(input){
 if(!input||input.v!==VERSION||!nonempty(input.l)||!nonempty(input.lv)||!['full','single'].includes(input.m)||!nonempty(input.s)||!Array.isArray(input.w)||!input.w.length)throw Error('作业链接内容不完整。');
 if(input.s.length>500||input.w.length>100)throw Error('学生链接最多支持 100 题，请减少题量。');
 const ids=new Set();for(const id of input.w){if(!nonempty(id)||!id.startsWith(input.l+'/word/')||ids.has(id))throw Error('作业链接中的单词编号无效。');ids.add(id)}
 return {v:VERSION,l:input.l,lv:input.lv,m:input.m,s:input.s,w:[...input.w]};
}
async function createToken(input){
 const payload=validate(input),encoded=encodeBytes(encoder.encode(JSON.stringify(payload)));
 return encoded+'.'+await fingerprint(encoded);
}
async function readToken(token){
 const parts=String(token).split('.');if(parts.length!==2||!parts[0]||!parts[1])throw Error('作业链接格式无效。');
 const expected=await fingerprint(parts[0]);if(expected!==parts[1])throw Error('作业链接已损坏或被修改。');
 let parsed;try{parsed=JSON.parse(decoder.decode(decodeBytes(parts[0])))}catch{throw Error('作业链接内容无法读取。')}
 return validate(parsed);
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
