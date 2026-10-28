/* Teacher-only fixed learning assignment composer. */
(function(root){
'use strict';
if(document.body.dataset.teacher!=='true')return;
const V=root.WordVocabulary,C=root.WordCore,P=root.WordPresetLinks,registry=V.createRegistry(),$=id=>document.getElementById(id);
let library=null,words=[],loading=false,ticket=0,manualIds=new Set();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toggle(){const learning=$('assignmentType').value==='learning';$('setup').hidden=learning;$('teacherLearnSetup').hidden=!learning;if(learning&&!library)loadLibrary($('tlLibrary').value||null)}
function positive(id,max){const raw=$(id).value.trim(),n=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<1||n>max)throw Error(`请输入 1–${max} 的正整数。`);return n}
function eligible(){
 if(!library||loading)throw Error('词库尚未加载。');
 const list=library.lists.find(l=>l.id===$('tlGroup').value);if(!list)throw Error('请选择有效的 List / 难度。');
 if($('tlSelection').value!=='list'&&library.id==='lib:difficulty-100-120'&&$('tlScope').value==='prefix')return C.prefixPool(words,list.number,positive('tlPrefix',list.words.length));
 return words.filter(w=>w.listId===list.id);
}
function picked(){
 const pool=eligible(),method=$('tlSelection').value;
 if(method==='list')return pool;
 if(method==='manual')return pool.filter(w=>manualIds.has(w.id));
 const count=positive('tlCount',pool.length);return C.sampleMixed(pool,count);
}
function renderChoices(pool){
 const query=$('tlSearch').value.trim().toLocaleLowerCase();
 const matched=pool.filter(w=>!query||w.word.toLocaleLowerCase().includes(query)||w.senses.join('；').toLocaleLowerCase().includes(query));
 $('tlWordChoices').innerHTML=matched.slice(0,150).map(w=>`<label class="teacher-word-choice"><input type="checkbox" data-word-id="${esc(w.id)}" ${manualIds.has(w.id)?'checked':''}><span><strong>${esc(w.word)}</strong><small>${esc(w.pos)} ${esc(w.senses.join('；'))}</small></span></label>`).join('')||'<p class="small">没有匹配词条。</p>';
 $('tlManualCount').textContent=`已勾选 ${pool.filter(w=>manualIds.has(w.id)).length} 个 · 当前范围 ${pool.length} 个词${matched.length>150?' · 仅显示前 150 条，请搜索定位其他词':''}`;
}
function update(){
 $('tlLinkPanel').hidden=true;$('tlGenerate').disabled=true;
 $('tlFirstLetterWrap').hidden=$('tlMode').value!=='single';
 const method=$('tlSelection').value,det=library?.id==='lib:difficulty-100-120';
 $('tlScopeWrap').hidden=!det||method==='list';$('tlPrefixWrap').hidden=$('tlScopeWrap').hidden||$('tlScope').value!=='prefix';$('tlCountWrap').hidden=method!=='range';$('tlManualWrap').hidden=method!=='manual';
 try{const pool=eligible();if(method==='manual')renderChoices(pool);const count=method==='list'?pool.length:method==='manual'?pool.filter(w=>manualIds.has(w.id)).length:positive('tlCount',pool.length);
  if(!count)throw Error('请至少勾选 1 个词。');if(count>100)throw Error('学习链接最多支持 100 个词，请选择较小的 List 或改用范围/手动选词。');
  const time=$('tlTime').value.trim();if(!/^\d+$/.test(time)||Number(time)>600)throw Error('每题限时需为 0–600 的整数秒。');
  if(!$('tlName').value.trim())throw Error('请填写学习包名称。');
  $('tlSummary').textContent=`${library.name} · ${$('tlGroup').selectedOptions[0].textContent}${det&&method!=='list'&&$('tlScope').value==='prefix'?` · 第 1–${$('tlPrefix').value} 个词`:''} · 固定 ${count} 个词 · ${$('tlFinal').checked?'Learn → Review → Check':'Learn → Review'}`;
  $('tlError').textContent='';$('tlGenerate').disabled=false;
 }catch(e){$('tlSummary').textContent='';$('tlError').textContent=e.message}
}
async function loadLibrary(id){
 const current=++ticket;loading=true;library=null;words=[];manualIds.clear();$('tlGenerate').disabled=true;$('tlError').textContent='正在加载词库…';
 try{if(!registry.list().length)await registry.loadManifest(new URL('data/catalog.json',document.baseURI).href);if(current!==ticket)return;
  $('tlLibrary').replaceChildren(...registry.list().map(e=>new Option(e.name,e.id)));$('tlLibrary').disabled=false;
  const selected=id||registry.defaultId;$('tlLibrary').value=selected;const loaded=await registry.load(selected);if(current!==ticket)return;
  library=loaded;words=V.toPracticeWords(loaded);$('tlGroup').replaceChildren(...loaded.lists.map(l=>new Option(`${l.name} · ${l.words.length} 词`,l.id)));$('tlGroup').disabled=false;
 }catch(e){if(current===ticket)$('tlError').textContent='词库加载失败：'+e.message}
 finally{if(current===ticket){loading=false;if(library)update()}}
}
$('assignmentType').onchange=toggle;$('tlLibrary').onchange=()=>loadLibrary($('tlLibrary').value);
$('tlGroup').onchange=()=>{manualIds.clear();update()};$('tlSelection').onchange=()=>{manualIds.clear();update()};
for(const id of ['tlScope','tlPrefix','tlCount','tlTime','tlName','tlFinal','tlMode','tlAssistance','tlFirstLetter'])$(id).addEventListener(['tlScope','tlFinal','tlMode','tlAssistance','tlFirstLetter'].includes(id)?'change':'input',update);
$('tlSearch').oninput=()=>{try{renderChoices(eligible())}catch{}};
$('tlWordChoices').onchange=e=>{const id=e.target.dataset.wordId;if(!id)return;if(e.target.checked)manualIds.add(id);else manualIds.delete(id);update()};
$('tlGenerate').onclick=async()=>{
 try{
  if(loading||!library||library.source.type!=='builtin')throw Error('只能从已加载的内置词库生成学习作业。');
  const selected=picked();if(!selected.length||selected.length>100)throw Error('固定学习包需包含 1–100 个词。');
  const assistance=$('tlAssistance').value;
  const payload={v:P.LEARNING_VERSION,l:library.id,lv:library.version,w:selected.map(w=>w.id),name:$('tlName').value.trim(),m:$('tlMode').value,f:$('tlFinal').checked,t:Number($('tlTime').value),h:assistance!=='none',...(assistance==='check'?{u:'check'}:{}),...($('tlMode').value==='single'?{i:$('tlFirstLetter').checked}:{})};
  let url=await P.createUrl(payload,new URL('./',document.baseURI).href);if(url.length>2000)throw Error(`链接长 ${url.length} 字符，可能无法稳定分享；请减少词数或拆成多个学习包。`);
  if(root.WordAssignedTeacher?.assigned)url=await root.WordAssignedTeacher.wrap(url);
  $('tlLink').value=url;$('tlLinkSummary').textContent=`${selected.length} 个固定 Word ID · ${payload.f?'含正式检查':'仅学习与复习'} · ${root.WordAssignedTeacher?.assigned?'已指定学生，进度需提交到服务端':'学生刷新后可恢复本机进度'}`;$('tlLinkPanel').hidden=false;$('tlError').textContent='';$('tlLink').focus();$('tlLink').select();
 }catch(e){$('tlError').textContent=e.message;$('tlLinkPanel').hidden=true}
};
$('tlCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('tlLink').value)}catch{$('tlLink').select();document.execCommand('copy')}$('tlCopy').textContent='已复制'};
})(window);
