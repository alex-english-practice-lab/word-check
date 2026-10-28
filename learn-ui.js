/* Student learning controller; teacher links pin fixed Word IDs. */
(function(root){
'use strict';
if(document.body.dataset.teacher==='true')return;
const L=root.WordLearnCore,V=root.WordVocabulary,R=root.WordPracticeRecords,C=root.WordCore,D=root.WordCheckPracticeCore,G=root.WordVocabularyProgress;
const repo=root.WordLearnStore.createRepository(()=>root.WordStudentIdentity?.storage||root.localStorage),registry=V.createRegistry();
const $=id=>document.getElementById(id),text=(id,value)=>$(id).textContent=value;
const WHOLE_LIST_LIBRARIES=new Set(['lib:ielts','lib:writing-survival-100']);
let catalogPromise,library=null,words=[],bundle=null,checkBundle=null,practiceBundle=null,checkAttached=false,loading=false,request=0,manualCount='8',assignment=false;
const sections=document.createElement('div');
sections.innerHTML=`
<section id="learnSetup" hidden class="panel learn-setup">
 <div class="section-heading"><span class="step">L</span><h2>背单词 · Learn Vocabulary</h2><button id="learnHome" class="text-button">返回首页</button></div>
 <p class="muted">先认识新词，再用中文回忆英文，最后实际拼写检查。</p>
 <div id="learnResumePanel" class="notice" hidden><strong id="learnResumeName"></strong><p id="learnResumeDetail"></p><button id="learnResume" class="secondary">继续上次学习</button></div>
 <section class="learn-dashboard" aria-label="My Vocabulary"><div class="section-heading"><h3>My Vocabulary · 我的词汇</h3><button type="button" id="learnExport" class="text-button">导出 JSON 备份</button></div>
  <div class="learn-metrics"><div><strong id="metricSeen">0</strong><span>已接触</span></div><div><strong id="metricChecked">0</strong><span>已正式检查</span></div><div><strong id="metricDue">0</strong><span>待复习</span></div><div><strong id="metricFrequent">0</strong><span>经常答错</span></div></div>
  <p id="metricLast" class="small"></p><h4>Today's Vocabulary · 今日学习</h4><div class="learn-today"><button type="button" id="todayNew" class="secondary"></button><button type="button" id="todayDue" class="secondary"></button><button type="button" id="todayNeeds" class="secondary"></button></div><p id="learnHistoryNote" class="small"></p>
 </section>
 <div class="learn-settings">
  <div><label class="field-label" for="learnLibrary">词库</label><select id="learnLibrary" disabled></select></div>
  <div><label class="field-label" for="learnGroup">List / 难度</label><select id="learnGroup" disabled></select></div>
  <div><label class="field-label" for="learnFilter">学习内容</label><select id="learnFilter"><option value="new">新词 · 尚未首次学习</option><option value="due">到期复习</option><option value="old">旧词 · 主动回忆</option><option value="again">还不会 · 再复习</option><option value="all">当前范围全部词</option></select></div>
  <div id="learnCountField"><label class="field-label" for="learnCount">本次词数</label><input id="learnCount" type="number" min="1" step="1" value="8" inputmode="numeric"></div>
 </div>
 <div id="learnScopeField" class="learn-scope" hidden><label class="field-label" for="learnScope">Vocabulary Scope · 选词范围</label><select id="learnScope"><option value="all">All Words · 全部单词</option><option value="prefix">First N Words · 前 N 个词</option></select><div id="learnPrefixField" hidden><label class="field-label" for="learnPrefix">前多少个词？</label><input id="learnPrefix" type="number" min="1" step="1" value="60" inputmode="numeric"></div></div>
 <details class="learn-check-settings"><summary>正式检查设置</summary><div class="learn-settings"><div><label class="field-label" for="learnTime">每题秒数 · 0 不限时</label><input id="learnTime" type="number" min="0" max="600" step="1" value="0" inputmode="numeric"></div><div><span class="field-label">提示设置</span><label class="learn-toggle-control"><input id="learnHints" type="checkbox"><span>允许提示字母</span></label></div></div></details>
 <p id="learnAvailable" class="small"></p><p id="learnSetupError" class="error" role="alert"></p>
 <button id="learnStart" class="primary" disabled>开始学习</button><button id="learnReload" class="text-button" hidden>重新加载词库</button>
 <p class="small">雅思与多邻国核心100按所选 List 全量学习；多邻国难度词库默认每次 8 词，可自由修改。新词先看英文；已学习的词直接进入中文回忆。</p>
</section>
<section id="learnCards" hidden class="learn-workspace">
 <div class="quiz-top"><button id="learnPause" class="text-button">暂停并返回</button><span id="learnStage" class="pill"></span><span id="learnProgress"></span></div>
 <h2 id="learnPackName" class="learn-pack-name"></h2><div class="progress"><div id="learnProgressBar"></div></div>
 <button type="button" id="flashcard" class="panel flashcard" aria-label="翻转单词卡" aria-pressed="false"><span id="cardSide" class="eyebrow"></span><strong id="cardMain"></strong><span id="cardPhonetic"></span><span id="cardPos"></span><span id="cardMeaning"></span><span id="cardInstruction" class="small"></span></button>
 <div id="learnCardActions" class="learn-actions"><button id="learnPrevious" class="secondary">上一张</button><button id="learnNext" class="primary">下一张</button></div>
 <div id="reviewCardActions" class="learn-actions" hidden><button id="reviewAgain" class="secondary">还不会 · Again</button><button id="reviewKnow" class="primary">记住了 · Know</button></div>
 <p id="learnCardHelp" class="small" aria-live="polite"></p><button id="reviewEnd" class="text-button" hidden>结束本轮复习 / 进入检查</button>
</section>
<section id="learnSummary" hidden class="panel results learn-summary">
 <span class="eyebrow">LEARN → REVIEW → CHECK</span><h1 id="learnSummaryTitle"></h1><p id="learnSummaryText"></p>
 <div class="stats p-two-stats" id="learnReviewStats" hidden><div><strong id="reviewKnownCount"></strong><span>自评记住</span></div><div><strong id="reviewPendingCount"></strong><span>仍需复习</span></div></div>
 <p id="learnSummaryNote" class="muted"></p><p id="learnActionError" class="error" role="alert"></p>
 <div class="result-actions"><button id="learnContinue" class="secondary">继续复习</button><button id="learnCheck" class="primary">开始正式检查</button><button id="learnFinish" class="primary" hidden>完成学习任务</button><button id="learnBack" class="text-button">返回学习设置</button></div>
</section>
<section id="learnPaused" hidden class="panel results learn-summary"><h1>学习已暂停</h1><p>当前进度保存在本浏览器。再次打开同一链接也可继续。</p><button id="learnPausedResume" class="primary">继续学习</button></section>
<p id="learnStorageNotice" class="small learn-storage" role="status" hidden></p>`;
document.querySelector('footer').before(sections);
const returnButton=document.createElement('button');returnButton.id='returnToLearn';returnButton.className='secondary';returnButton.textContent='返回学习包';returnButton.hidden=true;$('results').querySelector('.result-actions').append(returnButton);
function show(id){root.WordCheckHome.show(id);$('learnStorageNotice').hidden=false;storageNotice()}
function dailyData(){try{return D.readStoreDetailed(root.WordStudentIdentity?.storage||root.localStorage)}catch{return {store:{attempts:[]},warning:'本浏览器无法读取日常词汇记录。'}}}
function progress(){return G.derive({sessions:repo.sessions(),checks:repo.checks(),daily:dailyData().store,profileId:repo.identity.profileId})}
function storageNotice(){const warning=[root.WordStudentIdentity?.warning,repo.warning,dailyData().warning].filter(Boolean).join(' ');text('learnStorageNotice',warning||'学习记录只保存在当前浏览器；清理浏览器数据会丢失记录。自评不计入正式成绩。');if(warning)$('learnStorageNotice').hidden=false}
function refreshDashboard(){const data=progress(),current=data.words.filter(w=>w.libraryId===library?.id),byId=new Map(current.map(w=>[w.wordId,w]));
 text('metricSeen',data.summary.seen);text('metricChecked',data.summary.checked);text('metricDue',data.summary.due);text('metricFrequent',data.summary.frequent);text('metricLast',data.summary.lastAt?'最近学习：'+new Date(data.summary.lastAt).toLocaleString('zh-CN'):'最近学习：暂无记录');
 const group=$('learnGroup').value;let range=words.filter(w=>!group||w.listId===group);
 if(library?.id==='lib:difficulty-100-120'&&$('learnScope').value==='prefix'){
  const selected=library.lists.find(l=>l.id===group),raw=$('learnPrefix').value.trim(),n=Number(raw);
  if(selected&&/^\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>0&&n<=range.length)range=C.prefixPool(words,selected.number,n);
 }
 text('todayNew',`New Words · ${range.filter(w=>!byId.get(w.id)?.seen).length}`);text('todayDue',`Due for Review · ${range.filter(w=>byId.get(w.id)?.due).length}`);text('todayNeeds',`Needs More Practice · ${range.filter(w=>byId.get(w.id)?.needsPractice).length}`);
 text('learnHistoryNote',dailyData().warning||'今日任务仅作建议；可自行选择其他词库、List 和学习内容。旧版日常词汇最多保留 100 轮历史，已删除的旧记录无法恢复。');storageNotice();return byId}
function save(){if(root.WordStudentIdentity?.assignmentId)bundle.assignmentId=root.WordStudentIdentity.assignmentId;repo.saveSession(bundle);root.WordCloudSync?.queue();storageNotice();refreshDashboard()}
function catalog(){return catalogPromise||(catalogPromise=registry.loadManifest(new URL('data/catalog.json',document.baseURI).href).catch(error=>{catalogPromise=null;throw error}))}
function available(){
 if(!library)throw Error('词库尚未加载。');const state=refreshDashboard(),group=$('learnGroup').value,filter=$('learnFilter').value;
 let pool=words.filter(w=>!group||w.listId===group);
 if(library.id==='lib:difficulty-100-120'&&$('learnScope').value==='prefix'){
  const selected=library.lists.find(list=>list.id===group),raw=$('learnPrefix').value.trim(),n=Number(raw);
  if(!selected)throw Error('请先选择一个难度组。');
  if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<1)throw Error('前 N 个词中的 N 必须为正整数。');
  pool=C.prefixPool(words,selected.number,n);
 }
 return pool.filter(w=>{const s=state.get(w.id);return filter==='all'||filter==='new'&&!s?.seen||filter==='old'&&s?.seen||filter==='again'&&s?.needsPractice||filter==='due'&&s?.due});
}
function usesWholeList(){return Boolean(library&&WHOLE_LIST_LIBRARIES.has(library.id))}
function integer(id,min,max){const raw=$(id).value.trim(),n=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<min||n>max)throw Error(id==='learnTime'?'每题限时需为 0–600 的整数秒。':`本次词数需为 1–${max} 的整数；不能超过当前可用词数。`);return n}
function updateSetup(){
 $('learnStart').disabled=true;if(loading)return;
 const det=library?.id==='lib:difficulty-100-120';$('learnScopeField').hidden=!det;$('learnPrefixField').hidden=!det||$('learnScope').value!=='prefix';
 if(det){const group=library.lists.find(l=>l.id===$('learnGroup').value);$('learnPrefix').max=group?.words.length||0}
 try{const pool=available(),wholeList=usesWholeList();$('learnCountField').hidden=wholeList;$('learnCount').max=pool.length;$('learnCount').value=wholeList?pool.length:manualCount;text('learnAvailable',wholeList?`当前 List 符合条件的 ${pool.length} 个词将全部加入学习包，学习与检查使用同一组词`:`${det&&$('learnScope').value==='prefix'?`${$('learnGroup').selectedOptions[0].textContent} · 第 1–${$('learnPrefix').value} 个词 · `:''}当前可用 ${pool.length} 个词 · 随机组成固定学习包，学习与检查使用同一组词`);if(!pool.length)throw Error('当前范围没有这类词，请切换学习内容或 List / 难度。');if(!wholeList)integer('learnCount',1,pool.length);integer('learnTime',0,600);text('learnSetupError','');$('learnStart').disabled=false}catch(e){text('learnSetupError',e.message)}storageNotice();
}
function resumePanel(){const saved=repo.loadActive();$('learnResumePanel').hidden=!saved;if(saved){text('learnResumeName',saved.pack.name);text('learnResumeDetail',`${saved.pack.wordIds.length} 个词 · ${saved.session.currentStage==='completed'?'已完成，可再次复习':'上次进度已保存'}`)}}
function syncLibraryControls(){
 const previous=$('learnGroup').value;
 $('learnLibrary').replaceChildren(...registry.list().map(e=>new Option(e.name,e.id)));$('learnLibrary').value=library.id;$('learnLibrary').disabled=false;
 $('learnGroup').replaceChildren(...library.lists.map(l=>new Option(l.name,l.id)));if(library.lists.some(l=>l.id===previous))$('learnGroup').value=previous;$('learnGroup').disabled=false;
}
async function loadLibrary(id){
 const ticket=++request;loading=true;library=null;words=[];$('learnStart').disabled=true;$('learnGroup').disabled=true;$('learnReload').hidden=true;text('learnSetupError','正在加载词库…');
 try{await catalog();if(ticket!==request)return;const entries=registry.list();$('learnLibrary').replaceChildren(...entries.map(e=>new Option(e.name,e.id)));$('learnLibrary').disabled=false;$('learnLibrary').value=id||registry.defaultId;
  const loaded=await registry.load(id||registry.defaultId);if(ticket!==request)return;library=loaded;words=V.toPracticeWords(library);syncLibraryControls();
 }catch(e){if(ticket!==request)return;text('learnSetupError','加载失败：'+e.message);$('learnReload').hidden=false}
 finally{if(ticket===request){loading=false;if(library)updateSetup();storageNotice()}}
}
async function openSetup(){checkAttached=false;returnButton.hidden=true;show('learnSetup');if(root.WordStudentIdentity?.mode==='named')await root.WordCloudSync?.ready;resumePanel();refreshDashboard();if(!library)await loadLibrary($('learnLibrary').value||null);else updateSetup()}
function render(){
 const s=bundle.session,p=bundle.pack;L.validateSession(s,p);text('learnActionError','');
 if(s.currentStage==='learn'||s.currentStage==='review'){
  show('learnCards');const learn=s.currentStage==='learn',word=words.find(w=>w.id===s.currentCardId),queue=learn?s.learnQueue:s.reviewQueue;
  text('learnStage',learn?'Learn · 新词初识':'Review · 主动回忆');text('learnPackName',p.name);text('learnProgress',`${s.index+1} / ${queue.length}`);$('learnProgressBar').style.width=`${s.index/queue.length*100}%`;
  text('cardSide',s.flipped?'背面 · 答案':learn?'正面 · 认识英文':'正面 · 回忆英文');text('cardMain',learn||s.flipped?word.word:word.senses.join('；'));
  text('cardPhonetic',learn||s.flipped?word.phonetic:'');text('cardPos',s.flipped||!learn?word.pos:'');text('cardMeaning',s.flipped?word.senses.join('；'):'');
  text('cardInstruction',s.flipped?'点击翻回正面':'点击卡片查看'+(learn?'中文释义':'英文答案'));$('flashcard').setAttribute('aria-pressed',String(s.flipped));
  $('learnCardActions').hidden=!learn;$('reviewCardActions').hidden=learn;$('reviewEnd').hidden=learn;$('learnPrevious').disabled=s.index===0;$('learnNext').disabled=!s.seenIds.includes(s.currentCardId);text('learnNext',s.index===queue.length-1?'完成首次学习':'下一张');
  $('reviewAgain').disabled=!s.flipped;$('reviewKnow').disabled=!s.flipped;text('learnCardHelp',learn?'每张卡至少翻看一次；看过不代表已经掌握。':'先尝试回忆拼写，再翻面自评。Know 不计入正式正确率。');
 }else{
  show('learnSummary');$('learnSummary').querySelector('.eyebrow').textContent=p.settings.includeFinalCheck===false?'LEARN → REVIEW':'LEARN → REVIEW → CHECK';const learned=s.currentStage==='learn_complete',completed=s.currentStage==='completed',interrupted=s.currentStage==='check';
  text('learnSummaryTitle',learned?`已接触 ${s.learnQueue.length} 个新词`:completed?p.settings.includeFinalCheck===false?'学习任务已完成':'本组正式检查已完成':interrupted?'正式检查尚未完成':'本轮复习完成');
  text('learnSummaryText',p.name+' · '+p.wordIds.length+' 个词');$('learnReviewStats').hidden=learned||interrupted;
  text('reviewKnownCount',p.wordIds.length-s.pendingIds.length);text('reviewPendingCount',s.pendingIds.length);
  text('learnSummaryNote',learned?'接下来用中文主动回忆英文。首次翻卡完成不代表已掌握。':interrupted?'已提交的检查答案与学习进度保留。继续将从同一组单词开始一次新检查，不将未答题标为完成。':p.settings.includeFinalCheck===false?completed?'本次仅学习与复习，没有正式检查成绩；需要时可再复习同一组词。':'这里是复习自评，不是考试成绩；可继续复习或结束学习任务。':`这里是复习自评，不是考试成绩。${s.pendingIds.length?'仍有 '+s.pendingIds.length+' 个词需要加强，可继续复习或开始检查。':'可通过实际拼写验证掌握情况。'}`);
  $('learnContinue').hidden=interrupted;$('learnContinue').disabled=!learned&&!completed&&!s.pendingIds.length;text('learnContinue',learned?'开始主动回忆':completed?'再次复习这组词':'继续复习不会的词');$('learnCheck').hidden=learned||p.settings.includeFinalCheck===false;$('learnFinish').hidden=p.settings.includeFinalCheck!==false||learned||completed||interrupted;text('learnCheck',interrupted?'重新开始本组检查':completed?'再次检查本组单词':'开始正式检查');$('learnBack').hidden=assignment;
 }
}
function act(action){try{bundle.session=L.transition(bundle.session,bundle.pack,action);save();render();if(['flip','previous','next','know','again'].includes(action))$('flashcard').focus({preventScroll:true})}catch(e){text('learnCardHelp',e.message)}}
async function resume(){
 const saved=repo.loadActive();if(!saved){resumePanel();text('learnSetupError','没有可恢复的有效进度，可以开始新学习包。');return}
 const ticket=++request;
 try{loading=true;$('learnStart').disabled=true;$('learnResume').disabled=true;await catalog();if(ticket!==request)return;const loaded=await registry.load(saved.pack.libraryId),nextWords=V.toPracticeWords(loaded);if(ticket!==request)return;L.resolvePack(saved.pack,loaded,nextWords);library=loaded;words=nextWords;syncLibraryControls();bundle=saved;render()}catch(e){if(ticket===request)text('learnSetupError',e.message)}finally{if(ticket===request)loading=false;$('learnResume').disabled=false}
}
function start(){try{
 if(loading)throw Error('词库正在加载，请稍候。');
 const pool=available(),count=usesWholeList()?pool.length:integer('learnCount',1,pool.length),timeLimit=integer('learnTime',0,600),state=refreshDashboard();
 const selected=C.sampleMixed(pool,count),name=library.name+' · '+$('learnGroup').selectedOptions[0].textContent+' · '+count+' 词学习包';
 const pack=L.createPack({library,words:selected,name,profileId:repo.identity.profileId,settings:{timeLimit,hintsAllowed:$('learnHints').checked}});
 bundle={pack,session:L.createSession(pack,repo.identity.profileId,[...state.values()].filter(s=>s.seen).map(s=>s.wordId))};assignment=false;checkAttached=false;save();render();
 }catch(e){text('learnSetupError',e.message)}}
