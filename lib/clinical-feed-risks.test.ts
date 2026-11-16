import test from 'node:test';
import assert from 'node:assert/strict';
import {medicationRisksForFeed} from './clinical-feed-risks.ts';
import type {ClinicalReport} from './clinical-report.ts';

const report=(management:ClinicalReport['management']):ClinicalReport=>({
 problem:'Синтетический разбор',facts:[],differential:[],investigations:[],
 management,questions:[],limitations:[],followUp:[],
});
test('C6 main feed surfaces severe medication warnings from proposed treatment options',()=>{
 const risk=medicationRisksForFeed(report([
  {option:'Схема А: спиронолактон',conditions:[],safetyChecks:[],monitoring:[],
   localOrganAlerts:[{drug:'спиронолактон',severity:'contraindicated',risk:'Выраженная гиперкалиемия',action:'Проверить K+',url:'https://dailymed.nlm.nih.gov',section:'4'}]},
  {option:'Схема Б: апиксабан',conditions:[],safetyChecks:[],monitoring:[],
   localInteractions:[{first:'апиксабан',second:'ибупрофен',severity:'major',relation:'current-proposed',risk:'Риск кровотечения',
    action:'Пересмотреть',url:'https://dailymed.nlm.nih.gov',source:'DailyMed',section:'7.3',monitoring:'Гемоглобин',mechanism:'Аддитивный',conditions:'Системный приём'}]},
 ]));
 assert.deepEqual(risk.risks.map(x=>x.option),['Схема А: спиронолактон','Схема Б: апиксабан']);
 assert.deepEqual(risk.risks.map(x=>x.severity),['contraindicated','major']);
 assert.equal(risk.remaining,0);
});
test('C6 alternatives remain separate and repeated alerts do not occupy multiple slots',()=>{
 const risk=medicationRisksForFeed(report([
  {option:'Вариант 1',conditions:[],safetyChecks:[],monitoring:[],
   localOrganAlerts:[{drug:'X',risk:'Сверить СКФ',severity:'major',action:'',url:'',section:''},
    {drug:'X',risk:'Сверить СКФ',severity:'major',action:'',url:'',section:''}]},
  {option:'Вариант 2',conditions:[],safetyChecks:[],monitoring:[],
   localOrganAlerts:[{drug:'Y',risk:'Сверить СКФ',severity:'major',action:'',url:'',section:''}]},
 ]));
 assert.deepEqual(risk.risks.map(x=>x.option),['Вариант 1','Вариант 2']);
});
test('C6 short summary prioritizes contraindications and never labels monitor or missing coverage as safe',()=>{
 const r=medicationRisksForFeed(report([
  {option:'Вариант 1',conditions:[],safetyChecks:[],monitoring:[],localCoverage:{recognized:[],unrecognized:['drugX'],ruleCount:26,unverifiedPairCount:2,unverifiedPairs:['X+Y']}},
  {option:'Вариант 2',conditions:[],safetyChecks:[],monitoring:[],
   localOrganAlerts:[{drug:'A',risk:'Нужен мониторинг',severity:'monitor',action:'',url:'',section:''}]},
 ]));
 assert.deepEqual(r,{risks:[],remaining:0});
 const another=medicationRisksForFeed(report([
  {option:'A',conditions:[],safetyChecks:[],monitoring:[],localOrganAlerts:Array.from({length:5},(_,i)=>({
   drug:'drug',risk:'Риск '+i,severity:i===4?'contraindicated' as const:'major' as const,action:'',url:'',section:''}))},
 ]),3);
 assert.equal(another.risks[0].risk,'Риск 4');
 assert.equal(another.risks.length,3);
 assert.equal(another.remaining,2);
});
