import {InputError} from './identity.js';
import {digest,issueSession} from './auth.js';

const token=()=>btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const id=value=>typeof value==='string'&&value.length>0&&value.length<=180&&/^[\w:./@-]+$/.test(value);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value}
function preset(value){if(typeof value!=='string'||value.length>2000||!/^#preset=[A-Za-z0-9._~-]+$/.test(value))throw new InputError('练习链接格式无效');return value}

export async function createAssignment(db,body){
 if(!id(body?.studentId)||!/^[0-9a-f-]{36}$/i.test(body.studentId))throw new InputError('请选择有效的学生');
 const hash=preset(body.presetHash),days=body.expiresInDays??30;
 if(!Number.isInteger(days)||days<1||days>90)throw new InputError('链接有效期需在 1–90 天之间');
 const student=await db.prepare('SELECT id FROM students WHERE id=? AND status=?').bind(body.studentId,'active').first();
 if(!student)throw new InputError('学生不存在或已停用',404);
 const value=token(),assignmentId=crypto.randomUUID(),now=new Date();
 await db.prepare('INSERT INTO assignments(id,token_hash,student_id,preset_hash,created_at,expires_at) VALUES(?,?,?,?,?,?)').bind(assignmentId,await digest(value),student.id,hash,now.toISOString(),new Date(now.getTime()+days*86400000).toISOString()).run();
 return {id:assignmentId,token:value,expiresAt:new Date(now.getTime()+days*86400000).toISOString()};
}
export async function openAssignment(db,value){
 if(typeof value!=='string'||! /^[A-Za-z0-9_-]{40,64}$/.test(value))throw new InputError('作业链接无效',404);
 const row=await db.prepare('SELECT a.id,a.student_id,a.preset_hash,a.expires_at,s.display_name FROM assignments a JOIN students s ON s.id=a.student_id WHERE a.token_hash=? AND a.expires_at>? AND s.status=?').bind(await digest(value),new Date().toISOString(),'active').first();
 if(!row)throw new InputError('作业链接已过期或不可用',404);
 const alias=await db.prepare('SELECT normalized_alias FROM student_aliases WHERE student_id=? AND active=1 ORDER BY normalized_alias LIMIT 1').bind(row.student_id).first();
 if(!alias)throw new InputError('该学生没有有效的 Student ID',404);
 const session=await issueSession(db,row.student_id);
 return {assignmentId:row.id,presetHash:row.preset_hash,student:{id:row.student_id,displayName:row.display_name},alias:alias.normalized_alias,...session};
}

export async function putRecord(db,studentId,input){
 const kind=input?.kind,payload=input?.payload,recordId=input?.id,assignmentId=input?.assignmentId??null;
 if(!['session','check','daily'].includes(kind)||!id(recordId)||!payload||typeof payload!=='object'||Array.isArray(payload))throw new InputError('学习记录格式无效');
 if(assignmentId!==null){
  if(!id(assignmentId))throw new InputError('作业编号无效');
  const assigned=await db.prepare('SELECT id FROM assignments WHERE id=? AND student_id=?').bind(assignmentId,studentId).first();
  if(!assigned)throw new InputError('作业与当前学生不匹配',403);
 }
 const expected=kind==='session'?payload.session?.id:kind==='check'?payload.attempt?.id:payload.id;
 const timestamp=kind==='session'?payload.session?.updatedAt:kind==='check'?payload.attempt?.completedAt:payload.completed_at;
 if(expected!==recordId||!iso(timestamp))throw new InputError('学习记录编号或时间无效');
 if(kind==='session'&&payload.session?.profileId!==studentId||kind==='check'&&payload.attempt?.identity?.userId!==studentId)throw new InputError('学习记录与当前学生不匹配',403);
 if(kind==='check'&&(!['completed','abandoned'].includes(payload.attempt.status)||!Array.isArray(payload.answers)))throw new InputError('只能提交已结束的检查记录');
 if(kind==='daily'&&!Array.isArray(payload.answers))throw new InputError('选择题记录缺少答案');
 const json=JSON.stringify(canonical(payload));if(json.length>180000)throw new InputError('学习记录过大',413);
 const hash=await digest(json);
 const prior=await db.prepare('SELECT payload_hash,updated_at,assignment_id FROM student_records WHERE student_id=? AND kind=? AND record_id=?').bind(studentId,kind,recordId).first();
 if(prior){
  if(prior.payload_hash===hash&&prior.assignment_id===assignmentId)return {saved:false,duplicate:true};
  if(kind!=='session'||prior.assignment_id!==assignmentId||timestamp<=prior.updated_at)throw new InputError('同一记录编号的内容冲突',409);
  const updated=await db.prepare('UPDATE student_records SET payload_json=?,payload_hash=?,updated_at=? WHERE student_id=? AND kind=? AND record_id=? AND updated_at<?').bind(json,hash,timestamp,studentId,kind,recordId,timestamp).run();
  if((updated?.meta?.changes??updated?.changes)===0)throw new InputError('进度已被其他设备更新，请重新同步',409);
  return {saved:true,duplicate:false};
 }
 try{await db.prepare('INSERT INTO student_records(student_id,kind,record_id,payload_json,payload_hash,updated_at,assignment_id) VALUES(?,?,?,?,?,?,?)').bind(studentId,kind,recordId,json,hash,timestamp,assignmentId).run()}
 catch{const concurrent=await db.prepare('SELECT payload_hash,assignment_id FROM student_records WHERE student_id=? AND kind=? AND record_id=?').bind(studentId,kind,recordId).first();if(concurrent?.payload_hash===hash&&concurrent.assignment_id===assignmentId)return {saved:false,duplicate:true};throw new InputError('同一记录编号的内容冲突',409)}
 return {saved:true,duplicate:false};
}
export async function listRecords(db,studentId,after=0){
 if(!Number.isSafeInteger(after)||after<0)throw new InputError('分页位置无效');
 const rows=(await db.prepare('SELECT rowid AS cursor,kind,record_id,payload_json,updated_at,assignment_id FROM student_records WHERE student_id=? AND rowid>? ORDER BY rowid LIMIT 101').bind(studentId,after).all()).results;
 const page=rows.slice(0,100);return {records:page.map(row=>({kind:row.kind,id:row.record_id,payload:JSON.parse(row.payload_json),assignmentId:row.assignment_id,updatedAt:row.updated_at})),nextCursor:rows.length>100?page[page.length-1].cursor:null};
}

// Teacher reads are deliberately separate from student bearer-token reads. A cursor
// moves backwards through immutable rowids, so checkpoint updates do not reshuffle pages.
export async function listTeacherRecords(db,{studentId,assignmentId=null,before=Number.MAX_SAFE_INTEGER}){
 if(typeof studentId!=='string'||!/^[0-9a-f-]{36}$/i.test(studentId))throw new InputError('请选择有效的学生');
 if(assignmentId!==null&&(typeof assignmentId!=='string'||!/^[0-9a-f-]{36}$/i.test(assignmentId)))throw new InputError('作业编号无效');
 if(!Number.isSafeInteger(before)||before<1)throw new InputError('分页位置无效');
 const student=await db.prepare('SELECT id,display_name,status FROM students WHERE id=?').bind(studentId).first();
 if(!student)throw new InputError('找不到该学生',404);
 if(assignmentId){const assigned=await db.prepare('SELECT id FROM assignments WHERE id=? AND student_id=?').bind(assignmentId,studentId).first();if(!assigned)throw new InputError('作业与学生不匹配',404)}
 const sql='SELECT rowid AS cursor,kind,record_id,payload_json,updated_at,assignment_id FROM student_records WHERE student_id=? AND rowid<?'+(assignmentId?' AND assignment_id=?':'')+' ORDER BY rowid DESC LIMIT 26';
 const args=assignmentId?[studentId,before,assignmentId]:[studentId,before];
 const rows=(await db.prepare(sql).bind(...args).all()).results,page=rows.slice(0,25);
 return {student:{id:student.id,displayName:student.display_name,status:student.status},records:page.map(row=>({kind:row.kind,id:row.record_id,payload:JSON.parse(row.payload_json),assignmentId:row.assignment_id,updatedAt:row.updated_at})),nextCursor:rows.length>25?page[page.length-1].cursor:null};
}
export async function listTeacherAssignments(db,studentId){
 if(typeof studentId!=='string'||!/^[0-9a-f-]{36}$/i.test(studentId))throw new InputError('请选择有效的学生');
 const student=await db.prepare('SELECT id FROM students WHERE id=?').bind(studentId).first();if(!student)throw new InputError('找不到该学生',404);
 const rows=(await db.prepare('SELECT id,created_at,expires_at FROM assignments WHERE student_id=? ORDER BY created_at DESC,id DESC LIMIT 200').bind(studentId).all()).results;
 return rows.map(row=>({id:row.id,createdAt:row.created_at,expiresAt:row.expires_at}));
}