async function startCheck(){
 const continueDisabled=$('learnContinue').disabled;$('learnContinue').disabled=true;$('learnBack').disabled=true;
 try{if(bundle.session.currentStage!=='check'){bundle.session=L.transition(bundle.session,bundle.pack,'check');save()}
  checkAttached=true;$('learnCheck').disabled=true;await root.WordCheckHome.startLearnCheck(bundle.pack);returnButton.hidden=false;
 }catch(e){checkAttached=false;show('learnSummary');text('learnActionError',e.message)}finally{$('learnCheck').disabled=false;$('learnContinue').disabled=continueDisabled;$('learnBack').disabled=false}
}
function startAssignment(preset,loaded,practiceWords,hash){
 const ids=new Set(preset.w),selected=preset.w.map(id=>practiceWords.find(w=>w.id===id));
 if(selected.some(w=>!w)||new Set(selected.map(w=>w.id)).size!==ids.size)throw Error('指定词条不在当前词库中，请老师重新生成学习链接。');
 const assignmentId=root.WordStudentIdentity?.assignmentId||hash.split('.')[1];if(!assignmentId)throw Error('学习作业编号无效。');
 const pack=L.createTeacherPack({library:loaded,words:selected,name:preset.name,assignmentId,settings:{mode:preset.m,timeLimit:preset.t,hintsAllowed:preset.h,assistanceMode:preset.u??(preset.h?'both':'none'),includeFinalCheck:preset.f,showFirstLetter:preset.i}});
 L.resolvePack(pack,loaded,practiceWords);
 library=loaded;words=practiceWords;assignment=true;checkAttached=false;returnButton.hidden=true;
 const prior=repo.sessions().filter(b=>b.pack.id===pack.id&&b.session.status==='in_progress').sort((a,b)=>b.session.updatedAt.localeCompare(a.session.updatedAt))[0];
 bundle=prior||{pack,session:L.createSession(pack,repo.identity.profileId,[])};
 save();render();return bundle;
}
function onCheckStart({queue,library:loaded,mode,prompts}){
 if(!checkAttached){
  if(practiceBundle?.attempt.status==='in_progress'){practiceBundle.attempt=R.closeAttempt(practiceBundle.attempt,practiceBundle.answers,{status:'abandoned'});repo.saveCheck(practiceBundle)}
  const questions=queue.map((w,i)=>({wordId:w.id,mode,prompt:prompts[i]}));
  const linked=/^(#preset=|#assigned=)/.test(root.location.hash);const source=linked?{type:'assignment',id:root.WordStudentIdentity?.assignmentId||root.location.hash.slice(0,100)}:{type:'free',id:null};
  practiceBundle={attempt:R.createAttempt({library:loaded,identity:repo.identity,questions,source}),answers:[],...(root.WordStudentIdentity?.assignmentId?{assignmentId:root.WordStudentIdentity.assignmentId}:{})};repo.saveCheck(practiceBundle);storageNotice();return;
 }
 L.resolvePack(bundle.pack,loaded,V.toPracticeWords(loaded));if(queue.some(w=>!bundle.pack.wordIds.includes(w.id)))throw Error('检查词条不属于当前学习包');
 // A reload/restart begins a new attempt; never silently complete the interrupted one.
 for(const prior of repo.checks().filter(b=>b.sessionId===bundle.session.id&&b.attempt.status==='in_progress')){prior.attempt=R.closeAttempt(prior.attempt,prior.answers,{status:'abandoned'});repo.saveCheck(prior)}
 const questions=queue.map((w,i)=>({wordId:w.id,mode,prompt:prompts[i]}));
 const attempt=R.createAttempt({library:loaded,identity:repo.identity,questions,source:{type:bundle.pack.source.type==='teacher'?'assignment':'preset',id:bundle.pack.id}});
 checkBundle={sessionId:bundle.session.id,attempt,answers:[],...(root.WordStudentIdentity?.assignmentId?{assignmentId:root.WordStudentIdentity.assignmentId}:{})};repo.saveCheck(checkBundle);bundle.session.checkAttemptIds.push(attempt.id);bundle.session.currentStage='check';bundle.session.status='in_progress';save();
}
function onCheckAnswer({index,typed,hints,spellingChecks,skip,reason}){
 const target=checkAttached?checkBundle:practiceBundle;if(!target)return;
 const answer=R.createAnswer({attempt:target.attempt,questionId:target.attempt.questions[index].id,text:typed,hintCount:hints,spellingChecks,skipped:skip});
 // Supplemental timeout/skip reason; canonical grade remains unchanged.
 target.answers.push({...answer,reason:reason||null});repo.saveCheck(target);storageNotice();
}
function onCheckFinish(){
 if(!checkAttached){if(!practiceBundle)return;const complete=practiceBundle.answers.length===practiceBundle.attempt.questionCount;practiceBundle.attempt=R.closeAttempt(practiceBundle.attempt,practiceBundle.answers,{status:complete?'completed':'abandoned'});repo.saveCheck(practiceBundle);practiceBundle=null;root.WordCloudSync?.queue();storageNotice();return}
 if(!checkBundle)return;
 const complete=checkBundle.answers.length===checkBundle.attempt.questionCount;
 checkBundle.attempt=R.closeAttempt(checkBundle.attempt,checkBundle.answers,{status:complete?'completed':'abandoned'});repo.saveCheck(checkBundle);root.WordCloudSync?.queue();
 const whole=complete&&new Set(checkBundle.answers.map(a=>a.wordId)).size===bundle.pack.wordIds.length;
 bundle.session.currentStage=whole?'completed':'review_complete';bundle.session.status=whole?'completed':'in_progress';bundle.session.updatedAt=new Date().toISOString();save();returnButton.hidden=false;
}
$('learnHome').onclick=()=>{show('studentHome');$('learnStorageNotice').hidden=true};$('learnBack').onclick=openSetup;$('learnPause').onclick=()=>{if(assignment){save();show('learnPaused')}else openSetup()};$('learnPausedResume').onclick=render;
$('learnLibrary').onchange=()=>loadLibrary($('learnLibrary').value);$('learnReload').onclick=()=>loadLibrary($('learnLibrary').value||null);
for(const id of ['learnGroup','learnFilter','learnTime'])$(id).addEventListener(id==='learnTime'?'input':'change',updateSetup);
for(const id of ['learnScope','learnPrefix'])$(id).addEventListener(id==='learnPrefix'?'input':'change',updateSetup);
$('learnCount').addEventListener('input',()=>{manualCount=$('learnCount').value;updateSetup()});
$('learnResume').onclick=resume;$('learnStart').onclick=start;$('flashcard').onclick=()=>act('flip');$('learnPrevious').onclick=()=>act('previous');$('learnNext').onclick=()=>act('next');$('reviewKnow').onclick=()=>act('know');$('reviewAgain').onclick=()=>act('again');$('reviewEnd').onclick=()=>act('end-review');$('learnContinue').onclick=()=>act('review');$('learnFinish').onclick=()=>act('finish');$('learnCheck').onclick=startCheck;
returnButton.onclick=()=>{checkAttached=false;render()};
function chooseToday(filter){$('learnFilter').value=filter;updateSetup();$('learnFilter').focus()}
$('todayNew').onclick=()=>chooseToday('new');$('todayDue').onclick=()=>chooseToday('due');$('todayNeeds').onclick=()=>chooseToday('again');
$('learnExport').onclick=()=>{try{const daily=dailyData(),backup={schemaVersion:1,exportedAt:new Date().toISOString(),identity:repo.identity,sessions:repo.sessions(),checks:repo.checks(),daily:daily.store,...(daily.raw?{damagedDailyRaw:daily.raw}:{})};const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='word-check-backup-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){text('learnHistoryNote','导出失败：'+e.message)}};
root.WordCheckLearning={openSetup,startAssignment,onCheckStart,onCheckAnswer,onCheckFinish,get isChecking(){return checkAttached},get warning(){return repo.warning},get isAssignment(){return assignment},getCheckPrompt:index=>(checkAttached?checkBundle:practiceBundle)?.attempt.questions[index]?.prompt.meaning??null,restartCheck(){if(!checkAttached)return false;startCheck();return true},get activeSession(){return bundle?JSON.parse(JSON.stringify(bundle)):null}};
})(window);
