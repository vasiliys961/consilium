/**
 * Non-patient, non-network smoke tests for the two existing module paths:
 * synthetic PNG -> Radiology station report -> case; synthetic 12-lead
 * digital waveform -> ECGFounder adapter -> saved evidence -> follow-up.
 *
 * This does NOT launch DICOM detector weights or a real ECGFounder network.
 * Inference responses are injected, explicitly synthetic stand-ins.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { syntheticVisionFrames } from '../integrations/radiology/web/lib/synthetic-vision-phantom.ts';
import { radiologyReportMessage } from './radiology-bridge.ts';
import { materialRoute, materialKey } from './material-routing.ts';
import { caseAnalysisInput, caseContext, exportCase, newCase } from './casebook.ts';
import { assessTracing } from '../packages/ecg/founder.ts';
import { ecgModuleEvidence, ecgEvidenceText } from './module-evidence.ts';
import { conduct } from './conductor.ts';

const {PNG} = createRequire(import.meta.url)('pngjs');
const digest=(value:Buffer)=>createHash('sha256').update(value).digest('hex');

test('Radiology: actual non-patient PNG phantoms decode and preserve limited station provenance',()=>{
  // Geometric illustrations: *not* a medical CT/MRI and not a diagnosis.
  for (const region of ['head','chest','abdomen'] as const) {
    for (const modality of ['CT','MR'] as const) {
      const frames=syntheticVisionFrames(modality,region);
      assert.equal(frames.length,2);
      for(const frame of frames){
        assert.match(frame.viewLabel,/NON-PATIENT MATHEMATICAL PHANTOM/);
        const image=PNG.sync.read(Buffer.from(frame.base64,'base64'));
        assert.deepEqual([image.width,image.height],[96,96]);
        assert.equal(frame.mimeType,'image/png');
      }
    }
  }
  const frame=syntheticVisionFrames('CT','chest')[0];
  const bytes=Buffer.from(frame.base64,'base64');
  const sample={name:'non-patient-chest-phantom.png',sha256:digest(bytes),
    bytes:bytes.length,image:'data:image/png;base64,'+frame.base64,
    imageProfile:'ct' as const,processingModule:'radiology' as const};
  assert.equal(materialRoute(sample),'radiology');
  const clinical=newCase(81);
  clinical.context='Synthetic chest phantom only, no patient';
  clinical.question='Did the station return a bounded image description?';
  clinical.files=[sample];
  assert.equal(caseAnalysisInput(clinical).pendingModules.length,1);
  const text='Geometric phantom: two shaded ellipses. Synthetic frame only; no clinical assessment.';
  const session='synthetic-session-qa';
  assert.equal(radiologyReportMessage({type:'concilium.report',session:'wrong',text},session),null);
  const bound=radiologyReportMessage({type:'concilium.report',session,text},session);
  assert.equal(bound,text);
  clinical.moduleReports=[{id:'radiology-synthetic-1',module:'radiology',
    fileKeys:[materialKey(sample)],sources:[sample.name],text:bound!,
    at:'2026-11-15T12:00:00Z',status:'reported',coverage:'not_verified'}];
  assert.equal(caseAnalysisInput(clinical).pendingModules.length,0);
  assert.equal(caseAnalysisInput(clinical).files.length,0);
  for(const result of [caseContext(clinical),exportCase(clinical)]) {
    assert.match(result,/two shaded ellipses/);
    assert.match(result,/неподписанный черновик/);
    assert.match(result,/НЕ подтверждена/);
    assert.match(result,/non-patient-chest-phantom.png/);
  }
});

test('ECGFounder: synthetic digital 12-lead waveform reaches parser and saved case, without running weights',async()=>{
  const leads=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
  const wave=Array.from({length:5000},(_,i)=>
    leads.map((_,channel)=>String(Math.round(120*Math.sin((i+channel*7)/26)))).join(',')
  ).join('\n');
  const csv='sampling_rate,500\n'+leads.join(',')+'\n'+wave;
  const source='non-patient-12-lead.csv';
  const sha=digest(Buffer.from(csv,'utf8'));
  let called=0;
  const read=await assessTracing({name:source,text:csv},'ru',{
    names:['SINUS RHYTHM','ATRIAL FIBRILLATION'],
    run:async (_home,payload)=>{
      called++;
      const input=JSON.parse(payload) as {samplingRate:number;leads:Record<string,number[]>};
      assert.equal(input.samplingRate,500);
      assert.equal(input.leads.I.length,5000);
      assert.equal(Object.keys(input.leads).length,12);
      // Mock inference: these scores are not obtained from ECGFounder weights.
      return JSON.stringify({ok:true,scores:[
        {label:'SINUS RHYTHM',score:0.84},{label:'ATRIAL FIBRILLATION',score:0.12}
      ],measurements:{available:true,method:'mocked-qa-only',
        description:'Synthetic digital input, not a clinical measurement',
        lines:[{name:'QA sampling rate',value:'500 Hz'}],
        note:'Values injected for transport testing, not measured by a network'}});
    },
  });
  assert.equal(called,1);
  assert.equal(read?.status,'read');
  const evidence=ecgModuleEvidence(read!,sha);
  assert.equal(evidence.sha256,sha);
  assert.deepEqual(evidence.cleared.map(x=>x.label),['SINUS RHYTHM']);
  assert.doesNotMatch(ecgEvidenceText(evidence),/0\.12/);
  assert.match(ecgEvidenceText(evidence),/не калиброванные вероятности/);
  const clinical=newCase(82);
  clinical.question='What does the synthetic waveform adapter report?';
  clinical.files=[{name:source,sha256:sha,bytes:Buffer.byteLength(csv)}];
  clinical.analyses=[{id:'ecg-synthetic-1',at:'2026-11-15T12:00:00Z',
    context:'Synthetic ECG adapter QA; no patient.',
    result:{...conduct({text:'Synthetic ECG adapter QA; no patient.'}),
      clinicalDraft:'generated',ecgEvidence:evidence,
      draft:{status:'unsigned',summary:'Mocked waveform data received',statements:[]}}}];
  for(const result of [caseAnalysisInput(clinical).text,exportCase(clinical)]){
    assert.match(result,/ECGFounder/);
    assert.match(result,/500 Hz/);
    assert.match(result,/mocked-qa-only/);
    assert.match(result,/не калиброванные вероятности/);
  }
});

test('ECGFounder: unavailable inference is not interpreted as normal ECG',async()=>{
  const leads=['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];
  const row=leads.map(()=> '0').join(',');
  const text=['sampling_rate,500',leads.join(','),...Array.from({length:5000},()=>row)].join('\n');
  const observed=await assessTracing({name:'missing-weights.csv',text},'en',{
    names:['SINUS RHYTHM'],run:async()=>JSON.stringify({ok:false,code:'weights'}),
  });
  assert.equal(observed?.status,'not_assessed');
  const saved=ecgModuleEvidence(observed!);
  assert.match(ecgEvidenceText(saved),/Не оценено/);
  assert.deepEqual(saved.cleared,[]);
  assert.equal(saved.top,null);
});
