#!/usr/bin/env node
/** Explicit C10 update for a STOPPED, clean, isolated chatgpt-dev checkout.
 * No reset, clean, force checkout, deployment, secret reading or patient storage access.
 */
import {spawnSync} from 'node:child_process';
import {assertPreviewReady,checkPreviewCheckout} from './preview-preflight.mjs';
function run(command,args){
 const result=spawnSync(command,args,{cwd:process.cwd(),stdio:'inherit',env:{...process.env,GIT_TERMINAL_PROMPT:'0',NEXT_TELEMETRY_DISABLED:'1'}});
 if(result.error||result.status!==0)throw Error(`Команда ${command} завершилась с ошибкой. Никаких принудительных откатов нет.`);
}
try{
 const current=await assertPreviewReady(process.cwd(),'update');
 console.log('[C10] Обновление отдельной копии chatgpt-dev. 3107, main, .env.local, IndexedDB и оригинальные приложения не трогаем.');
 run('git',['fetch','--no-tags','origin','chatgpt-dev']);
 // No force, no rebase, no deletion of tracked or untracked work.
 run('git',['merge','--ff-only','FETCH_HEAD']);
 run('npm',['ci','--ignore-scripts','--no-audit','--no-fund']);
 const updated=checkPreviewCheckout(process.cwd(),'start');
 if(updated.branch!==current.branch||!updated.hasRootDependencies)throw Error('После обновления не удалось подтвердить готовность Preview.');
 console.log('[C10] Готово: остановленный Preview обновлён. Запуск только по команде npm run dev:preview (порт 3207).');
 console.log('[C10] Вложения и история клинических случаев хранятся в браузере по origin 127.0.0.1:3207; их нельзя очистить этой командой.');
}catch(error){
 console.error('[C10] '+(error instanceof Error?error.message:'Обновление прервано.'));
 console.error('[C10] Проверяйте текущее состояние git status. Не используйте git reset --hard и не удаляйте пользовательские каталоги.');
 process.exitCode=1;
}
