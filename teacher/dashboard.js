(function(root){
'use strict';
const $=id=>document.getElementById(id),base=root.WordCheckStudentConfig?.apiBase?.replace(/\/$/,'')||'';
const student=$('dashStudent'),assignment=$('dashAssignment'),status=$('dashStatus'),error=$('dashError'),results=$('dashResults'),records=$('dashRecords'),more=$('dashMore');
let cursor=null,epoch=0,busy=false,students=[],assignments=[];
const el=(tag,value)=>{const node=document.createElement(tag);node.textContent=String(value??'');return node};
const date=value=>{const n=Date.parse(value);return Number.isFinite(n)?new Date(n).toLocaleString('zh-CN'):'时间未知'};
async function get(path){const response=await root.fetch(base+path,{credentials:'include',headers:{Accept:'application/json'}});let value;try{value=await response.json()}catch{throw Error('服务没有返回有效结果')};if(!response.ok)throw Error(response.status===403?'教师访问未授权；请先通过 Access 登录。':value.error||'HTTP '+response.status);return value}
function cell(row,value){row.append(el('td',value))}
function table(headers,items){const wrap=el('div',''),t=document.createElement('table'),head=document.createElement('tr'),body=document.createElement('tbody');wrap.className='table-scroll';headers.forEach(h=>head.append(el('th',h)));const thead=document.createElement('thead');thead.append(head);t.append(thead,body);items.forEach(item=>{const tr=document.createElement('tr');item.forEach(value=>cell(tr,value));body.append(tr)});wrap.append(t);return wrap}
function render(record){const p=record.payload||{},box=document.createElement('article'),title=el('h3',record.kind==='session'?'Learn / Review · 学习进度':record.kind==='check'?'Spelling · 正式检查':'Recognition / Synonym · 正式检查');box.append(title);
 const meta=el('p',date(record.updatedAt)+' · '+(record.assignmentId?'指定作业 '+record.assignmentId.slice(0,8):'自由练习'));meta.className='small';box.append(meta);
 if(record.kind==='session'){const s=p.session||{};box.append(el('p',`${p.pack?.name||'学习包'} · ${s.currentStage||'进行中'} · 已翻看 ${(s.seenIds||[]).length}/${(p.pack?.wordIds||[]).length} · 待复习 ${(s.pendingIds||[]).length}`));box.append(el('p',`自评 Know ${(s.reviews||[]).filter(r=>r.rating==='know').length} / Again ${(s.reviews||[]).filter(r=>r.rating==='again').length}；自评不计入正式正确率。`));return box}
 const answers=Array.isArray(p.answers)?p.answers:[],finished=record.kind==='check'?p.attempt?.status==='completed':p.finished;
 const correct=answers.filter(a=>record.kind==='check'?a.result?.isCorrect===true:a.correct===true).length;
 box.append(el('p',`客户端提交：${finished?'已完成':'已结束或未完成'} · 已作答 ${answers.length} 题 · 答对 ${correct} 题`));
 if(record.kind==='check'){const outcomes={correct:0,checked:0,letter_assisted:0,assisted:0,wrong:0};answers.forEach(a=>{if(a.result?.outcome in outcomes)outcomes[a.result.outcome]++});box.append(el('p',`独立答对 ${outcomes.correct} · 拼写检查后答对 ${outcomes.checked} · 字母提示后答对 ${outcomes.letter_assisted+outcomes.assisted} · 错误 ${outcomes.wrong}`))}
 const details=document.createElement('details'),summary=el('summary','查看每题作答');details.append(summary);
 if(record.kind==='check'){const q=new Map((p.attempt?.questions||[]).map(x=>[x.id,x]));details.append(table(['题干（实际条件）','学生输入','结果','参考答案'],answers.map(a=>{const question=q.get(a.questionId),prompt=question?.prompt||{},condition=question?.mode==='single'?`${prompt.pos?prompt.pos+' · ':''}${prompt.meaning||'—'}${prompt.initialShown?' · 首字母：'+prompt.initial:''}${prompt.format?'':' · 旧题干'}`:`${prompt.phonetic||''} · ${prompt.pos||''} · ${prompt.meaning||'—'}`;return [condition,a.response?.skipped?'跳过 / 超时':a.response?.text||'—',a.result?.outcome||'—',(question?.snapshot?.acceptedAnswers||[]).join(' / ')||'—']})))}
 else details.append(table(['题目','学生选择','结果','正确选项'],answers.map(a=>{const options=new Map((a.displayed_options||[]).map(o=>[o.id,o.text]));const labels=ids=>(ids||[]).map(id=>options.get(id)||id).join('、')||'未选择';return [a.prompt||a.question_id||'—',labels(a.selected_option_ids),a.correct?'正确':'错误 / 跳过',labels(a.correct_option_ids)]})));
 box.append(details);return box}
async function load(reset=false){if(!base||!student.value)return;if(busy&&!reset)return;const run=++epoch,id=student.value,selected=assignment.value;busy=true;more.disabled=true;error.textContent='';status.textContent='正在加载记录…';if(reset){cursor=null;records.replaceChildren();results.hidden=true}
 try{const q=new URLSearchParams({studentId:id});if(selected)q.set('assignmentId',selected);if(cursor!==null)q.set('before',cursor);const data=await get('/api/teacher/records?'+q);if(run!==epoch)return;
  data.records.forEach(r=>records.append(render(r)));cursor=data.nextCursor;results.hidden=false;$('dashTitle').textContent=data.student.displayName+' · 已提交记录';$('dashCounts').textContent=records.querySelectorAll('article').length+' 条已加载记录（含学习进度；重复提交按记录 ID 合并）';if(!records.children.length)records.append(el('p','尚无已提交记录。'));more.hidden=cursor===null;status.textContent=cursor===null?'已加载当前范围的全部记录。':'还有更早记录可加载。';
 }catch(e){if(run===epoch){error.textContent=e.message;status.textContent='读取失败，可点击刷新重试。'}}finally{if(run===epoch){busy=false;more.disabled=false}}}
async function choose(){const run=++epoch;assignment.disabled=true;assignment.replaceChildren(new Option('全部记录',''));assignments=[];renderManagement();results.hidden=true;records.replaceChildren();error.textContent='';if(!student.value){status.textContent='请选择学生。';return}status.textContent='正在加载作业…';try{const data=await get('/api/teacher/assignments?'+new URLSearchParams({studentId:student.value}));if(run!==epoch)return;assignments=data.assignments;data.assignments.forEach(a=>assignment.add(new Option(date(a.createdAt)+' · '+a.id.slice(0,8)+' · '+assignmentState(a),a.id)));renderManagement();assignment.disabled=false;await load(true)}catch(e){if(run===epoch){error.textContent=e.message;status.textContent='读取失败，可点击刷新重试。'}}}
async function init(){if(!base){status.textContent='学生服务尚未配置，暂时无法查看云端记录。';student.replaceChildren(new Option('服务尚未配置',''));return}try{const data=await get('/api/teacher/students'),selected=student.value;students=data.students||[];student.replaceChildren(new Option('请选择学生',''),...students.map(s=>new Option(s.displayName+(s.status==='disabled'?' · 已停用':''),s.id)));if(students.some(s=>s.id===selected))student.value=selected;student.disabled=false;$('rosterSubmit').disabled=false;status.textContent='请选择学生查看记录。'}catch(e){student.replaceChildren(new Option('无法加载学生',''));error.textContent=e.message;status.textContent='请检查教师身份与服务连接。'}}
const management=el('details','');management.className='panel management';management.append(el('summary','学生档案与作业管理'));
const manager=el('div',''),manageStatus=el('p','');manageStatus.setAttribute('role','status');management.append(manager,manageStatus);$('dashResults').before(management);
const assignmentState=a=>a.revokedAt?'已撤销':Date.parse(a.expiresAt)<=Date.now()?'已到期':'有效';
async function patch(path,value){const response=await root.fetch(base+path,{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});const data=await response.json().catch(()=>null);if(!response.ok)throw Error(data?.error||'保存失败，请重新验证教师登录后重试');return data}
function field(form,label,type,value){const wrap=el('label',label),input=document.createElement('input');input.type=type;input.value=value;input.required=true;wrap.append(input);form.append(wrap);return input}
async function saveManagement(form,action,message){if(form.dataset.saving)return;form.dataset.saving='true';const controls=[...form.querySelectorAll('input,button')];controls.forEach(c=>c.disabled=true);manageStatus.textContent='正在保存…';try{await action();await init();await choose();manageStatus.textContent=message}catch(e){manageStatus.textContent=e.message}finally{delete form.dataset.saving;controls.forEach(c=>c.disabled=false)}}
function renderManagement(){
 manager.replaceChildren();manageStatus.textContent='';const person=students.find(s=>s.id===student.value);if(!person){manager.append(el('p','先选择一位学生。'));return}
 const form=document.createElement('form');form.className='management-form';form.append(el('h3',person.displayName+' · 档案'));
 const name=field(form,'显示名称','text',person.displayName);name.maxLength=80;
 const aliases=field(form,'登录 ID（多个用英文逗号分隔）','text',person.aliases.join(', '));aliases.maxLength=328;
 form.append(el('p','修改姓名或 ID 会保留已有成绩。移除的 ID 不会转给其他学生。'));
 const save=el('button','保存档案');save.type='submit';form.append(save);
 form.addEventListener('submit',event=>{event.preventDefault();const value={displayName:name.value,aliases:aliases.value.split(',').map(s=>s.trim()).filter(Boolean)};saveManagement(form,()=>patch('/api/teacher/students/'+person.id,value),'学生档案已保存。')});
 const toggle=el('button',person.status==='disabled'?'重新启用学生':'停用学生');toggle.type='button';toggle.className='secondary';form.append(toggle);
 toggle.addEventListener('click',()=>{const disabled=person.status!=='disabled';if(!root.confirm(disabled?'停用 '+person.displayName+' 后将不能登录、打开作业或提交。已有成绩保留。确定停用？':'重新启用 '+person.displayName+'？未过期且未撤销的作业将重新可用。'))return;saveManagement(form,()=>patch('/api/teacher/students/'+person.id,{status:disabled?'disabled':'active'}),disabled?'学生已停用，已有成绩保留。':'学生已重新启用，请重新登录。')});manager.append(form);
 manager.append(el('h3','作业链接（最近 200 个）'),el('p','撤销或到期后不能打开或提交，已提交成绩保留。已打开的页面可能继续显示题目，提交时会被拒绝。'));
 if(person.status==='disabled')manager.append(el('p','该学生已停用，以下作业目前均不可用。'));
 if(!assignments.length)manager.append(el('p','暂无作业。'));
 assignments.forEach(a=>{const form=document.createElement('form');form.className='management-form';form.append(el('h4',date(a.createdAt)+' · '+a.id.slice(0,8)+' · '+assignmentState(a)),el('p','到期时间：'+date(a.expiresAt)));
  if(a.revokedAt){form.append(el('p','撤销时间：'+date(a.revokedAt)+'。需要继续练习时请生成新链接。'));manager.append(form);return}
  const d=new Date(a.expiresAt),local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16),expiry=field(form,'到期时间（本机时区）','datetime-local',local);
  const save=el('button','保存到期时间');save.type='submit';form.append(save);
  form.addEventListener('submit',event=>{event.preventDefault();const value=new Date(expiry.value);if(!Number.isFinite(value.getTime())){manageStatus.textContent='请选择有效时间。';return}saveManagement(form,()=>patch('/api/teacher/assignments/'+a.id,{expiresAt:value.toISOString()}),'到期时间已保存。')});
  const revoke=el('button','撤销链接');revoke.type='button';revoke.className='secondary';form.append(revoke);revoke.addEventListener('click',()=>{if(!root.confirm('撤销 '+person.displayName+' 的这份作业链接？撤销后不能恢复，已提交成绩保留。'))return;saveManagement(form,()=>patch('/api/teacher/assignments/'+a.id,{revoke:true}),'链接已撤销，已有成绩保留。')});manager.append(form);
 });
}
const rosterForm=$('rosterForm'), entries=$('rosterEntries'), rosterStatus=$('rosterStatus');
rosterForm.addEventListener('submit', async event=>{
 event.preventDefault();
 const submit=$('rosterSubmit');
 if(submit.disabled)return;
 submit.disabled=true;
 const completed=[];
 try{
  const rows=entries.value.trim().split(/\r?\n/).filter(line=>line.trim()).map((line,index)=>{
   const parts=line.split('|').map(s=>s.trim());
   const aliases=(parts[1]||'').split(',').map(s=>s.trim()).filter(Boolean);
   if(parts.length!==2||!parts[0]||!aliases.length)throw Error('请检查第 '+(index+1)+' 行的姓名和登录 ID。');
   return {displayName:parts[0],aliases};
  });
  for(const person of rows){
   const res=await root.fetch(base+'/api/teacher/students',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(person)});
   const body=await res.json().catch(()=>null);
   if(!res.ok)throw Error(person.displayName+'：'+(body?.error||'请刷新页面并重新验证教师登录。'));
   completed.push(body.student.displayName);
   entries.value=rows.slice(completed.length).map(row=>row.displayName+' | '+row.aliases.join(', ')).join('\n');
  }
  rosterStatus.textContent='已建立：'+completed.join('、');
 }catch(err){
  rosterStatus.textContent=(completed.length?'已建立：'+completed.join('、')+'\n':'')+err.message;
 }finally{
  if(completed.length){await init();await choose();}
  submit.disabled=false;
 }
});
student.addEventListener('change',choose);assignment.addEventListener('change',()=>load(true));more.addEventListener('click',()=>load());$('dashRefresh').addEventListener('click',()=>student.value?choose():init());init();
})(window);

