#!/usr/bin/env node
/**
 * Read-only C10 safety gate for the isolated 3207 Preview.
 * Never reads .env.local, never installs dependencies, never writes to patient storage.
 * Heavy RU/EN protocols and other specialist modules are optional, separately installed.
 */
import {existsSync, lstatSync, readFileSync, realpathSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {connect} from 'node:net';

const DEFAULT_ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const REPO_URL=/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)vasiliys961\/consilium(?:\.git)?\/?$/i;
const ALLOWED_BRANCH=(branch)=>branch==='chatgpt-dev'||branch.startsWith('chatgpt/');
function fail(message){throw Error(message);}
function runGit(root,args){
 const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:8000,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 if(result.error||result.status!==0)fail('Git не доступен или папка не является корректной рабочей копией.');
 return (result.stdout??'').trim();
}
function checkedNodeVersion(version){
 const parts=version.split('.').map(Number);
 return Number.isInteger(parts[0])&&(parts[0]>22||(parts[0]===22&&parts[1]>=18));
}
export function checkPreviewCheckout(root=DEFAULT_ROOT,mode='start'){
 root=resolve(root);
 if(mode!=='start'&&mode!=='update')fail('Неизвестный режим проверки Preview.');
 if(!checkedNodeVersion(process.versions.node))fail('Нужен Node.js 22.18 или новее. Не меняйте системный Node автоматически.');
 let packageData;try{packageData=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));}catch{fail('Не найден package.json в корне отдельной копии Consilium.');}
 if(packageData.name!=='doctor-opus-next'||!existsSync(join(root,'package-lock.json')))fail('Для независимой установки необходим исходный репозиторий с package-lock.json.');
 const top=runGit(root,['rev-parse','--show-toplevel']);
 if(realpathSync(top)!==realpathSync(root))fail('Запускайте команду только из корня отдельной копии, а не из вложенного каталога.');
 const branch=runGit(root,['symbolic-ref','--quiet','--short','HEAD']);
 if(!ALLOWED_BRANCH(branch))fail('Это не ветка ChatGPT. Не изменяйте main/Codex: откройте отдельную копию с chatgpt-dev.');
 const modules=join(root,'node_modules');
 if(existsSync(modules)||safeLstat(modules)){
  const stat=safeLstat(modules);
  if(stat?.isSymbolicLink())fail('node_modules — символическая ссылка. Нельзя зависеть от исходной установки. Создайте отдельные зависимости в копии Preview (не удаляйте содержимое исходной папки).');
  if(stat&&!stat.isDirectory())fail('node_modules должен быть отдельным каталогом.');
 }
 const hasRootDependencies=existsSync(join(modules,'next','dist','bin','next'));
 if(mode==='start'&&!hasRootDependencies)fail('Для первого запуска отдельно установите зависимости в Preview: npm ci --ignore-scripts. Исходную папку Codex не изменяйте.');
 const status=runGit(root,['status','--porcelain','--untracked-files=normal']);
 if(mode==='update'){
  if(branch!=='chatgpt-dev')fail('Обновлять автоматически можно только отдельную ветку chatgpt-dev.');
  if(status)fail('Есть несохранённые изменения в Preview. Зафиксируйте или сохраните их отдельно до обновления; ничего не перезаписано.');
  const origin=runGit(root,['remote','get-url','origin']);
  if(!REPO_URL.test(origin))fail('origin не является ожидаемым репозиторием vasiliys961/consilium. Автоматическое обновление отменено.');
 }
 return {root,branch,dirty:Boolean(status),hasRootDependencies,protocolRu:existsSync(join(root,'integrations/protocol/ru/node_modules/next/dist/bin/next')),
  protocolEn:existsSync(join(root,'integrations/protocol/en/node_modules/next/dist/bin/next'))};
}
function safeLstat(path){try{return lstatSync(path);}catch{return null;}}
export async function previewPortBusy(){
 return new Promise(resolve=>{
  let done=false;
  const finish=(value)=>{if(done)return;done=true;socket.destroy();resolve(value);};
  const socket=connect({host:'127.0.0.1',port:3207});
  socket.once('connect',()=>finish(true));
  socket.once('error',()=>finish(false));
  socket.setTimeout(700,()=>finish(true));
 });
}
export async function assertPreviewReady(root=DEFAULT_ROOT,mode='start'){
 const status=checkPreviewCheckout(root,mode);
 if(mode==='update'&&await previewPortBusy())fail('Порт 3207 занят. Остановите только терминал Preview (Control+C), не останавливайте 3107.');
 return status;
}
function show(status,mode){
 console.log(`[Preview C10] Узел: Node.js ${process.versions.node}; отдельная ветка: ${status.branch}; порт: 3207.`);
 console.log(`[Preview C10] Зависимости ядра: ${status.hasRootDependencies?'установлены':'не установлены'}; Protocol RU: ${status.protocolRu?'установлен':'не установлен'}; Protocol Global: ${status.protocolEn?'установлен':'не установлен'}.`);
 if(status.dirty)console.warn('[Preview C10] Есть локальные правки; проверка запуска разрешена, обновление с изменениями запрещено.');
 if(!status.protocolRu||!status.protocolEn)console.log('[Preview C10] Для модулей протоколов при необходимости вручную: npm run setup:protocols. Их отсутствие не блокирует ядро.');
 if(mode==='start')console.log('[Preview C10] Предварительная проверка завершена. Без сетевых вызовов и без изменений данных.');
 else console.log('[Preview C10] Копия готова к безопасному fast-forward обновлению. Основная ветка и порт 3107 не затрагиваются.');
}
const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const mode=process.argv.includes('--update')?'update':'start';
 // --root is a read-only, testable override. The actual updater never allows it.
 const rootArg=process.argv.find(v=>v.startsWith('--root='));
 const root=rootArg?resolve(rootArg.slice('--root='.length)):DEFAULT_ROOT;
 assertPreviewReady(root,mode).then(value=>show(value,mode)).catch(error=>{
  console.error('[Preview C10] '+(error instanceof Error?error.message:'Проверка окружения не удалась.'));
  process.exitCode=1;
 });
}
