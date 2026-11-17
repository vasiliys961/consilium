import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ecgWordDescription} from './ecg-word-description.ts';
import {completedClinicalEvidence} from './protocol-print.ts';
import {newCase,type ClinicalCase} from './casebook.ts';
import type {EcgModuleEvidence} from './module-evidence.ts';

const hash='a'.repeat(64);
const ecg:EcgModuleEvidence={
 module:'ecgfounder',method:'digital-ecg-waveform',source:'synthetic-12-lead.csv',
 sha256:hash,status:'read',threshold:0.5,
 cleared:[{label:'AF',score:0.78}],top:{label:'AF',score:0.78},
 measurements:{
   method:'synthetic digital sample measurement',
   description:'SYNTHETIC 12-lead tracing, not patient data',
   lines:[{name:'HR',value:'88 bpm'},{name:'QRS',value:'104 ms'}],
   note:'Test values; not validated clinically.'
 },reason:null,
};
const report=[{
 source:'synthetic-12-lead.csv',modality:'ECG',
 description:[{label:'Ритм',text:'Предварительная синтетическая оценка ритма.'}],
 conclusion:'Синтетический учебный результат; требует врачебной проверки.',
 limitations:['Изображения нет; измерения получены из тестового цифрового сигнала.'],
}];

test('W4 ECG Word export preserves the original readable report plus ECGFounder evidence, without upgrading classifier scores to diagnoses',()=>{
 const text=ecgWordDescription(report,ecg);
 assert.match(text,/Предварительная синтетическая оценка ритма/);
 assert.match(text,/Синтетический учебный результат/);
 assert.match(text,/Изображения нет/);
 assert.match(text,/ECGFounder.*synthetic-12-lead\.csv/);
 assert.match(text,/HR: 88 bpm/);
 assert.match(text,/QRS: 104 ms/);
 assert.match(text,/Баллы сети — не калиброванные вероятности/);
 assert.match(text,/AF \(0\.78\)/);
 assert.ok(text.indexOf('Предварительная синтетическая')<text.indexOf('ECGFounder'));
 assert.equal(text.match(/Синтетический учебный результат/g)?.length,1);
 assert.doesNotMatch(text,/подтверждённая фибрилляция предсердий|AF confirmed/);
});

test('W4 existing ECG Word description remains unchanged when ECGFounder did not produce technical evidence',()=>{
 const withModule=ecgWordDescription(report,undefined);
 assert.doesNotMatch(withModule,/ECGFounder/);
 assert.match(withModule,/Ритм/);
 assert.match(withModule,/требует врачебной проверки/);
 const failed=ecgWordDescription(report,{...ecg,status:'not_assessed',reason:'Недоступны веса',cleared:[],top:null});
 assert.match(failed,/Не оценено: Недоступны веса/);
 assert.match(failed,/не является нормальной ЭКГ/);
 assert.doesNotMatch(failed,/AF \(0\.78\)/);
});

test('W4 ECG station does not redirect to deferred Radiology when linked clinical case contains a DICOM',()=>{
 const workbench=readFileSync('app/components/analysis-workbench.tsx','utf8');
 assert.match(workbench,/if\(fixedProfile!=='ecg'&&dicom\.length&&/);
 assert.match(workbench,/files: files\.filter\(file=>!isRadiologyFile\(file\)\)/);
 assert.match(workbench,/ecgWordDescription\(result\.draft\.studyReports!,result\.ecgEvidence/);
 assert.match(readFileSync('app/ecg/page.tsx','utf8'),/fixedProfile="ecg"/);
});

test('W4 clinical case keeps the source-bound ECGFounder result in its printable source, without extra model calls',()=>{
 const value=newCase();
 value.title='SYNTHETIC ECG TEST';
 value.context='Синтетические жалобы и цифровая запись; реальных пациентов нет.';
 value.files=[{name:'synthetic-12-lead.csv',sha256:hash,text:'sampling_rate,500\nI,II\n0.2,0.3'}];
 value.analyses=[{
  id:'synthetic-analysis',at:'2026-11-17T18:00:00Z',context:'Test',
  result:{
   clinicalDraft:'generated',ecgEvidence:ecg,unassessed:[],
   draft:{summary:'Синтетический предварительный разбор',studyReports:report,statements:[]},
  } as ClinicalCase['analyses'][number]['result'],
 }];
 const text=completedClinicalEvidence(value);
 assert.ok(text);
 assert.match(text!,/Синтетический предварительный разбор/);
 assert.match(text!,/ЭКГ — извлечённые результаты/);
 assert.match(text!,/synthetic-12-lead\.csv/);
 assert.match(text!,/QRS: 104 ms/);
});
