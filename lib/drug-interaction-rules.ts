/** A small locally checked list. Each pair is tied to a specific public drug label. */
const rules = [
  { a: /^(?:sildenafil|viagra|силденафил|виагра)\b|^(?:силденафил|виагра)(?!\p{L})/iu,
    b: /^(?:nitroglycerin|glyceryl trinitrate|isosorbide|нитроглицерин|изосорбид)(?!\p{L})/iu,
    risk: 'Силденафил и нитраты · риск выраженной гипотензии',
    action: 'Сочетание противопоказано по инструкции. Уточните приём нитратов по требованию и время последней дозы.',
    setId: 'd905dc8d-917f-4ea3-a4ee-a1ecf6967d4e' },
  { a: /^(?:simvastatin|zocor|симвастатин|зокор)(?!\p{L})/iu,
    b: /^(?:clarithromycin|erythromycin|кларитромицин|эритромицин)(?!\p{L})/iu,
    risk: 'Симвастатин и некоторые макролиды · риск миопатии и рабдомиолиза',
    action: 'Сочетание противопоказано по инструкции. Проверьте альтернативу или временную приостановку симвастатина с лечащим врачом.',
    setId: 'e59bf31f-d880-4d9e-b6c2-5a18a53718f9' },
  { a: /^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu,
    b: /^(?:lisinopril|enalapril|ramipril|losartan|valsartan|лизиноприл|эналаприл|рамиприл|лозартан|валсартан)(?!\p{L})/iu,
    risk: 'Спиронолактон и препараты, повышающие калий · риск гиперкалиемии',
    action: 'Сверьте калий и функцию почек. При сниженной функции почек или изменении терапии может потребоваться более частый контроль.',
    setId: '0fed2822-3a03-4b64-9857-c682fcd462bc' },
  { a: /^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu,
    b: /^(?:ibuprofen|diclofenac|naproxen|ketorolac|ибупрофен|диклофенак|напроксен|кеторолак)(?!\p{L})/iu,
    risk: 'Варфарин и НПВП · риск кровотечения',
    action: 'Сверьте необходимость НПВП и анамнез кровотечений. Обсудите альтернативу и контроль признаков кровотечения.',
    setId: 'bd6ea120-5d1c-4815-94f2-81e28dc6b7a9' },

  { a:/^(?:sildenafil|viagra|силденафил|виагра)(?!\p{L})/iu, b:/^(?:riociguat|adempas|риоцигуат|адемпас)(?!\p{L})/iu,
    risk:'Силденафил и риоцигуат · выраженная гипотензия',action:'Сочетание противопоказано. Проверьте полный список назначений.',
    setId:'d905dc8d-917f-4ea3-a4ee-a1ecf6967d4e' },
  { a:/^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu, b:/^(?:clarithromycin|кларитромицин|клацид)(?!\p{L})/iu,
    risk:'Варфарин и кларитромицин · риск кровотечения и изменения МНО',action:'Проверьте необходимость антибиотика и обеспечьте учащённый контроль МНО.',
    setId:'9eb306e0-ccfb-418c-82ca-204f20a788f7' },
  { a:/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu, b:/^(?:ibuprofen|diclofenac|naproxen|ketorolac|целекоксиб|ибупрофен|диклофенак|напроксен|кеторолак|celecoxib)(?!\p{L})/iu,
    risk:'Апиксабан и системный НПВП · риск кровотечения (особенно при длительном применении НПВП)',
    action:'Проверьте показание к НПВП, риск кровотечения и альтернативы. Контролируйте клинические признаки кровопотери.',
    setId:'7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e' },
  { a:/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu, b:/^(?:aspirin|clopidogrel|аспирин|ацетилсалициловая кислота|клопидогрел|клопидогрель)(?!\p{L})/iu,
    risk:'Апиксабан и антиагрегант · риск кровотечения',action:'Уточните показания и длительность комбинированной антитромботической терапии.',
    setId:'7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e' },
  { a:/^(?:lithium|литий|лития карбонат)(?!\p{L})/iu, b:/^(?:ibuprofen|diclofenac|naproxen|ketorolac|celecoxib|ибупрофен|диклофенак|напроксен|кеторолак|целекоксиб)(?!\p{L})/iu,
    risk:'Литий и системный НПВП · повышение концентрации лития',action:'Оцените альтернативу; необходим контроль концентрации лития и функции почек.',
    setId:'be1346df-4a39-45e8-874b-e2a496847fd5' },
  { a:/^(?:lithium|литий|лития карбонат)(?!\p{L})/iu, b:/^(?:lisinopril|enalapril|ramipril|losartan|valsartan|captopril|лизиноприл|эналаприл|рамиприл|лозартан|валсартан|каптоприл)(?!\p{L})/iu,
    risk:'Литий и ингибитор АПФ/БРА · повышение концентрации лития',action:'При изменении схемы обеспечьте мониторинг концентрации лития и функции почек.',
    setId:'be1346df-4a39-45e8-874b-e2a496847fd5' },
  { a:/^(?:digoxin|дигоксин)(?!\p{L})/iu, b:/^(?:amiodarone|cordarone|амиодарон|кордарон)(?!\p{L})/iu,
    risk:'Дигоксин и амиодарон · повышение концентрации дигоксина',action:'По инструкции пересмотрите дозу дигоксина и контролируйте концентрацию, ЭКГ, калий и функцию почек.',
    setId:'924c9359-ebc4-62a7-e053-2a95a90a4327' },
  { a:/^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu, b:/^(?:co-trimoxazole|trimethoprim|триметоприм|ко-тримоксазол|бисептол)(?!\p{L})/iu,
    risk:'Спиронолактон и триметоприм · риск гиперкалиемии',action:'Проверьте калий и СКФ; оцените альтернативу при повышенном риске.',
    setId:'0fed2822-3a03-4b64-9857-c682fcd462bc' },
  { a:/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu, b:/^(?:rifampin|rifampicin|carbamazepine|phenytoin|рифампицин|карбамазепин|фенитоин)(?!\p{L})/iu,
    risk:'Апиксабан и сильный индуктор P-gp/CYP3A4 · снижение эффекта антикоагулянта',
    action:'Инструкция рекомендует избегать сочетания. Проверьте возможные альтернативы.',
    setId:'7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e' },

] as const;

