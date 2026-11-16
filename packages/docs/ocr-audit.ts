/**
 * Deterministic reviewer checklist for clinical OCR; never "correct" source text.
 * Heuristic flags are an aid to physician comparison against the original PDF,
 * not validated OCR confidence scores and not confirmation of the source values.
 */
export type OcrReviewKind='comparison'|'negation'|'dose'|'lab'|'table'|'number-spacing';
export type OcrReviewFlag={kind:OcrReviewKind;page:number|null;sample:string};
const patterns:ReadonlyArray<{kind:OcrReviewKind;pattern:RegExp}>= [
 {kind:'comparison',pattern:/(?:^|[\s:(])(?:[<>≤≥]|(?<!\p{L})(?:не\s+менее|не\s+более|less\s+than|greater\s+than)(?!\p{L}))/iu},
 {kind:'negation',pattern:/(?:^|[^\p{L}])(?:нет|не|без|отрицает|отрицател[ьи]|no|not|denies|negative|without)(?!\p{L})/iu},
 {kind:'dose',pattern:/(?:\b(?:mg|mcg|µg|ug|g|ml|iu|units)\b|(?:мг|мкг|мл|мЕ|МЕ|ед)(?!\p{L}))/iu},
 {kind:'lab',pattern:/(?:\b(?:INR|HbA1c|eGFR|Hb|Na|K\+|glucose|creatinine)\b|(?:МНО|СКФ|гемоглобин|глюкоз[аы]|креатинин|натрий|калий|ммоль\/л)(?!\p{L}))/iu},
 {kind:'number-spacing',pattern:/(?:^|[^\d])(?:-|\+)?\d+\s+[.,]\s*\d+|(?:^|[^\d])(?:-|\+)?\d+\s*[.,]\s+\d+/u},
 {kind:'table',pattern:/\t/u},
];

/** Returns a bounded set of original line fragments for manual checking. */
export function auditClinicalOcrText(text:string,maxFlags=12):OcrReviewFlag[]{
 const results:OcrReviewFlag[]=[];
 const lines=text.split(/\r?\n/);
 let page:number|null=null;
 const used=new Set<string>();
 for(const raw of lines){
  const heading=/^Страница\s+(\d+)\s+·\s+OCR/u.exec(raw);
  if(heading){page=Number(heading[1]);continue;}
  const line=raw.trim();if(!line)continue;
  for(const rule of patterns){
   if(!rule.pattern.test(line))continue;
   const key=(page??0)+':'+rule.kind+':'+line;
   if(used.has(key))continue;
   used.add(key);
   results.push({kind:rule.kind,page,sample:line.slice(0,160)});
   if(results.length>=maxFlags)return results;
  }
 }
 return results;
}

export function ocrReviewSummary(flags:readonly OcrReviewFlag[]):string{
 if(!flags.length)return 'Сверьте распознанный текст с оригиналом, особенно назначения и результаты.';
 const labels:Record<OcrReviewKind,string>={
  comparison:'знаки сравнения',negation:'отрицания',dose:'дозы и единицы',
  lab:'лабораторные значения','number-spacing':'разделители чисел',table:'столбцы таблиц',
 };
 const categories=[...new Set(flags.map(f=>labels[f.kind]))];
 const pages=[...new Set(flags.map(f=>f.page).filter((p):p is number=>p!==null))];
 return 'Проверить по скану: '+categories.join(', ')+(pages.length?' (страницы '+pages.join(', ')+')':'')+'. OCR может искажать критические значения.';
}
