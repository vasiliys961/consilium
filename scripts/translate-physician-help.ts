// Generic product instructions only; no patient records are read or sent.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {english} from '../lib/workspace-i18n.ts';
import {complete} from '../lib/gateway.ts';
import {MODELS} from '../lib/cost.ts';
const ts=createRequire(import.meta.url)('typescript');
process.loadEnvFile('.env.local');
const keys=new Set<string>();
for(const path of ['app/page.tsx','app/components/clinical-workspace.tsx','app/workbench/page.tsx','app/components/physician-help.tsx','app/components/product-guide.tsx','app/components/workflow-guide.tsx','lib/physician-guide.ts','app/components/analysis-progress.tsx','app/components/genetic-extraction.tsx','app/components/image-profile.tsx','app/components/genomic-review.tsx','app/protocol/page.tsx','app/radiology/page.tsx','packages/medical-images/profiles.ts','packages/protocol/document.ts']){
 const source=ts.createSourceFile(path,await readFile(path,'utf8'),ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function visit(node:any){
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='t'&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0]))keys.add(node.arguments[0].text);
  if(['lib/physician-guide.ts','packages/medical-images/profiles.ts','packages/protocol/document.ts','app/components/clinical-workspace.tsx','app/components/genomic-review.tsx'].includes(path)&&ts.isStringLiteral(node)&&/[а-яё]/i.test(node.text))keys.add(node.text);
  if(ts.isJsxAttribute(node)&&node.name.text==='text'&&node.initializer&&ts.isStringLiteral(node.initializer))keys.add(node.initializer.text);
  ts.forEachChild(node,visit);
 }
 visit(source);
}
const missing=[...keys].filter(key=>!english[key]);
let values:Record<string,string>={};try{values=JSON.parse(await readFile('lib/help-english.json','utf8'));}catch{}
function parse(raw:string){try{return JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return null;}}
for(let offset=0;offset<missing.length;offset+=25){
 const batch=missing.slice(offset,offset+25);const source=Object.fromEntries(batch.map((key,i)=>[String(i),key]));
 const result=await complete(process.env,{model:MODELS.flash,maxTokens:7000,messages:[{role:'system',content:'Translate physician application instructions from Russian to clear plain English. Preserve the original capabilities, conditions, numerical limits and quoted button meanings. Do not introduce features. Return complete JSON with the same numeric keys and string values, no commentary.'},{role:'user',content:JSON.stringify(source)}],validate:raw=>{const parsed=parse(raw);return parsed&&batch.every((_,i)=>typeof parsed[i]==='string'&&parsed[i].trim());}});
 if(!result)throw Error('English help translation failed');const translated=parse(result.text);batch.forEach((key,i)=>values[key]=translated[i]);await writeFile('lib/help-english.json',JSON.stringify(values,null,2)+'\n');console.log(`English help: ${Math.min(offset+25,missing.length)}/${missing.length}`);
}
