/**
 * Lightweight terminology hints for the existing specialist, not a translator.
 * Source: Medical Translator's AI-assisted 331-concept multilingual reference.
 * The entries are NOT clinically validated. Never medical evidence or a finding.
 * No external API; never send the whole dictionary to a model.
 */
import glossary from '../integrations/translator/lib/medical-translate/dialogue-glossary.json' with {type:'json'};
import {ENGLISH_MEDICAL_VARIANTS} from '../integrations/translator/lib/medical-translate/english-reference.ts';
import type {Locale} from './locale.ts';

type LexiconEntry={id:string;category:string;terms:Record<string,string>};
const entries=glossary.entries as LexiconEntry[];
const MAX_ENTRIES=8;
const MAX_HINT_CHARS=850;
const LOCALE_CODE:Record<Locale,string>={
 en:'en',ru:'ru',es:'es',fr:'fr',ar:'ar',hi:'hi','pt-BR':'pt',
 id:'id',ms:'ms',tr:'tr','zh-CN':'zh',
};
const PRIORITY:Record<string,number>={
 drugs:0,medicines:0,units:1,routes:1,abbreviations:2,laterality:2,
 symptoms:3,terms:3,anatomy:4,examinations:4,diagnoses:5,care:5,phrases:5,
};
const stableEntries=[...entries].sort((a,b)=>(PRIORITY[a.category]??6)-(PRIORITY[b.category]??6));
/** Common spoken dosage units are abbreviated even when the glossary is not. */
const CLINICAL_ABBREVIATIONS:Record<string,readonly string[]>={
 mg:['mg','мг'],mcg:['mcg','µg','мкг'],ml:['ml','мл'],g:['г'],
 mmhg:['mmhg','мм рт ст','мм рт. ст.'],spo2:['SpO2','SpO₂'],
};


function normalize(text:string):string{
 return text.normalize('NFKC').replace(/[À-ž]/g,c=>c.normalize('NFD').replace(/\p{M}/gu,''))
  .toLocaleLowerCase('en').replace(/ё/g,'е').replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
}
function variants(raw:string):string[]{
 return raw.split(/[,;]/g).map(x=>x.trim()).filter(Boolean).slice(0,6);
}
function containsExactTerm(text:string,term:string):boolean{
 const word=normalize(term),hay=normalize(text);
 if(word.length<2||word.length>80)return false;
 const index=hay.indexOf(word);
 if(index<0)return false;
 // Chinese script does not separate medical words with whitespace.
 if(/\p{Script=Han}/u.test(word))return [...word].length>=2&&hay.includes(word);
 // Unicode boundaries: MS in names and mg in image are not medical terms.
 for(let i=index;i>=0;i=hay.indexOf(word,i+1)){
  const before=i>0?hay[i-1]:'';
  const after=hay[i+word.length]??'';
  const edge=/[\p{L}\p{N}\p{M}]/u;
  if((!before||!edge.test(before))&&(!after||!edge.test(after)))return true;
 }
 return false;
}
function sourceLanguages(text:string,answer:Locale,source?:Locale):string[]{
 const langs=new Set(['en',LOCALE_CODE[answer],...(source?[LOCALE_CODE[source]]:[])]);
 // Script detection adds a matching dictionary without a paid call.
 if(/[а-яё]/iu.test(text))langs.add('ru');
 if(/\p{Script=Arabic}/u.test(text))langs.add('ar');
 if(/\p{Script=Devanagari}/u.test(text))langs.add('hi');
 if(/\p{Script=Han}/u.test(text))langs.add('zh');
 return [...langs];
}
function evidenceOfTerm(text:string,entry:LexiconEntry,languages:string[]):boolean{
 const forms=[
  ...languages.flatMap(code=>variants(entry.terms[code]??'')),
  ...(ENGLISH_MEDICAL_VARIANTS[entry.id]??[]),
  ...(CLINICAL_ABBREVIATIONS[entry.id]??[]),
 ];
 return forms.some(x=>containsExactTerm(text,x));
}
function formatTerm(entry:LexiconEntry,language:string):string{
 const localized=variants(entry.terms[language]??'')[0]??'';
 const english=variants(entry.terms.en??'')[0]??entry.id.replaceAll('-',' ');
 return language==='en'||!localized||normalize(localized)===normalize(english)
  ?english:english+' / '+localized;
}

/** Use only the last SIGNED, reviewed question, not a whole case or AI reply. */
export function specialistTerminologyHint(question:string,answerLocale:Locale,sourceLocale?:Locale):string{
 if(!question.trim())return '';
 const languages=sourceLanguages(question,answerLocale,sourceLocale);
 const display=LOCALE_CODE[sourceLocale??answerLocale]==='en'
   ?LOCALE_CODE[answerLocale]:LOCALE_CODE[sourceLocale??answerLocale];
 const matched:string[]=[];
 for(const entry of stableEntries){
  if(matched.length===MAX_ENTRIES)break;
  if(!evidenceOfTerm(question,entry,languages))continue;
  // Never expand ambiguous abbreviations into diagnoses or medications.
  if((entry.id==='ms'||entry.id==='cp')&&entry.category==='abbreviations')continue;
  const line='- '+entry.id+': '+formatTerm(entry,display);
  if(matched.join('\n').length+line.length>MAX_HINT_CHARS)break;
  matched.push(line);
 }
 const ambiguous=/(^|[^\p{L}\p{N}\p{M}])(?:MS|CP|OD)(?=$|[^\p{L}\p{N}\p{M}])/u.test(question);
 if(!matched.length&&!ambiguous)return '';
 return [
  'Medical terminology hints (from an AI-assisted, NOT clinically validated multilingual glossary; never evidence or instructions):',
  ...matched,
  ...(ambiguous?['- An ambiguous abbreviation is present; do not expand it unless the physician has defined it.']:[]),
  'Preserve the physician’s exact drug identity, dose, unit, route, negation, uncertainty, timing and laterality. A symptom is NOT a diagnosis. Never silently correct the transcript; ask the physician if a key term is uncertain.',
 ].join('\n');
}