export type MedicationSeverity='contraindicated'|'major'|'monitor';
export type MedicationContext={egfr?:number|null;potassium?:number|null;decompensatedCirrhosis?:boolean;severeHepaticImpairment?:boolean};
export type DrugInteractionAlert={first:string;second:string;risk:string;action:string;url:string;severity:MedicationSeverity;relation:'current-current'|'current-proposed'|'proposed-proposed';source:string;section:string;monitoring:string};
export type OrganSafetyAlert={drug:string;risk:string;action:string;severity:MedicationSeverity;url:string;section:string};
const evidence=[
 ['contraindicated','VIAGRA · 2023-11-17','4.1','АД, приём нитратов'],
 ['contraindicated','SIMVASTATIN · 2026-04-08','4 / 7.1','Мышечные симптомы; КФК при показаниях'],
 ['monitor','ALDACTONE · 2025-11-28','5.1 / 7.1','Калий и СКФ; калий в течение недели после начала/титрации'],
 ['major','WARFARIN · 2026-08-10','7.3','Клинические признаки кровотечения, МНО по плану'],
 ['contraindicated','VIAGRA · 2023-11-17','4.3','АД'],
 ['major','CLARITHROMYCIN · 2025-11-01','Drug Interactions','МНО, признаки кровотечения'],
 ['major','ELIQUIS · 2025-08-29','5.2 / 7.3','Клинические признаки кровотечения'],
 ['major','ELIQUIS · 2025-08-29','7.3','Клинические признаки кровотечения'],
 ['major','LITHIUM · 2026-10-23','7.1','Концентрация лития, СКФ'],
 ['major','LITHIUM · 2026-10-23','7.1','Концентрация лития, СКФ'],
 ['major','AMIODARONE · 2026','7 Drug Interactions','Дигоксин, ЭКГ, K+, СКФ'],
 ['major','ALDACTONE · 2025-11-28','7.1','K+, СКФ'],
 ['major','ELIQUIS · 2025-08-29','7.2','Точное название индуктора'],
] as const;
const nonSystemic=/(?:глазн|офтальм|наружн|мазь|гель|крем|ophthalmic|topical|cutaneous|eye drops)/iu;

export const CURRENT_MEDICATIONS_HEADING = 'Current medications reported by the physician:';

export function reportedMedications(note: string): string {
  const heading = `${CURRENT_MEDICATIONS_HEADING}\n`;
  const section = note.startsWith(heading) ? note.slice(heading.length) : note.split(`\n\n${heading}`, 2)[1];
  return section?.split(/\n[ \t]*\n/, 1)[0].slice(0, 2000).trim() ?? '';
}

export function knownDrugInteractions(current:string,proposed=''):DrugInteractionAlert[]{
 const entries=[...drugEntries(current).map(name=>({name,stage:'current' as const})),...drugEntries(proposed).map(name=>({name,stage:'proposed' as const}))].filter(item=>!nonSystemic.test(item.name));
 return rules.flatMap((rule,i)=>{
  const a=entries.find(row=>rule.a.test(row.name)),b=entries.find(row=>rule.b.test(row.name)&&row!==a);
  if(!a||!b)return [];
  const [severity,source,section,monitoring]=evidence[i];
  return [{first:a.name,second:b.name,risk:rule.risk,action:rule.action,url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid='+rule.setId,
   severity,source:'DailyMed '+source,section,monitoring,relation:[a.stage,b.stage].sort().join('-') as DrugInteractionAlert['relation']}];
 });
}

