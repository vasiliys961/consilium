// Translate only generic interface strings. No clinical records or credentials are included in requests.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {english} from '../lib/workspace-i18n.ts';
import {complete} from '../lib/gateway.ts';
import {MODELS} from '../lib/cost.ts';
process.loadEnvFile('.env.local');
const languages=[['es','Spanish'],['fr','French'],['ar','Arabic'],['hi','Hindi'],['pt-BR','Brazilian Portuguese'],['id','Indonesian'],['tr','Turkish'],['zh-CN','Simplified Chinese']];
function parse(raw:string){try{return JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return null;}}
async function translate(code:string,name:string){
 const path=`lib/workspace-locales/${code}.json`;let existing:Record<string,string>={};try{existing=JSON.parse(await readFile(path,'utf8'));}catch{}
 const missing=Object.entries(english).filter(([key])=>!existing[key]);
 for(let offset=0;offset<missing.length;offset+=35){const batch=missing.slice(offset,offset+35);const source=Object.fromEntries(batch.map(([,value],i)=>[String(i),value]));
 const glossary=Object.fromEntries(["Инструкция для врача","Запустить разбор","Телефон · камера · голос · видео","Библиотека врача · поиск по фрагментам","＋ Выбрать файлы","Сохранить случай","Бланк DOCX","Обзор случая","Материалы","Разбор","Решение врача","Динамика","✳ Разобрать случай","Определить по вопросу","Разобрать материалы","Диагностический разбор","Лечебная тактика","Поиск доказательств","Подключить консилиум","Добавить запись","Помощник-оркестратор"].filter(key=>existing[key]).map(key=>[english[key],existing[key]]));
 const turn=await complete(process.env,{model:MODELS.flash,maxTokens:7000,messages:[{role:'system',content:`Translate this physician application interface into ${name}. Keep brand names, placeholders, API names and ASCII numerical limits unchanged. Translate interface instructions, not patient content. Use these existing translations verbatim when referring to the corresponding buttons or tabs: ${JSON.stringify(glossary)}. Return complete JSON with the same numeric keys and string values, no commentary.`},{role:'user',content:JSON.stringify(source)}],validate:raw=>{const value=parse(raw);return value&&batch.every((_,i)=>typeof value[i]==='string'&&value[i].trim());}});
 if(!turn)throw Error(`${code} batch ${offset} failed`);const values=parse(turn.text);batch.forEach(([key],i)=>existing[key]=values[i]);await writeFile(path,JSON.stringify(existing,null,2)+'\n');console.log(`${code}: ${Math.min(offset+35,missing.length)}/${missing.length}`);
 }
}
await mkdir('lib/workspace-locales',{recursive:true});
for(let i=0;i<languages.length;i+=4)await Promise.all(languages.slice(i,i+4).map(([code,name])=>translate(code,name)));
console.log('All interface catalogs completed.');
