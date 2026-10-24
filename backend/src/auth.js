import {InputError} from './identity.js';
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=part=>Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-part.length%4)%4)),c=>c.charCodeAt(0));
export async function digest(token){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function issueSession(db,studentId){
 const token=encode(crypto.getRandomValues(new Uint8Array(32))),at=new Date(),expiresAt=new Date(at.getTime()+30*86400000).toISOString();
 await db.prepare('INSERT INTO student_sessions(token_hash,student_id,expires_at,created_at) VALUES(?,?,?,?)').bind(await digest(token),studentId,expiresAt,at.toISOString()).run();
 return {accessToken:token,expiresAt};
}
function bearer(request){const h=request.headers.get('Authorization')||'';const match=/^Bearer ([A-Za-z0-9_-]{40,})$/.exec(h);if(!match)throw new InputError('请重新输入 Student ID',401);return match[1]}
export async function requireStudent(request,db){
 const hash=await digest(bearer(request));
 const row=await db.prepare('SELECT s.id,s.display_name FROM student_sessions t JOIN students s ON s.id=t.student_id WHERE t.token_hash=? AND t.expires_at>? AND s.status=?').bind(hash,new Date().toISOString(),'active').first();
 if(!row)throw new InputError('学生会话已失效，请重新进入',401);
 return {id:row.id,displayName:row.display_name,tokenHash:hash};
}
export async function revokeStudent(request,db){await db.prepare('DELETE FROM student_sessions WHERE token_hash=?').bind(await digest(bearer(request))).run()}
export async function requireTeacher(request,env,fetcher=fetch){
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token||!env.ACCESS_ISSUER?.startsWith('https://')||!env.ACCESS_AUD||!env.TEACHER_EMAIL||env.ACCESS_AUD.startsWith('REPLACE_')||env.ACCESS_ISSUER.includes('REPLACE-'))throw new InputError('教师访问未授权',403);
 try{
  const parts=token.split('.');if(parts.length!==3)throw Error('JWT');
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),payload=JSON.parse(new TextDecoder().decode(decode(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid)throw Error('alg/kid');
  const issuer=env.ACCESS_ISSUER.replace(/\/$/,'');
  if(payload.iss!==issuer||!(Array.isArray(payload.aud)?payload.aud.includes(env.ACCESS_AUD):payload.aud===env.ACCESS_AUD)||payload.email?.toLowerCase()!==env.TEACHER_EMAIL.toLowerCase())throw Error('claims');
  const now=Math.floor(Date.now()/1000);if(!Number.isFinite(payload.exp)||payload.exp<=now||payload.nbf>now||payload.iat>now+60)throw Error('expired');
  const certs=await fetcher(issuer+'/cdn-cgi/access/certs');if(!certs.ok)throw Error('certs');
  const keys=(await certs.json()).keys;const jwk=keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!jwk)throw Error('key');
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw Error('signature');
  return {email:payload.email,subject:payload.sub};
 }catch{throw new InputError('教师访问未授权',403)}
}
