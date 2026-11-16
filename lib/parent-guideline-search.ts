/**
 * Independent clinical-guideline lookup adapted from the ORIGINAL
 * doctor-opus/app/api/protocols/search/route.ts workflow.
 * No consilium case is required, and no rigid JSON report schema is used.
 * Modes preserve the parent's fast / expert / Sonar online choices.
 */
import {complete} from './gateway.ts';
import {MODELS,priceUsd} from './cost.ts';
import {parseLocale,languageName,type Locale} from './locale.ts';

export type GuidelineMode='brief'|'standard'|'detailed'|'online';
export const GUIDELINE_MODES:Record<GuidelineMode,{model:string;maxTokens:number;title:string}>={
 brief:{model:MODELS.flash,maxTokens:2800,title:'Кратко · Gemini Flash'},
 standard:{model:MODELS.flash,maxTokens:6500,title:'Стандарт · Gemini Flash'},
 detailed:{model:MODELS.sonnet,maxTokens:9000,title:'Клинический разбор · Sonnet 5.5'},
 online:{model:'perplexity/sonar',maxTokens:7500,title:'Актуальные · Perplexity Sonar'},
};

export function isGuidelineMode(value:unknown):value is GuidelineMode{
 return typeof value==='string'&&Object.hasOwn(GUIDELINE_MODES,value);
}
export function guidelineSearchPrompt(query:string,specialty:string,mode:GuidelineMode,locale:Locale):string{
 const current=new Date().getUTCFullYear();
 const detailed=mode==='detailed',short=mode==='brief',online=mode==='online';
 return [
  'You are a senior physician preparing a substantive, practical clinical-guidance review for another physician.',
  'Topic (may be a one-word diagnosis): '+query+'. Specialty: '+(specialty||'all clinical disciplines')+'.',
  'If the topic is short, determine its medical meaning and relevant synonyms before responding. For pleuritis/плеврит distinguish pleural inflammation, pleural effusion, empyema and other causes. Never answer "not found" merely because the query is a single diagnosis.',
  'Respond in '+languageName(locale)+'. Structure the review with clear headings as in the original Doctor Opus module:',
  '1. НАЗВАНИЯ КЛИНИЧЕСКИХ РЕКОМЕНДАЦИЙ: authoritative society and government guidelines applicable to the topic. Identify document and year ONLY if grounded in the model information or real retrieved references; no invented URLs, years, DOI, grading, editions or full-text claims.',
  '2. ДИФФЕРЕНЦИАЛЬНАЯ ДИАГНОСТИКА: key dangerous alternatives, positive discriminators, and missing patient-specific facts.',
  '3. КЛИНИЧЕСКИЕ КРИТЕРИИ И ШКАЛЫ: investigations, sensitivity of findings, risk scores when relevant, and what result changes a decision.',
  '4. ПОШАГОВАЯ ТАКТИКА: urgent and ambulatory branches, when to hospitalize and when to reassess.',
  '5. СХЕМЫ ЛЕЧЕНИЯ: practical drug and non-drug options with relevant doses ONLY when enough context and support exist; duration, contraindications, renal/hepatic considerations, alternatives; physician may revise all proposals.',
  '6. МОНИТОРИНГ И КРАСНЫЕ ФЛАГИ: measurable safety/efficacy indicators and when to change therapy.',
  '7. ДОКУМЕНТЫ И ИСТОЧНИКИ: distinguish confirmed links supplied by a live provider from references recalled by the model. If an actual link cannot be verified, clearly identify it as a candidate for verification, not a confirmed source.',
  'No fabricated normal examination, patient consent, signed prescription, treatment already administered, scores or citations.',
  'This is an independent general guidance search, not a record of a physical exam. Only clinician approval makes a treatment plan an order.',
  short?'Keep each section brief but clinically useful; prioritize diagnostic and therapeutic steps.':detailed?'Provide a thorough discussion with conditional treatment and methodological caveats.':'Give a well-organized standard clinical review, with concrete diagnostic and treatment actions.',
  online?'Use the provider’s live search and cite actual accessible sources if available. Focus on revisions and guidelines current as of '+current+'; say when no live evidence was returned.':'Do not claim real-time search or cite guessed links. Mention where the physician should verify up-to-date recommendations.',
 ].join('\n');
}
export async function searchClinicalGuidelines(
 input:{query:string;specialty?:string;mode:GuidelineMode;locale:Locale},
 env:Record<string,string|undefined>,
 fetchImpl:typeof fetch=fetch
):Promise<{text:string;model:string;estimatedUsd:number;inputTokens:number;outputTokens:number;searchMode:GuidelineMode}>{
 const query=input.query.replace(/\s+/g,' ').trim();
 const specialty=(input.specialty??'').trim();
 if(query.length<3||query.length>550||specialty.length>100||!isGuidelineMode(input.mode))throw Error('invalid_guideline_request');
 const locale=parseLocale(input.locale),selected=GUIDELINE_MODES[input.mode];
 const result=await complete(env,{
  model:selected.model,maxTokens:selected.maxTokens,timeoutMs:input.mode==='online'?90000:input.mode==='detailed'?120000:75000,
  retryInvalidResponse:false,
  messages:[{role:'system',content:guidelineSearchPrompt(query,specialty,input.mode,locale)},
   {role:'user',content:'Clinical guideline topic: '+query+(specialty?'. Specialty: '+specialty:'')+'. The doctor requests assessment and treatment recommendations. Do not assume any patient-specific findings.'}],
  validate:text=>text.trim().length>100
 },fetchImpl);
 if(!result)throw Error('provider_no_clinical_guidance');
 return {text:result.text,model:result.model,estimatedUsd:priceUsd(result.model,result.inputTokens,result.outputTokens),
  inputTokens:result.inputTokens,outputTokens:result.outputTokens,searchMode:input.mode};
}
