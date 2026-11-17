// Clinical profiles adapted from Doctor Opus Global's chat-specialists and prompts.
export const SPECIALIST_PROFILES = [
  { id: 'universal', label: 'Терапия', focus: 'Use an internal medicine and cross-specialty perspective. Identify the problem that drives immediate management, then explain the relevant differential or treatment branches. Integrate comorbidity, polypharmacy, organ function and outpatient versus inpatient disposition when those affect the decision.' },
  { id: 'pulmonology', label: 'Пульмонология', focus: 'Differentiate respiratory distress severity from chronic symptoms. Use respiratory rate, oxygen saturation, airway findings, imaging and chronic lung disease context. Identify dangerous features that require urgent in-person evaluation. Consider asthma, COPD, infections and cardiopulmonary mimics without treating a symptom-based suggestion as a confirmed diagnosis.' },
  { id: 'cardiology', label: 'Кардиология', focus: 'Separate stability, hemodynamics, rhythm and ischemia. For an arrhythmia, use the documented rhythm or ECG descriptors and distinguish acute rate or rhythm control from long-term strategy and thromboembolic risk. For heart failure, distinguish congestion, perfusion, ejection-fraction phenotype and medication eligibility. Use risk tools only with their required inputs.' },
  { id: 'neurology', label: 'Неврология', focus: 'Start with localization, onset and time course. For acute deficits, prioritize time-sensitive vascular, infectious or compressive causes and the investigation that changes urgent management. When comparing etiologies, tie each to discriminating examination or imaging findings and distinguish acute intervention from secondary prevention.' },
  { id: 'endocrinology', label: 'Эндокринология', focus: 'Distinguish primary from secondary dysfunction, screening from confirmation, and acute metabolic decompensation from outpatient management. Explain how sampling time, medication effects or pregnancy alter interpretation. For treatment, state the phenotype, organ-function constraints, monitoring target and reassessment interval when known.' },
  { id: 'radiology', label: 'Лучевая диагностика', focus: 'Reason from the described modality, technique, comparison studies and actual reported findings. Connect location, pattern and important negatives to the differential. Recommend an additional modality, sequence, contrast phase or follow-up only if it changes management. Use a reporting classification only when the necessary descriptors are present.' },
  { id: 'oncology', label: 'Онкология', focus: 'Separate suspected from tissue-confirmed malignancy, then identify histology, stage, biomarkers, performance status and treatment intent. Explain which missing test changes the line of therapy, what options depend on eligibility, and which toxicities require monitoring or urgent reassessment.' },
  { id: 'hematology', label: 'Гематология', focus: 'Use CBC indices, differential, trends and smear findings to separate production defects from loss, destruction or sequestration. For cytopenia or coagulopathy, connect bleeding, thrombosis or infection risk to immediate disposition. Separate confirmatory testing from thresholds for transfusion or other intervention.' },
  { id: 'gynecology', label: 'Акушерство и гинекология', focus: 'Determine pregnancy status, gestational timing or reproductive stage where relevant. Prioritize time-sensitive obstetric, bleeding and pelvic-pain causes. Tie investigations to the decision and distinguish pregnancy-compatible treatments, fertility goals and follow-up conditions.' },
  { id: 'rheumatology', label: 'Ревматология', focus: 'Separate disease activity from irreversible damage, infection, drug toxicity and common mimics. Stratify systemic autoimmune disease by organ involvement and severity. In lupus, when relevant, distinguish skin and joint disease, major organ involvement and nephritis. Specify what changes induction, maintenance, glucocorticoid taper and surveillance.' },
  { id: 'traumatology', label: 'Травматология и ортопедия', focus: 'Connect mechanism and examination to stability, displacement and function. Identify neurovascular compromise, compartment syndrome or an open injury early when supported. Explain what imaging or finding changes immobilization, weight bearing, referral or operative assessment, and when to reassess.' },
  { id: 'gastroenterology', label: 'Гастроэнтерология', focus: 'Localize the likely GI or hepatic process using chronology, bleeding pattern, biochemistry, imaging and endoscopy as applicable. Distinguish the need for urgent stabilization from diagnostic workup and definitive management. State endoscopy or referral triggers and medication constraints in liver disease.' },
  { id: 'dermatology', label: 'Дерматология', focus: 'Use lesion morphology, distribution, evolution and exposures to separate the leading diagnosis from its important mimics. Identify when dermoscopy, sampling, biopsy or urgent examination changes management. Match treatment to site, extent, severity and contraindications, with a clear point for reassessment.' },
  { id: 'pediatrics', label: 'Педиатрия', focus: 'Use age, weight, developmental stage and age-specific reference ranges. Assess feeding, hydration, respiratory work and systemic signs when relevant. Distinguish outpatient observation from urgent referral. Any verified pediatric regimen must distinguish dose per administration from dose per day, weight basis and applicable maximum.' },
  { id: 'longevai', label: 'Здоровое долголетие', focus: 'Start with measurable health outcomes and baseline risk. Prioritize prevention, exercise, nutrition, sleep and preservation of function. Explain whether a biomarker or wearable result changes management. Distinguish established interventions from surrogate or experimental evidence, and evaluate harms of supplements, hormones or off-label regimens without treating them as standard prevention.' },
  { id: 'hua_tuo_master', label: 'Традиционная китайская медицина', focus: 'Explain classical Chinese medical concepts in their historical framework and distinguish them from contemporary diagnoses. For acupuncture, herbal preparations or other interventions, state the exact proposed use, evidence for clinical outcomes, toxicity, contamination, interactions and pregnancy considerations when relevant. Preserve timely evaluation and established care.' },
] as const;

export type SpecialistProfile = (typeof SPECIALIST_PROFILES)[number];
export type SpecialistId = SpecialistProfile['id'];

export const QUESTION_LIMIT = 3000;
export const HISTORY_LIMIT = 9000;
export const TRANSCRIPT_LIMIT = QUESTION_LIMIT + HISTORY_LIMIT + 100;
export const QUESTION_MARKER = '[QUESTION]\n';
export const ANSWER_MARKER = '\n\n[ANSWER]\n';

export function consultationTranscript(previous: string, question: string) {
  let history = previous;
  if (history.length > HISTORY_LIMIT) {
    const start = history.indexOf('\n\n' + QUESTION_MARKER, history.length - HISTORY_LIMIT);
    if (start !== -1) history = history.slice(start + 2);
    else {
      const lastQuestion = history.lastIndexOf('\n\n' + QUESTION_MARKER);
      const lastTurn = history.slice(lastQuestion === -1 ? 0 : lastQuestion + 2);
      const answerStart = lastTurn.indexOf(ANSWER_MARKER);
      history = answerStart === -1 ? '' : lastTurn.slice(0, HISTORY_LIMIT);
    }
  }
  return history ? history + '\n\n' + QUESTION_MARKER + question.trim() : question.trim();
}

export function latestQuestion(transcript: string) {
  const lines = transcript.trim().split('\n');
  const question = lines.slice(lines.lastIndexOf(QUESTION_MARKER.trim()) + 1);
  return question.includes(ANSWER_MARKER.trim()) ? '' : question.join('\n').trim();
}
