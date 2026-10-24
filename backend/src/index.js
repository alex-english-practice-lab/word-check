import {InputError,selectStudent,createStudent,listStudents,updateStudent} from './identity.js';
import {issueSession,requireStudent,revokeStudent,requireTeacher} from './auth.js';
import {createAssignment,openAssignment,putRecord,listRecords,listTeacherRecords,listTeacherAssignments} from './records.js';
function json(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}})}
async function body(request,max=4096){
 if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))throw new InputError('请提交 JSON');
 if(Number(request.headers.get('Content-Length')||0)>max)throw new InputError('请求过大',413);
 const raw=await request.text();if(raw.length>max)throw new InputError('请求过大',413);
 try{return JSON.parse(raw)}catch{throw new InputError('JSON 格式无效')}
}
export async function handle(request,env,{fetcher=fetch}={}){
 const origin=request.headers.get('Origin'),allowed=env.FRONTEND_ORIGIN;
 if(origin&&origin!==allowed)return json({error:'Origin 未授权'},403);
 const cors=origin?{'Access-Control-Allow-Origin':allowed,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Vary':'Origin'}:{};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 try{
  if(!env.DB)throw new InputError('数据库尚未配置',503);
  const path=new URL(request.url).pathname;
  if(path==='/api/health'&&request.method==='GET')return json({ok:true},200,cors);
  if(path==='/api/student/select'&&request.method==='POST'){
   if(!env.SELECT_LIMITER?.limit)throw new InputError('身份查询暂不可用',503);
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';if(!(await env.SELECT_LIMITER.limit({key:ip})).success)throw new InputError('尝试次数过多，请稍后重试',429);
   const student=await selectStudent(env.DB,(await body(request)).alias),session=await issueSession(env.DB,student.id);
   return json({student,...session},200,cors);
  }
  if(path==='/api/student/profile'&&request.method==='GET'){const s=await requireStudent(request,env.DB);return json({student:{id:s.id,displayName:s.displayName}},200,cors)}
  if(path==='/api/student/logout'&&request.method==='POST'){await revokeStudent(request,env.DB);return json({ok:true},200,cors)}
  if(path==='/api/assignment/open'&&request.method==='POST'){
   if(!env.SELECT_LIMITER?.limit)throw new InputError('作业链接暂不可用',503);
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';if(!(await env.SELECT_LIMITER.limit({key:ip})).success)throw new InputError('尝试次数过多，请稍后重试',429);
   return json(await openAssignment(env.DB,(await body(request)).token),200,cors);
  }
  if(path==='/api/student/records'&&request.method==='GET'){
   const s=await requireStudent(request,env.DB),raw=new URL(request.url).searchParams.get('after')||'0';
   if(!/^\d+$/.test(raw))throw new InputError('分页位置无效');
   return json(await listRecords(env.DB,s.id,Number(raw)),200,cors);
  }
  if(path==='/api/student/records'&&request.method==='POST'){
   const s=await requireStudent(request,env.DB);return json(await putRecord(env.DB,s.id,await body(request,200000)),200,cors);
  }
  if(path.startsWith('/api/teacher/')){
   await requireTeacher(request,env,fetcher);
   if(path==='/api/teacher/records'&&request.method==='GET'){
    const query=new URL(request.url).searchParams;
    const raw=query.get('before');if(raw!==null&&!/^[1-9]\d*$/.test(raw))throw new InputError('分页位置无效');
    return json(await listTeacherRecords(env.DB,{studentId:query.get('studentId'),assignmentId:query.get('assignmentId')||null,before:raw===null?undefined:Number(raw)}),200,cors);
   }
   if(path==='/api/teacher/assignments'&&request.method==='GET')return json({assignments:await listTeacherAssignments(env.DB,new URL(request.url).searchParams.get('studentId'))},200,cors);
   if(path==='/api/teacher/assignments'&&request.method==='POST')return json(await createAssignment(env.DB,await body(request)),201,cors);
   if(path==='/api/teacher/students'&&request.method==='GET')return json({students:await listStudents(env.DB)},200,cors);
   if(path==='/api/teacher/students'&&request.method==='POST')return json({student:await createStudent(env.DB,await body(request))},201,cors);
   const match=/^\/api\/teacher\/students\/([0-9a-f-]{36})$/i.exec(path);
   if(match&&request.method==='PATCH')return json({student:await updateStudent(env.DB,match[1],await body(request))},200,cors);
  }
  return json({error:'Not found'},404,cors);
 }catch(error){return json({error:error instanceof InputError?error.message:'服务暂不可用'},error instanceof InputError?error.status:500,cors)}
}
export default {fetch:handle};
