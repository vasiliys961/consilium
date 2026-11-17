import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {readFileSync} from 'node:fs';
import {caseAnalysisInput,caseContext,caseSignature,exportCase,newCase,persistCase,persistNativeProtocol,persistRadiologyReport,protocolSource} from './casebook.ts';
import {readVaultCaseById} from './local-vault.ts';
import {conduct,type CaseFile} from './conductor.ts';
import {runConsilium,CONSILIUM_ROLES} from './consilium.ts';
import {materialRoute} from './material-routing.ts';
import {extractMedicationSafetyContext} from './medication-context.ts';
import {checkMedicationRegimen} from './drug-interaction-rules.ts';
import {originalClinicalDocument,completedClinicalEvidence} from './protocol-print.ts';
import {protocolDocumentMessage} from './protocol-bridge.ts';
import {createProtocolDocx} from '../packages/protocol/docx.ts';

// Fake 1 x 1 pixel: an attachment for routing/integrity only, NOT a chest radiograph.
// Findings below are a synthetic physician-supplied report, NOT imaging inference.
const BLANK_PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WPmD+QAAAAASUVORK5CYII=';
const hash=(letter:string)=>letter.repeat(64);
const ecgCsv=['sampling_rate,500','I,II,V1,V2,V3,V4,V5,V6','0.1,0.2,0,0,0,0,0,0','0.1,0.4,0,0,0,0,0,0'].join('\n');
const labsCsv=['Показатель,Результат,Единица,Референс','Калий,5.6,ммоль/л,3.5-5.2','Креатинин,186,мкмоль/л,60-110'].join('\n');
const ecg:CaseFile={name:'synthetic-ecg.csv',sha256:hash('a'),text:ecgCsv};
const laboratory:CaseFile={name:'synthetic-labs.csv',sha256:hash('b'),text:labsCsv};
const radiology:CaseFile={name:'synthetic-chest-xray.png',sha256:hash('c'),image:BLANK_PNG,imageProfile:'xray'};
const now='2026-11-17T12:00:00.000Z';

function caseFixture(){
 const value=newCase();
 value.title='SYNTHETIC ONLY · Dyspnea / arrhythmia / CKD';
 value.question='Оценить синтетические жалобы, риски лечения и недостающие исследования.';
 value.context=[
  'СИНТЕТИЧЕСКИЙ ТЕСТ, НЕ ДАННЫЕ ПАЦИЕНТА.',
  'Возраст: 72 года',
  'Жалобы: одышка при ходьбе, сердцебиение, слабость. Одышка в покое: не указана.',
  'Анамнез: артериальная гипертензия, хроническая болезнь почек, фибрилляция предсердий в анамнезе.',
  'СКФ: 28 мл/мин/1,73 м²',
  'Калий: 5,6 ммоль/л',
  'QTc: 520 мс (сообщено врачом; не измерено автоматически тестовым ECG CSV)',
  'Активное патологическое кровотечение: нет',
  'Рентгеновская проекция не подтверждена: вложенная миниатюра — только тестовый маркер.'
 ].join('\n');
 value.currentMedications='амиодарон\nспиронолактон\nкалия хлорид';
 value.files=[ecg,laboratory,radiology];
 return value;
}
async function removeCase(id:string){
 const record=await readVaultCaseById(id);
 if(record)await persistCase(record,true);
}
function completedSyntheticResult(input:ReturnType<typeof caseAnalysisInput>,summary:string){
 const result=conduct({text:input.text,files:input.files,locale:'ru'});
 result.clinicalDraft='generated'; // Synthetic model response stub, NOT a real provider conclusion.
 result.draft.summary=summary;
 return result;
}

