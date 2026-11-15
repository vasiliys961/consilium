import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePrivacy} from './privacy-prepare.ts';
import {signPrivacy,verifyPrivacy} from './privacy-ticket.ts';
import {relativeDateCleaner} from './privacy-dates.ts';
import {redactText,redactDocument} from '../packages/intake/redact.ts';
import {encodeDataUrl,decodeDataUrl} from '../packages/intake/raster.ts';
import {caseContext,newCase} from './casebook.ts';
import {analyzeCase} from './analyze-case.ts';
test('Russian and English identifiers are masked without erasing doses, negations or measurements',()=>{
 const input='ФИО: Иванов Иван Иванович; DOB: 1980-11-05; Patient name: John Smith; Иванов И.И.; email: test@example.com; +1 (212) 555-0199; SSN: 123-45-6789. Боли нет. Метопролол 50 мг. HR 72 bpm. BP 120/80.';
 const output=redactText(input).text;for(const token of ['Иванов','John Smith','test@example.com','555-0199','123-45-6789','1980-11-05'])assert.ok(!output.includes(token),token);
 for(const token of ['Боли нет','50 мг','72 bpm','120/80'])assert.ok(output.includes(token),token);
});
test('CSV personal columns are masked while numeric signal samples retain their precision',()=>{
 const csv='Patient Name,DOB,glucose\n"Smith, John",1980-01-02,5.123456789012\n';const result=redactDocument('report.csv',csv);assert.ok(!result.text!.includes('Smith'));assert.ok(!result.text!.includes('1980'));assert.ok(result.text!.includes('5.123456789012'));
 const signal='sampling_rate,500\nI,II\n0.123456789012345,0.234567890123456\n';assert.equal(redactDocument('ecg.csv',signal).text,signal);
});
test('VCF removes sample labels and personal metadata while keeping variants and genotypes',()=>{
 const source='##fileformat=VCFv4.2\n##SAMPLE=<ID=John-Smith>\n##fileDate=20261108\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tJohn-Smith\n1\t12345678\trs123\tA\tG\t99\tPASS\tGENE=BRCA1;PATIENT_ID=secret\tGT:AD\t0/1:1234567890,3\n';
 const output=redactDocument('test.vcf',source).text!;for(const item of ['John-Smith','20261108','secret'])assert.ok(!output.includes(item));assert.ok(output.includes('SAMPLE_1'));assert.ok(output.includes('1\t12345678\trs123\tA\tG'));assert.ok(output.includes('0/1:1234567890,3'));
});
test('relative timeline retains intervals and withholds the date of birth',()=>{const dates=relativeDateCleaner(),result=dates.clean('DOB: 1980-01-01. Exam 2026-11-08; previous 05.11.2026; follow-up 2026-11-15.');assert.ok(!result.includes('1980'));assert.ok(!result.includes('2026'));assert.match(result,/\[day 0\]/);assert.match(result,/\[day -3\]/);assert.match(result,/\[day 7\]/);});
test('preparation calls no external provider, excludes raw binaries and audio, and hides original filenames',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('External network must not run');};
 try{const value=await preparePrivacy({text:'Patient name: John Smith; pain absent.',files:[{name:'John-Smith.txt',text:'Метопролол 50 мг. Иванов И.И.'},{name:'John-Smith.wav',audio:'RAW_AUDIO'},{name:'secret.bin',binary:'U0VDUkVU'}]});const packed=JSON.stringify(value.body);for(const token of ['John-Smith','Иванов','RAW_AUDIO','U0VDUkVU'])assert.ok(!packed.includes(token));assert.ok(packed.includes('50 мг'));assert.equal(value.audioAvailable,true);assert.ok(value.excluded.length>=2);}finally{globalThis.fetch=original;}
});
test('every image is withheld when OCR fails, irrespective of the image profile',async()=>{const image=encodeDataUrl({width:4,height:4,kind:'png',data:new Uint8Array(64).fill(255)});const value=await preparePrivacy({files:[{name:'wound.png',image}]},{readWords:async()=>null});assert.equal(value.body.files?.length,0);assert.equal(value.excluded.length,1);});
test('OCR identifiers and manually selected pixels are black in the exact approved copy',async()=>{
 const image=encodeDataUrl({width:20,height:20,kind:'png',data:new Uint8Array(1600).fill(255)});
 const first=await preparePrivacy({files:[{name:'John-Smith.png',image}]},{readWords:async()=>[{text:'John',x:2,y:1,width:4,height:2},{text:'Smith',x:8,y:1,width:4,height:2}]});assert.ok(first.removed>0);
 const file=first.body.files![0];file.masks=[{x:10,y:10,width:3,height:3}];const final=await preparePrivacy(first.body,{finalize:true});const decoded=decodeDataUrl(final.body.files![0].image!)!;assert.equal(decoded.data[(11*20+11)*4],0);assert.equal(decoded.data[(18*20+18)*4],255);assert.equal(final.body.files![0].masks,undefined);
});
test('approval is bound to exact text and image bytes and expires',()=>{const body={text:'Reviewed copy',files:[{image:'exact-pixels'}]},now=Date.now(),token=signPrivacy(body,now);assert.equal(verifyPrivacy(body,token,now+10),true);assert.equal(verifyPrivacy({...body,text:'Different'},token,now+10),false);assert.equal(verifyPrivacy(body,token,now+900001),false);assert.equal(verifyPrivacy(body,token+'x',now+1),false);});
test('identity mapping stays outside the case context sent to models',()=>{const value=newCase();value.context='No pain; review ECG.';value.privatePatient={name:'PRIVATE NAME',birthDate:'1980-01-01',identifiers:'PRIVATE MRN',dates:'2026-11-08'};const context=caseContext(value);assert.equal(context,'No pain; review ECG.');assert.ok(!context.includes('PRIVATE'));});

test('clinical headings and high precision values are preserved during name masking',()=>{const source='Left Anterior Fascicular Block. Aortic Valve Stenosis. No Patient Data. AF=0.01234567890123. Na +130 mmol/L.';assert.equal(redactText(source).text,source);});

test('final approval preserves the exact physician-edited clinical text',async()=>{const edited='Left Anterior Fascicular Block. Clinical correction retained.';const final=await preparePrivacy({text:edited,files:[{name:'material-1.txt',text:edited}]},{finalize:true});assert.equal(final.body.text,edited);assert.equal(final.body.files![0].text,edited);});

test('diagnostic reasoning headings remain clinical structure, not mistaken person names',()=>{const source='Assessment / Preliminary Diagnosis. Differential Diagnosis. Evidence For. Evidence Against / Uncertainties. Diagnostic Plan. Management Plan.';assert.equal(redactText(source).text,source);});
test('a verified physician correction reaches analysis without a second destructive name replacement',async()=>{
 const calls:string[]=[];await analyzeCase({text:'Ann Arbor stage II. No pain. What evidence is missing?',externalSearch:false,locale:'en'},{reviewed:true,env:{OPENROUTER_API_KEY:'synthetic-test-key',POLZA_API_KEY:undefined},fetch:async(_url,init)=>{calls.push(String(init?.body??''));return new Response('{}',{status:503});}});
 assert.ok(calls.some(body=>body.includes('Ann Arbor stage II')));assert.ok(!calls.some(body=>body.includes('[name] stage II')));
});
