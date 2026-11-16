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
  { a:/^(?:moxifloxacin|avelox|моксифлоксацин|авелокс)(?!\p{L})/iu,
    b:/^(?:amiodarone|cordarone|sotalol|амиодарон|кордарон|соталол)(?!\p{L})/iu,
    risk:'Моксифлоксацин и антиаритмик III класса · удлинение QT и риск torsade de pointes',
    action:'По инструкции избегать совместного применения; оценить альтернативный антибиотик и исходные ЭКГ/электролиты.',
    setId:'1e6bc886-eec9-4cd8-be78-7563817457f2' },
  { a:/^(?:moxifloxacin|avelox|моксифлоксацин|авелокс)(?!\p{L})/iu,
    b:/^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu,
    risk:'Моксифлоксацин и варфарин · возможно усиление антикоагуляции и кровотечение',
    action:'Проверить МНО и симптомы кровотечения, скорректировать наблюдение по клинической необходимости.',
    setId:'1e6bc886-eec9-4cd8-be78-7563817457f2' },
  { a:/^(?:moxifloxacin|avelox|моксифлоксацин|авелокс)(?!\p{L})/iu,
    b:/^(?:prednisone|prednisolone|methylprednisolone|dexamethasone|преднизон|преднизолон|метилпреднизолон|дексаметазон)(?!\p{L})/iu,
    risk:'Моксифлоксацин и системный ГКС · повышенный риск тендинита и разрыва сухожилий',
    action:'Оценить необходимость фторхинолона и альтернативу, особенно у пациентов старше 60 лет; обсудить симптомы поражения сухожилия.',
    setId:'1e6bc886-eec9-4cd8-be78-7563817457f2' },
  { a:/^(?:clarithromycin|кларитромицин|клацид)(?!\p{L})/iu,
    b:/^(?:colchicine|колхицин)(?!\p{L})/iu,
    risk:'Кларитромицин и колхицин · риск тяжёлой токсичности колхицина',
    action:'При почечной или печёночной недостаточности сочетание противопоказано; в иных ситуациях проверить инструкцию и альтернативный антибиотик.',
    setId:'fa69ea92-0b41-43fb-918f-ed80e0dedf04' },
  { a:/^(?:clarithromycin|кларитромицин|клацид)(?!\p{L})/iu,
    b:/^(?:lovastatin|мевакор|ловастатин)(?!\p{L})/iu,
    risk:'Кларитромицин и ловастатин · риск миопатии/рабдомиолиза',
    action:'Сочетание противопоказано по инструкции; обсудить альтернативный антибиотик или временную паузу статина по решению врача.',
    setId:'fa69ea92-0b41-43fb-918f-ed80e0dedf04' },
  { a:/^(?:clarithromycin|кларитромицин|клацид)(?!\p{L})/iu,
    b:/^(?:lurasidone|latuda|луразидон|латуда)(?!\p{L})/iu,
    risk:'Кларитромицин и луразидон · значительное повышение экспозиции луразидона',
    action:'Сочетание противопоказано по инструкции; выбрать альтернативный антибактериальный препарат или другую тактику.',
    setId:'fa69ea92-0b41-43fb-918f-ed80e0dedf04' },
  { a:/^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu,
    b:/^(?:potassium chloride|kcl|калия хлорид|калий хлорид)(?!\p{L})/iu,
    risk:'Спиронолактон и добавка калия · риск тяжёлой гиперкалиемии',
    action:'Уточнить необходимость добавки калия, исходные K+ и СКФ; при СН инструкция обычно рекомендует отменять добавки калия при начале спиронолактона.',
    setId:'0fed2822-3a03-4b64-9857-c682fcd462bc' },
  { a:/^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu,
    b:/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu,
    risk:'Варфарин и апиксабан · риск кровотечения при нежелательном одновременном приёме',
    action:'Уточните, является ли схема переходом с варфарина на апиксабан; проверьте план перехода и МНО. Не считайте отдельные альтернативы совместным назначением.',
    setId:'7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e' },
  { a:/^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu,
    b:/^(?:rivaroxaban|xarelto|ривароксабан|ксарелто)(?!\p{L})/iu,
    risk:'Варфарин и ривароксабан · риск кровотечения при неоправданном совмещении',
    action:'Уточните направление и сроки перехода на другой антикоагулянт; некоторые схемы перехода требуют ограниченного перекрытия. Проверяйте протокол перехода, МНО и признаки кровотечения.',
    setId:'10db92f9-2300-4a80-836b-673e1ae91610' },
  { a:/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu,
    b:/^(?:rivaroxaban|xarelto|ривароксабан|ксарелто)(?!\p{L})/iu,
    risk:'Апиксабан и ривароксабан · риск кровотечения при одновременном применении двух прямых антикоагулянтов',
    action:'Уточните, не являются ли препараты альтернативами или последовательным переходом. Если предполагается совместный приём, требуется пересмотр схемы.',
    setId:'7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e' },
  { a:/^(?:rivaroxaban|xarelto|ривароксабан|ксарелто)(?!\p{L})/iu,
    b:/^(?:ibuprofen|diclofenac|naproxen|ketorolac|celecoxib|ибупрофен|диклофенак|напроксен|кеторолак|целекоксиб)(?!\p{L})/iu,
    risk:'Ривароксабан и системный НПВП · повышенный риск кровотечения',
    action:'Проверить необходимость и длительность НПВП, кровопотерю и альтернативы; мониторировать признаки кровотечения.',
    setId:'10db92f9-2300-4a80-836b-673e1ae91610' },
  { a:/^(?:rivaroxaban|xarelto|ривароксабан|ксарелто)(?!\p{L})/iu,
    b:/^(?:aspirin|clopidogrel|аспирин|ацетилсалициловая кислота|клопидогрел|клопидогрель)(?!\p{L})/iu,
    risk:'Ривароксабан и антиагрегант · повышенный риск кровотечения',
    action:'Уточнить показание, дозы и срок комбинированной терапии; не считать автоматически противопоказанием при обоснованном назначении.',
    setId:'10db92f9-2300-4a80-836b-673e1ae91610' },
  { a:/^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu,
    b:/^(?:aspirin|clopidogrel|аспирин|ацетилсалициловая кислота|клопидогрел|клопидогрель)(?!\p{L})/iu,
    risk:'Варфарин и антиагрегант · повышенный риск кровотечения',
    action:'Сверить показание и продолжительность комбинированной антитромботической терапии; оценить МНО и клиническое кровотечение.',
    setId:'bd6ea120-5d1c-4815-94f2-81e28dc6b7a9' },
] as const;

