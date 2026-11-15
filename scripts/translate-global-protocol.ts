/** Generic interface text only. No case material or clinical prompts are translated by this script. */
import {createRequire} from 'node:module';import {readFile,writeFile} from 'node:fs/promises';
import {complete} from '../lib/gateway.ts';import {MODELS} from '../lib/cost.ts';
import {protocolMessages} from '../integrations/protocol/en/lib/i18n/ui-client-messages.ts';
import {DEFAULT_TEMPLATES} from '../integrations/protocol/en/lib/protocol-templates.ts';
import {UNIVERSAL_SPECIALIST_TEMPLATES} from '../integrations/protocol/en/lib/prompts.ts';
const ts=createRequire(import.meta.url)('typescript'),keys=new Set<string>();process.loadEnvFile('.env.local');
for(const path of ['app/protocol/page.tsx','components/GlobalCaseBridge.tsx','components/GlobalProtocolChrome.tsx','components/VoiceInput.tsx','components/ConciliumPrivacy.tsx']){
 const source=ts.createSourceFile(path,await readFile('integrations/protocol/en/'+path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function literals(node:any){if(ts.isStringLiteral(node))keys.add(node.text);else if(ts.isConditionalExpression(node)){literals(node.whenTrue);literals(node.whenFalse);}}
 function visit(node:any){if(ts.isCallExpression(node)){const name=node.expression.getText(source);if(name==='ui'||name==='setNotice')literals(node.arguments[0]);if(name==='nativeProtocolUi'&&node.arguments[1])literals(node.arguments[1]);}ts.forEachChild(node,visit);}visit(source);
}
for(const label of ['Source notes','Text','Transcript','Working draft','Protocol','Physician additions','Physician template','Specialist','Document structure','Reference excerpts','Additional text'])keys.add(label);
for(const value of Object.values(protocolMessages.en))if(typeof value==='string')keys.add(value);
for(const template of DEFAULT_TEMPLATES)keys.add(template.name);
for(const template of Object.values(UNIVERSAL_SPECIALIST_TEMPLATES)){keys.add(template.name);keys.add(template.focus);}
const english=Object.fromEntries([...keys].filter(key=>/[a-z]/i.test(key)).map(key=>[key,key]));await writeFile('integrations/protocol/en/lib/native-locales/en.json',JSON.stringify(english,null,2)+'\n');
const languages=[['es','Spanish'],['fr','French'],['ar','Arabic'],['hi','Hindi'],['pt-BR','Brazilian Portuguese'],['id','Indonesian'],['ms','Malay'],['tr','Turkish'],['zh-CN','Simplified Chinese']];
function parse(raw:string){try{return JSON.parse(raw.replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{return null;}}
async function translate(code:string,name:string){const path=`integrations/protocol/en/lib/native-locales/${code}.json`;let values:Record<string,string>={};try{values=JSON.parse(await readFile(path,'utf8'));}catch{}const missing=Object.keys(english).filter(key=>!values[key]);for(let i=0;i<missing.length;i+=35){const batch=missing.slice(i,i+35);const result=await complete(process.env,{model:MODELS.flash,maxTokens:7000,messages:[{role:'system',content:`Translate these physician interface labels into ${name}. Preserve brand names, SOAP, API, RAG, DOCX, model names and placeholders. These are interface instructions, not patient content. Return JSON with the same numeric keys and string values. No commentary.`},{role:'user',content:JSON.stringify(Object.fromEntries(batch.map((key,n)=>[n,key])))}],validate:raw=>{const value=parse(raw);return value&&batch.every((_,n)=>typeof value[n]==='string'&&value[n].trim());}});if(!result)throw Error('Translation failed: '+code);const translated=parse(result.text);batch.forEach((key,n)=>values[key]=translated[n]);await writeFile(path,JSON.stringify(values,null,2)+'\n');console.log(`${code}: ${Math.min(i+35,missing.length)}/${missing.length}`);}}
for(let i=0;i<languages.length;i+=3)await Promise.all(languages.slice(i,i+3).map(([code,name])=>translate(code,name)));
