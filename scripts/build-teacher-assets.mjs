import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.join(root,'backend/public');
await mkdir(path.join(target,'teacher'),{recursive:true});
for(const name of ['style.css','teacher/dashboard.css','teacher/dashboard.js']){
 await copyFile(path.join(root,name),path.join(target,name));
}
const source=await readFile(path.join(root,'teacher/dashboard.html'),'utf8');
const dashboard=source.replace('<a class="brand" href="./">','<a class="brand" href="https://alex-english-practice-lab.github.io/word-check/">')
 .replace('<a href="teacher/">教师设置</a>','<a href="https://alex-english-practice-lab.github.io/word-check/teacher/">教师设置</a>');
if(dashboard===source||!dashboard.includes('teacher/dashboard.js'))throw Error('教师页面模板发生变化，请检查构建脚本');
await writeFile(path.join(target,'teacher/dashboard.html'),dashboard);
await writeFile(path.join(target,'student-config.js'),'window.WordCheckStudentConfig={apiBase:location.origin};\n');
console.log('Teacher Dashboard assets built for the Worker origin.');
