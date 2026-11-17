#!/usr/bin/env node
/**
 * Optional, explicit installation of the isolated 3210 Radiology bridge.
 * NEVER modifies the user's working standalone Radiology on the Mac.
 * No installation runs during npm run update:preview.
 */
import {assertPreviewReady} from './preview-preflight.mjs';
import {spawnSync} from 'node:child_process';
import {existsSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {connect} from 'node:net';

async function occupied(port){
 return await new Promise(resolvePromise=>{
  const socket=connect({host:'127.0.0.1',port});
  let settled=false;
  const done=value=>{if(settled)return;settled=true;socket.destroy();resolvePromise(value);};
  socket.once('connect',()=>done(true));
  socket.once('error',()=>done(false));
  socket.setTimeout(800,()=>done(true));
 });
}
try{
 const root=process.cwd();
 const state=await assertPreviewReady(root,'update');
 if(state.branch!=='chatgpt-dev')throw Error('Установку запускают только в отдельной ветке chatgpt-dev.');
 if(await occupied(3210))throw Error('Порт Preview Radiology 3210 занят. Остановите только отдельный радиомодуль Preview.');
 const target=resolve(root,'integrations/radiology/web');
 if(!target.startsWith(resolve(root)+'/')||!existsSync(join(target,'package-lock.json'))||!existsSync(join(target,'app/viewer/page.tsx')))
  throw Error('Исходники встроенного моста Radiology неполны. Установка отменена.');
 const possible=join(target,'node_modules');
 if(existsSync(possible)&&lstatSync(possible).isSymbolicLink())
  throw Error('node_modules во встроенном модуле является ссылкой; запрещено менять чужую установку.');
 if(realpathSync(target)!==target)throw Error('Символические ссылки на чужую папку Radiology запрещены.');
 console.log('Установка только в',target,'(отдельный Preview 3210). Рабочий Radiology на Mac не затрагивается.');
 console.log('Radiology содержит тяжёлые зависимости; свободное место на диске и загрузка могут быть значительными.');
 const out=spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{
  cwd:target,stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',GIT_TERMINAL_PROMPT:'0'},timeout:600000,
 });
 if(out.error||out.status!==0)throw Error('Установка встроенной копии не завершилась. Не меняйте исходный Radiology.');
 if(!existsSync(join(possible,'next/dist/bin/next')))throw Error('Установка прошла без Next.js; проверьте журнал npm.');
 console.log('Встроенный Radiology готов. Теперь запустите npm run dev:preview на 3207 и откройте Radiology в приложении.');
}catch(error){
 console.error('[Radiology Preview] '+(error instanceof Error?error.message:'Ошибка установки'));
 process.exitCode=1;
}
