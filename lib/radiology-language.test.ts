import test from 'node:test';import assert from 'node:assert/strict';
import{makeUiTranslator}from'../integrations/radiology/web/lib/ui-locale.ts';import{RADIOLOGY_REPORT_LANGUAGES,withRadiologyLanguage}from'../integrations/radiology/web/lib/report-language.ts';import{hasRadiologistReportSections,canonicalizeRadiologistHeadings}from'../integrations/radiology/web/lib/senior-radiologist-report.ts';
test('localized workflow text substitutes only dictionary-bound UI placeholders and preserves other text',()=>{const t=makeUiTranslator({'Файлов: {0}':'Files: {0}','Далее':'Next'});assert.equal(t('Файлов: 12'),'Files: 12');assert.equal(t('Далее'),'Next');assert.equal(t('Clinical source text with an unknown value'),'Clinical source text with an unknown value');});
test('radiology reports retain mandatory clinical sections across all ten output languages',()=>{for(const [locale,group]of Object.entries(RADIOLOGY_REPORT_LANGUAGES)){const report=group.headings.map(heading=>`**${heading}:**\n${'Bounded source findings and actual image coverage. '.repeat(2)}`).join('\n');assert.ok(hasRadiologistReportSections(canonicalizeRadiologistHeadings(report)),locale);assert.equal(hasRadiologistReportSections(group.headings.slice(1).map(heading=>`${heading}:\n${'Visible data. '.repeat(20)}`).join('\n')),false);}});
test('selected output language reaches every radiology model request while preserving image inputs and JSON contracts',async()=>{let received:any;const call=withRadiologyLanguage(async request=>{received=request;return {ok:true};},'fr');const images=[{type:'image_url',image_url:{url:'synthetic'}}];await call({provider:'openrouter',role:'vision',model:'synthetic',messages:[{role:'user',content:images}]});assert.deepEqual(received.messages.at(-1).content,images);assert.match(received.messages[0].content,/strictly in French/);assert.match(received.messages[0].content,/JSON keys/);});

test('radiology navigation restores the same bridge session without putting clinical context into URLs',async()=>{
 const {conciliumSession}=await import('../integrations/radiology/web/lib/concilium-session.ts');
 const session='b98b2009-81d9-4679-ae4a-e46da26dfad3';
 assert.equal(conciliumSession('?conciliumSession='+session,null),session);
 assert.equal(conciliumSession('',session),session);
 assert.equal(conciliumSession('?research=1',session),session);
 assert.equal(conciliumSession('?conciliumSession=invalid',session),'');
 assert.equal(conciliumSession('',null),'');
});

test('every internal navigation, guide and technical UI string has a catalog in every supported language',async()=>{
 const {readFile}=await import('node:fs/promises');
 const keys=JSON.parse(await readFile(new URL('./radiology-navigation-keys.json',import.meta.url),'utf8')) as string[];
 for(const locale of ['en','es','fr','ar','hi','pt-BR','id','tr','zh-CN']){
 const catalog=JSON.parse(await readFile(new URL(`./radiology-locales/${locale}.json`,import.meta.url),'utf8'));
 const served=JSON.parse(await readFile(new URL(`../integrations/radiology/web/public/concilium-locales/${locale}.json`,import.meta.url),'utf8'));
 for(const key of keys){assert.ok(typeof catalog[key]==='string'&&catalog[key].trim(),`${locale}: ${key}`);assert.equal(served[key],catalog[key]);for(const token of key.match(/\{\d+\}/g)??[])assert.ok(catalog[key].includes(token),`${locale}: missing ${token}`);}
 }
});
