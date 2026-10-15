/** Word Check V3 — pure practice logic (browser + Node) */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WordCheckPracticeCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const TYPES = Object.freeze({ recognition: 'recognition_single', synonym: 'synonym_multi' });
  function invariant(ok, message) { if (!ok) throw new Error(message); }
  function shuffle(items, random = Math.random) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function distinct(values) { return new Set(values).size === values.length; }
  function correctIds(q) { return q.question_type === TYPES.recognition ? [q.correct_option_id] : q.correct_option_ids; }
  function validateQuestions(payload, type, master = null) {
    invariant(payload && Array.isArray(payload.questions), '题库缺少 questions 数组');
    const qIds = new Set(); const masterIds = master ? new Set(master.entries.map(e => e.id)) : null;
    for (const q of payload.questions) {
      invariant(q && q.question_type === type, '题目类型错误：' + (q && q.id));
      invariant(typeof q.id === 'string' && q.id && !qIds.has(q.id), '题目 ID 缺失或重复：' + (q && q.id)); qIds.add(q.id);
      invariant(Array.isArray(q.options) && q.options.length >= 4, '选项不足：' + q.id);
      invariant(q.options.every(o => o.id && typeof o.text === 'string' && o.text.trim()), '选项内容不完整：' + q.id);
      invariant(distinct(q.options.map(o => o.id)), '选项 ID 重复：' + q.id);
      invariant(distinct(q.options.map(o => o.text.trim())), '选项文本重复：' + q.id);
      const ids = correctIds(q); invariant(ids && ids.length >= 1 && distinct(ids), '正确答案集合不合法：' + q.id);
      invariant(ids.every(id => q.options.some(o => o.id === id)), '正确答案不在选项中：' + q.id);
      if (type === TYPES.recognition) {
        invariant(q.options.length === 4 && ids.length === 1, '四选一题格式错误：' + q.id);
        invariant(!!q.word_id && !!q.tested_sense_id, '识别题缺少词条或义项 ID：' + q.id);
        if (masterIds) invariant(masterIds.has(q.word_id), '词库中找不到词条：' + q.id);
      } else invariant(!!q.headword && !!q.word_id, '同义词题缺少词条：' + q.id);
    }
    return payload.questions.length;
  }
  function pickQuestions(questions, count, category = '', reviewKeys = null, random = Math.random) {
    let pool = category ? questions.filter(q => q.category === category) : questions;
    if (reviewKeys) pool = pool.filter(q => reviewKeys.has(q.question_type + ':' + q.id));
    const n = Number(count);
    invariant(Number.isSafeInteger(n) && n >= 0, '题量必须为非负整数');
    invariant(pool.length > 0, '该范围暂无可用题目');
    // count=0 means all; otherwise cap at available instead of erroring on small review pools.
    return shuffle(pool, random).slice(0, n === 0 ? pool.length : Math.min(n, pool.length));
  }
  function grade(q, selectedIds) {
    const valid = new Set(q.options.map(o => o.id));
    const selected = Array.from(new Set(selectedIds));
    invariant(selected.every(id => valid.has(id)), '包含无效的答案 ID');
    invariant(q.question_type !== TYPES.recognition || selected.length <= 1, '单选题不能选择多个答案');
    const expected = correctIds(q); const chosen = new Set(selected), right = new Set(expected);
    return { correct: selected.length === expected.length && expected.every(id => chosen.has(id)),
      selected_option_ids: selected, correct_option_ids: expected.slice(),
      omitted_correct_ids: expected.filter(id => !chosen.has(id)),
      incorrectly_selected_ids: selected.filter(id => !right.has(id)) };
  }
  function snapshot(q, orderedOptions, outcome, completedAt) {
    return { question_id: q.id, question_type: q.question_type, word_id: q.word_id,
      sense_id: q.tested_sense_id || q.sense_id || null, question_version: q.question_version || 1,
      prompt: q.prompt_en || q.headword, context: q.context_en || null,
      displayed_options: orderedOptions.map(o => ({ id: o.id, text: o.text })),
      ...outcome, completed_at: completedAt };
  }
  const KEY = 'wordcheck.v3.practice.local.v1';
  function emptyStore() { return { schema_version: 1, attempts: [], progress: {} }; }
  function readStore(storage) {
    try { const raw = storage.getItem(KEY); if (!raw) return emptyStore();
      const x = JSON.parse(raw); if (x && x.schema_version === 1 && Array.isArray(x.attempts) && x.progress && typeof x.progress === 'object' && !Array.isArray(x.progress)) return x;
    } catch (_) { /* Private mode / corrupted payload / disabled storage. */ }
    return emptyStore();
  }
  function writeStore(storage, store) {
    try { storage.setItem(KEY, JSON.stringify(store)); return true; }
    catch (_) { return false; }
  }
  function updateProgress(store, answers) {
    for (const a of answers) {
      const key = a.question_type + ':' + a.question_id;
      const p = store.progress[key] || { attempts: 0, mistakes: 0, streak: 0, needs_review: false, last_seen: null };
      p.attempts++;
      if (a.correct) { p.streak++; if (p.needs_review && p.streak >= 2) p.needs_review = false; }
      else { p.mistakes++; p.streak = 0; p.needs_review = true; }
      p.last_seen = a.completed_at; store.progress[key] = p;
    }
    return store;
  }
  function saveAttempt(storage, attempt) {
    const store = readStore(storage);
    // Idempotency for one browser session (no cloud-level guarantee).
    if (store.attempts.some(a => a.id === attempt.id)) return true;
    store.attempts.unshift(attempt);
    store.attempts = store.attempts.slice(0, 100);
    updateProgress(store, attempt.answers);
    return writeStore(storage, store);
  }
  function dueKeys(store) { return new Set(Object.entries(store.progress).filter(([,v])=>v.needs_review).map(([k])=>k)); }
  return { TYPES, KEY, shuffle, correctIds, validateQuestions, pickQuestions, grade, snapshot, readStore, saveAttempt, updateProgress, dueKeys };
});
