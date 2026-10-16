/* Daily Vocabulary V3 controller for the unified Word Check homepage. */
(function (root) {
  'use strict';
  const SOURCE_ID = 'practice:daily-v3';
  const C = root.WordCheckPracticeCore;
  const byId = id => document.getElementById(id);
  const state = { recognition: [], synonym: [], entries: [], queue: [], answers: [], index: 0,
    active: false, graded: false, selected: new Set(), mode: 'recognition', sourceLabel: '',
    startedAt: '', attemptId: '', lastMisses: [] };
  let loadPromise = null;

  function text(id, value) { byId(id).textContent = String(value); }
  function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = String(value); return node; }
  function shell() { if (!root.WordCheckHome) throw new Error('首页尚未初始化'); return root.WordCheckHome; }
  function modeLabel() { return state.mode === 'recognition' ? '词义四选一' : '同义词多选'; }
  function practiceType() { return state.mode === 'recognition' ? C.TYPES.recognition : C.TYPES.synonym; }
  function currentPool() { return state[state.mode]; }
  async function fetchJson(path) { const response = await fetch(path, { cache: 'no-cache' }); if (!response.ok) throw new Error(path + ' HTTP ' + response.status); return response.json(); }

  async function ensureLoaded() {
    if (state.entries.length) return;
    if (!loadPromise) loadPromise = Promise.all([
      fetchJson('data/daily_v3_master.json'), fetchJson('data/recognition_v3_pilot.json'), fetchJson('data/synonyms_v3_questions.json')
    ]).then(([master, recognition, synonym]) => {
      if (!Array.isArray(master.entries) || !master.entries.length) throw new Error('日常词汇 V3 主词库为空');
      C.validateQuestions(recognition, C.TYPES.recognition, master);
      C.validateQuestions(synonym, C.TYPES.synonym);
      state.entries = master.entries; state.recognition = recognition.questions; state.synonym = synonym.questions;
      populateCategories();
    }).catch(error => { loadPromise = null; throw error; });
    return loadPromise;
  }

  function populateCategories() {
    const groups = new Map();
    state.recognition.forEach(question => groups.set(question.category, (groups.get(question.category) || 0) + 1));
    const select = byId('v3Category'); select.replaceChildren(new Option('全部分类', ''));
    for (const [category, count] of Array.from(groups).sort((a,b) => a[0].localeCompare(b[0], 'zh'))) select.add(new Option(`${category} (${count})`, category));
  }

  function renderPreview() {
    text('sourceBadge', '日常词汇 V3');
    text('wordCount', state.entries.length.toLocaleString() + ' 个词');
    byId('defaultNotice').hidden = false;
    byId('defaultNotice').innerHTML = '<strong>日常常见词汇 V3</strong><p>1,172 个词条 · 309 道 Recognition 四选一 · 46 道 Synonym 多选。</p>';
    byId('loadError').hidden = true;
    byId('importNotice').className = '';
    byId('importNotice').innerHTML = '<p class="small">词库已就绪 · 当前为选择题练习；其他词条保留在下方供查阅。</p>';
    byId('lists').innerHTML = `<span class="chip selected">Recognition <strong>${state.recognition.length}</strong></span><span class="chip">Synonym <strong>${state.synonym.length}</strong></span>`;
    const rows = byId('preview'); rows.replaceChildren();
    for (const item of state.entries.slice(0, 150)) {
      const tr = el('tr'), term = el('td'), meaning = el('td'), group = el('td');
      term.append(el('strong', '', item.term_en), el('small', '', '日常词汇 V3'));
      meaning.textContent = item.meaning_zh || item.senses?.map(s => s.meaning_zh).join('；') || '—';
      group.appendChild(el('span', 'pill', (item.sections || [])[0] || '日常词汇'));
      tr.append(term, meaning, group); rows.append(tr);
    }
    byId('previewBottom').innerHTML = '词库预览显示答案。<span>练习时选项与题目顺序随机</span>';
  }

  function updateSetup() {
    if (root.WordCheckHome?.sourceKind !== 'v3') return;
    const chosen = document.querySelector('input[name=v3PracticeMode]:checked');
    state.mode = chosen ? chosen.value : 'recognition';
    byId('v3CategoryWrap').hidden = state.mode !== 'recognition';
    const category = state.mode === 'recognition' ? byId('v3Category').value : '';
    const eligible = currentPool().filter(question => !category || question.category === category);
    const due = C.dueKeys(C.readStore(root.localStorage));
    const review = eligible.filter(question => due.has(question.question_type + ':' + question.id));
    text('v3ReviewCount', `当前范围待复习 ${review.length} 题（仅本机）`);
    const available = byId('v3ReviewOnly').checked ? review.length : eligible.length;
    const raw = byId('v3QuestionCount').value.trim(), requested = Number(raw);
    const valid = raw !== '' && Number.isSafeInteger(requested) && requested >= 0;
    const actual = valid ? (requested === 0 ? available : Math.min(requested, available)) : 0;
    text('selection', `可用 ${available} 题 · 本轮 ${actual} 题 · 题目与选项顺序随机`);
    text('setupError', !valid ? '请输入 0 或正整数题量。' : available ? '' : (state.entries.length ? '当前范围没有可用题目，请修改条件。' : '词库正在加载…'));
    byId('start').disabled = !valid || available === 0;
  }

  async function activate() {
    text('sourceBadge', '正在加载日常词汇 V3…'); byId('start').disabled = true;
    try { await ensureLoaded(); renderPreview(); updateSetup(); return SOURCE_ID; }
    catch (error) { text('sourceBadge', '日常词汇 V3 加载失败'); text('setupError', (error.message || '未知错误') + '，请重试。'); throw error; }
  }

  function start() {
    try {
      updateSetup(); if (byId('start').disabled) return;
      const category = state.mode === 'recognition' ? byId('v3Category').value : '';
      const due = byId('v3ReviewOnly').checked ? C.dueKeys(C.readStore(root.localStorage)) : null;
      const pool = C.pickQuestions(currentPool(), byId('v3QuestionCount').value, category, due);
      begin(pool, `${category || (state.mode === 'recognition' ? '全部分类' : '近义词词库')}${due ? ' · 本机错题' : ''}`);
    } catch (error) { text('setupError', error.message); }
  }

  function begin(questions, label) {
    if (!questions.length) { text('setupError', '没有可用题目'); return; }
    state.queue = questions.map(question => ({ question, orderedOptions: C.shuffle(question.options) }));
    state.answers = []; state.index = 0; state.graded = false; state.selected.clear(); state.active = true;
    state.startedAt = new Date().toISOString(); state.attemptId = crypto.randomUUID ? crypto.randomUUID() : 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    state.sourceLabel = label; shell().show('v3Quiz'); renderQuestion();
  }

  function renderQuestion() {
    const { question, orderedOptions } = state.queue[state.index];
    state.selected = new Set(); state.graded = false;
    text('v3QuizMode', modeLabel()); text('v3ProgressText', `${state.index + 1} / ${state.queue.length}`);
    byId('v3ProgressBar').style.width = (state.index / state.queue.length * 100) + '%';
    text('v3QuestionCategory', state.mode === 'recognition' ? (question.category || '词义识别') : 'SYNONYM PRACTICE');
    text('v3QuestionInstruction', state.mode === 'recognition' ? '选择正确中文释义' : '选择所有意思相近的选项');
    text('v3Headword', question.prompt_en || question.headword); text('v3Context', state.mode === 'synonym' ? (question.context_en || question.sense_zh || '') : '');
    byId('v3Context').hidden = state.mode !== 'synonym';
    const group = byId('v3Options'); group.replaceChildren(); group.removeAttribute('aria-disabled');
    orderedOptions.forEach((option, index) => { const button = el('button', 'p-option'); button.type = 'button'; button.dataset.optionId = option.id; button.setAttribute('aria-pressed', 'false'); button.append(el('span', 'p-option-letter', String.fromCharCode(65 + index)), el('span', '', option.text)); button.addEventListener('click', () => select(option.id)); group.append(button); });
    byId('v3Feedback').replaceChildren(); byId('v3Feedback').className = ''; byId('v3Feedback').parentElement.scrollTop = 0;
    byId('v3Submit').disabled = true; byId('v3Submit').hidden = false; byId('v3Skip').hidden = false; byId('v3Next').hidden = true;
    group.querySelector('button')?.focus();
  }

  function select(id) {
    if (state.graded) return;
    if (state.mode === 'recognition') state.selected = new Set([id]); else if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    byId('v3Options').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(state.selected.has(button.dataset.optionId))));
    byId('v3Submit').disabled = state.selected.size === 0;
  }

  function labelForIds(question, ids) { const labels = new Map(question.options.map(option => [option.id, option.text])); return ids.map(id => labels.get(id) || '未知选项').join('、') || '未作答'; }
  function grade(skip) {
    if (state.graded || !state.active) return;
    const row = state.queue[state.index], question = row.question, selected = skip ? [] : Array.from(state.selected);
    if (!selected.length && !skip) return;
    const outcome = C.grade(question, selected), answer = C.snapshot(question, row.orderedOptions, outcome, new Date().toISOString());
    state.answers.push({ ...answer, correct: outcome.correct, skipped: !!skip }); state.graded = true;
    const correct = new Set(outcome.correct_option_ids);
    byId('v3Options').querySelectorAll('button').forEach(button => { button.disabled = true; if (correct.has(button.dataset.optionId)) button.classList.add('correct-answer'); else if (selected.includes(button.dataset.optionId)) button.classList.add('incorrect-answer'); });
    byId('v3Options').setAttribute('aria-disabled', 'true');
    const feedback = byId('v3Feedback'); feedback.className = 'feedback ' + (outcome.correct ? 'correct' : 'wrong'); feedback.replaceChildren(el('strong', '', outcome.correct ? '回答正确' : (skip ? '已跳过这道题' : '还需要巩固')), document.createElement('br'), el('span', '', '正确答案：' + labelForIds(question, outcome.correct_option_ids)));
    if (!outcome.correct && state.mode === 'synonym') feedback.append(document.createElement('br'), el('small', '', '漏选：' + labelForIds(question, outcome.omitted_correct_ids) + '；误选：' + labelForIds(question, outcome.incorrectly_selected_ids)));
    if (question.explanation_zh) feedback.append(document.createElement('br'), el('small', '', question.explanation_zh));
    byId('v3Submit').hidden = true; byId('v3Skip').hidden = true; text('v3Next', state.index === state.queue.length - 1 ? '查看本轮结果' : '下一题'); byId('v3Next').hidden = false; byId('v3Next').focus({ preventScroll: true });
  }

  function next() { if (!state.graded) return; if (++state.index >= state.queue.length) finish(); else renderQuestion(); }
  function finish() {
    if (!state.active) return; state.active = false;
    const attempt = { id: state.attemptId, library_id: state.mode === 'recognition' ? 'daily-common-v3' : 'synonym-core-v3', source: 'free_practice', question_type: practiceType(), started_at: state.startedAt, completed_at: new Date().toISOString(), finished: state.answers.length === state.queue.length, planned_question_ids: state.queue.map(row => row.question.id), answers: state.answers.slice() };
    let saved = true; if (attempt.answers.length) saved = C.saveAttempt(root.localStorage, attempt);
    const correct = state.answers.filter(answer => answer.correct).length;
    text('v3ResultTitle', attempt.finished ? '本轮练习完成' : '本轮已结束'); text('v3ResultSummary', `${modeLabel()} · ${state.sourceLabel} · 已作答 ${state.answers.length} / ${state.queue.length} 题`); text('v3CorrectCount', correct); text('v3WrongCount', state.answers.length - correct);
    const rows = byId('v3ResultRows'); rows.replaceChildren();
    state.answers.forEach(answer => { const question = state.queue.find(row => row.question.id === answer.question_id).question, tr = el('tr'), term = el('td'); term.appendChild(el('strong', '', answer.prompt)); if (answer.context) term.appendChild(el('small', '', answer.context)); const result = el('td'); result.appendChild(el('span', 'pill ' + (answer.correct ? 'correct' : 'wrong'), answer.correct ? '正确' : '待复习')); tr.append(term, el('td', '', labelForIds(question, answer.selected_option_ids)), result, el('td', '', labelForIds(question, answer.correct_option_ids))); rows.append(tr); });
    if (!state.answers.length) { const tr = el('tr'), td = el('td', '', '本轮没有已提交的题目。'); td.colSpan = 4; tr.append(td); rows.append(tr); }
    text('v3StorageMessage', saved ? '答题历史及错题状态已保存在当前浏览器。' : '本浏览器未能保存记录；可继续练习，但数据可能丢失。');
    state.lastMisses = state.answers.filter(answer => !answer.correct).map(answer => state.queue.find(row => row.question.id === answer.question_id).question); byId('v3RetryWrong').disabled = !state.lastMisses.length; shell().show('v3Results');
  }

  document.querySelectorAll('input[name=v3PracticeMode]').forEach(input => input.addEventListener('change', updateSetup));
  byId('v3Category').addEventListener('change', updateSetup); byId('v3QuestionCount').addEventListener('input', updateSetup); byId('v3ReviewOnly').addEventListener('change', updateSetup);
  byId('v3Submit').addEventListener('click', () => grade(false)); byId('v3Skip').addEventListener('click', () => grade(true)); byId('v3Next').addEventListener('click', next);
  byId('v3Exit').addEventListener('click', () => { if (root.confirm('结束本轮并查看已答题目的结果？')) finish(); });
  byId('v3Restart').addEventListener('click', () => { shell().show('setup'); updateSetup(); }); byId('v3RetryWrong').addEventListener('click', () => begin(C.shuffle(state.lastMisses), '本轮错题重练'));
  root.addEventListener('beforeunload', event => { if (state.active) { event.preventDefault(); event.returnValue = ''; } });
  root.WordCheckHomeV3 = { SOURCE_ID, NAME: '日常词汇 V3', activate, updateSetup, start, get active() { return state.active; }, get loaded() { return !!state.entries.length; } };
})(window);
