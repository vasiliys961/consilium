import {drugEntries} from './drug-interaction-rules.ts';

/**
 * W5 offline physician-supplied context only. Exact ingredient overlaps are
 * screening findings, NOT a complete allergy or pregnancy prescribing engine.
 * Do not infer absence of allergy/pregnancy from missing fields.
 */
export type AllergyStatus='unknown'|'confirmed'|'none_reported';
export type PregnancyStatus='unknown'|'pregnant'|'not_pregnant'|'not_applicable';
export type PatientSafetyInput={
 current:string;
 proposed?:string;
 alternatives?:string;
 stopped?:string;
 allergyStatus:AllergyStatus;
 allergenNames:string;
 pregnancyStatus:PregnancyStatus;
};
export type PatientSafetyFinding={
 drug:string;
 allergen:string;
 scope:'current'|'proposed'|'alternative';
 alternative?:string;
 kind:'same_ingredient';
};
export type PatientSafetyReview={
 findings:PatientSafetyFinding[];
 issues:string[];
 pregnancyReview:Array<{scope:'current'|'proposed'|'alternative';drug:string;alternative?:string}>;
 unverifiedAllergens:string[];
 doseVerificationRequired:boolean;
};
const aliasRows:ReadonlyArray<readonly [string,readonly string[]]>=[
 ['amoxicillin',['amoxicillin','amoxil','амоксициллин','амоксицилін']],
 ['ampicillin',['ampicillin','ампициллин','ампіцилін']],
 ['penicillin',['penicillin','пенициллин','пеніцилін']],
 ['apixaban',['apixaban','eliquis','апиксабан','эликвис']],
 ['rivaroxaban',['rivaroxaban','xarelto','ривароксабан','ксарелто']],
 ['warfarin',['warfarin','coumadin','варфарин']],
 ['metformin',['metformin','glucophage','метформин','метформін','глюкофаж','сиофор']],
 ['ibuprofen',['ibuprofen','nurofen','ибупрофен','ібупрофен','нурофен']],
 ['aspirin',['aspirin','acetylsalicylic acid','аспирин','аспірин','ацетилсалициловая кислота']],
 ['clarithromycin',['clarithromycin','клацид','кларитромицин','кларитроміцин']],
 ['spironolactone',['spironolactone','aldactone','спиронолактон','верошпирон']],
 ['moxifloxacin',['moxifloxacin','avelox','моксифлоксацин','авелокс']],
 ['simvastatin',['simvastatin','zocor','симвастатин','зокор']],
 ['sildenafil',['sildenafil','viagra','силденафил','виагра']],
 ['nitroglycerin',['nitroglycerin','нитроглицерин']],
 ['clopidogrel',['clopidogrel','клопидогрел','клопидогрель','клопідогрел']],
];
const simpleName=/^[\p{L}][\p{L}\s-]{1,69}$/u;
function normalize(v:string){return v.toLocaleLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();}
const aliases=new Map(aliasRows.flatMap(([canonical,values])=>values.map(name=>[normalize(name),canonical] as const)));
function ingredient(value:string):string|null{
 const v=normalize(value);
 const candidates=[...aliases.keys()].sort((a,b)=>b.length-a.length);
 const found=candidates.find(a=>v===a||v.startsWith(a+' '));
 if(found){
  const tail=v.slice(found.length).trim();
  // Only allow recognised ingredient followed by a numeric strength or route
  // annotation, never a different chemical name or another active ingredient.
  if(tail&&!/^(?:\d|\(|tablet|capsule|oral|topical|ophthalmic|таблет|капсул|гель|мазь|per os)/iu.test(tail))return null;
  return aliases.get(found)!;
 }
 // An unknown ingredient can only match if both sides supply the exact
 // same simple name. Brand/substance equivalence and class cross-reactivity
 // are NOT inferred for unknown compounds.
 return simpleName.test(v)?v:null;
}
function medicationEntries(text:string):string[]{return drugEntries(text).filter(Boolean);}
function canonicalStopped(stopped:string){return new Set(medicationEntries(stopped).map(ingredient).filter((x):x is string=>Boolean(x)));}
function activeEntries(text:string,stopped:Set<string>){
 return medicationEntries(text).filter(drug=>{const key=ingredient(drug);return !key||!stopped.has(key);});
}
function options(text:string):Array<{name:string;drugs:string[]}>{
 return text.split(/[\n;|]/).map(name=>name.trim()).filter(Boolean).slice(0,12)
  .map(name=>({name,drugs:medicationEntries(name)}));
}
export function reviewPatientSafetyFactors(input:PatientSafetyInput):PatientSafetyReview{
 const issues:string[]=[],findings:PatientSafetyFinding[]=[],pregnancyReview:PatientSafetyReview['pregnancyReview']=[];
 const rawAllergens=medicationEntries(input.allergenNames).slice(0,20);
 const unverifiedAllergens:string[]=[];
 if(input.allergyStatus==='confirmed'&&rawAllergens.length===0)issues.push('confirmed_allergens_missing');
 if(input.allergyStatus!=='confirmed'&&rawAllergens.length>0)issues.push('allergy_status_conflict');
 const allergenSet=new Map<string,string>();
 if(input.allergyStatus==='confirmed'){
  for(const name of rawAllergens){
   const key=ingredient(name);
   if(!key||/^(?:unknown|неизвестно|no allergies|нет аллергии)$/iu.test(key)){
    unverifiedAllergens.push(name);continue;
   }
   allergenSet.set(key,name);
  }
  if(unverifiedAllergens.length)issues.push('allergen_names_unverified');
 }
 const stopped=canonicalStopped(input.stopped??'');
 const stages:[
  {scope:'current';drugs:string[];alternative?:string},
  {scope:'proposed';drugs:string[];alternative?:string},
  ...Array<{scope:'alternative';drugs:string[];alternative:string}>
 ]=[
  {scope:'current',drugs:activeEntries(input.current,stopped)},
  {scope:'proposed',drugs:activeEntries(input.proposed??'',stopped)},
  ...options(input.alternatives??'').map(({name,drugs})=>({scope:'alternative' as const,alternative:name,drugs:activeEntries(drugs.join('\n'),stopped)})),
 ];
 for(const stage of stages)for(const drug of stage.drugs){
  const key=ingredient(drug);
  if(key&&allergenSet.has(key)){
   findings.push({drug,allergen:allergenSet.get(key)!,scope:stage.scope,
    ...(stage.alternative?{alternative:stage.alternative}:{}),kind:'same_ingredient'});
  }
  if(input.pregnancyStatus==='pregnant'){
   pregnancyReview.push({drug,scope:stage.scope,...(stage.alternative?{alternative:stage.alternative}:{})});
  }
 }
 // Dose, frequency, route and population-specific instructions are never
 // validated by matching medicine names or by this lightweight module.
 return {findings,issues,pregnancyReview,unverifiedAllergens,
  doseVerificationRequired:stages.some(s=>s.drugs.length>0)};
}
