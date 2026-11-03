import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const config=JSON.parse(await readFile(path.join(root,'backend/wrangler.jsonc'),'utf8'));
const db=config.d1_databases?.find(item=>item.binding==='DB');
if(!db||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(db.database_id)||/^0+$/.test(db.database_id.replaceAll('-','')))
 throw Error('先将真实 D1 Database UUID 写入 backend/wrangler.jsonc；占位 UUID 不允许部署。');
if(config.vars?.FRONTEND_ORIGIN!=='https://alex-english-practice-lab.github.io')throw Error('FRONTEND_ORIGIN 必须是 GitHub Pages 的精确 Origin。');
if(!config.ratelimits?.some(item=>item.name==='SELECT_LIMITER'))throw Error('缺少学生身份查询的 Rate Limit Binding。');
if(config.assets?.binding!=='ASSETS'||config.assets?.run_worker_first!==true)throw Error('缺少受 Worker 校验的教师 Dashboard Assets Binding。');
console.log('Deployment config has a real D1 ID and required bindings; check Access and secrets separately.');
