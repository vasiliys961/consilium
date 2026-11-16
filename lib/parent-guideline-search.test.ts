import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GUIDELINE_MODES,isGuidelineMode,guidelineSearchPrompt,searchClinicalGuidelines} from './parent-guideline-search.ts';
import {MODELS} from './cost.ts';

test('original Doctor Opus guideline modes: fast Flash, deep Sonnet, current Sonar',()=>{
 assert.equal(GUIDELINE_MODES.brief.model,MODELS.flash);
 assert.equal(GUIDELINE_MODES.standard.model,MODELS.flash);
 assert.equal(GUIDELINE_MODES.detailed.model,MODELS.sonnet);
 assert.equal(GUIDELINE_MODES.online.model,'perplexity/sonar');
 assert.equal(isGuidelineMode('online'),true);
 assert.equal(isGuidelineMode('gpt-sol'),false);
});
test('one-word pleuritis query generates usable diagnostic and therapeutic instruction',()=>{
 const prompt=guidelineSearchPrompt('плеврит','Пульмонология','standard','ru');
 assert.match(prompt,/плеврит/);
 assert.match(prompt,/pleuritis/);
 assert.match(prompt,/ДИФФЕРЕНЦИАЛЬНАЯ ДИАГНОСТИКА/);
 assert.match(prompt,/СХЕМЫ ЛЕЧЕНИЯ/);
 assert.match(prompt,/КРАСНЫЕ ФЛАГИ/);
 assert.doesNotMatch(prompt,/Return only JSON/);
});
test('fast and Sonar searches accept a short medical topic and call the specified model exactly once',async()=>{
 for(const mode of ['standard','online'] as const){
  let requests=0;
  const result=await searchClinicalGuidelines({query:'плеврит',specialty:'Пульмонология',mode,locale:'ru'},{OPENROUTER_API_KEY:'synthetic'},async(_url,init)=>{
   requests++;
   const body=JSON.parse(String(init?.body));
   assert.equal(body.model,mode==='online'?'perplexity/sonar':MODELS.flash);
   assert.match(body.messages[1].content,/плеврит/);
   return Response.json({choices:[{finish_reason:'stop',message:{content:'1. Клинические рекомендации по плевральным заболеваниям. 2. Дифференциальная диагностика: плевральный выпот, эмпиема. 3. Обследование и тактика зависят от причины; срочность определяется состоянием пациента.'}}],usage:{prompt_tokens:42,completion_tokens:120}});
  });
  assert.equal(requests,1);
  assert.equal(result.searchMode,mode);
  assert.match(result.text,/эмпиема/);
 }
});
test('original RU and multilingual apps remain physically separate and primary protocol route points to them',()=>{
 const router=readFileSync('app/protocol/page.tsx','utf8');
 assert.match(router,/from '.\/case\/page'/);
 for(const edition of ['ru','en']){
  const page=readFileSync('integrations/protocol/'+edition+'/app/protocol/page.tsx','utf8');
  assert.ok(page.length>10000);
 }
 const postReview=readFileSync('lib/protocol-language-flow.ts','utf8');
 assert.match(postReview,/\/protocol\/structured/);
});
