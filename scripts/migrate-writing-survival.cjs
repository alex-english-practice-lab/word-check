// One-time deterministic conversion from the reviewed source document.
// Run from repo root: node scripts/migrate-writing-survival.cjs | apply_patch
const fs=require('node:fs');
const V=require('../vocabulary.js');
const source=require('../data/writing-survival-100.source.json');
const target='data/writing-survival-100.v1.json';
if(fs.existsSync(target))throw Error('Already migrated. Preserve the canonical IDs and edit the versioned file instead.');
const safe=value=>{
 const result=String(value).trim();
 if(!/^[a-z0-9][a-z0-9._-]*$/i.test(result))throw Error('Unsafe source ID: '+value);
 return result;
};
const library=V.fromSource(source,{id:'lib:writing-survival-100',idFactory:(_kind,sourceId)=>safe(sourceId)});
const lines=JSON.stringify(library,null,2).replace(/\{\n {10}"id":[\s\S]+?\n {8}\}/g,block=>JSON.stringify(JSON.parse(block))).split('\n');
console.log('*** Begin Patch\n*** Add File: '+target+'\n'+lines.map(line=>'+'+line).join('\n')+'\n*** End Patch');