export function checkProposedMedications(current: string, proposed: string[]): DrugInteractionAlert[] {
  if (!proposed.length) return [];
  return knownDrugInteractions(current, proposed.join('\n')).filter(alert => alert.relation !== 'current-current');
}

export function drugEntries(text:string):string[]{return text.split(/[\n;+]|(?<!\d),|,(?!\d)/).map(value=>value.trim().replace(/^(?:[-•*]|\d+[.)])\s*/, '').replace(/^(?:таб(?:л)?\.?|капс\.?|т\.)\s+/iu,'')).filter(Boolean).slice(0,32);}
export function localDrugCoverage(current:string,proposed=''){
 const entries=[...new Set([...drugEntries(current),...drugEntries(proposed)])];
 const recognized=(value:string)=>!nonSystemic.test(value)&&(rules.some(rule=>rule.a.test(value)||rule.b.test(value))||/^(?:metformin|glucophage|метформин|глюкофаж)(?!\p{L})/iu.test(value));
 return {recognized:entries.filter(recognized),unrecognized:entries.filter(value=>!recognized(value)),ruleCount:rules.length};
}


const isMetformin=(value:string)=>/^(?:metformin|glucophage|метформин|глюкофаж)(?!\p{L})/iu.test(value);
export function checkMedicationRegimen(input:{current:string;proposed?:string;stopped?:string;alternatives?:string;context?:MedicationContext}){
 const stopped=drugEntries(input.stopped??'');
 const retained=(value:string)=>!stopped.some(s=>s.toLowerCase()===value.toLowerCase()||rules.some(r=>(r.a.test(s)&&r.a.test(value))||(r.b.test(s)&&r.b.test(value))));
 const current=drugEntries(input.current).filter(retained).join('\n');
 const proposed=drugEntries(input.proposed??'').filter(retained).join('\n');
 const alerts=knownDrugInteractions(current,proposed);
 // Each option is checked with the baseline separately, not against other alternatives.
 const alternatives=(input.alternatives??'').split(/[\n|;]/).map(s=>s.trim()).filter(Boolean).slice(0,12).map(name=>({
  name,alerts:knownDrugInteractions(current,[proposed,name].filter(Boolean).join('\n')).filter(a=>a.first===name||a.second===name),
 }));
 const context=input.context??{},organAlerts:OrganSafetyAlert[]=[],missing:string[]=[];
 const active=drugEntries([current,proposed].filter(Boolean).join('\n'));
 const metformin=active.find(isMetformin),egfr=context.egfr;
 if(metformin){
  const url='https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=498ac5fc-14be-d36a-e063-6394a90a3012';
  if(egfr==null||!Number.isFinite(egfr)||egfr<0)missing.push('Метформин: СКФ не указана.');
  else if(egfr<30)organAlerts.push({drug:metformin,severity:'contraindicated',risk:'Метформин: СКФ <30 мл/мин/1,73 м² — противопоказание',action:'Проверьте результат; согласно инструкции при такой СКФ терапию прекращают.',url,section:'2.3 / 4'});
  else if(egfr<45){
   const starting=drugEntries(proposed).some(isMetformin)&&!drugEntries(current).some(isMetformin);
   organAlerts.push({drug:metformin,severity:'major',risk:starting?'Метформин: начало при СКФ 30–44 не рекомендуется':'Метформин: при СКФ 30–44 оценить пользу/риск продолжения',action:starting?'Инструкция не рекомендует начинать метформин при такой СКФ.':'Оцените пользу/риск продолжения и динамику СКФ.',url,section:'2.3'});
  }
 }
 const has=(re:RegExp)=>active.some(re.test.bind(re));
 if(has(/^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu)){if(context.potassium==null)missing.push('Спиронолактон: калий не указан.');if(egfr==null)missing.push('Спиронолактон: СКФ не указана.');}
 if(has(/^(?:lithium|литий|лития карбонат)(?!\p{L})/iu)&&egfr==null)missing.push('Литий: СКФ и концентрация лития не указаны.');
 if(has(/^(?:digoxin|дигоксин)(?!\p{L})/iu)&&egfr==null)missing.push('Дигоксин: СКФ не указана.');
 if(context.decompensatedCirrhosis&&has(/^(?:simvastatin|zocor|симвастатин|зокор)(?!\p{L})/iu))organAlerts.push({drug:'Симвастатин',severity:'contraindicated',risk:'Симвастатин противопоказан при декомпенсированном циррозе',action:'Пересмотрите назначение по инструкции.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e59bf31f-d880-4d9e-b6c2-5a18a53718f9',section:'4'});
 if(context.severeHepaticImpairment&&has(/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu))organAlerts.push({drug:'Апиксабан',severity:'major',risk:'Апиксабан при тяжёлой печёночной недостаточности не рекомендуется',action:'Уточните печёночный статус и альтернативы.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e',section:'8.7'});
 return {alerts,alternatives,organAlerts,missing,stopped,coverage:localDrugCoverage(current,proposed)};
}
