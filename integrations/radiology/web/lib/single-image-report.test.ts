import test from 'node:test';
import assert from 'node:assert/strict';
import {singleImageReport} from './single-image-report.ts';
import {RADIOLOGY_REPORT_LANGUAGES,type RadiologyReportLanguage} from './report-language.ts';
test('one-image coverage is in the selected interface language and never rewrites the image reading',()=>{
 for(const language of Object.keys(RADIOLOGY_REPORT_LANGUAGES) as RadiologyReportLanguage[]){
  const source='Synthetic source-bound reading. 4 mm, uncertain, not confirmed.';
  const report=singleImageReport(source,language);
  assert.equal(report.split('\n\n')[1],source);
  if(language!=='ru')assert.doesNotMatch(report.split('\n\n')[0],/[а-яё]/i);
  if(language==='en')assert.match(report,/One supplied image/);
  if(language==='ar')assert.match(report,/صورة واحدة/);
 }
});
