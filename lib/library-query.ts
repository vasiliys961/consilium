/** Local retrieval expansion only; these words are not diagnostic conclusions. */
export function expandLibraryKeywords(words: string[], query: string): string[] {
 const terms = new Set(words);
 if(/(?:жидкост|выпот)/i.test(query)&&/(?:л[её]гк|плевр)/i.test(query)){terms.add('pleural');terms.add('effusion');}
 const groups: [RegExp,string[]][] = [
  [/инфаркт|infarct/iu,['infarction','инфаркт']],
  [/стеноз|stenos/iu,['stenosis','стеноз']],
  [/бактери|bacteri/iu,['bacteria','бактери']],
  [/сердц|сердеч|heart/iu,['heart','сердц']],
  [/л[её]гк|lung/iu,['lungs','лёгк','легк']],
  [/п[её]чен|liver/iu,['liver','печен','печён']],
  [/почк|kidney|renal/iu,['kidney','renal','почк']],
  [/кров|blood/iu,['blood','кров']],
  [/сосуд|vessel/iu,['vessels','сосуд']],
  [/пневмон|pneumoni/iu,['pneumonia','пневмон']],
  [/антибиот|антибактери|antibiotic|antimicrobial/iu,['antibiotic','antimicrobial','антибиот']],
  [/лечени|терапи|treatment|therapy/iu,['treatment','therapy','лечени']],
  [/внебольнич|community.acquired/iu,['community acquired']],
  [/нозокоми|госпитальн|hospital.acquired/iu,['hospital acquired','nosocomial']],
  [/эндокардит|endocarditis/iu,['endocarditis','эндокардит']],
  [/диабет|diabet/iu,['diabetes','диабет']],
  [/плевр|pleur/iu,['pleural','плевр']],
  [/выпот|effusion/iu,['effusion','выпот']],
  [/санфорд|sanford/iu,['sanford','санфорд']],
 ];
 for(const [pattern,variants] of groups)if(pattern.test(query))for(const variant of variants)terms.add(variant);
 for(const word of words)if(word.length>=6)terms.add(word.slice(0,5));
 return [...terms];
}
export function librarySemanticScore(similarity:number,min:number,max:number){
 // E5 cosine is not a probability. Requiring 0.8 discarded useful cross-language hits.
 if(!Number.isFinite(similarity)||similarity<0.55)return 0;
 return max>min?(similarity-min)/(max-min):Math.min(1,(similarity-0.5)/0.3);
}
