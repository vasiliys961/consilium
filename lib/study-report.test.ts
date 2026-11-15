import test from 'node:test';
import assert from 'node:assert/strict';
import { readDraft } from './draft.ts';
import { studyReportsText } from './study-report.ts';

test('study descriptions precede the conclusion and are accepted only for readable sources', () => {
  const study = { source:'file:ecg-1.png',modality:'ECG',description:[{label:'QRS',text:'Approximately 80 ms, visual grid estimate.'}],conclusion:'Provisional tracing conclusion.',limitations:[] };
  const raw=JSON.stringify({summary:'Answer to the physician question.',studyReports:[study,{...study,source:'absent.png'}]});
  const result=readDraft(raw,new Set(['file:ecg-1.png']));
  assert.equal(result?.studyReports?.length,1);
  const text=studyReportsText(result?.studyReports??[]);
  assert.ok(text.indexOf('Approximately 80')<text.indexOf('Provisional tracing'));
  assert.equal(result?.summary,'Answer to the physician question.');
});
