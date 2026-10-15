// One-time migration. Emit an apply_patch patch; never overwrite an existing ID inventory.
// Run from repo root: node scripts/migrate-ielts.cjs | apply_patch
const fs=require('node:fs'),crypto=require('node:crypto');
const C=require('../core.js'),V=require('../vocabulary.js');
const target='data/ielts.v1.json';
if(fs.existsSync(target))throw Error('Already migrated. Edit the canonical JSON preserving IDs; do not regenerate.');
const raw=fs.readFileSync('ielts-word-list.txt','utf8');
const library=V.fromLegacy(C.parse(raw),{id:'lib:ielts',name:'IELTS 默认词库',source:{type:'builtin',format:'legacy-txt',path:'ielts-word-list.txt',sha256:crypto.createHash('sha256').update(raw).digest('hex')},idFactory:()=>crypto.randomUUID()});
library.description='现有 IELTS 词库的无损练习数据迁移；原始 TXT 保留供核对。';
// Compact each word onto one line so future content edits are reviewable.
const lines=JSON.stringify(library,null,2).replace(/\{\n {10}"id":[\s\S]+?\n {8}\}/g,block=>JSON.stringify(JSON.parse(block))).split('\n');
console.log('*** Begin Patch\n*** Add File: '+target+'\n'+lines.map(x=>'+'+x).join('\n')+'\n*** End Patch');
