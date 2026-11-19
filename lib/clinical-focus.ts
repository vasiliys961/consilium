/**
 * Small, deterministic clinical focus router. No models, database or worker processes.
 * These are prompt *domains*, not independently invoked specialists or diagnoses.
 * Keep independent safety review in the consilium pipeline regardless of selection.
 */
export interface ClinicalFocus {
  domain: string;
  reason: 'clinical-text' | 'input-modality';
}

type Rule = {
  domain: string;
  text: RegExp;
  modalities?: readonly string[];
};

const RULES: readonly Rule[] = [
  {
    domain: 'cardiology',
    text: /сердечн|карди|ишеми|инфаркт|аритми|фибрилляци|(?:^|[\s(])фп(?=[\s,.;)])|ортопноэ|стенокарди|тропонин|nt.?probnp|cardiac|cardio|heart\s+fail|orthopn|troponin|myocard|arrhythm|atrial\s+fibrill|chest\s+pain/iu,
    modalities: ['ecg'],
  },
  {
    domain: 'pulmonology',
    text: /одыш|гипоксем|сатурац|дыхательн|лёгочн|легочн|тромбоэмбол|\bтэл[аы]\b|пневмон|хобл|астм|каш[елий]|кашл|spo.?2|dyspn|hypox|cough|hemoptys|pulmon|respirat|lung|pneumon|embolism|copd|asthma/iu,
  },
  {
    domain: 'nephrology',
    text: /креатинин|почечн|почк|олигури|анури|альбуминури|протеинури|гематури|(?:^|[\s(])скф(?=[\s,.;)])|renal|creatinin|kidney|nephr|\begfr\b|\baki\b|\bckd\b|proteinuri|hematuri/iu,
  },
  {
    domain: 'clinical pharmacology',
    text: /лекарств|препарат|дозиров|доза|фуросемид|антикоагулянт|взаимодейств|метформин|ингибитор|побочн|drug|medication|prescrib|pharmacol|dosage|interaction|furosemide|metformin|anticoagula/iu,
  },
  {
    domain: 'infectious diseases',
    text: /лихорад|сепсис|инфекци|бактерием|менингит|антибиотик|fever|sepsis|infectio|bacteremi|meningit|antibiotic/iu,
  },
  {
    domain: 'neurology',
    text: /инсульт|очагов.*неврол|парез|эпилеп|судорог|энцефал|головн.*боль|stroke|seizure|neurolog|epilep|encephal|paresis/iu,
  },
  {
    domain: 'endocrinology',
    text: /диабет|гипогликем|гипергликем|кетоацидоз|щитовидн|тиреотокс|diabet|hypoglyc|hyperglyc|ketoacidos|thyroid|thyrotox/iu,
  },
  {
    domain: 'radiology and medical imaging',
    text: /\b(?:ct|mri|dicom)\b|\b(?:кт|мрт)\b|рентген|томограф|снимк|radiograph|imaging|computed\s+tomograph/iu,
    modalities: ['radiology', 'dicom', 'ct', 'mri'],
  },
  {
    domain: 'clinical genetics',
    text: /генетик|геном|вариант.*ген|фармакоген|\bvcf\b|genetic|genomic|variant|pharmacogen/iu,
    modalities: ['genetics'],
  },
  {
    domain: 'gastroenterology and hepatology',
    text: /печен|гепат|цирроз|желтух|панкреат|билирубин|liver|hepat|cirrho|jaundice|pancreat|bilirubin/iu,
  },
  {
    domain: 'hematology',
    text: /анеми|нейтропени|лейкеми|лимфом|коагулопат|тромбоцитопен|anemi|neutropeni|leukemi|lymphoma|coagulopath|thrombocytopen/iu,
  },
  {
    domain: 'obstetrics and gynecology',
    text: /беремен|послеродов|маточн|преэклампси|pregnan|postpartum|uterine|preeclamps/iu,
  },
];

const MAX_DOMAINS = 5;

/**
 * No extra model calls: these domains are provided to the existing role prompts.
 * Preserve stable deterministic priority order and keep note-derived focus concise.
 */
export function chooseClinicalFocus(note: string, modalities: readonly string[]): ClinicalFocus[] {
  const normalizedModalities = new Set(modalities.map(item => item.toLowerCase()));
  const selected: ClinicalFocus[] = [{ domain: 'internal medicine', reason: 'clinical-text' }];
  for (const rule of RULES) {
    const fromModality = rule.modalities?.some(modality => normalizedModalities.has(modality)) ?? false;
    if (fromModality || rule.text.test(note)) {
      selected.push({ domain: rule.domain, reason: rule.text.test(note) ? 'clinical-text' : 'input-modality' });
      if (selected.length >= MAX_DOMAINS + 1) break;
    }
  }
  return selected;
}

export function clinicalFocusText(note: string, modalities: readonly string[]): string {
  return chooseClinicalFocus(note, modalities).map(item => item.domain).join(', ');
}
