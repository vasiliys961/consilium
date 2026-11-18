import test from 'node:test';
import assert from 'node:assert/strict';
import {clinicalFirstResponse,converseWithPhysician} from './physician-agent.ts';
import {MODELS} from './cost.ts';

function model(response:{reply:string;question:string|null;tools:string[];translatedReply?:string|null;translatedQuestion?:string|null}){
 let calls=0;
 const mock:typeof fetch=async(_input,init)=>{
  calls++;
  const payload=JSON.parse(String(init?.body));
  assert.equal(payload.model,'anthropic/claude-haiku-5.5');
  assert.equal(payload.stream,undefined);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}],usage:{prompt_tokens:70,completion_tokens:66}});
 };
 return {mock,calls:()=>calls};
}

test('C13: RU chest/respiratory workflow override keeps English first and medically meaningful Russian second',async()=>{
 const {mock,calls}=model({reply:'Наши возможности: выбрать модуль и создать протокол.',question:null,tools:['protocol','ambient']});
 const result=await converseWithPhysician({text:'[PHYSICIAN]\nУ пациента кашель с одышкой',locale:'ru'},
  {...process.env,OPENROUTER_API_KEY:'synthetic'},mock);
 assert.equal(calls(),1);
 assert.deepEqual(result.plan.steps.map(step=>step.tool),['clinical']);
 assert.match(result.message,/^For cough and breathlessness/);
 assert.match(result.message,/\nПри кашле и одышке/);
 assert.match(result.message,/urgent care/);
 assert.match(result.message,/срочная очная помощь/);
 assert.match(result.question??'',/^Do you have SpO₂/);
 assert.match(result.question??'',/\nЕсть данные SpO₂/);
});

test('C13: non-English-script first line never impersonates international English answer',async()=>{
 const {mock,calls}=model({reply:'Откройте анализ ЭКГ.',question:'Есть ли ЭКГ?',tools:['ecg','clinical'],
  translatedReply:'Ouvrir l’ECG',translatedQuestion:'Un ECG est-il disponible ?'});
 const result=await converseWithPhysician({text:'[PHYSICIAN]\nNeed ECG review',locale:'fr'},
  {...process.env,OPENROUTER_API_KEY:'synthetic'},mock);
 assert.equal(calls(),1);
 assert.match(result.message,/^Suggested next step: ECG/);
 assert.match(result.message,/\nProchaine étape suggérée: ECG/);
 assert.equal(result.question,null);
 assert.deepEqual(result.plan.steps.map(s=>s.tool),['ecg','clinical']);
});

test('C13: correctly paired English and Spanish answers do not require a second paid translation',async()=>{
 const {mock,calls}=model({reply:'Ask a clinical specialist to review the complaint.',translatedReply:'Consulte a un especialista para revisar la queja.',
  question:null,translatedQuestion:null,tools:['specialist']});
 const result=await converseWithPhysician({text:'[PHYSICIAN]\nPaciente con síntomas',locale:'es'},
  {...process.env,OPENROUTER_API_KEY:'synthetic'},mock);
 assert.equal(calls(),1);
 assert.equal(result.message,'Ask a clinical specialist to review the complaint.\nConsulte a un especialista para revisar la queja.');
 assert.equal(result.question,null);
 assert.deepEqual(result.plan.steps.map(s=>s.tool),['specialist']);
});

test('C13: plain translated instructions do not overwrite a full evidence-backed clinical answer',()=>{
 const result=clinicalFirstResponse('Young patient has cough and shortness of breath','fr',{
  reply:'Urgent evaluation may be needed if SpO₂ is low.',translatedReply:'Évaluation urgente si la saturation est basse.',
  question:'What is SpO₂?',translatedQuestion:'Quelle est la SpO₂?',tools:['clinical']});
 assert.equal(result.reply,'Urgent evaluation may be needed if SpO₂ is low.');
 assert.equal(result.translatedReply,'Évaluation urgente si la saturation est basse.');
 assert.equal(result.question,'What is SpO₂?');
});
