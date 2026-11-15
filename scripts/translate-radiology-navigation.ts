// Static product UI only. No patient files, images, clinical cases or secrets enter translation requests.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import ts from 'typescript';
import {complete} from '../lib/gateway.ts';
import {MODELS} from '../lib/cost.ts';
process.loadEnvFile('.env.local');
const root='integrations/radiology/web/';
const files=['app/guide/page.tsx','app/technical/page.tsx','app/technical/TechnicalConnectionStatus.tsx','components/WorkspaceNavigation.tsx','components/DetectorDeployButton.tsx','components/DetectorAvailabilityGuide.tsx','components/OriginalWorkerFleetReadiness.tsx','lib/detector-deploy-plan.ts','app/api/detector-deploy/route.ts','components/ConciliumBridge.tsx'];
const keys=new Set(['На весь экран · панель вниз','Свернуть изображение · Esc']);
for(const file of files){const source=ts.createSourceFile(file,await readFile(root+file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);function visit(node:ts.Node){if(ts.isStringLiteral(node)&&/[А-Яа-яЁё]/.test(node.text))keys.add(node.text.trim());ts.forEachChild(node,visit);}visit(source);}
const languages=[['en','English'],['es','Spanish'],['fr','French'],['ar','Arabic'],['hi','Hindi'],['pt-BR','Brazilian Portuguese'],['id','Indonesian'],['tr','Turkish'],['zh-CN','Simplified Chinese']];
function parse(raw:string){try{return JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return null;}}
async function translate(code:string,name:string){const path=`lib/radiology-locales/${code}.json`;const catalog=JSON.parse(await readFile(path,'utf8'));const missing=[...keys].filter(key=>!catalog[key]);console.log(`${code}: ${missing.length} missing UI strings`);
 for(let offset=0;offset<missing.length;offset+=12){const batch=missing.slice(offset,offset+12);const source=Object.fromEntries(batch.map((key,i)=>[String(i),key]));const glossary=Object.fromEntries(['Исследование','Техническая панель','Руководство','Анализировать исследование','Перемещение','Три плоскости','Сбросить вид','Для врача'].filter(key=>catalog[key]).map(key=>[key,catalog[key]]));
 const result=await complete(process.env,{model:MODELS.flash,maxTokens:14000,messages:[{role:'system',content:`Translate these static radiology application interface strings from Russian into ${name}. Preserve numbers, units, programming commands, medical meaning, brand names and placeholders exactly. Use this established UI glossary: ${JSON.stringify(glossary)}. Return JSON with every identical numeric key and a nonempty translated string. No commentary.`},{role:'user',content:JSON.stringify(source)}],validate:raw=>{const value=parse(raw);return Boolean(value&&batch.every((_,i)=>typeof value[i]==='string'&&value[i].trim()));}});
 if(!result)throw Error(`${code}: UI translation failed at batch ${offset}`);const translated=parse(result.text);batch.forEach((key,i)=>catalog[key]=translated[i]);await writeFile(path,JSON.stringify(catalog,null,2)+'\n');console.log(`${code}: ${Math.min(offset+12,missing.length)}/${missing.length}`);
 }
 const target=root+'public/concilium-locales';await mkdir(target,{recursive:true});await writeFile(`${target}/${code}.json`,JSON.stringify(catalog));
}
await writeFile('/private/tmp/radiology-navigation-keys.json',JSON.stringify([...keys]));
await Promise.all(languages.filter(([code])=>!process.env.RADIOLOGY_TRANSLATE_ONLY||code===process.env.RADIOLOGY_TRANSLATE_ONLY).map(([code,name])=>translate(code,name)));
// Keep the parent fullscreen control in the same language as the embedded viewer.
for(const [code] of languages){if(code==='en')continue;const path=`lib/workspace-locales/${code}.json`;const parent=JSON.parse(await readFile(path,'utf8'));const child=JSON.parse(await readFile(`lib/radiology-locales/${code}.json`,'utf8'));for(const key of ['На весь экран · панель вниз','Свернуть изображение · Esc'])parent[key]=child[key];await writeFile(path,JSON.stringify(parent,null,2)+'\n');}
