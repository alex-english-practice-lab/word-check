(function(root){
const posToken='(?:excl|interj|int|adj|adv|ad|prep|pron|conj|num|aux|art|det|phr|vt|vi|[nva])\\s*\\.';
const posPattern=new RegExp('\\b'+posToken+'(?:\\s*[/／]\\s*'+posToken+')*','gi');
function meanings(text){let out=[],part='',depth=0;for(const c of text){if('（(['.includes(c))depth++;if('）)]'.includes(c))depth=Math.max(0,depth-1);if(/[;；,，、]/.test(c)&&!depth){if(part.trim())out.push(part.trim());part=''}else part+=c}if(part.trim())out.push(part.trim());return out.map(x=>x.replace(/^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|\d+[.、)])\s*/,'')).filter(Boolean)}
function parse(text){
 let list=null,words=[],warnings=[],seen=new Map();
 text.replace(/^\uFEFF/,'').split(/\r\n?|\n/).forEach((raw,i)=>{
  let s=raw.trim();if(!s)return;
  const warn=reason=>warnings.push({line:i+1,text:raw,reason});
  const heading=s.match(/^(?:[#*\s]*)(?:(?:word\s+)?list|unit|单元)\s*[:：.-]?\s*(\d+)(?:\s*[:：\-—].*)?\s*[*#]*$/i)||s.match(/^第\s*(\d+)\s*(?:单元|课)$/);
  if(heading){list=Number(heading[1]);if(!Number.isSafeInteger(list)||list<1){warn('单元编号需为正整数');list=null}return}
  if(!list){warn('前面缺少有效的 List 标题');return}
  s=s.replace(/^\d+[.)、]\s*/,'');
  // Read the headword before parsing IPA or part-of-speech slashes.
  const match=s.match(/^([A-Za-z][A-Za-z’'\-]*(?:\s+[A-Za-z][A-Za-z’'\-]*)*)(?:[*＊]+)?(?=\s|[/\[\u3400-\u9fff]|$)/);
  if(!match){warn('无法分开英文与释义');return}
  const word=match[1].trim();let rest=s.slice(match[0].length).trim(),phonetic='',variants=[];
  const alternate=rest.match(/^\/([A-Za-z][A-Za-z’'\-]*)(?=\s|[\u3400-\u9fff])/);
  if(alternate){variants=[word.replace(/[^ ]+$/,alternate[1])];rest=rest.slice(alternate[0].length).trim()}

  const ipaPattern=/\/[^/\n\u3400-\u9fff]+\/|\[[^\]\n\u3400-\u9fff]+\]|\{[^}\n\u3400-\u9fff]+\}/g;
  const phonetics=[];
  rest=rest.replace(ipaPattern,(token,offset)=>{if(token.startsWith('[')&&offset!==0&&!/[\u0250-\u02ffæŋðθˈˌ':]/.test(token))return token;phonetics.push(token);return ' '});
  const broken=rest.match(new RegExp('^\\[([^\\]\\u3400-\\u9fff]+?)\\s+(?='+posToken+')','i'));
  if(broken){phonetics.push('['+broken[1].trim()+']');rest=rest.slice(broken[0].length);warn('音标缺少右括号，已补齐显示；释义按原文保留')}
  phonetic=[...new Set(phonetics)].join(' · ');
  const pos=[...new Set([...rest.matchAll(posPattern)].map(x=>x[0].replace(/\s+/g,'')))].join(' / ');
  rest=rest.replace(posPattern,';').replace(/^[;\s|:：]+/,'');
  const senses=meanings(rest).map(x=>x.replace(/^[|\s]+|[|\s]+$/g,'')).filter(x=>/[A-Za-z\u3400-\u9fff]/.test(x));
  if(!senses.length||!/[\u3400-\u9fff]/.test(rest)){warn('未找到中文释义');return}
  const key=list+':'+word.toLowerCase();if(seen.has(key)){const existing=seen.get(key);existing.senses=[...new Set([...existing.senses,...senses])];existing.pos=[...new Set([existing.pos,pos].filter(Boolean))].join(' / ');if(!existing.phonetic)existing.phonetic=phonetic;warn('同一单元内重复单词，已合并原文释义，请核对词性与释义');return}
  const entry={word,phonetic,pos,senses,list,id:words.length,...(variants.length?{variants}:{})};seen.set(key,entry);words.push(entry);
 });return{words,warnings}
}
function range(value,available){
 const result=new Set(),known=available?[...new Set(available)]:null;
 const parts=String(value).trim().replace(/\b(?:word\s+list|list|unit)\s*/gi,'').replace(/[，、]/g,',').replace(/[–—～~]/g,'-').split(',');
 for(const p of parts){
  const m=p.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if(!m)throw Error('范围格式不正确，请输入如 1-4 或 1,3,7-9。');
  const a=Number(m[1]),b=Number(m[2]||m[1]);
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b<a)throw Error('List 编号需为正整数，起始编号不能大于结束编号。');
  if(known){const matches=known.filter(n=>n>=a&&n<=b);if(matches.length!==b-a+1)throw Error(a===b?'词表中没有 List '+a+'，请调整范围或导入完整词表。':'词表中未包含 List '+a+'–'+b+' 的全部单元，请检查已导入的单元。');matches.forEach(n=>result.add(n))}
  else{if(b-a>10000)throw Error('范围过大，请缩小范围或先导入词表。');for(let n=a;n<=b;n++)result.add(n)}
 }
 return [...result].sort((a,b)=>a-b)
}
function totalCount(value,available){const text=String(value).trim(),count=Number(text);if(!/^\d+$/.test(text)||!Number.isSafeInteger(count))throw Error('总题量需为 0 或正整数；填 0 表示全部。');if(count>available)throw Error('所选 List 共 '+available+' 个词，请减少总题量。');return count===0?available:count}
function sampleMixed(words,value){return shuffle(words).slice(0,totalCount(value,words.length))}
const normalize=x=>x.trim().toLowerCase().replace(/[‘’]/g,"'").replace(/\s+/g,' ');
function accepts(entry,typed){return [entry.word,...(entry.variants||[])].some(word=>normalize(word)===normalize(typed))}
function shuffle(array){const out=[...array];for(let i=out.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]]}return out}
function sampleByList(words,plan){const seen=new Set(),result=[];for(const {list,count} of plan){if(!Number.isInteger(list)||!Number.isSafeInteger(list)||list<1||seen.has(list))throw Error('请检查 List 编号，不能重复。');seen.add(list);const pool=words.filter(w=>w.list===list);if(!pool.length)throw Error('词表中没有 List '+list+'。');if(!Number.isInteger(count)||count<0)throw Error('List '+list+' 的抽取数量需为 0 或正整数。');if(count>pool.length)throw Error('List '+list+' 只有 '+pool.length+' 个词，请减少抽取数量。');result.push(...shuffle(pool).slice(0,count))}if(!result.length)throw Error('请至少抽取 1 个单词。');return shuffle(result)}
const api={parse,range,meanings,normalize,accepts,shuffle,sampleByList,totalCount,sampleMixed};if(typeof module!=='undefined')module.exports=api;else root.WordCore=api;
})(typeof window!=='undefined'?window:globalThis);
