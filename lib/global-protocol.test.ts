import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import {STAGE1_PROTOCOL_SYSTEM_PROMPT,STAGE2_SOAP_SYSTEM_PROMPT,STAGE1_PROTOCOL_HEADINGS,STAGE2_SOAP_HEADINGS} from '../integrations/protocol/en/lib/prompts.ts';
import {isValidStage2Note} from '../integrations/protocol/en/lib/protocol-stage2.ts';
import {buildForcedResponseLanguageInstruction} from '../integrations/protocol/en/lib/language-policy.ts';
test('Global retains its original two-stage protocol contract, independent of Russian encounter templates',()=>{
 assert.equal(STAGE1_PROTOCOL_HEADINGS.length,13);assert.deepEqual(STAGE2_SOAP_HEADINGS,['Subjective','Objective','Assessment','Plan']);assert.match(STAGE1_PROTOCOL_SYSTEM_PROMPT,/working Diagnostic Reasoning Draft/);assert.match(STAGE2_SOAP_SYSTEM_PROMPT,/15-25 line/);assert.match(buildForcedResponseLanguageInstruction('fr'),/strictly in French/);
 assert.equal(isValidStage2Note('**Subjective:**\nDonnées synthétiques.\n**Objective:**\nAucun examen fourni.\n**Assessment:**\nÀ préciser.\n**Plan:**\nObtenir les informations manquantes.'),true);
 assert.equal(isValidStage2Note('Synthèse sans sections SOAP.'),false);
});
test('all ten Global interface catalogs translate the actual visible settings and case-bridge labels',()=>{
 const base='integrations/protocol/en/lib/native-locales/',english=JSON.parse(readFileSync(base+'en.json','utf8'));assert.ok(Object.keys(english).length>50);assert.equal(english.rtl,undefined);assert.equal(english.ltr,undefined);
 for(const code of ['es','fr','ar','hi','pt-BR','id','ms','tr','zh-CN']){const values=JSON.parse(readFileSync(base+code+'.json','utf8'));for(const key of Object.keys(english))assert.ok(typeof values[key]==='string'&&values[key].trim(),`${code}: ${key}`);}
});

test('Global language selection remains active when iframe cookies and local storage are unavailable',async()=>{
 const {getClientLocale,setClientLocale}=await import('../integrations/protocol/en/lib/i18n/client.ts');const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'document',{configurable:true,get(){throw Error('storage blocked');}});Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('storage blocked');}});
 try{setClientLocale('fr');assert.equal(getClientLocale(),'fr');setClientLocale('ar');assert.equal(getClientLocale(),'ar');}finally{if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else delete (globalThis as any).document;if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else delete (globalThis as any).localStorage;}
});

test('English protocol can be selected even when the shell is already English but the loaded edition is Russian',async()=>{
 const {shouldSwitchProtocolLanguage}=await import('./protocol-bridge.ts');
 assert.equal(shouldSwitchProtocolLanguage('en','en','ru','ru'),true);
 assert.equal(shouldSwitchProtocolLanguage('en','en','en','en'),false);
 assert.equal(shouldSwitchProtocolLanguage('fr','fr','en','en'),true);
});
test('translated SOAP headings validate without forcing English headings into non-English notes',()=>{
 assert.equal(isValidStage2Note('**Subjectif:**\nDonnées fournies.\n**Objectif:**\nExamen fourni.\n**Évaluation:**\nDiagnostic de travail.\n**Plan:**\nContrôle prévu.'),true);
 assert.equal(isValidStage2Note('**主观:**\n提供的病史。\n**客观:**\n已提供的检查。\n**评估:**\n初步诊断。\n**计划:**\n复查。'),true);
});
