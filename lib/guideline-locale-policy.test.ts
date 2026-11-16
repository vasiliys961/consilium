import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_LANGUAGES} from './workspace-i18n.ts';
import {guidelineLocalePolicy,guidelineEvidenceInstruction} from './guideline-locale-policy.ts';
import {guidelineUi} from './guideline-ui.ts';
import {searchClinicalGuidelines,guidelineSearchPrompt,GUIDELINE_MODES} from './parent-guideline-search.ts';
import {MODELS} from './cost.ts';

test('UI and output language cover all ten independently selectable workspace locales',()=>{
 assert.equal(WORKSPACE_LANGUAGES.length,10);
 for(const {code} of WORKSPACE_LANGUAGES){
  assert.ok(guidelineUi(code,'title').length>2);
  assert.ok(guidelineUi(code,'output').length>2);
  assert.ok(guidelineUi(code,'search').length>2);
  assert.ok(guidelineUi(code,'standard').includes('Gemini Flash'));
  assert.ok(guidelineLocalePolicy(code).localAuthorities.length);
  assert.ok(guidelineLocalePolicy(code).internationalAuthorities.length);
 }
});
test('Russian guidance prioritizes Minzdrav and compares USA/European sources',()=>{
 const policy=guidelineEvidenceInstruction('ru');
 assert.match(policy,/Минздрав России/);
 assert.match(policy,/cr\.minzdrav\.gov\.ru/);
 assert.match(policy,/US: NIH/);
 assert.match(policy,/Europe: ESC/);
 assert.match(guidelineSearchPrompt('плеврит','Пульмонология','standard','ru'),/Respond ONLY in Russian/);
});
test('English, Spanish, French, Arabic, Indian and Brazilian sources do not assume one jurisdiction equals every speaker',()=>{
 const english=guidelineSearchPrompt('pleuritis','','online','en');
 assert.match(english,/NICE/);
 assert.match(english,/AHA\/ACC/);
 const spanish=guidelineSearchPrompt('pleuritis','','online','es');
 assert.match(spanish,/SEPAR/);
 assert.match(spanish,/Spanish/);
 assert.match(guidelineSearchPrompt('pleuritis','','online','fr'),/HAS/);
 assert.match(guidelineSearchPrompt('pleuritis','','online','ar'),/Arabic is not a single national jurisdiction/);
 assert.match(guidelineSearchPrompt('pleuritis','','online','hi'),/ICMR/);
 assert.match(guidelineSearchPrompt('pleuritis','','online','pt-BR'),/CONITEC/);
 assert.match(guidelineSearchPrompt('pleuritis','','online','tr'),/Sağlık Bakanlığı/);
 assert.match(guidelineSearchPrompt('pleuritis','','online','id'),/Kemenkes/);
 assert.match(guidelineSearchPrompt('pleuritis','','online','zh-CN'),/National Health Commission/);
});
test('standard Gemini and online Sonar pass independent language instructions with one outbound provider call',async()=>{
 for(const [locale,mode,expected] of [['ru','standard',MODELS.flash],['es','online','perplexity/sonar'],['en','online','perplexity/sonar']] as const){
  let calls=0;
  const result=await searchClinicalGuidelines({query:'плеврит',mode,locale}, {OPENROUTER_API_KEY:'unit'},async(_u,init)=>{
   calls++;
   const body=JSON.parse(String(init?.body));
   assert.equal(body.model,expected);
   assert.match(body.messages[0].content,locale==='ru'?/Respond ONLY in Russian/:locale==='es'?/Respond ONLY in Spanish/:/Respond ONLY in English/);
   assert.equal(body.messages[1].content.includes('плеврит'),true);
   return Response.json({choices:[{finish_reason:'stop',message:{content:'Clinical assessment of pleuritis includes differential diagnosis, diagnostics, management, monitoring, with an explicit warning that citations need verification.'}}],usage:{prompt_tokens:30,completion_tokens:100}});
  });
  assert.equal(calls,1);
  assert.equal(result.model,expected);
  assert.equal(result.searchMode,mode);
 }
 assert.equal(Object.keys(GUIDELINE_MODES).length,3);
});
test('truncated standard response shows a precise failure and never starts a second paid call automatically',async()=>{
 let calls=0;
 await assert.rejects(()=>searchClinicalGuidelines({query:'плеврит',mode:'standard',locale:'ru'},{OPENROUTER_API_KEY:'unit'},async()=>{
  calls++;return Response.json({choices:[{finish_reason:'length',message:{content:'incomplete'}}]});
 }),/guideline_truncated/);
 assert.equal(calls,1);
});
test('online provider 402 is reported as payment_required, not no guidelines',async()=>{
 let calls=0;
 await assert.rejects(()=>searchClinicalGuidelines({query:'pleuritis',mode:'online',locale:'en'},{OPENROUTER_API_KEY:'unit'},async()=>{
  calls++;return Response.json({error:{message:'balance'}},{status:402});
 }),/guideline_payment_required/);
 assert.equal(calls,1);
});
