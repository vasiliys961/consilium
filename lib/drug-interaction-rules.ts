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
    setId: '8f55d5de-5a4f-4a39-8c84-c53976dd6af9' },
  { a: /^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu,
    b: /^(?:lisinopril|enalapril|ramipril|losartan|valsartan|trimethoprim|лизиноприл|эналаприл|рамиприл|лозартан|валсартан|триметоприм)(?!\p{L})/iu,
    risk: 'Спиронолактон и препараты, повышающие калий · риск гиперкалиемии',
    action: 'Сверьте калий и функцию почек. При сниженной функции почек или изменении терапии может потребоваться более частый контроль.',
    setId: '0fed2822-3a03-4b64-9857-c682fcd462bc' },
  { a: /^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu,
    b: /^(?:ibuprofen|diclofenac|naproxen|ketorolac|ибупрофен|диклофенак|напроксен|кеторолак)(?!\p{L})/iu,
    risk: 'Варфарин и НПВП · риск кровотечения',
    action: 'Сверьте необходимость НПВП и анамнез кровотечений. Обсудите альтернативу и контроль признаков кровотечения.',
    setId: '25146c2b-91dc-452a-8628-23eacd5a9f79' },
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
