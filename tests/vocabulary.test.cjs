const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const C=require('../core'),V=require('../vocabulary'),ielts=require('../data/ielts.v1.json'),second=require('./fixtures/second-library.json');
const clone=x=>JSON.parse(JSON.stringify(x));
const legacyFields=w=>({word:w.word,phonetic:w.phonetic,pos:w.pos,senses:w.senses,list:w.list,...(w.variants?{variants:w.variants}:{})});
test('A: all original TXT bytes and 3610 parsed entries, variants, warnings survive',()=>{
 const raw=fs.readFileSync('ielts-word-list.txt','utf8'),old=C.parse(raw),words=V.toPracticeWords(ielts);
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),ielts.source.sha256);
 assert.equal(words.length,3610);assert.equal(ielts.lists.length,48);
 assert.deepEqual(words.map(legacyFields),old.words.map(legacyFields));assert.deepEqual(ielts.importDiagnostics,old.warnings);
 for(const w of words){assert.ok(C.accepts(w,'  '+w.word.toUpperCase()+'  '));for(const v of w.variants||[])assert.ok(C.accepts(w,v));assert.ok(!C.accepts(w,w.word+'xxx'))}
 assert.equal(words.filter(w=>!w.phonetic).length,25);
});
test('B: registry loads default manifest, a separate library, and samples only that library',async()=>{
 const requests=[];const catalog=require('../data/catalog.json');
 const registry=V.createRegistry({fetcher:async url=>{requests.push(url);return {ok:true,json:async()=>url==='data/catalog.json'?catalog:clone(ielts)}}});
 assert.equal(await registry.loadManifest('data/catalog.json'),ielts.id);
 assert.equal(requests[0],'data/catalog.json');
 assert.equal((await registry.load(ielts.id)).id,ielts.id);
 assert.match(requests[1],/\/data\/ielts\.v1\.json$/);
 registry.register({id:second.id,data:second});
 const loaded=await registry.load(second.id),words=V.toPracticeWords(loaded);
 for(const sample of [C.sampleMixed(words,2),C.sampleByList(words,[{list:3,count:2}])]){
  assert.equal(sample.length,2);assert.equal(new Set(sample.map(w=>w.id)).size,2);assert.ok(sample.every(w=>w.libraryId===second.id));
 }
 loaded.name='mutated';assert.notEqual((await registry.load(second.id)).name,'mutated');
 await assert.rejects(registry.load('missing'));assert.throws(()=>registry.register({id:second.id,data:second}));
});
test('registry rejects corrupt identity/version/schema and retries manifest failures atomically',async()=>{
 const registry=V.createRegistry({fetcher:async()=>({ok:true,json:async()=>second})});
 registry.register({id:'lib:other',url:'/x'});await assert.rejects(registry.load('lib:other'),/identity/);
 registry.register({id:second.id,url:'/x',version:'2.0.0'});await assert.rejects(registry.load(second.id),/version/);
 const broken={schemaVersion:1,defaultLibraryId:second.id,libraries:[{id:second.id,url:'x'},{id:second.id,url:'y'}]};
 const catalog=V.createRegistry({fetcher:async()=>({ok:true,json:async()=>broken})});
 await assert.rejects(catalog.loadManifest('data/catalog.json'));assert.deepEqual(catalog.list(),[]);
 broken.libraries.pop();await catalog.loadManifest('data/catalog.json');assert.equal(catalog.defaultId,second.id);
});
test('C: same spelling is distinct across libraries and within one list; sorting/editing preserves IDs',()=>{
 const a=V.toPracticeWords(ielts).find(w=>w.word==='emperor'),b=V.toPracticeWords(second);
 assert.notEqual(a.id,b[0].id);assert.notEqual(b[1].id,b[2].id);assert.equal(b[1].word,b[2].word);
 const edited=clone(second);edited.lists.reverse();edited.lists[1].words.reverse();
 assert.deepEqual(V.toPracticeWords(edited),b);
 const w=edited.lists[1].words[0],id=w.id;w.text='new bank';w.acceptedAnswers=['new bank'];w.senses=['新释义'];w.revision++;w.order=-1;
 edited.version='1.1.0';assert.equal(V.toPracticeWords(edited)[0].id,id);
 const ids=[...V.toPracticeWords(ielts),...b].map(w=>w.id);assert.equal(new Set(ids).size,ids.length);
});
test('invalid relationships, duplicate IDs and duplicate display numbers fail closed',()=>{
 for(const mutate of [l=>l.schemaVersion=2,l=>l.lists[0].libraryId='other',l=>l.lists[0].words[0].listId='other',l=>l.lists[0].words[0].id=l.lists[0].words[1].id,l=>l.lists[1].number=3,l=>l.lists[0].words[0].acceptedAnswers=[]]){const l=clone(second);mutate(l);assert.throws(()=>V.validate(l))}
});
test('moving a word to another List or renumbering a List retains persistent identities',()=>{
 const edited=clone(second),from=edited.lists[0],to=edited.lists[1],word=from.words.pop(),id=word.id;
 word.listId=to.id;to.words.push(word);to.number=93;to.order=-1;
 V.validate(edited);const adapted=V.toPracticeWords(edited).find(w=>w.id===id);
 assert.equal(adapted.listId,to.id);assert.equal(adapted.list,93);assert.equal(adapted.id,id);
});
test('TXT adapter retains parser behavior but creates new IDs, with no upper List bound',()=>{
 const parsed=C.parse('Word List 29\nremarkable* [rɪˈmɑ:kəbl] a. 显著的\nWord List 61\nexact /ɪgˈzækt/ a. 准确的');
 const a=V.fromLegacy(parsed,{name:'user'}),b=V.fromLegacy(parsed,{name:'user'});
 assert.notEqual(a.id,b.id);assert.notEqual(a.lists[0].words[0].id,b.lists[0].words[0].id);
 assert.deepEqual(V.toPracticeWords(a).map(legacyFields),parsed.words.map(legacyFields));
 assert.deepEqual(C.range('29,61',V.toPracticeWords(a).map(w=>w.list)),[29,61]);
 assert.equal(C.sampleByList(V.toPracticeWords(a),[{list:61,count:1}])[0].word,'exact');
});
test('sampling and normalization keep original edge cases and never mutate input',()=>{
 const words=V.toPracticeWords(ielts),before=words.map(w=>w.id);
 assert.equal(C.sampleMixed(words,0).length,words.length);assert.equal(C.sampleMixed(words,'17').length,17);
 assert.throws(()=>C.sampleMixed(words,'1.5'));assert.throws(()=>C.sampleMixed(words,-1));assert.throws(()=>C.sampleMixed(words,words.length+1));
 assert.throws(()=>C.sampleByList(words,[{list:1,count:0}]));assert.throws(()=>C.sampleByList(words,[{list:1,count:1},{list:1,count:1}]));
 assert.deepEqual(C.range('1,3,29-30',words.map(w=>w.list)),[1,3,29,30]);assert.throws(()=>C.range('49',words.map(w=>w.list)));
 assert.deepEqual(words.map(w=>w.id),before);assert.equal(C.normalize('  DON’T   go '),"don't go");
});
