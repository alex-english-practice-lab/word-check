import {cp,copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
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
 .replace('<a href="teacher/">教师设置</a>','<a href="/teacher/setup">教师设置</a>');
if(dashboard===source||!dashboard.includes('teacher/dashboard.js'))throw Error('教师页面模板发生变化，请检查构建脚本');
await writeFile(path.join(target,'teacher/dashboard.html'),dashboard);
await writeFile(path.join(target,'student-config.js'),'window.WordCheckStudentConfig={apiBase:location.origin};\n');

// Keep the teacher's scripts and data on the Access-protected origin.
// Student links always point back to the public practice site.
const studentHome='https://alex-english-practice-lab.github.io/word-check/';
const assets=path.join(target,'teacher/setup-assets');
await mkdir(assets,{recursive:true});
const template=await readFile(path.join(root,'teacher/index.html'),'utf8');
const files=[...template.matchAll(/(?:src|href)="([\w.-]+\.(?:js|css))(?:\?[^"]*)?"/g)].map(match=>match[1]);
for(const file of new Set(files)){
 if(file!=='student-config.js')await copyFile(path.join(root,file),path.join(assets,file));
}
await cp(path.join(root,'data'),path.join(assets,'data'),{recursive:true});
await writeFile(path.join(assets,'student-config.js'),
 'window.WordCheckStudentConfig={apiBase:location.origin,studentHome:'+JSON.stringify(studentHome)+'};\n');
const setup=template.replace('<base href="../">','<base href="/teacher/setup-assets/">')
 .replaceAll('href="./"','href="'+studentHome+'"')
 .replace('href="teacher/dashboard.html"','href="/teacher/dashboard"');
await writeFile(path.join(target,'teacher/setup.html'),setup);
console.log('Teacher dashboard and assignment setup built.');
