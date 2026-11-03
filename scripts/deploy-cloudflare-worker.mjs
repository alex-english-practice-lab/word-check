import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const names=['ACCESS_ISSUER','ACCESS_AUD','TEACHER_EMAIL'];

export function deploymentSecrets(env=process.env){
 const secrets=Object.fromEntries(names.map(name=>[name,env[name]]));
 const missing=names.filter(name=>typeof secrets[name]!=='string'||!secrets[name]);
 if(missing.length)throw Error('缺少 Worker 运行时 Secret：'+missing.join(', '));
 if(secrets.ACCESS_ISSUER!==secrets.ACCESS_ISSUER.trim()||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(secrets.ACCESS_ISSUER))throw Error('ACCESS_ISSUER 必须是无空格、无末尾斜杠的 Cloudflare Access HTTPS 地址。');
 if(secrets.ACCESS_AUD!==secrets.ACCESS_AUD.trim()||!/^[0-9a-f]{64}$/i.test(secrets.ACCESS_AUD))throw Error('ACCESS_AUD 必须是 64 位 Cloudflare Access Audience Tag。');
 if(secrets.TEACHER_EMAIL!==secrets.TEACHER_EMAIL.trim()||!/^\S+@\S+\.\S+$/.test(secrets.TEACHER_EMAIL))throw Error('TEACHER_EMAIL 必须是无前后空格的完整邮箱地址。');
 return secrets;
}

export async function deployWorker(env=process.env){
 const secrets=deploymentSecrets(env),secretFile=path.join(os.tmpdir(),'word-check-worker-secrets-'+randomUUID()+'.json');
 await writeFile(secretFile,JSON.stringify(secrets),{encoding:'utf8',mode:0o600,flag:'wx'});
 try{
  const command=process.platform==='win32'?'wrangler.cmd':'wrangler';
  const result=spawnSync(command,['deploy','--secrets-file',secretFile],{stdio:'inherit',env});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Wrangler deploy failed with status '+result.status+'.');
 }finally{await rm(secretFile,{force:true})}
}

const direct=process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(direct)await deployWorker();