test('W4: pending Radiology does NOT hijack clinical reasoning; ECG and labs remain readable',()=>{
 const value=caseFixture();
 assert.equal(materialRoute(radiology),'radiology');
 assert.equal(materialRoute(ecg),'ecg');
 assert.equal(materialRoute(laboratory),'laboratory');
 const input=caseAnalysisInput(value);
 assert.deepEqual(input.pendingModules.map(file=>file.name),['synthetic-chest-xray.png']);
 assert.match(input.text,/IMAGING NOT ASSESSED BY RADIOLOGY/);
 assert.match(input.text,/do NOT infer image findings/);
 assert.equal(input.files.some(file=>file.name===radiology.name),false);
 const report=conduct({text:input.text,files:input.files,locale:'ru'});
 const ecgRow=report.ledger.find(row=>row.source===ecg.name);
 const labRow=report.ledger.find(row=>row.source===laboratory.name);
 assert.equal(ecgRow?.modality,'ecg');
 assert.equal(ecgRow?.status,'read');
 assert.equal(labRow?.labs?.status,'read');
 assert.equal(labRow?.labs?.rows.length,2);
 assert.doesNotMatch(report.draft.summary,/снимок без патологии|normal chest radiograph/i);
 const workspace=readFileSync('app/components/clinical-workspace.tsx','utf8');
 assert.doesNotMatch(workspace,/if\(caseAnalysisInput\(snapshot\)\.pendingModules\.length\)\s*\{/);
 assert.match(workspace,/href=\{`\/radiology\?case=\$\{encodeURIComponent\(current\.id\)\}`\}/);
 // Standalone Radiology still opens from explicit module button; it cannot block clinical analysis.
});

test('W4: complete synthetic case continuity: report -> follow-up consilium -> local medication warnings -> DOCX',async()=>{
 const value=caseFixture();
 await persistCase(value);
 try {
  const initial=caseAnalysisInput(value);
  const mockedCalls:string[]=[];
  const firstVoices=await runConsilium({OPENROUTER_API_KEY:'SYNTHETIC_NO_NETWORK'},{
    locale:'ru',note:initial.text,draft:'Synthetic unsigned clinical draft',citations:[],modalities:['ecg','radiology']
  },async(_url,init)=>{
    const request=JSON.parse(String(init?.body)) as {messages:Array<{content:string}>};
    mockedCalls.push(request.messages[0]?.content??'');
    return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({
      text:'Synthetic unverified opinion: imaging was not yet interpreted; lab and ECG are distinct evidence.',
      source:null
    })}}],usage:{prompt_tokens:12,completion_tokens:14}});
  });
  assert.equal(mockedCalls.length,CONSILIUM_ROLES.length);
  assert.equal(firstVoices.length,CONSILIUM_ROLES.length);
  assert.ok(firstVoices.every(voice=>voice.status==='done'));
  const first=completedSyntheticResult(initial,'Синтетический предварительный разбор 1: проверить жалобы, лабораторию, ЭКГ; снимок не оценён.');
  first.voices=firstVoices;
  value.analyses.unshift({id:'synthetic-analysis-1',at:now,question:value.question,kind:'council',context:initial.text,
    inputSignature:caseSignature(value),result:first});
  await persistCase(value);

  // The report returns to the very same case, associated with its exact saved image hash.
  const reported=await persistRadiologyReport(value.id,{text:'СИНТЕТИЧЕСКОЕ ОПИСАНИЕ, НЕ ИЗ СНИМКА. Проекция и полнота исследования не подтверждены.',
    fileKeys:[radiology.sha256!],sources:[radiology.name]},'2026-11-17T12:10:00.000Z');
  assert.deepEqual(reported.moduleReports?.[0].fileKeys,[radiology.sha256]);
  assert.equal(reported.analyses.length,1);
  assert.equal(reported.files.length,3);

  reported.events.push({id:'test-note-2',at:'2026-11-17T12:20:00.000Z',kind:'note',text:'Динамика: одышка усилилась при нагрузке. Отрицания и числа сохранять.'});
  reported.events.push({id:'test-question-2',at:'2026-11-17T12:21:00.000Z',kind:'question',text:'Как меняется оценка с учётом нового описания исследования?'});
  reported.updated='2026-11-17T12:22:00.000Z';
  await persistCase(reported);
  const followup=caseAnalysisInput(reported);
  assert.equal(followup.pendingModules.length,0);
  for(const phrase of ['СИНТЕТИЧЕСКОЕ ОПИСАНИЕ','Динамика: одышка усилилась','Как меняется оценка','Синтетический предварительный разбор 1','Synthetic unverified opinion']){
    assert.ok(followup.text.includes(phrase),'Missing follow-up clinical context: '+phrase);
  }
  assert.ok(!followup.text.includes('IMAGING NOT ASSESSED BY RADIOLOGY'), 'Current exact source-bound report is preserved');

  const parsed=extractMedicationSafetyContext(caseContext(reported));
  assert.equal(parsed.context.egfr,28);
  assert.equal(parsed.context.potassium,5.6);
  assert.equal(parsed.context.qtcMs,520);
  const safety=checkMedicationRegimen({current:reported.currentMedications??'',proposed:'моксифлоксацин',context:parsed.context});
  assert.ok(safety.alerts.some(alert=>/QT|torsade/i.test(alert.risk)),'Potential interaction must be flagged');
  assert.ok(safety.organAlerts.some(alert=>/гиперкалием/i.test(alert.risk)),'Potassium context must be flagged');
  assert.ok(safety.coverage.unverifiedPairCount>0,'Unverified combinations must stay unverified');

  const second=completedSyntheticResult(followup,'Синтетический предварительный разбор 2: учтены новые данные. Выбор терапии остаётся за врачом.');
  reported.analyses.unshift({id:'synthetic-analysis-2',at:'2026-11-17T12:30:00.000Z',kind:'council',question:'Как меняется оценка?',context:followup.text,
    inputSignature:caseSignature(reported),result:second});
  await persistCase(reported);
  const source=completedClinicalEvidence(reported);
  assert.ok(source?.includes('Синтетический предварительный разбор 2'));
  const document=originalClinicalDocument(reported,'ru');
  assert.ok(document?.sections.some(section=>section.text.includes('Синтетический предварительный разбор 2')));
  const docx=createProtocolDocx({title:'Synthetic clinical follow-up',text:source!,locale:'ru'});
  assert.equal(docx.subarray(0,2).toString('ascii'),'PK');
  assert.ok(docx.length>1000);

  const session='12345678-1234-1234-1234-123456789abc';
  const native=protocolDocumentMessage({type:'concilium.protocol.document',id:'87654321-1234-1234-1234-123456789abc',
    session,source:protocolSource(reported),text:'СИНТЕТИЧЕСКИЙ РЕДАКТИРУЕМЫЙ ПРОТОКОЛ · решение врача ещё не подписано.'},session,'ru');
  assert.ok(native);
  const saved=await persistNativeProtocol(reported.id,native!,'ru','ru','2026-11-17T12:45:00.000Z');
  const reopened=await readVaultCaseById(reported.id);
  assert.equal(saved.protocols?.length,1);
  assert.equal(reopened?.protocols?.[0].id,native!.id);
  assert.equal(reopened?.analyses.length,2);
  assert.equal(reopened?.moduleReports?.length,1);
  assert.equal(reopened?.files.length,3);
  assert.equal(reopened?.events.length,2);
  assert.match(exportCase(reopened!),/СИНТЕТИЧЕСКИЙ РЕДАКТИРУЕМЫЙ ПРОТОКОЛ/);
  assert.match(exportCase(reopened!),/synthetic-chest-xray\.png/);
  assert.match(exportCase(reopened!),/Синтетический предварительный разбор 1/);
 }finally{
  await removeCase(value.id);
 }
});
