const $=id=>document.getElementById(id),C=window.WordCore,V=window.WordVocabulary,P=window.WordPresetLinks,H=window.WordCheckHomeV3;
const libraries=V.createRegistry();let catalogReady=null,activeLibrary=null,loading=false,pendingLibraryId=null,libraryLoadFailed=false;
const V3_ID=H.SOURCE_ID;
const DET_ID='lib:difficulty-100-120';
const teacherMode=document.body.dataset.teacher==='true';
$('linkType')?.addEventListener('change',updateSelection);
function ensureCatalog(){return catalogReady||(catalogReady=libraries.loadManifest(new URL('data/catalog.json',document.baseURI).href).catch(e=>{catalogReady=null;throw e}))}
let words=[],queue=[],answers=[],index=0,hints=0,spellingChecks=0,spellingMessage='',graded=false,mode='full',scope='',currentSense='',questionPrompts=[],legacyPrompt=false,showFirstLetter=true,isDemo=false,active=false,loadVersion=0,presetSession=null,timeLimit=0,hintsAllowed=true,assistanceMode='both',timerId=null,timerDeadline=0,sourceKind='spelling';
const assistanceSelect=document.createElement('select');assistanceSelect.id='assistanceMode';assistanceSelect.innerHTML='<option value="both">拼写检查 + 下一个字母</option><option value="check">仅检查当前拼写</option><option value="none">不提供辅助</option>';
const assistanceLabel=document.createElement('label');assistanceLabel.className='assistance-setting';assistanceLabel.innerHTML='<span class="field-label">提示权限</span>';assistanceLabel.append(assistanceSelect);$('allowHints').closest('label').replaceWith(assistanceLabel);
const spellingButton=document.createElement('button');spellingButton.id='checkSpelling';spellingButton.type='button';spellingButton.className='secondary';spellingButton.textContent='检查当前拼写';$('hint').before(spellingButton);$('hint').textContent='提示下一个字母';
const checkedStat=document.createElement('div');checkedStat.innerHTML='<strong id="checked"></strong><span>检查后答对</span>';$('assisted').parentElement.before(checkedStat);$('assisted').nextElementSibling.textContent='字母辅助答对';$('results').querySelector('.stats').classList.add('spelling-stats');
document.querySelector('.quiz-footnote').textContent='两类辅助分别统计 · Enter 提交答案 / 下一题';
function renderAssistance(){const letters=hints?C.letterHint(queue[index].word,hints).text:'';$('hintDisplay').textContent=[spellingMessage,letters].filter(Boolean).join(' · ')}
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const namedGroups=()=>activeLibrary?.selectionMode==='named';
const listName=number=>activeLibrary?.lists.find(list=>list.number===number)?.name||'List '+number;
const selectedGroups=()=>C.range($('range').value,words.map(w=>w.list));
function selectedGroupsSafe(){try{return selectedGroups()}catch{return[]}}
function updateScopeControls(){
 const det=sourceKind==='spelling'&&activeLibrary?.id===DET_ID,groups=det?selectedGroupsSafe():[];
 if(!det){$('detScopeSettings').hidden=true;$('vocabularyScope').value='all';$('prefixScopeInput').hidden=true;return}
 const single=groups.length===1;
 $('detScopeSettings').hidden=!single;
 if(!single){$('vocabularyScope').value='all';$('prefixScopeInput').hidden=true;return}
 $('vocabularyScope').disabled=false;$('prefixScopeInput').hidden=$('vocabularyScope').value!=='prefix';
 $('detScopeNotice').textContent='按该难度组的词库原顺序限定抽查范围。';
 if(single){const available=words.filter(word=>word.list===groups[0]).length;$('prefixCount').max=available;$('prefixScopeHelp').textContent=`该难度共 ${available} 个词；范围与本次题量分别设置。`}
}
function selectionContext(){
 if(namedGroups()&&!$('range').value.trim())throw Error('请至少选择一个难度分组。');
 const lists=selectedGroups(),available=new Set(words.map(w=>w.list)),missing=lists.filter(n=>!available.has(n));
 if(missing.length)throw Error('词表中没有 List '+missing.join('、')+'，请调整范围或导入完整词表。');
 let pool=words.filter(word=>lists.includes(word.list)),scope={type:'all',lists};
 if(activeLibrary?.id===DET_ID&&$('vocabularyScope').value==='prefix'){
  if(lists.length!==1)throw Error('First N Words 需要且只能选择一个难度组。');
  const raw=$('prefixCount').value.trim(),count=Number(raw);
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(count)||count<1)throw Error('前 N 个词中的 N 必须为正整数。');
  pool=C.prefixPool(words,lists[0],count);scope={type:'prefix',list:lists[0],prefixCount:count};
 }
 return{pool,scope};
}
function compactScope(pool){const lists=[...new Set(pool.map(word=>word.list))].sort((a,b)=>a-b);return namedGroups()?lists.map(listName).join('、'):'List '+lists.join(',')}
function renderLibraryPicker(){
 const registered=libraries.list(),options=registered.map(e=>({id:e.id,name:e.name||e.data?.name||e.id}));
 options.push({id:V3_ID,name:H.NAME});
 if(activeLibrary&&!options.some(e=>e.id===activeLibrary.id))options.push({id:activeLibrary.id,name:activeLibrary.name+'（临时导入）'});
 if(!options.length)return;
 $('librarySelect').innerHTML=options.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
 $('librarySelect').value=(loading?pendingLibraryId||(sourceKind==='v3'?V3_ID:libraries.defaultId):sourceKind==='v3'?V3_ID:activeLibrary?.id)||libraries.defaultId;
 $('librarySelect').disabled=false;
}
function renderGroupChoices(){
 const named=namedGroups();$('numberedLists').hidden=named;$('namedLists').hidden=!named;
 const chosen=$('range').value.split(',').map(Number);
 $('groupChoices').innerHTML=named?activeLibrary.lists.map(list=>`<label class="group-choice"><input type="checkbox" data-group="${list.number}" ${chosen.includes(list.number)?'checked':''}><span>${esc(list.name)}<small>共 ${list.words.length} 个词</small></span></label>`).join(''):'';
 $('sampling').options[0].textContent=named?'按难度分别设置数量':'按 List 分别设置数量';
 $('sampling').options[1].textContent=named?'从所选难度混合抽取':'从所选 List 混合抽取';
 $('samplingHelp').textContent=named?'每个难度随机抽取，不重复；填 0 可跳过。':'每个 List 随机抽取，不重复；填 0 可跳过。';
 updateScopeControls();
}
$('librarySelect').addEventListener('change',()=>{const id=$('librarySelect').value;return id===V3_ID?activateV3():loadLibrary(id)});
$('groupChoices').addEventListener('change',()=>{$('range').value=[...$('groupChoices').querySelectorAll('input:checked')].map(input=>input.dataset.group).join(',');updateScopeControls();renderListCounts();updateSelection()});
function show(id){document.querySelector('.page-heading').hidden=id.startsWith('learn');for(const x of ['studentHome','learnSetup','learnCards','learnSummary','learnPaused','setup','quiz','results','presetError','presetLoading','v3Quiz','v3Results'])if($(x))$(x).hidden=x!==id;if($('learnStorageNotice'))$('learnStorageNotice').hidden=!(id.startsWith('learn')||['quiz','results'].includes(id)&&(window.WordCheckLearning?.isChecking||window.WordCheckLearning?.warning));window.scrollTo(0,0)}
function setSourceKind(kind){
 sourceKind=kind==='v3'?'v3':'spelling';const v3=sourceKind==='v3';
 $('numberedLists').hidden=v3||namedGroups();$('namedLists').hidden=v3||!namedGroups();
 $('spellingModeOptions').hidden=v3;$('v3ModeOptions').hidden=!v3;
 $('spellingAnswerSettings').hidden=v3;$('v3AnswerSettings').hidden=!v3;
 $('spellingSamplingSettings').hidden=v3;$('v3SamplingSettings').hidden=!v3;
 $('detScopeSettings').hidden=v3||activeLibrary?.id!==DET_ID;
 $('createPreset').hidden=!teacherMode;$('presetHelp').hidden=!teacherMode;
 if($('teacherLinkSettings'))$('teacherLinkSettings').hidden=false;
 $('start').textContent=v3?'开始练习':'开始检查';
 $('libraryHelp').textContent=v3?'在同一页面选择 Recognition 或 Synonym，再设置范围与题量。':'选择词库后，再设置检查范围与题量。';
 document.body.classList.toggle('v3-home',v3);clearPresetOutput();
}
async function activateV3(){
 if(active||H.active)throw Error('请先结束当前练习。');
 const version=++loadVersion;pendingLibraryId=V3_ID;loading=true;setSourceKind('v3');$('loadError').hidden=true;$('start').disabled=true;renderLibraryPicker();
 try{if(version!==loadVersion)return;await H.activate();if(version!==loadVersion)return;return V3_ID}
 catch(e){if(version===loadVersion){$('loadErrorDetail').textContent=e.message;$('loadError').hidden=false}}
 finally{if(version===loadVersion){loading=false;renderLibraryPicker();H.updateSetup()}}
}
function selection(){return selectionContext().pool}
const listCounts=new Map();
function listPlan(){return C.range($('range').value,words.map(w=>w.list)).map(list=>({list,count:listCounts.get(list)===''?NaN:Number(listCounts.get(list))}))}
function renderListCounts(){let lists=[],eligible=words;try{lists=selectedGroups();eligible=selection()}catch{}$('listCounts').innerHTML=lists.map(list=>{const available=eligible.filter(w=>w.list===list).length;if(!listCounts.has(list))listCounts.set(list,String(Math.min(10,available)));return `<div class="count-row"><label for="list-count-${list}">${esc(listName(list))}<small>当前范围 ${available} 个词</small></label><input id="list-count-${list}" data-count-list="${list}" type="number" min="0" max="${available}" step="1" value="${esc(listCounts.get(list))}" aria-label="${esc(listName(list))} 抽取数量"><span>个</span></div>`}).join('')}
function clearPresetOutput(){$('presetLinkPanel').hidden=true;$('presetLink').value='';$('copyPreset').textContent='复制链接'}
function answerOptions(){const raw=$('questionTime').value.trim(),seconds=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(seconds)||seconds<0||seconds>600)throw Error('每题限时需为 0–600 的整数秒；0 表示不限时。');return{timeLimit:seconds,hintsAllowed:assistanceSelect.value!=='none',assistanceMode:assistanceSelect.value,showFirstLetter:$('showFirstLetter').checked}}
function totalQuestionCount(value,available,scope){try{return C.totalCount(value,available)}catch(e){const n=Number(String(value).trim());if(scope.type==='prefix'&&Number.isSafeInteger(n)&&n>available)throw Error(`当前前 ${scope.prefixCount} 个词范围只有 ${available} 个词，请减少总题量。`);throw e}}
function updateSelection(){
 if(sourceKind==='v3'){clearPresetOutput();H.updateSetup();return}
 clearPresetOutput();updateScopeControls();const perList=$('sampling').value==='per-list';$('perListSettings').hidden=!perList;$('totalSettings').hidden=perList;
 const linkable=activeLibrary?.source.type==='builtin';$('presetHelp').textContent=linkable?'链接保留限时和提示设置；学生打开后直接练习。固定测试保持同一批单词，随机练习每次重新抽词。':'临时导入的 TXT 只存在于当前设备，不能生成学生链接。';
 try{
  const context=selectionContext(),selected=context.pool,options=answerOptions();let total=perList?0:totalQuestionCount($('count').value,selected.length,context.scope);$('count').max=selected.length;
  $('countHelp').textContent=context.scope.type==='prefix'?'填 0 检查当前前 N 个词范围内的全部单词。':'填 0 检查所选单元全部单词。';
  if(perList){const plan=listPlan();for(const row of plan){const available=selected.filter(w=>w.list===row.list).length;if(!Number.isInteger(row.count)||row.count<0)throw Error(listName(row.list)+' 的抽取数量需为 0 或正整数。');if(row.count>available)throw Error((context.scope.type==='prefix'?`当前前 ${context.scope.prefixCount} 个词范围只有 ${available} 个词，`:`${listName(row.list)} 只有 ${available} 个词，`)+'请减少抽取数量。');total+=row.count}if(!total)throw Error('请至少抽取 1 个单词。')}
  const scopeText=context.scope.type==='prefix'?`${listName(context.scope.list)} · 第 1–${context.scope.prefixCount} 个词 · 随机抽查 ${total} 题`:`已选 ${selected.length} 个词 · 本轮 ${total} 题`;
  $('selection').textContent=scopeText+(options.timeLimit?` · 每题 ${options.timeLimit} 秒`:'')+(options.hintsAllowed?'':' · 不提供提示');$('setupError').textContent=libraryLoadFailed?'词库加载失败，请重试或重新选择词库后再生成链接。':'';$('start').disabled=loading||!selected.length;$('createPreset').disabled=$('start').disabled||!linkable||libraryLoadFailed;
 }catch(e){$('selection').textContent='';$('setupError').textContent=e.message;$('start').disabled=true;$('createPreset').disabled=true}
 let r=[];try{r=selectedGroups()}catch{}document.querySelectorAll('.chip').forEach(el=>el.classList.toggle('selected',r.includes(+el.dataset.list)));
}
function renderPreview(){let lists=[...new Set(words.map(w=>w.list))].sort((a,b)=>a-b);$('wordCount').textContent=words.length+' 个词';$('lists').innerHTML=lists.map(l=>`<span class="chip" data-list="${l}">${esc(listName(l))} <strong>${words.filter(w=>w.list===l).length}</strong></span>`).join('');$('preview').innerHTML=words.map(w=>`<tr><td><strong>${esc(w.word)}</strong><small>${esc(w.phonetic||'未提供音标')}</small></td><td><span class="word-pos">${esc(w.pos)}</span>${esc(w.senses.join('；'))}</td><td><span class="pill">${namedGroups()?esc(listName(w.list)):w.list}</span></td></tr>`).join('');$('previewBottom').innerHTML='正式检查时隐藏英文答案。<span>每轮随机排序</span>';renderListCounts();updateSelection()}
$('range').addEventListener('input',()=>{updateScopeControls();renderListCounts();updateSelection()});$('count').addEventListener('input',updateSelection);$('sampling').addEventListener('change',updateSelection);$('vocabularyScope').addEventListener('change',()=>{updateScopeControls();renderListCounts();updateSelection()});$('prefixCount').addEventListener('input',()=>{renderListCounts();updateSelection()});$('questionTime').addEventListener('input',updateSelection);assistanceSelect.addEventListener('change',updateSelection);$('listCounts').addEventListener('input',e=>{if(e.target.dataset.countList){listCounts.set(+e.target.dataset.countList,e.target.value);updateSelection()}});document.querySelectorAll('[name=mode]').forEach(input=>input.addEventListener('change',()=>{$('firstLetterSetting').hidden=document.querySelector('[name=mode]:checked').value!=='single';updateSelection()}));$('firstLetterSetting').hidden=true;$('showFirstLetter').addEventListener('change',updateSelection);
function useWordList(text,name,isDefault=false,encoding='UTF-8'){
 const parsed=C.parse(text);if(!parsed.words.length)throw Error('没有识别到词条，请检查词表格式。');
 return useLibrary(V.fromLegacy(parsed,{name}),isDefault,encoding);
}
function useLibrary(library,isDefault=false,encoding='UTF-8'){
 const nextWords=V.toPracticeWords(library);if(!nextWords.length)throw Error('没有识别到词条，请检查词表格式。');
 const name=library.name,parsed={warnings:library.importDiagnostics||[]};
 setSourceKind('spelling');activeLibrary=library;words=nextWords;libraryLoadFailed=false;listCounts.clear();$('vocabularyScope').value='all';$('prefixCount').value='60';const lists=[...new Set(words.map(w=>w.list))].sort((a,b)=>a-b);
 if(!isDefault)$('range').value=lists.join(',');else{try{C.range($('range').value,lists)}catch{$('range').value=String(lists[0])}}
 $('sourceBadge').textContent=name;$('defaultNotice').hidden=!isDefault;$('defaultNotice').innerHTML='<strong>IELTS 默认词库</strong><p>List 1–48 · 打开即用，选择检查范围与题量即可开始。</p>';$('restoreDefault').hidden=isDefault;$('loadError').hidden=true;
 $('importNotice').className='';$('importNotice').innerHTML=`<p class="small">${isDefault?'默认词库已就绪':library.source.type==='builtin'?'词库已就绪':'已临时导入'} · ${words.length.toLocaleString()} 个词条 · ${lists.length} 个${namedGroups()?'难度分组':' List'}${library.source.type==='user'?' · '+encoding:''}</p>`;
 const noIPA=words.filter(w=>!w.phonetic).length;
 if(parsed.warnings.length||noIPA){const d=document.createElement('details');d.className='source-notes';d.innerHTML=`<summary>词表核对说明${parsed.warnings.length?' · '+parsed.warnings.length+' 处格式或重复记录':''}</summary>${parsed.warnings.length?'<pre>'+parsed.warnings.map(w=>'第 '+w.line+' 行 · '+esc(w.reason)+'\n'+esc(w.text)).join('\n\n')+'</pre>':''}${noIPA?'<p class="small">'+noIPA+' 个词条原文未提供音标，以短语为主；检查时显示释义。</p>':''}`;$('importNotice').append(d)}
 renderGroupChoices();renderLibraryPicker();renderPreview();
}
async function loadLibrary(libraryId){if(active||H.active)throw Error('请先结束当前检查。');setSourceKind('spelling');const version=++loadVersion;pendingLibraryId=libraryId||null;loading=true;$('sourceBadge').textContent='正在加载词库…';$('start').disabled=true;$('createPreset').disabled=true;$('loadError').hidden=true;
 try{await ensureCatalog();if(version!==loadVersion)return;renderLibraryPicker();const library=await libraries.load(libraryId||libraries.defaultId);if(version!==loadVersion)return;useLibrary(library,library.id===libraries.defaultId);return library.id}catch(e){if(version!==loadVersion)return;libraryLoadFailed=true;$('sourceBadge').textContent=words.length?'保留当前词表':'词库未加载';$('loadErrorDetail').textContent=e.message;$('loadError').hidden=false}
 finally{if(version===loadVersion){loading=false;renderLibraryPicker();if(words.length)updateSelection();else $('start').disabled=true}}
}
function loadDefault(){return loadLibrary()}
// Lightweight integration/test entry point; no new selector or persistence UI.
window.WordCheckLibraries={register:entry=>libraries.register(entry),switchLibrary:id=>id===V3_ID?activateV3():loadLibrary(id),list:()=>[...libraries.list().map(({id,version})=>({id,version})),{id:V3_ID,version:'3'}],get activeId(){return sourceKind==='v3'?V3_ID:activeLibrary?.id||null}};
$('retryLoad').onclick=()=>pendingLibraryId===V3_ID?activateV3():loadLibrary(pendingLibraryId);$('restoreDefault').onclick=loadDefault;
$('file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;const version=++loadVersion;loading=true;$('start').disabled=true;$('createPreset').disabled=true;try{if(file.size>2*1024*1024)throw Error('文件超过 2 MB，请先精简词表。');const buf=await file.arrayBuffer();let text,encoding='UTF-8';try{text=new TextDecoder('utf-8',{fatal:true}).decode(buf)}catch{text=new TextDecoder('gb18030',{fatal:true}).decode(buf);encoding='GB18030'}if(version!==loadVersion)return;useWordList(text,file.name,false,encoding)}catch(err){$('importNotice').textContent=err.message;$('importNotice').className='error';updateSelection()}finally{if(version===loadVersion){loading=false;renderLibraryPicker();updateSelection()}e.target.value=''}});
function stopTimer(hide=true){if(timerId!==null){clearInterval(timerId);timerId=null}if(hide){$('timer').hidden=true;$('timer').classList.remove('timer-low')}}
function updateTimer(){if(!active||graded||!timeLimit)return;const remaining=Math.max(0,Math.ceil((timerDeadline-Date.now())/1000));$('timer').textContent=remaining+' 秒';$('timer').classList.toggle('timer-low',remaining<=5);if(remaining===0){stopTimer(false);grade(true,'timeout')}}
function startTimer(){stopTimer();if(!timeLimit)return;timerDeadline=Date.now()+timeLimit*1000;$('timer').hidden=false;updateTimer();timerId=setInterval(updateTimer,250)}
function begin(pool,chosenMode,chosenScope,options={}){if(loading)throw Error('词库正在加载，请稍候。');if(!pool.length)throw Error('没有可用词条。');stopTimer();queue=C.shuffle(pool);questionPrompts=queue.map(w=>C.spellingPrompt(w,chosenMode,Math.floor(Math.random()*w.senses.length),{legacy:options.legacyPrompt===true,showFirstLetter:options.showFirstLetter!==false}));window.WordCheckLearning?.onCheckStart({queue,library:activeLibrary,mode:chosenMode,prompts:questionPrompts});answers=[];index=0;mode=chosenMode;scope=chosenScope;timeLimit=options.timeLimit??0;hintsAllowed=options.hintsAllowed??true;assistanceMode=options.assistanceMode??(hintsAllowed?'both':'none');legacyPrompt=options.legacyPrompt===true;showFirstLetter=options.showFirstLetter!==false;active=true;show('quiz');renderQuestion();return{questions:queue.length,mode,scope,timeLimit,hintsAllowed,assistanceMode,showFirstLetter}}
function configuredQuiz(){const context=selectionContext(),selected=context.pool,perList=$('sampling').value==='per-list',plan=perList?listPlan():null,count=$('count').value,pool=perList?C.sampleByList(selected,plan):C.sampleMixed(selected,count);const label=context.scope.type==='prefix'?`${listName(context.scope.list)} · 第 1–${context.scope.prefixCount} 个词 · 随机抽查 ${pool.length} 题`:perList?plan.filter(p=>p.count>0).map(p=>`${listName(p.list)} 抽 ${p.count} 个`).join(' · '):namedGroups()?selectedGroups().map(listName).join('、'):'List '+$('range').value;return{pool,scope:context.scope,mode:document.querySelector('[name=mode]:checked').value,label,options:answerOptions()}}
$('start').onclick=()=>{if(sourceKind==='v3'){H.start();return}try{const quiz=configuredQuiz();begin(quiz.pool,quiz.mode,quiz.label,quiz.options)}catch(e){$('setupError').textContent=e.message}};
$('createPreset').onclick=async()=>{
 const button=$('createPreset');
 try{
  if(!teacherMode)throw Error('请使用教师设置页生成链接。');
  if(loading)throw Error('词库正在加载，请稍候。');
  if(sourceKind==='spelling'&&libraryLoadFailed)throw Error('词库加载失败，请重试或重新选择词库后再生成链接。');
  button.disabled=true;button.textContent='正在生成…';
  const random=$('linkType').value==='random';
  if(random&&window.WordAssignedTeacher?.assigned)throw Error('指定学生作业请选固定测试，以便每次使用相同题目。');
  let payload,questions,summary;
  if(sourceKind==='v3'){
   const built=H.buildPreset(random?'random':'fixed');payload=built.payload;questions=built.questions;
   summary=(random?'每次按设置重新抽取':'已固定')+' '+questions+' 道题 · '+(payload.m==='recognition'?'Recognition 四选一':'Synonym 多选')+(payload.g?' · '+payload.g:'')+(random?' · 刷新或再练会重新抽题，可能与上一轮重合':' · 学生每次打开时随机排列');
  }else{
   if(activeLibrary?.source.type!=='builtin')throw Error('临时导入的 TXT 无法生成学生链接。');
   const quiz=configuredQuiz();payload={v:random?(quiz.scope.type==='prefix'?P.SCOPED_RANDOM_VERSION:P.RANDOM_VERSION):P.VERSION,l:activeLibrary.id,lv:activeLibrary.version,m:quiz.mode,t:quiz.options.timeLimit,h:quiz.options.hintsAllowed,...(quiz.mode==='single'?{i:quiz.options.showFirstLetter}:{}),...(quiz.options.assistanceMode==='check'?{u:'check'}:{})};
   if(random){
    if(quiz.scope.type==='prefix'){
     payload.r=quiz.scope.list;payload.p=quiz.scope.prefixCount;payload.n=$('sampling').value==='per-list'?listPlan()[0].count:Number($('count').value);P.sampleScopedRandom(payload,words,C);
    }else{
     payload.a=$('sampling').value;payload.r=selectedGroups();if(payload.a==='per-list')payload.c=listPlan().map(row=>row.count);else payload.n=Number($('count').value);P.sampleRandom(payload,words,C);
    }
   }else{
    const byId=new Map(words.map((word,i)=>[word.id,i]));payload.w=quiz.pool.map(word=>byId.get(word.id));
   }
   questions=quiz.pool.length;
   summary=(random?'每次按设置重新抽取':'已固定')+' '+questions+' 个单词 · '+quiz.label+' · '+(quiz.options.timeLimit?'每题 '+quiz.options.timeLimit+' 秒':'不限时')+' · '+(quiz.options.hintsAllowed?'允许提示':'不提供提示')+(random?' · 刷新或再练会重新抽词，可能与上一轮重合':' · 学生每次打开时随机排列');
  }
  let url=await P.createUrl(payload,new URL('./',document.baseURI).href);
  if(url.length>2000)throw Error('链接过长，请减少题量或选择范围。');
  if(window.WordAssignedTeacher?.assigned){url=await window.WordAssignedTeacher.wrap(url);summary+=' · 已指定学生，成绩需提交到服务端'}
  $('presetLink').value=url;$('presetSummary').textContent=summary;$('presetLinkPanel').hidden=false;$('presetLink').focus();$('presetLink').select();
 }catch(e){$('setupError').textContent=e.message}
 finally{button.textContent='生成学生练习链接';button.disabled=$('start').disabled||(sourceKind==='spelling'&&(activeLibrary?.source.type!=='builtin'||libraryLoadFailed))}
};
$('copyPreset').onclick=async()=>{try{await navigator.clipboard.writeText($('presetLink').value)}catch{$('presetLink').select();document.execCommand('copy')}$('copyPreset').textContent='已复制'};
function renderQuestion(){const w=queue[index];hints=0;spellingChecks=0;spellingMessage='';graded=false;const prompt=questionPrompts[index];currentSense=prompt.meaning;$('quizMode').textContent=mode==='full'?'音标 + 释义':'单个释义';$('progressText').textContent=`${index+1} / ${queue.length}`;$('progressBar').style.width=`${index/queue.length*100}%`;$('questionList').textContent=namedGroups()?listName(w.list):`LIST ${String(w.list).padStart(2,'0')}`;$('phonetic').hidden=mode==='single';$('phonetic').textContent=w.phonetic||'未提供音标';$('meaning').textContent=mode==='single'?currentSense:w.senses.join('；');$('pos').textContent=prompt.pos;$('pos').hidden=!prompt.pos;$('initialCue').hidden=!prompt.initialShown;$('initialCue').textContent=prompt.initialShown?'首字母：'+prompt.initial:'';$('answer').value='';$('answer').disabled=false;$('hintDisplay').textContent='';$('feedback').textContent='';$('feedback').className='';$('checkSpelling').hidden=assistanceMode==='none';$('checkSpelling').disabled=assistanceMode==='none';$('hint').hidden=assistanceMode!=='both';$('hint').disabled=assistanceMode!=='both'||C.letterHint(w.word,0).max===0;$('submit').hidden=false;$('skip').hidden=false;$('next').hidden=true;$('answer').focus();startTimer()}
$('checkSpelling').onclick=()=>{if(graded||assistanceMode==='none')return;const typed=$('answer').value.trim();if(!typed){spellingMessage='请先输入自己的拼写。';renderAssistance();$('answer').focus();return}spellingChecks++;const w=queue[index],match=C.spellingPosition([w.word,...(w.variants||[])].find(candidate=>C.normalize(candidate)===C.normalize(typed))||w.word,typed);spellingMessage=match.matched?'当前拼写匹配，请点击右下角检查答案提交。':`前 ${match.prefix} 个字符正确，后续拼写需要检查。${match.expectedLength===match.actualLength?'':`长度不同：当前 ${match.actualLength} 个字符。`}`;renderAssistance();$('answer').focus()};
$('hint').onclick=()=>{if(graded||assistanceMode!=='both')return;const result=C.letterHint(queue[index].word,hints+1);if(hints>=result.max)return;hints++;renderAssistance();$('hint').disabled=hints>=result.max;$('answer').focus()};
function grade(skip=false,reason=''){if(graded||!active)return;let typed=$('answer').value.trim();if(!typed&&!skip){$('answer').setCustomValidity('请先输入答案，或选择“不会，查看答案”。');$('answer').reportValidity();return}stopTimer(reason!=='timeout');$('answer').setCustomValidity('');let w=queue[index],ok=!skip&&C.accepts(w,typed),status=ok?(hints?'letter_assisted':spellingChecks?'checked':'correct'):'wrong';answers.push({entry:w,typed,hints,spellingChecks,status,reason,prompt:currentSense,initialShown:questionPrompts[index].initialShown===true,initial:questionPrompts[index].initial||''});window.WordCheckLearning?.onCheckAnswer({index,typed,hints,spellingChecks,skip,reason});graded=true;$('answer').disabled=true;$('hint').disabled=true;$('checkSpelling').disabled=true;$('submit').hidden=true;$('skip').hidden=true;$('feedback').className='feedback '+(status==='letter_assisted'||status==='checked'?'assisted':status);$('feedback').innerHTML=`<strong>${ok?{correct:'独立答对，记得很牢！',checked:'检查后答对',letter_assisted:'字母辅助答对'}[status]:(reason==='timeout'?'本题超时':skip?'这个词再练一次':'拼写还差一点')}</strong><br>正确答案：<strong>${esc(w.word)}</strong>${!ok?'<br>'+esc(w.senses.join('；')):''}`;if(!ok&&mode==='single')$('feedback').insertAdjacentHTML('beforeend','<br><small>按词表原词判分；若写出其他同义词，可由老师另行判断。</small>');$('next').textContent=index===queue.length-1?'查看本轮结果':'下一题';$('next').hidden=false;$('next').focus()}
$('answer').oninput=()=>{$('answer').setCustomValidity('');spellingMessage='';if(active&&!graded)renderAssistance()};$('answerForm').onsubmit=e=>{e.preventDefault();grade()};$('skip').onclick=()=>grade(true,'skip');$('next').onclick=()=>{if(!graded)return;if(++index>=queue.length)finish();else renderQuestion()};
$('exit').onclick=()=>{if(window.confirm('结束本轮并查看已完成题目的结果？'))finish()};
function finish(){stopTimer();active=false;window.WordCheckLearning?.onCheckFinish();show('results');$('resultTitle').textContent=answers.length===queue.length?'本轮检查完成':'本轮已结束';$('resultScope').textContent=`${isDemo?'示例词表 · ':''}${scope} · ${mode==='full'?'音标 + 释义':legacyPrompt?'单个释义（旧版题干）':showFirstLetter?'单个释义 · 词性 + 首字母':'单个释义 · 词性'}${timeLimit?` · 每题 ${timeLimit} 秒`:''}${hintsAllowed?'':' · 不提供提示'} · 已完成 ${answers.length} / ${queue.length} 题`;$('independent').textContent=answers.filter(a=>a.status==='correct').length;$('checked').textContent=answers.filter(a=>a.status==='checked').length;$('assisted').textContent=answers.filter(a=>a.status==='letter_assisted').length;$('incorrect').textContent=answers.filter(a=>a.status==='wrong').length;$('review').innerHTML=answers.map(a=>`<tr><td><strong>${esc(a.entry.word)}</strong><small>${esc(listName(a.entry.list))}</small></td><td class="review-answer">${esc(a.typed||'未作答')}</td><td><span class="pill ${a.status==='checked'||a.status==='letter_assisted'?'assisted':a.status}">${a.reason==='timeout'?'超时':{correct:'独立答对',checked:'检查后答对',letter_assisted:'字母辅助答对',wrong:'待复习'}[a.status]}</span>${a.spellingChecks?'<small>拼写检查 '+a.spellingChecks+' 次</small>':''}${a.hints?'<small>字母提示 '+a.hints+' 次</small>':''}${a.initialShown?'<small>题干提供首字母 '+esc(a.initial)+'</small>':''}</td><td>${esc(a.entry.senses.join('；'))}</td></tr>`).join('')||'<tr><td colspan="4">本轮尚未完成任何题目。</td></tr>';$('retry').disabled=!answers.some(a=>a.status!=='correct')}
$('restart').onclick=()=>{if(window.WordCheckLearning?.restartCheck())return;if(presetSession){const pool=presetSession.recipe?(presetSession.recipe.v===P.SCOPED_RANDOM_VERSION?P.sampleScopedRandom(presetSession.recipe,words,C):P.sampleRandom(presetSession.recipe,words,C)):presetSession.pool;begin(pool,presetSession.mode,presetSession.scope,presetSession.options);}else{show('setup');updateSelection()}};$('retry').onclick=()=>begin(answers.filter(a=>a.status!=='correct').map(a=>a.entry),mode,scope+' · 巩固练习',{timeLimit,hintsAllowed,assistanceMode,showFirstLetter,legacyPrompt});
window.addEventListener('beforeunload',e=>{if(active){e.preventDefault();e.returnValue=''}});
window.WordCheckHome={show,get sourceKind(){return sourceKind},async startLearnCheck(pack){
 if(teacherMode||presetSession||/^(#preset=|#assigned=)/.test(location.hash)&&!window.WordCheckLearning?.isAssignment)throw Error('指定检查任务不能替换为学习包。');
 if(active||H.active)throw Error('请先结束当前检查。');
 const loaded=await loadLibrary(pack.libraryId);if(!loaded||libraryLoadFailed)throw Error('无法加载学习包词库，请重试。');
 const pool=window.WordLearnCore.resolvePack(pack,activeLibrary,words),settings=pack.settings.finalCheck;
 return begin(pool,settings.mode,pack.name+' · 正式检查',{timeLimit:settings.timeLimit,hintsAllowed:settings.hintsAllowed,assistanceMode:settings.assistanceMode,showFirstLetter:settings.showFirstLetter,legacyPrompt:settings.showFirstLetter===undefined});
}};
$('goLearn')?.addEventListener('click',()=>window.WordCheckLearning.openSetup());
$('goCheck')?.addEventListener('click',()=>{show('setup');updateSelection()});
$('checkHome')?.addEventListener('click',()=>show('studentHome'));
async function initialize(){
 const assigned=location.hash.startsWith('#assigned=');
 if(!location.hash.startsWith('#preset=')&&!assigned){show(teacherMode||location.hash==='#check'?'setup':'studentHome');loadDefault();return}
 show('presetLoading');document.body.classList.add('preset-mode');document.title='Word Check · 学生练习';
 try{
  if(assigned)await window.WordAssignedReady;
  if(assigned&&!window.WordAssignedPreset)throw Error('指定作业需要连接服务器并保存学习记录，请稍后重试。');
  if(assigned){const sync=await window.WordCloudSync?.ready;if(sync?.status==='pending')throw Error('目前无法读取学生云端记录，请检查网络后重新打开作业链接。')}
  const preset=await P.readHash(assigned?window.WordAssignedPreset.presetHash:location.hash);
  if(preset.v===P.DAILY_VERSION){setSourceKind('v3');await H.startPreset(preset);return}
  await ensureCatalog();
  if(!libraries.list().some(entry=>entry.id===preset.l))throw Error('这份练习使用的词库目前不可用。');
  await loadLibrary(preset.l);
  if(activeLibrary?.id!==preset.l)throw Error('无法加载这份练习使用的词库。');
  if(activeLibrary.version!==preset.lv)throw Error('词库版本已经更新，请老师重新生成练习链接。');
  if(preset.v===P.LEARNING_VERSION){await window.WordCheckLearning.startAssignment(preset,activeLibrary,words,assigned?window.WordAssignedPreset.presetHash:location.hash);return}
  let pool;if(preset.v===P.SCOPED_RANDOM_VERSION)pool=P.sampleScopedRandom(preset,words,C);else if(preset.v===P.RANDOM_VERSION)pool=P.sampleRandom(preset,words,C);else if(preset.v===P.VERSION)pool=preset.w.map(position=>words[position]);else{const byId=new Map(words.map(word=>[word.id,word]));pool=preset.w.map(id=>byId.get(id))}
  if(pool.some(word=>!word))throw Error('部分练习单词已不在当前词库中，请老师重新生成链接。');
  const options={timeLimit:preset.t??0,hintsAllowed:preset.h??true,assistanceMode:preset.u??(preset.h===false?'none':'both'),showFirstLetter:preset.i??false,legacyPrompt:preset.i===undefined},presetScope=preset.s||(preset.v===P.SCOPED_RANDOM_VERSION?`${listName(preset.r)} · 第 1–${preset.p} 个词 · 随机抽查 ${pool.length} 题`:compactScope(pool));presetSession={pool,mode:preset.m,scope:presetScope,options,recipe:[P.RANDOM_VERSION,P.SCOPED_RANDOM_VERSION].includes(preset.v)?preset:null};$('restart').textContent=presetSession.recipe?'按相同设置再练一组':'重新练习本组单词';
  begin(pool,preset.m,presetScope,options);
 }catch(e){active=false;$('presetErrorMessage').textContent=e.message;show('presetError')}
}
initialize();
if(document.modelContext?.registerTool){const lifecycle=new AbortController();for(const tool of [{name:'read_vocabulary_summary',description:'Read the loaded vocabulary lists and the current quiz status without revealing answers.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){return{lists:[...new Set(words.map(w=>w.list))],words:words.length,isDemo,active,completed:answers.length}}},{name:'start_vocabulary_check',description:'Start a new vocabulary check from the loaded lists. Fails while a quiz is active.',inputSchema:{type:'object',properties:{lists:{type:'string'},mode:{type:'string',enum:['full','single']},count:{type:'integer',minimum:0,maximum:10000}},required:['lists','mode','count'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){if(presetSession||/^(#preset=|#assigned=)/.test(location.hash))throw Error('学生练习链接不允许更改设置。');if(active)throw Error('请先结束当前检查。');if(!input||typeof input.lists!=='string'||!['full','single'].includes(input.mode)||!Number.isInteger(input.count)||input.count<0||input.count>10000)throw Error('Invalid quiz settings');const r=C.range(input.lists,words.map(w=>w.list));if(r.some(n=>!words.some(w=>w.list===n)))throw Error('所选 List 不在词表中。');let pool=C.sampleMixed(words.filter(w=>r.includes(w.list)),input.count);return begin(pool,input.mode,'List '+input.lists)}}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{})}catch{}}window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true})}
