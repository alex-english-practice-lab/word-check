(function(root){
'use strict';
if(document.body.dataset.teacher!=='true')return;
const select=document.getElementById('assignmentStudent'),note=document.getElementById('assignmentStudentNotice');
const base=root.WordCheckStudentConfig?.apiBase?.replace(/\/$/,'')||'';
let loading=null,loaded=false;
async function roster(){
 if(!base){note.textContent='学生服务尚未配置；可继续生成普通链接。';return}
 if(loaded)return;
 if(loading)return loading;
 loading=(async()=>{
  note.textContent='正在加载学生名单…';
  try{const response=await root.fetch(base+'/api/teacher/students',{credentials:'include',headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('HTTP '+response.status+'；请确认已通过教师 Access 验证');
   const data=await response.json(),previous=select.value;select.replaceChildren(new Option('普通链接 · 不指定学生',''),...(data.students||[]).filter(s=>s.status==='active').map(s=>new Option(`${s.displayName} · ${(s.aliases||[]).join(' / ')}`,s.id)));if([...select.options].some(o=>o.value===previous))select.value=previous;loaded=true;
   note.textContent='指定学生的链接会保存答题记录；链接持有人可使用该学生身份。';
  }catch(error){note.textContent='学生名单加载失败：'+error.message+'。普通链接仍可生成。'}
 })();try{await loading}finally{loading=null}
}
select.addEventListener('focus',roster);roster();
async function wrap(url){
 if(!select.value)return url;
 if(!base)throw Error('学生服务尚未配置，无法生成指定学生链接。');
 const response=await root.fetch(base+'/api/teacher/assignments',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:select.value,presetHash:new URL(url).hash})});
 let data;try{data=await response.json()}catch{throw Error('教师服务没有返回有效结果；请检查 Access 登录与服务地址。')}
 if(!response.ok)throw Error(data.error||'指定学生链接生成失败');
 const result=new URL(url);result.hash='assigned='+data.token;return result.href;
}
root.WordAssignedTeacher={wrap,get assigned(){return !!select.value},roster};
})(window);
