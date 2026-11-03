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
async function inspectTeacher(request,env,fetcher=fetch){
 const checks={
  tokenPresent:false,issuerConfigured:false,audienceConfigured:false,emailConfigured:false,
  tokenParsed:false,algorithmAccepted:false,issuerMatches:false,audienceMatches:false,
  emailClaimPresent:false,emailMatches:false,timeValid:false,certificatesFetched:false,
  signingKeyFound:false,signatureValid:false
 };
 const token=request.headers.get('Cf-Access-Jwt-Assertion');checks.tokenPresent=Boolean(token);
 checks.issuerConfigured=Boolean(env.ACCESS_ISSUER?.startsWith('https://')&&!env.ACCESS_ISSUER.includes('REPLACE-'));
 checks.audienceConfigured=Boolean(env.ACCESS_AUD&&!env.ACCESS_AUD.startsWith('REPLACE_'));
 checks.emailConfigured=Boolean(env.TEACHER_EMAIL);
 if(!checks.tokenPresent||!checks.issuerConfigured||!checks.audienceConfigured||!checks.emailConfigured)return{ok:false,stage:'request-or-config',checks};
 try{
  const parts=token.split('.');if(parts.length!==3)return{ok:false,stage:'token-format',checks};
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),payload=JSON.parse(new TextDecoder().decode(decode(parts[1])));checks.tokenParsed=true;
  checks.algorithmAccepted=header.alg==='RS256'&&typeof header.kid==='string'&&Boolean(header.kid);if(!checks.algorithmAccepted)return{ok:false,stage:'token-header',checks};
  const issuer=env.ACCESS_ISSUER.replace(/\/$/,'');
  checks.issuerMatches=payload.iss===issuer;
  checks.audienceMatches=Array.isArray(payload.aud)?payload.aud.includes(env.ACCESS_AUD):payload.aud===env.ACCESS_AUD;
  checks.emailClaimPresent=typeof payload.email==='string'&&Boolean(payload.email);
  checks.emailMatches=checks.emailClaimPresent&&payload.email.toLowerCase()===env.TEACHER_EMAIL.toLowerCase();
  if(!checks.issuerMatches||!checks.audienceMatches||!checks.emailMatches)return{ok:false,stage:'claims',checks};
  const now=Math.floor(Date.now()/1000);checks.timeValid=Number.isFinite(payload.exp)&&payload.exp>now&&!(payload.nbf>now)&&!(payload.iat>now+60);if(!checks.timeValid)return{ok:false,stage:'time',checks};
  const certs=await fetcher(issuer+'/cdn-cgi/access/certs');checks.certificatesFetched=certs.ok;if(!checks.certificatesFetched)return{ok:false,stage:'certificates',checks};
  const keys=(await certs.json()).keys,jwk=keys?.find(k=>k.kid===header.kid&&k.kty==='RSA');checks.signingKeyFound=Boolean(jwk);if(!checks.signingKeyFound)return{ok:false,stage:'signing-key',checks};
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  checks.signatureValid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));if(!checks.signatureValid)return{ok:false,stage:'signature',checks};
  return{ok:true,stage:'authorized',checks,identity:{email:payload.email,subject:payload.sub}};
 }catch{return{ok:false,stage:'unexpected',checks}}
}
export async function diagnoseTeacher(request,env,fetcher=fetch){const result=await inspectTeacher(request,env,fetcher);return{ok:result.ok,stage:result.stage,checks:result.checks}}
export async function requireTeacher(request,env,fetcher=fetch){
 const result=await inspectTeacher(request,env,fetcher);if(!result.ok)throw new InputError('教师访问未授权',403);return result.identity;
}