export type MedicationSeverity='contraindicated'|'major'|'monitor';
export type MedicationContext={egfr?:number|null;potassium?:number|null;ageYears?:number|null;qtcMs?:number|null;decompensatedCirrhosis?:boolean;severeHepaticImpairment?:boolean};
export type DrugInteractionAlert={first:string;second:string;risk:string;action:string;url:string;severity:MedicationSeverity;relation:'current-current'|'current-proposed'|'proposed-proposed';source:string;section:string;monitoring:string;mechanism:string;conditions:string};
export type OrganSafetyAlert={drug:string;risk:string;action:string;severity:MedicationSeverity;url:string;section:string};
const evidence=[
 ['contraindicated','VIAGRA · 2023-11-17','4.1','АД, время последнего приёма нитратов','Синергичное усиление NO/cGMP-вазодилатации','Системные нитраты, включая приём по требованию'],
 ['contraindicated','SIMVASTATIN · 2026-04-08','4 / 7.1','Мышечные симптомы; КФК по показаниям','Ингибирование метаболизма симвастатина, увеличение экспозиции','Системные сильные ингибиторы CYP3A4'],
 ['monitor','ALDACTONE · 2025-11-28','5.1 / 7.1','K+, СКФ в течение недели после начала или изменения дозы','Снижение экскреции калия на фоне блокады РААС','Не универсальное противопоказание: риск зависит от калия и функции почек'],
 ['major','WARFARIN · 2026-08-10','7.3','Кровотечение, МНО согласно плану','Аддитивное влияние на гемостаз и повреждение слизистой ЖКТ','Системные НПВП; местные/глазные формы отдельно'],
 ['contraindicated','VIAGRA · 2023-11-17','4.3','АД','Усиление вазодилатации через путь NO/cGMP','Риоцигуат и системный ингибитор PDE5'],
 ['major','CLARITHROMYCIN · 2025-11-01','7','МНО, признаки кровотечения','Потенциальное усиление антикоагуляции','При начале/отмене макролида'],
 ['major','ELIQUIS · 2025-08-29','5.2 / 7.3','Признаки кровотечения, Hb по показаниям','Аддитивное геморрагическое действие','Системные НПВП'],
 ['major','ELIQUIS · 2025-08-29','7.3','Признаки кровотечения','Аддитивное антитромботическое действие','Сочетание может иметь показания, важны срок и риск кровотечения'],
 ['major','LITHIUM · 2026-10-23','7.1','Концентрация лития, СКФ','Снижение почечного клиренса лития','НПВП системного действия'],
 ['major','LITHIUM · 2026-10-23','7.1','Концентрация лития, СКФ','Снижение почечного выведения лития','Ингибитор АПФ или БРА'],
 ['major','AMIODARONE · 2026','7','Дигоксин, ЭКГ, K+, СКФ','Рост экспозиции дигоксина за счёт ингибирования транспортёров','Системное совместное назначение'],
 ['major','ALDACTONE · 2025-11-28','7.1','K+, СКФ','Аддитивное снижение выведения калия','Нарушение функции почек существенно повышает риск'],
 ['major','ELIQUIS · 2025-08-29','7.2','Клинические признаки тромбоэмболии','Индукция CYP3A4/P-gp уменьшает экспозицию апиксабана','Сильные индукторы, включая рифампицин'],
 ['major','MOXIFLOXACIN · 2025-09','5.6 / 7.5','QTc, K+, Mg2+, ЭКГ по показаниям','Аддитивное удлинение реполяризации и риск желудочковой аритмии','Системный моксифлоксацин и антиаритмик класса III: избегать'],
 ['major','MOXIFLOXACIN · 2025-09','7.2','МНО, признаки кровотечения','Возможно усиление эффекта варфарина при антибиотикотерапии','Контроль МНО при начале и прекращении курса'],
 ['major','MOXIFLOXACIN · 2025-09','5.2 / 8.5','Боль, отёк сухожилий; возраст','Сочетание двух факторов риска тендинопатии','Системный ГКС, риск выше после 60 лет'],
 ['major','CLARITHROMYCIN · 2025-12','4.4 / 7','Токсичность колхицина, почечная/печёночная функция','Ингибирование CYP3A4/P-gp повышает экспозицию колхицина','Противопоказано при почечной или печёночной недостаточности'],
 ['contraindicated','CLARITHROMYCIN · 2025-12','4.5 / 7','Мышечные симптомы, КФК по показаниям','Ингибирование CYP3A4 повышает экспозицию ловастатина','Системное сочетание противопоказано'],
 ['contraindicated','CLARITHROMYCIN · 2025-12','4.7 / 7','Симптомы нежелательных реакций','Ингибирование CYP3A4 повышает концентрацию луразидона','Системное сочетание противопоказано'],
 ['major','ALDACTONE · 2025-11-28','5.1 / 7.1','K+, СКФ','Уменьшение почечной экскреции калия','Добавки калия и калийсодержащие заменители соли'],
 ['major','ELIQUIS · 2025-08-29','5.2 / 7.3','Признаки кровотечения, МНО при переходе с варфарина','Аддитивное нарушение гемостаза','Проверить направление и сроки перехода; не считать два альтернативных препарата совместно принимаемыми'],
 ['major','XARELTO · 2026-03','2.3 / 7.4','МНО, кровотечение; время перехода','Аддитивное нарушение гемостаза','Контекст перехода на/с варфарина принципиален; в инструкции есть особые схемы переключения'],
 ['major','ELIQUIS · 2025-08-29','5.2 / 7.3','Кровотечение','Аддитивная антикоагуляция','Два прямых антикоагулянта не являются обычным совместным режимом'],
 ['major','XARELTO · 2026-03','7.4','Признаки кровотечения, Hb при показаниях','Аддитивное влияние системных НПВП на гемостаз','Системные НПВП; местные формы проверяются отдельно'],
 ['major','XARELTO · 2026-03','7.4','Признаки кровотечения','Аддитивное влияние на гемостаз','Сочетания с антиагрегантами могут быть показаны, требуется индивидуальная оценка'],
 ['major','WARFARIN · 2026-08-10','7.3','МНО, кровотечение','Аддитивное антитромботическое действие','Показание и срок сопутствующей антитромботической терапии'],
] as const;
const nonSystemic=/(?:глазн|офтальм|наружн|мазь|гель|крем|ophthalmic|topical|cutaneous|eye drops)/iu;

