(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WordStudentIdentityCore=api})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const KEY='word-check.identity.v1.selected',GUEST='word-check.identity.v1.guest',MARKER='word-check.identity.v1.ever-enabled';
const valid=x=>x&&typeof x.id==='string'&&/^[0-9a-f-]{36}$/i.test(x.id)&&typeof x.displayName==='string'&&x.displayName.length>0&&x.displayName.length<=80&&typeof x.alias==='string'&&/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,39}$/u.test(x.alias);
function scopedStorage(backing,studentId){
 const memory=new Map(),prefix=studentId?'word-check.identity.v1.student.'+studentId+'.':null;
 function keys(){if(!prefix)return [...memory.keys()];const result=[];for(let i=0;i<backing.length;i++){const k=backing.key(i);if(k?.startsWith(prefix))result.push(k.slice(prefix.length))}return result}
 return {getItem:k=>prefix?backing.getItem(prefix+k):memory.get(k)??null,setItem:(k,v)=>prefix?backing.setItem(prefix+k,String(v)):memory.set(k,String(v)),removeItem:k=>prefix?backing.removeItem(prefix+k):memory.delete(k),key:i=>keys()[i]??null,get length(){return keys().length},clear(){for(const k of keys())this.removeItem(k)}};
}
function create({apiBase='',local,session,fetcher,refresh}){
 if(!apiBase){let used=false;try{used=local.getItem(MARKER)==='1'}catch{}return used?{enabled:false,current:null,storage:scopedStorage(local,null),mode:'guest',status:'offline'}:{enabled:false,current:null,storage:local,mode:'legacy'}}
 const url=new URL(apiBase);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw Error('Cloud API 必须使用 HTTPS');
 try{local.setItem(MARKER,'1')}catch{}
 const base=url.href.replace(/\/$/,'');let saved=null;
 try{saved=JSON.parse(local.getItem(KEY)||'null');if(!valid(saved))saved=null}catch{saved=null}
 let guest=false;try{guest=session.getItem(GUEST)==='1'}catch{}
 const current=guest?null:saved,storage=scopedStorage(local,current?.id||null);let token=null,status=current?'checking':'guest',generation=0;
 async function select(alias){
  const response=await fetcher(base+'/api/student/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({alias})});
  const data=await response.json();if(!response.ok){const error=Error(data.error||'Student ID 无法验证');error.status=response.status;throw error}
  const normalized=alias.normalize('NFKC').trim().toLocaleLowerCase('en');
  if(!valid({...data.student,alias:normalized})||typeof data.accessToken!=='string')throw Error('服务器返回的身份无效');
  return {student:data.student,alias:normalized,token:data.accessToken};
 }
 async function choose(alias,expectedId=null){const version=++generation,result=await select(alias);if(version!==generation)throw Error('身份已经切换，请重新进入');if(expectedId&&result.student.id!==expectedId)throw Error('这份作业已指定给另一位学生');local.setItem(KEY,JSON.stringify({...result.student,alias:result.alias}));session.removeItem(GUEST);refresh();return result.student}
 function acceptAssigned(result){
  if(!valid({...result.student,alias:result.alias})||typeof result.accessToken!=='string'||!result.assignmentId)throw Error('作业身份无效');
  if(current?.id!==result.student.id){local.setItem(KEY,JSON.stringify({...result.student,alias:result.alias}));session.removeItem(GUEST);refresh();return false}
  token=result.accessToken;status='ready';return true;
 }
 async function restore(){if(!current)return {status:'guest'};const version=++generation;try{const result=await select(current.alias);if(version!==generation)return {status:'superseded'};if(result.student.id!==current.id){local.removeItem(KEY);refresh();return {status:'changed'}}token=result.token;status='ready';return {status,student:result.student}}catch(e){if(version!==generation)return {status:'superseded'};if([401,403,404].includes(e.status)){local.removeItem(KEY);refresh();return {status:'invalid'}}status='offline';return {status,error:e.message}}}
 async function logout(){generation++;const old=token;token=null;local.removeItem(KEY);session.removeItem(GUEST);if(old){try{await fetcher(base+'/api/student/logout',{method:'POST',headers:{Authorization:'Bearer '+old}})}catch{}}refresh()}
 function noRecording(){generation++;token=null;session.setItem(GUEST,'1');if(current)refresh()}
 function leaveGuest(){generation++;session.removeItem(GUEST);refresh()}
 return {enabled:true,apiBase:base,mode:current?'named':'guest',current,storage,choose,acceptAssigned,restore,logout,noRecording,leaveGuest,get token(){return token},get status(){return status}};
}
return {KEY,GUEST,MARKER,scopedStorage,create};
});
