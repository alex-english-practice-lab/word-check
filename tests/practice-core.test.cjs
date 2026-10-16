const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../practice-core.js');
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', name), 'utf8'));
const master = read('daily_v3_master.json');
const rec = read('recognition_v3_pilot.json');
const syn = read('synonyms_v3_questions.json');

test('source V3 data structure and all answer IDs', () => {
  assert.equal(master.entries.length, 1172);
  assert.equal(C.validateQuestions(rec, C.TYPES.recognition, master), 309);
  assert.equal(C.validateQuestions(syn, C.TYPES.synonym), 46);
});
test('reviewed V3 inventory has unique terms, complete meanings and pilot statuses', () => {
  assert.equal(new Set(master.entries.map(e=>e.canonical_term.toLocaleLowerCase('en'))).size, master.entries.length);
  assert.ok(master.entries.every(e=>e.meaning_zh.trim() && e.senses.length && e.senses.every(s=>s.id && s.meaning_zh.trim())));
  assert.equal(new Set(rec.questions.map(q=>q.prompt_en.toLocaleLowerCase('en'))).size, rec.questions.length);
  assert.deepEqual(new Set(rec.questions.map(q=>q.review_status)), new Set(['ready_for_pilot','context_checked_pilot']));
  assert.ok(rec.questions.every(q=>Array.isArray(q.quality_flags) && q.quality_flags.length===0));
  assert.deepEqual(new Set(syn.questions.map(q=>q.review_status)), new Set(['ready_for_pilot']));
  const answerCounts = syn.questions.reduce((map,q)=>map.set(q.correct_option_ids.length,(map.get(q.correct_option_ids.length)||0)+1),new Map());
  assert.deepEqual(Object.fromEntries(answerCounts), {'2':14,'3':29,'4':3});
});
test('unique word IDs and proper sense refs', () => {
  assert.equal(new Set(master.entries.map(e=>e.id)).size, master.entries.length);
  const map = new Map(master.entries.map(e=>[e.id,e]));
  for (const q of rec.questions) {
    assert.ok(map.get(q.word_id).senses.some(s=>s.id === q.tested_sense_id), q.id);
  }
});
test('recognition option set and shuffle does not reveal fixed answer placement', () => {
  const q = rec.questions[0];
  const set = new Set();
  for(let seed=0;seed<120;seed++) {
    let i = seed;
    const options = C.shuffle(q.options, () => ((i = (i * 1664525 + 1013904223) >>> 0) / 2 ** 32));
    set.add(options.findIndex(o=>o.id === q.correct_option_id));
  }
  assert.equal(set.size, 4);
  assert.equal(C.grade(q, [q.correct_option_id]).correct, true);
  assert.equal(C.grade(q, [q.options.find(o=>o.id!==q.correct_option_id).id]).correct, false);
});
test('exact multi-select correctness, omission and extra options', () => {
  const q = syn.questions[0];
  const correct = q.correct_option_ids;
  const incorrect = q.options.find(o => !correct.includes(o.id)).id;
  assert.equal(C.grade(q, correct).correct, true);
  let partial = C.grade(q, correct.slice(1));
  assert.equal(partial.correct, false);
  assert.deepEqual(partial.omitted_correct_ids, [correct[0]]);
  let extra = C.grade(q, [...correct, incorrect]);
  assert.equal(extra.correct, false);
  assert.deepEqual(extra.incorrectly_selected_ids, [incorrect]);
});
test('sampling respects mode, category and review pool', () => {
  const cat = rec.questions[0].category;
  const subset = rec.questions.filter(q=>q.category===cat);
  assert.equal(C.pickQuestions(rec.questions, 0, cat).length, subset.length);
  assert.ok(C.pickQuestions(rec.questions, 3, cat).every(q=>q.category===cat));
  const review = new Set([rec.questions[0].question_type+':'+rec.questions[0].id]);
  assert.equal(C.pickQuestions(rec.questions, 20, '', review)[0].id, rec.questions[0].id);
  assert.throws(()=>C.pickQuestions(rec.questions, 10, 'NONEXISTENT'), /暂无可用/);
});
test('progress remains due until two consecutive correct answers', () => {
  const store = C.emptyStore ? C.emptyStore() : {schema_version:1,attempts:[],progress:{}};
  const q = rec.questions[0]; const key = q.question_type+':'+q.id;
  const answer = correct => ({question_type:q.question_type,question_id:q.id,correct,completed_at:'2026-10-15T18:00:00Z'});
  C.updateProgress(store, [answer(false)]);
  assert.equal(store.progress[key].needs_review,true);
  C.updateProgress(store, [answer(true)]);
  assert.equal(store.progress[key].needs_review,true);
  C.updateProgress(store, [answer(true)]);
  assert.equal(store.progress[key].needs_review,false);
  C.updateProgress(store, [answer(false)]);
  assert.equal(store.progress[key].needs_review,true);
  assert.equal(store.progress[key].mistakes,2);
});
test('attempt serialization is idempotent', () => {
  const values=new Map(); const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const q=rec.questions[0];
  const a=C.snapshot(q,q.options,C.grade(q,[q.correct_option_id]),'2026-10-15T18:00:00Z');
  assert.equal(a.displayed_options.length,4);assert.equal(a.word_id,q.word_id);assert.equal(a.sense_id,q.tested_sense_id);
  const attempt={id:'sample-a1',answers:[{...a,correct:true}]};
  assert.equal(C.saveAttempt(storage,attempt),true);
  assert.equal(C.saveAttempt(storage,attempt),true);
  const data=C.readStore(storage);assert.equal(data.attempts.length,1);
  assert.equal(data.progress[q.question_type+':'+q.id].attempts,1);
});
