(function(root){
'use strict';if(document.body.dataset.teacher==='true')return;
const C=root.WordStudentIdentityCore,config=root.WordCheckStudentConfig||{};
const assignedToken=new URLSearchParams(root.location.hash.replace(/^#/, '')).get('assigned');
let local,session;try{local=root.localStorage;session=root.sessionStorage;void local.length;void session.length}catch{
 const note=document.createElement('span');note.className='small';note.textContent='本浏览器无法保存记录 · Guest';document.querySelector('header').append(note);
 root.WordStudentIdentity={enabled:false,mode:'guest',storage:C.scopedStorage(null,null),warning:'本浏览器无法保存学习记录；刷新后进度可能丢失。'};if(assignedToken)root.WordAssignedReady=Promise.resolve();return;
}
const ctrl=C.create({apiBase:config.apiBase,local,session,fetcher:(...args)=>root.fetch(...args),refresh:()=>root.location.reload()});
root.WordStudentIdentity=ctrl;if(!ctrl.enabled){if(assignedToken)root.WordAssignedReady=Promise.resolve();if(ctrl.mode==='guest'){const note=document.createElement('span');note.className='small';note.textContent='云端身份暂不可用 · Guest 不记录';document.querySelector('header').append(note)}return}
const header=document.querySelector('header'),button=document.createElement('button');button.type='button';button.className='identity-trigger';button.id='identityTrigger';header.append(button);
header.classList.add('has-student-identity');
const dialog=document.createElement('dialog');dialog.id='identityDialog';dialog.className='identity-dialog';dialog.innerHTML='<form method="dialog"><h2>Enter Student ID</h2><p>老师提供的 Student ID 或别名；无需密码。知道该 ID 的人也可能使用此档案。</p><label for="studentAlias">Student ID</label><input id="studentAlias" autocomplete="username" maxlength="40" spellcheck="false"><p id="identityError" role="alert" class="error"></p><div class="identity-actions"><button type="submit" id="identitySelect" class="primary">进入</button><button type="button" id="identityGuest" class="secondary">Continue Without Recording</button></div></form>';
document.body.append(dialog);
const $=id=>document.getElementById(id),menu=document.createElement('div');menu.className='identity-menu';menu.hidden=true;menu.innerHTML='<button type="button" id="identitySwitch">Switch Student</button><button type="button" id="identityLogout">Log Out</button><button type="button" id="identityNoRecord">Continue Without Recording</button>';
header.append(menu);
if(assignedToken){$('identityNoRecord').hidden=true;$('identityGuest').hidden=true}
function render(){button.textContent=(ctrl.current?.displayName||'Guest')+' ▾';button.setAttribute('aria-label','当前身份：'+(ctrl.current?.displayName||'Guest')+'；打开身份菜单')}
function open(){menu.hidden=true;$('identityError').textContent='';$('studentAlias').value='';dialog.showModal();$('studentAlias').focus()}
render();button.onclick=()=>{menu.hidden=!menu.hidden};$('identitySwitch').onclick=open;
$('identityLogout').onclick=async()=>{menu.hidden=true;button.disabled=true;if(assignedToken)root.history.replaceState(null,'',root.location.pathname);await ctrl.logout()};$('identityNoRecord').onclick=()=>{if(assignedToken)return;ctrl.noRecording();menu.hidden=true;render()};
$('identityGuest').onclick=()=>{ctrl.noRecording();dialog.close();render()};
dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();$('identitySelect').disabled=true;$('identityError').textContent='';try{await ctrl.choose($('studentAlias').value,root.WordAssignedPreset?.studentId||null)}catch(error){$('identityError').textContent=error.message;$('identitySelect').disabled=false}};
dialog.oncancel=e=>{if(!ctrl.current&&!root.location.hash.startsWith('#preset=')){e.preventDefault();$('identityError').textContent='请进入 Guest 或输入 Student ID'}};
if(assignedToken){
 root.WordAssignedReady=(async()=>{
  const response=await root.fetch(ctrl.apiBase+'/api/assignment/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:assignedToken})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'作业链接无法打开');
  if(!ctrl.acceptAssigned(data))return new Promise(()=>{});
  ctrl.assignmentId=data.assignmentId;
  root.WordAssignedPreset={presetHash:data.presetHash,assignmentId:data.assignmentId,studentId:data.student.id};
  render();return root.WordAssignedPreset;
 })();
}else if(ctrl.current){ctrl.ready=ctrl.restore().then(result=>{if(result.status==='offline'){$('identityError').textContent='当前离线；云端身份尚未验证，记录仅保存在本机。';button.textContent=ctrl.current.displayName+' · 离线 ▾'}else if(result.status==='ready')button.textContent=result.student.displayName+' · 本机记录 ▾';return result})}
else if(!root.location.hash.startsWith('#preset=')){let guestSelected=false;try{guestSelected=root.sessionStorage.getItem(C.GUEST)==='1'}catch{}if(!guestSelected)open()}
})(window);
