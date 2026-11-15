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
    b: /^(?:lisinopril|enalapril|ramipril|losartan|valsartan|trimethoprim|лизиноприл|эналаприл|рамиприл|лозартан|валсартан|триметоприм)(?!\p{L})/iu,
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

export type DrugInteractionAlert = { first: string; second: string; risk: string; action: string; url: string };

export const CURRENT_MEDICATIONS_HEADING = 'Current medications reported by the physician:';

export function reportedMedications(note: string): string {
  const heading = `${CURRENT_MEDICATIONS_HEADING}\n`;
  const section = note.startsWith(heading) ? note.slice(heading.length) : note.split(`\n\n${heading}`, 2)[1];
  return section?.split(/\n[ \t]*\n/, 1)[0].slice(0, 2000).trim() ?? '';
}

export function knownDrugInteractions(current: string, proposed = ''): DrugInteractionAlert[] {
  const split = drugEntries;
  const regimen = [...new Map([...split(proposed),...split(current)].map(value=>[value.toLowerCase(),value])).values()];
  return rules.flatMap(rule=>{
    const firstDrugs=regimen.filter(value=>rule.a.test(value));
    const secondDrugs=regimen.filter(value=>rule.b.test(value));
    const url=`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${rule.setId}`;
    return firstDrugs.flatMap(first=>secondDrugs.map(second=>({first,second,risk:rule.risk,action:rule.action,url})));
  });
}

export function checkProposedMedications(current: string, proposed: string[]): DrugInteractionAlert[] {
  if (!proposed.length) return [];
  const ingredients = new Set(proposed.map(name => name.toLowerCase()));
  return knownDrugInteractions(current, proposed.join('\n')).filter(alert =>
    ingredients.has(alert.first.toLowerCase()) || ingredients.has(alert.second.toLowerCase()));
}

export function drugEntries(text:string):string[]{return text.split(/[\n;+]|(?<!\d),|,(?!\d)/).map(value=>value.trim().replace(/^(?:[-•*]|\d+[.)])\s*/, '').replace(/^(?:таб(?:л)?\.?|капс\.?|т\.)\s+/iu,'')).filter(Boolean).slice(0,32);}
export function localDrugCoverage(current:string,proposed=''){
 const entries=[...new Set([...drugEntries(current),...drugEntries(proposed)])];
 return {recognized:entries.filter(value=>rules.some(rule=>rule.a.test(value)||rule.b.test(value))),unrecognized:entries.filter(value=>!rules.some(rule=>rule.a.test(value)||rule.b.test(value))),ruleCount:rules.length};
}
