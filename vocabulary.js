(function(root){
'use strict';
// Canonical data has explicit persistent IDs. The adapter alone knows the old UI shape.
const copy=value=>JSON.parse(JSON.stringify(value));
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
function requireValue(ok,message){if(!ok)throw Error('Vocabulary v1: '+message)}
function mintId(){return globalThis.crypto.randomUUID()}
function validate(library){
 requireValue(library&&library.schemaVersion===1,'unsupported schemaVersion');
 requireValue(nonempty(library.id)&&nonempty(library.name)&&nonempty(library.version),'library identity, name and version required');
 requireValue(!library.id.includes('/'),'library ID cannot contain a path separator');
 requireValue(library.description===undefined||typeof library.description==='string','invalid description');
 requireValue(library.source&&['builtin','user','test'].includes(library.source.type),'invalid source type');
 requireValue(Array.isArray(library.lists)&&library.lists.length>0,'lists required');
 const ids=new Set(),numbers=new Set();
 for(const list of library.lists){
  requireValue(nonempty(list.id)&&list.id.startsWith(library.id+'/list/')&&!ids.has(list.id),'duplicate or unscoped list ID');ids.add(list.id);
  requireValue(list.libraryId===library.id&&nonempty(list.name)&&Number.isFinite(list.order),'invalid list metadata');
  requireValue(Number.isSafeInteger(list.number)&&list.number>0&&!numbers.has(list.number),'unique positive display number required');numbers.add(list.number);
  requireValue(Array.isArray(list.words),'words must be an array');
  for(const word of list.words){
   requireValue(nonempty(word.id)&&word.id.startsWith(library.id+'/word/')&&!ids.has(word.id),'duplicate or unscoped word ID');ids.add(word.id);
   requireValue(word.libraryId===library.id&&word.listId===list.id,'word relationship mismatch');
   requireValue(Number.isSafeInteger(word.revision)&&word.revision>=1&&Number.isFinite(word.order),'invalid word revision/order');
   requireValue(nonempty(word.text)&&typeof word.phonetic==='string'&&typeof word.pos==='string','invalid word display fields');
   requireValue(Array.isArray(word.senses)&&word.senses.length>0&&word.senses.every(nonempty),'senses required');
   requireValue(Array.isArray(word.acceptedAnswers)&&word.acceptedAnswers.includes(word.text)&&word.acceptedAnswers.every(nonempty),'accepted answers must include canonical text');
  }
 }
 if(library.importDiagnostics!==undefined)requireValue(Array.isArray(library.importDiagnostics)&&library.importDiagnostics.every(w=>Number.isSafeInteger(w.line)&&w.line>0&&typeof w.text==='string'&&typeof w.reason==='string'),'invalid import diagnostics');
 return library;
}
const ordered=items=>[...items].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
function toPracticeWords(library){
 validate(library);
 return ordered(library.lists).flatMap(list=>ordered(list.words).map(w=>({
  id:w.id,libraryId:library.id,libraryVersion:library.version,listId:list.id,wordRevision:w.revision,
  word:w.text,phonetic:w.phonetic,pos:w.pos,senses:[...w.senses],list:list.number,
  ...(w.acceptedAnswers.some(x=>x!==w.text)?{variants:w.acceptedAnswers.filter(x=>x!==w.text)}:{})
 })));
}
// A TXT import is a NEW library, not an update inferred from spelling or row number.
// Persist the returned document to retain these IDs; current UI imports remain ephemeral.
function fromLegacy(parsed,{id='lib:'+mintId(),name,version='1.0.0',source={type:'user'},idFactory=mintId}={}){
 const library={schemaVersion:1,id,name,version,source:copy(source),lists:[],importDiagnostics:copy(parsed.warnings||[])};
 const lists=new Map();
 for(const entry of parsed.words){
  let list=lists.get(entry.list);
  if(!list){list={id:id+'/list/'+idFactory(),libraryId:id,name:'List '+entry.list,number:entry.list,order:entry.list,words:[]};lists.set(entry.list,list);library.lists.push(list)}
  list.words.push({id:id+'/word/'+idFactory(),libraryId:id,listId:list.id,revision:1,order:list.words.length,
   text:entry.word,phonetic:entry.phonetic,pos:entry.pos,senses:[...entry.senses],acceptedAnswers:[entry.word,...(entry.variants||[])]});
 }
 return validate(library);
}
function createRegistry({fetcher=(...args)=>fetch(...args)}={}){
 const entries=new Map();let defaultId=null;
 function register(entry){
  requireValue(entry&&nonempty(entry.id)&&!entries.has(entry.id),'duplicate or missing registry ID');
  requireValue(Boolean(entry.url)!==Boolean(entry.data),'register either url or data');
  if(entry.data){validate(entry.data);requireValue(entry.data.id===entry.id,'registry identity mismatch')}
  entries.set(entry.id,copy(entry));return entry.id;
 }
 async function load(id){
  const entry=entries.get(id);requireValue(entry,'unknown library: '+id);
  let library;
  if(entry.data)library=copy(entry.data);
  else{const response=await fetcher(entry.url,{cache:'no-cache'});if(!response.ok)throw Error('词库暂时无法加载');library=await response.json()}
  validate(library);requireValue(library.id===id,'loaded identity mismatch');
  if(entry.version)requireValue(library.version===entry.version,'loaded version mismatch');
  return library;
 }
 async function loadManifest(url){
  const response=await fetcher(url,{cache:'no-cache'});if(!response.ok)throw Error('词库目录暂时无法加载');
  const manifest=await response.json();requireValue(manifest.schemaVersion===1&&Array.isArray(manifest.libraries),'invalid manifest');
  // Validate atomically so a failed request cannot leave a half-registered catalog.
  const trial=createRegistry({fetcher});
  for(const entry of manifest.libraries)trial.register({...entry,url:new URL(entry.url,new URL(url,typeof location==='undefined'?'http://localhost/':location.href)).href});
  requireValue(trial.list().some(e=>e.id===manifest.defaultLibraryId),'default library not registered');
  for(const entry of trial.list())requireValue(!entries.has(entry.id),'duplicate catalog library');
  for(const entry of trial.list())register(entry);
  defaultId=manifest.defaultLibraryId;return defaultId;
 }
 return {register,load,loadManifest,list:()=>[...entries.values()].map(copy),get defaultId(){return defaultId}};
}
const api={validate,fromLegacy,toPracticeWords,createRegistry};
if(typeof module!=='undefined')module.exports=api;else root.WordVocabulary=api;
})(typeof window!=='undefined'?window:globalThis);
