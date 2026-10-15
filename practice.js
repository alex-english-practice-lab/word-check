/* Word Check V3: incremental browser UI; existing spelling engine is untouched. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.WordCheckPracticeCore;
  const state = { recognition: [], synonym: [], entries: [], queue: [], answers: [],
    index: 0, active: false, graded: false, selected: new Set(),
    mode: 'recognition', options: [], sourceLabel: '', startedAt: '', attemptId: '', lastMisses: [] };
  function text(id, value) { $(id).textContent = String(value); }
  function visible(id) { for (const name of ['setup', 'quiz', 'results']) $(name).hidden = name !== id; window.scrollTo(0,0); }
  function modeLabel() { return state.mode === 'recognition' ? '词义四选一' : '同义词多选'; }
  function practiceType() { return state.mode === 'recognition' ? C.TYPES.recognition : C.TYPES.synonym; }
  function currentPool() { return state[state.mode]; }
  function el(tag, className, value) { const x = document.createElement(tag); if (className) x.className = className; if (value !== undefined) x.textContent = String(value); return x; }
  function loadError(message) { text('loadStatus', '词库加载失败'); text('setupError', message + '，请刷新重试。'); $('start').disabled = true; }
  async function fetchJson(path) {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
    return response.json();
  }
  async function load() {
    try {
      const [master, rec, syn] = await Promise.all([
        fetchJson('data/daily_v3_master.json'),
        fetchJson('data/recognition_v3_pilot.json'),
        fetchJson('data/synonyms_v3_questions.json')
      ]);
      if (!Array.isArray(master.entries) || !master.entries.length) throw new Error('主词库内容为空');
      C.validateQuestions(rec, C.TYPES.recognition, master);
      C.validateQuestions(syn, C.TYPES.synonym);
      state.entries = master.entries; state.recognition = rec.questions; state.synonym = syn.questions;
      text('loadStatus', `${state.entries.length} 词 · ${state.recognition.length} 识别题 · ${state.synonym.length} 近义词题`);
      text('entryCount', `${state.entries.length} 词`);
      populateCategories(); renderWords(); updateSetup();
    } catch (e) { loadError(e.message || '未知错误'); console.error('Word Check V3 load failed', e); }
  }
  function populateCategories() {
    const groups = new Map();
    state.recognition.forEach(q => groups.set(q.category, (groups.get(q.category) || 0) + 1));
    const select = $('category'); select.replaceChildren(new Option('全部分类', ''));
    for (const [category, count] of Array.from(groups).sort((a,b)=>a[0].localeCompare(b[0],'zh'))) {
      select.add(new Option(`${category} (${count})`, category));
    }
  }
  function renderWords() {
    const value = $('wordSearch').value.toLowerCase().trim();
    const matches = value ? state.entries.filter(e => [e.term_en, e.meaning_zh, ...(e.sections||[])].join(' ').toLowerCase().includes(value)) : state.entries;
    const rows = $('wordRows'); rows.replaceChildren();
    for (const item of matches.slice(0, 150)) {
      const tr = el('tr'); const a = el('td'); const b = el('td'); const c = el('td');
      a.appendChild(el('strong', '', item.term_en));
      b.textContent = item.meaning_zh || item.senses?.map(s=>s.meaning_zh).join('；') || '—';
      c.textContent = (item.sections || []).slice(0, 2).join(' / ') || '—';
      tr.append(a,b,c); rows.append(tr);
    }
    if (!matches.length) { const tr = el('tr'), td = el('td','','没有匹配词条'); td.colSpan = 3; tr.append(td); rows.append(tr); }
    text('entryCount', `${state.entries.length} 词 · 显示 ${Math.min(150,matches.length)} / ${matches.length}`);
  }
  function updateSetup() {
    const chosen = document.querySelector('input[name=practiceMode]:checked');
    state.mode = chosen ? chosen.value : 'recognition';
    $('categoryWrap').hidden = state.mode !== 'recognition';
    const category = state.mode === 'recognition' ? $('category').value : '';
    const eligible = currentPool().filter(q => !category || q.category === category);
    const due = C.dueKeys(C.readStore(window.localStorage));
    const availableReview = eligible.filter(q => due.has(q.question_type + ':' + q.id));
    text('reviewCount', `当前模式${category?'及分类':''}待复习 ${availableReview.length} 题（仅本机）`);
    const count = $('reviewOnly').checked ? availableReview.length : eligible.length;
    text('selectionSummary', `本次可抽取 ${count} 题 · 选项顺序随机`);
    $('start').disabled = count === 0;
    text('setupError', count ? '' : (state.entries.length ? '当前选择没有可用题目，请修改条件。' : '词库正在加载…'));
  }
  function begin(questions, label) {
    if (!questions.length) { text('setupError', '没有可用的题目'); return; }
    state.queue = questions.map(question => ({ question, orderedOptions: C.shuffle(question.options) }));
    state.answers = []; state.index = 0; state.graded = false; state.selected.clear();
    state.active = true; state.startedAt = new Date().toISOString();
    state.attemptId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    state.sourceLabel = label; visible('quiz'); renderQuestion();
  }
  function startFromSetup() {
    try {
      const category = state.mode === 'recognition' ? $('category').value : '';
      const due = $('reviewOnly').checked ? C.dueKeys(C.readStore(window.localStorage)) : null;
      const count = $('questionCount').value;
      const pool = C.pickQuestions(currentPool(), count, category, due);
      begin(pool, `${category || (state.mode === 'recognition' ? '全部分类' : '近义词词库')}${due ? ' · 本机错题' : ''}`);
    } catch (e) { text('setupError', e.message); }
  }
  function renderQuestion() {
    const {question: q, orderedOptions} = state.queue[state.index];
    state.selected = new Set(); state.graded = false;
    text('quizMode', modeLabel());
    text('progressText', `${state.index + 1} / ${state.queue.length}`);
    $('progressBar').style.width = (state.index / state.queue.length * 100) + '%';
    text('questionCategory', state.mode === 'recognition' ? (q.category || '词义识别') : 'SYNONYM PRACTICE');
    text('questionInstruction', state.mode === 'recognition' ? '选择正确中文释义' : '选择所有意思相近的选项');
    text('headword', q.prompt_en || q.headword);
    text('context', state.mode === 'synonym' ? (q.context_en || q.sense_zh || '') : '');
    $('context').hidden = state.mode !== 'synonym';
    const group = $('options'); group.replaceChildren(); group.removeAttribute('aria-disabled');
    orderedOptions.forEach((option, i) => {
      const b = el('button', 'p-option'); b.type = 'button'; b.dataset.optionId = option.id;
      b.setAttribute('aria-pressed', 'false');
      b.append(el('span', 'p-option-letter', String.fromCharCode(65+i)), el('span', '', option.text));
      b.addEventListener('click', () => select(option.id)); group.append(b);
    });
    $('feedback').replaceChildren(); $('feedback').className = '';
    $('submit').disabled = true; $('submit').hidden = false;
    $('skip').hidden = false; $('next').hidden = true;
    const first = group.querySelector('button'); if (first) first.focus();
  }
  function select(id) {
    if (state.graded) return;
    if (state.mode === 'recognition') state.selected = new Set([id]);
    else if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    $('options').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(state.selected.has(b.dataset.optionId))));
    $('submit').disabled = state.selected.size === 0;
  }
  function labelForIds(q, ids) { const map = new Map(q.options.map(o => [o.id, o.text])); return ids.map(id => map.get(id) || '未知选项').join('、') || '未作答'; }
  function grade(skip) {
    if (state.graded || !state.active) return;
    const row = state.queue[state.index], q = row.question;
    const selected = skip ? [] : Array.from(state.selected);
    if (!selected.length && !skip) return;
    const outcome = C.grade(q, selected);
    const answer = C.snapshot(q, row.orderedOptions, outcome, new Date().toISOString());
    state.answers.push({ ...answer, correct: outcome.correct, skipped: !!skip });
    state.graded = true;
    const right = new Set(outcome.correct_option_ids);
    $('options').querySelectorAll('button').forEach(b => {
      b.disabled = true;
      if (right.has(b.dataset.optionId)) b.classList.add('correct-answer');
      else if (selected.includes(b.dataset.optionId)) b.classList.add('incorrect-answer');
    });
    $('options').setAttribute('aria-disabled', 'true');
    const feedback = $('feedback'); feedback.className = 'feedback ' + (outcome.correct ? 'correct' : 'wrong');
    const msg = el('strong', '', outcome.correct ? '回答正确' : (skip ? '已跳过这道题' : '还需要巩固'));
    feedback.replaceChildren(msg, document.createElement('br'), el('span', '', '正确答案：' + labelForIds(q, outcome.correct_option_ids)));
    if (!outcome.correct && state.mode === 'synonym') {
      feedback.append(document.createElement('br'), el('small', '', '漏选：' + labelForIds(q, outcome.omitted_correct_ids) + '；误选：' + labelForIds(q, outcome.incorrectly_selected_ids)));
    }
    if (q.explanation_zh) feedback.append(document.createElement('br'), el('small', '', q.explanation_zh));
    $('submit').hidden = true; $('skip').hidden = true;
    text('next', state.index === state.queue.length - 1 ? '查看本轮结果' : '下一题');
    $('next').hidden = false; $('next').focus();
  }
  function next() {
    if (!state.graded) return;
    state.index++;
    if (state.index >= state.queue.length) finish(); else renderQuestion();
  }
  function finish() {
    if (!state.active) return;
    state.active = false;
    const attempt = { id: state.attemptId, library_id: state.mode === 'recognition' ? 'daily-common-v3' : 'synonym-core-v3',
      source: 'free_practice', question_type: practiceType(), started_at: state.startedAt,
      completed_at: new Date().toISOString(), finished: state.answers.length === state.queue.length,
      planned_question_ids: state.queue.map(x => x.question.id),
      answers: state.answers.slice() };
    let saved = true;
    if (attempt.answers.length) saved = C.saveAttempt(window.localStorage, attempt);
    const right = state.answers.filter(a=>a.correct).length;
    text('resultTitle', attempt.finished ? '本轮练习完成' : '本轮已结束');
    text('resultSummary', `${modeLabel()} · ${state.sourceLabel} · 已作答 ${state.answers.length} / ${state.queue.length} 题`);
    text('correctCount', right); text('wrongCount', state.answers.length - right);
    const table = $('resultRows'); table.replaceChildren();
    state.answers.forEach(a => {
      const q = state.queue.find(x => x.question.id === a.question_id).question;
      const tr = el('tr');
      const term = el('td'); term.appendChild(el('strong', '', a.prompt));
      if (a.context) term.appendChild(el('small', '', a.context));
      const user = el('td', '', labelForIds(q, a.selected_option_ids));
      const result = el('td'); result.appendChild(el('span', 'pill ' + (a.correct ? 'correct' : 'wrong'), a.correct ? '正确' : '待复习'));
      const answer = el('td', '', labelForIds(q, a.correct_option_ids));
      tr.append(term, user, result, answer); table.append(tr);
    });
    if (!state.answers.length) { const tr = el('tr'), td = el('td', '', '本轮没有已提交的题目。'); td.colSpan = 4; tr.append(td); table.append(tr); }
    text('storageMessage', saved ? '答题历史及错题状态已保存在当前浏览器。' : '本浏览器未能保存记录；可继续练习，但数据可能丢失。');
    state.lastMisses = state.answers.filter(a=>!a.correct).map(a=>state.queue.find(x=>x.question.id===a.question_id).question);
    $('retryWrong').disabled = !state.lastMisses.length;
    visible('results');
  }
  document.querySelectorAll('input[name=practiceMode]').forEach(x=>x.addEventListener('change',updateSetup));
  $('category').addEventListener('change',updateSetup);
  $('questionCount').addEventListener('change',updateSetup);
  $('reviewOnly').addEventListener('change',updateSetup);
  $('wordSearch').addEventListener('input',renderWords);
  $('start').addEventListener('click',startFromSetup);
  $('submit').addEventListener('click',()=>grade(false));
  $('skip').addEventListener('click',()=>grade(true));
  $('next').addEventListener('click',next);
  $('exit').addEventListener('click',()=>{ if (window.confirm('结束本轮并查看已答题目的结果？')) finish(); });
  $('restart').addEventListener('click',()=>{ visible('setup'); updateSetup(); });
  $('retryWrong').addEventListener('click',()=>begin(C.shuffle(state.lastMisses), '本轮错题重练'));
  window.addEventListener('beforeunload', e=>{ if (state.active) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
