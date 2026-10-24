export function normalizeAlias(value){
 if(typeof value!=='string')throw new InputError('Student ID 格式无效');
 const alias=value.normalize('NFKC').trim().toLocaleLowerCase('en');
 if(!/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,39}$/u.test(alias))throw new InputError('Student ID 需为 1–40 个字母、数字、点、下划线或连字符');
 return alias;
}
export class InputError extends Error{constructor(message,status=400){super(message);this.status=status}}
export const publicStudent=row=>({id:row.id,displayName:row.display_name});
export function validateTeacherStudent(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new InputError('学生资料无效');
 const displayName=value.displayName?.normalize?.('NFKC').trim();
 if(!displayName||displayName.length>80)throw new InputError('显示名称需为 1–80 个字符');
 if(!Array.isArray(value.aliases)||!value.aliases.length||value.aliases.length>8)throw new InputError('需要 1–8 个 Student ID');
 const aliases=value.aliases.map(normalizeAlias);
 if(new Set(aliases).size!==aliases.length)throw new InputError('Student ID 重复');
 return {displayName,aliases};
}
export async function selectStudent(db,alias){
 const normalized=normalizeAlias(alias);
 const row=await db.prepare('SELECT s.id,s.display_name FROM student_aliases a JOIN students s ON s.id=a.student_id WHERE a.normalized_alias=? AND a.active=1 AND s.status=?').bind(normalized,'active').first();
 if(!row)throw new InputError('找不到该 Student ID，请向老师确认',404);
 return publicStudent(row);
}
export async function createStudent(db,input){
 const {displayName,aliases}=validateTeacherStudent(input),id=crypto.randomUUID(),at=new Date().toISOString();
 try{await db.batch([
  db.prepare('INSERT INTO students(id,display_name,status,created_at,updated_at) VALUES(?,?,?, ?,?)').bind(id,displayName,'active',at,at),
  ...aliases.map(alias=>db.prepare('INSERT INTO student_aliases(normalized_alias,student_id,active,created_at) VALUES(?,?,1,?)').bind(alias,id,at))
 ])}catch{throw new InputError('Student ID 已被使用；没有创建学生',409)}
 return {id,displayName,aliases,status:'active'};
}
export async function listStudents(db){
 const rows=(await db.prepare('SELECT id,display_name,status,created_at FROM students ORDER BY created_at,id').all()).results;
 const aliases=(await db.prepare('SELECT normalized_alias,student_id,active FROM student_aliases ORDER BY normalized_alias').all()).results;
 return rows.map(row=>({...publicStudent(row),status:row.status,createdAt:row.created_at,aliases:aliases.filter(a=>a.student_id===row.id&&a.active).map(a=>a.normalized_alias)}));
}
export async function updateStudent(db,id,input){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new InputError('学生编号无效');
 if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError('学生资料无效');
 const previous=await db.prepare('SELECT id,display_name,status FROM students WHERE id=?').bind(id).first();
 if(!previous)throw new InputError('找不到该学生',404);
 const current=(await db.prepare('SELECT normalized_alias FROM student_aliases WHERE student_id=? AND active=1').bind(id).all()).results.map(a=>a.normalized_alias);
 const {displayName,aliases}=validateTeacherStudent({displayName:input.displayName??previous.display_name,aliases:input.aliases??current});
 const status=input.status??previous.status;if(!['active','disabled'].includes(status))throw new InputError('学生状态无效');
 const at=new Date().toISOString();
 const owned=(await db.prepare('SELECT normalized_alias,student_id FROM student_aliases WHERE normalized_alias IN ('+aliases.map(()=>'?').join(',')+')').bind(...aliases).all()).results;
 if(owned.some(row=>row.student_id!==id))throw new InputError('Student ID 已被其他学生使用或保留',409);
 try{await db.batch([
  db.prepare('UPDATE students SET display_name=?,status=?,updated_at=? WHERE id=?').bind(displayName,status,at,id),
  db.prepare('UPDATE student_aliases SET active=0 WHERE student_id=?').bind(id),
  ...aliases.map(alias=>owned.some(row=>row.normalized_alias===alias)?db.prepare('UPDATE student_aliases SET active=1 WHERE normalized_alias=? AND student_id=?').bind(alias,id):db.prepare('INSERT INTO student_aliases(normalized_alias,student_id,active,created_at) VALUES(?,?,1,?)').bind(alias,id,at))
 ])}catch{throw new InputError('Student ID 冲突，资料未修改',409)}
 return {id,displayName,aliases,status};
}