export const CURRENT_MEDICATIONS_HEADING = 'Current medications reported by the physician:';

export function reportedMedications(note: string): string {
  const heading = `${CURRENT_MEDICATIONS_HEADING}\n`;
  const section = note.startsWith(heading) ? note.slice(heading.length) : note.split(`\n\n${heading}`, 2)[1];
  return section?.split(/\n[ \t]*\n/, 1)[0].slice(0, 2000).trim() ?? '';
}

/** A complete local match enumeration; two NSAIDs in one regimen must not collapse into one alert. */
export function knownDrugInteractions(current:string,proposed=''):DrugInteractionAlert[]{
 const entries=[...drugEntries(current).map(name=>({name,stage:'current' as const})),...drugEntries(proposed).map(name=>({name,stage:'proposed' as const}))].filter(item=>!nonSystemic.test(item.name));
 const seen=new Set<string>();
 return rules.flatMap((rule,i)=>{
  const [severity,source,section,monitoring,mechanism,conditions]=evidence[i];
  const matched:DrugInteractionAlert[]=[];
  for(const a of entries.filter(row=>rule.a.test(row.name)))
   for(const b of entries.filter(row=>rule.b.test(row.name))){
    if(a===b)continue;
    const label=(value:string)=>value.toLocaleLowerCase().replace(/\s+\d.*$/,'').trim();
    const key=i+':'+label(a.name)+':'+label(b.name);
    if(seen.has(key))continue;
    seen.add(key);
    matched.push({first:a.name,second:b.name,risk:rule.risk,action:rule.action,
     url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid='+rule.setId,
     severity,source:'DailyMed '+source,section,monitoring,mechanism,conditions,
     relation:[a.stage,b.stage].sort().join('-') as DrugInteractionAlert['relation']});
   }
  return matched;
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
 const canonical=(value:string)=>{
  const aliases:[string,RegExp][]=[
   ['moxifloxacin',/^(?:moxifloxacin|avelox|моксифлоксацин|авелокс)(?!\p{L})/iu],
   ['amiodarone',/^(?:amiodarone|cordarone|амиодарон|кордарон)(?!\p{L})/iu],
   ['sotalol',/^(?:sotalol|соталол)(?!\p{L})/iu],
   ['clarithromycin',/^(?:clarithromycin|кларитромицин|клацид)(?!\p{L})/iu],
   ['colchicine',/^(?:colchicine|колхицин)(?!\p{L})/iu],
   ['lovastatin',/^(?:lovastatin|мевакор|ловастатин)(?!\p{L})/iu],
   ['lurasidone',/^(?:lurasidone|latuda|луразидон|латуда)(?!\p{L})/iu],
   ['prednisone',/^(?:prednisone|преднизон)(?!\p{L})/iu],
   ['prednisolone',/^(?:prednisolone|преднизолон)(?!\p{L})/iu],
   ['potassium chloride',/^(?:potassium chloride|kcl|калия хлорид|калий хлорид)(?!\p{L})/iu],
   ['warfarin',/^(?:warfarin|coumadin|варфарин)(?!\p{L})/iu],
   ['ibuprofen',/^(?:ibuprofen|ибупрофен)(?!\p{L})/iu],
   ['naproxen',/^(?:naproxen|напроксен)(?!\p{L})/iu],
   ['diclofenac',/^(?:diclofenac|диклофенак)(?!\p{L})/iu],
   ['ketorolac',/^(?:ketorolac|кеторолак)(?!\p{L})/iu],
   ['celecoxib',/^(?:celecoxib|целекоксиб)(?!\p{L})/iu],
   ['apixaban',/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu],
   ['rivaroxaban',/^(?:rivaroxaban|xarelto|ривароксабан|ксарелто)(?!\p{L})/iu],
   ['spironolactone',/^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu],
   ['sildenafil',/^(?:sildenafil|viagra|силденафил|виагра)(?!\p{L})/iu],
   ['simvastatin',/^(?:simvastatin|zocor|симвастатин|зокор)(?!\p{L})/iu],
   ['metformin',/^(?:metformin|glucophage|метформин|глюкофаж)(?!\p{L})/iu],
  ];
  return aliases.find(([,pattern])=>pattern.test(value))?.[0]??value.trim().toLowerCase().replace(/\s+\d.*$/,'');
 };
 const retained=(value:string)=>!stopped.some(s=>canonical(s)===canonical(value));
 const current=drugEntries(input.current).filter(retained).join('\n');
 const proposed=drugEntries(input.proposed??'').filter(retained).join('\n');
 const alerts=knownDrugInteractions(current,proposed);
 // Each option is checked with the baseline separately, not against other alternatives.
 // An alternative is a separate complete option, not an addition to another proposed option.
 // Option rows may contain multiple simultaneously intended ingredients joined by "+".
 const alternatives=(input.alternatives??'').split(/[\n|;]/).map(s=>s.trim()).filter(Boolean).slice(0,12).map(name=>{
  const optionDrugs=drugEntries(name);
  const alerts=knownDrugInteractions(current,optionDrugs.join('\n')).filter(a=>
   optionDrugs.some(drug=>a.first===drug||a.second===drug));
  return {name,alerts};
 });
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
 const spironolactone=active.find(value=>/^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu.test(value));
 if(spironolactone){
  if(context.potassium==null||!Number.isFinite(context.potassium))missing.push('Спиронолактон: калий не указан.');
  else if(context.potassium>=5.5)organAlerts.push({drug:spironolactone,severity:'contraindicated',risk:'Спиронолактон: K+ ≥5,5 ммоль/л — выраженная гиперкалиемия; инструкция противопоказует препарат при гиперкалиемии, но не задаёт именно этот числовой порог',action:'Повторно проверить K+, ЭКГ и функцию почек; оценить коррекцию гиперкалиемии и необходимость изменения терапии.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0fed2822-3a03-4b64-9857-c682fcd462bc',section:'4 / 5.1'});
  else if(context.potassium>5&&drugEntries(proposed).some(value=>/^(?:spironolactone|aldactone|спиронолактон|верошпирон)(?!\p{L})/iu.test(value)))organAlerts.push({drug:spironolactone,severity:'major',risk:'Начало спиронолактона при K+ >5,0 требует пересмотра риска гиперкалиемии (данные инструкции для СН)',action:'Уточните показание и исходные K+/СКФ до назначения; значение для СН не следует автоматически переносить на все показания.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=0fed2822-3a03-4b64-9857-c682fcd462bc',section:'2.2 / 5.1'});
  if(egfr==null)missing.push('Спиронолактон: СКФ не указана.');
 }
 if(has(/^(?:lithium|литий|лития карбонат)(?!\p{L})/iu)&&egfr==null)missing.push('Литий: СКФ и концентрация лития не указаны.');
 if(has(/^(?:digoxin|дигоксин)(?!\p{L})/iu)&&egfr==null)missing.push('Дигоксин: СКФ не указана.');
 const impairedRenal=egfr!=null&&Number.isFinite(egfr)&&egfr>=0&&egfr<60;
 if((impairedRenal||context.severeHepaticImpairment||context.decompensatedCirrhosis)&&has(/^(?:colchicine|колхицин)(?!\p{L})/iu)&&has(/^(?:clarithromycin|кларитромицин|клацид)(?!\p{L})/iu)){
  for(const alert of alerts)if(alert.risk.includes('колхицина')){alert.severity='contraindicated';alert.conditions='Почечная или печёночная недостаточность подтверждена';}
 }
 if(has(/^(?:moxifloxacin|avelox|моксифлоксацин|авелокс)(?!\p{L})/iu)){
  if(context.qtcMs!=null&&Number.isFinite(context.qtcMs)&&context.qtcMs>=500)organAlerts.push({drug:'Моксифлоксацин',severity:'major',risk:'Моксифлоксацин при выраженном удлинении QTc — риск torsade de pointes',action:'По инструкции избегать моксифлоксацина при известном удлинении QT; оценить альтернативу и электролиты.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1e6bc886-eec9-4cd8-be78-7563817457f2',section:'5.6'});
  if(context.ageYears!=null&&Number.isFinite(context.ageYears)&&context.ageYears>60)organAlerts.push({drug:'Моксифлоксацин',severity:'monitor',risk:'Возраст >60 лет: повышен риск тендинита и разрыва сухожилий, особенно с ГКС',action:'Уточните предшествующее поражение сухожилий, использование системных ГКС и возможные альтернативы фторхинолону.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=1e6bc886-eec9-4cd8-be78-7563817457f2',section:'5.2 / 8.5'});
  if(alerts.some(alert=>alert.risk.includes('удлинение QT'))&&context.qtcMs==null)missing.push('Моксифлоксацин + антиаритмик: исходная QTc не указана (сочетание всё равно рекомендуется избегать).');
 }
 if(context.decompensatedCirrhosis&&has(/^(?:simvastatin|zocor|симвастатин|зокор)(?!\p{L})/iu))organAlerts.push({drug:'Симвастатин',severity:'contraindicated',risk:'Симвастатин противопоказан при декомпенсированном циррозе',action:'Пересмотрите назначение по инструкции.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=e59bf31f-d880-4d9e-b6c2-5a18a53718f9',section:'4'});
 if(context.severeHepaticImpairment&&has(/^(?:apixaban|eliquis|апиксабан|эликвис)(?!\p{L})/iu))organAlerts.push({drug:'Апиксабан',severity:'major',risk:'Апиксабан при тяжёлой печёночной недостаточности не рекомендуется',action:'Уточните печёночный статус и альтернативы.',url:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=7be1f4c1-bb2f-4ded-ae9a-515d2a22f93e',section:'8.7'});
 return {alerts,alternatives,organAlerts,missing,stopped,coverage:localDrugCoverage(current,proposed)};
}
