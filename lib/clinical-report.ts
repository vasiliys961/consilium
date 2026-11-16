/** Shared contract for physician-facing reasoning; every entry remains an unsigned proposal. */
import type { DrugInteractionAlert, OrganSafetyAlert, localDrugCoverage } from './drug-interaction-rules.ts';
import type { CaseTask } from './case-plan.ts';
import { separateMissingFromOpposing } from './clinical-integrity.ts';

export interface ClinicalReport {
  problem: string;
  facts: string[];
  differential: Array<{ hypothesis: string; supporting: string[]; opposing: string[]; missing: string[]; dangerous: boolean }>;
  investigations: Array<{ test: string; rationale: string; priority: string }>;
  management: Array<{ option: string; conditions: string[]; safetyChecks: string[]; monitoring: string[]; sources?: string[]; medications?: string[]; stoppedMedications?: string[]; localInteractions?: DrugInteractionAlert[]; localCoverage?: ReturnType<typeof localDrugCoverage>; localOrganAlerts?: OrganSafetyAlert[]; localSafetyGaps?:string[] }>;
  medicationSafety?: { gaps: string[]; alerts: Array<{ combination: string; risk: string; patientFactor: string; mitigation: string; sources: string[] }> };
  tactics?: { nextStep: string; timing: string; reassess: string; escalate: string };
  questions: string[];
  limitations: string[];
  followUp: string[];
}

const jsonString = { type: 'string' };
const jsonArray = (items: Record<string, unknown>) => ({ type: 'array', items });
const jsonStrings = jsonArray(jsonString);
const jsonObject = (properties: Record<string, unknown>) => ({
  type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});

/** Output contract sent to the model gateway. Local interaction checks are added after parsing. */
export function clinicalDraftSchema(task?: CaseTask) {
  const report = jsonObject({
    problem: jsonString,
    facts: jsonStrings,
    differential: jsonArray(jsonObject({
      hypothesis: jsonString, supporting: jsonStrings, opposing: jsonStrings, missing: jsonStrings, dangerous: { type: 'boolean' },
    })),
    investigations: jsonArray(jsonObject({ test: jsonString, rationale: jsonString, priority: jsonString })),
    management: jsonArray(jsonObject({
      option: jsonString, medications: jsonStrings, stoppedMedications: jsonStrings, conditions: jsonStrings,
      safetyChecks: jsonStrings, monitoring: jsonStrings, sources: jsonStrings,
    })),
    tactics: jsonObject({ nextStep: jsonString, timing: jsonString, reassess: jsonString, escalate: jsonString }),
    questions: jsonStrings,
    limitations: jsonStrings,
    followUp: jsonStrings,
    ...(task === 'management' ? { medicationSafety: jsonObject({
      alerts: jsonArray(jsonObject({
        combination: jsonString, risk: jsonString, patientFactor: jsonString, mitigation: jsonString, sources: jsonStrings,
      })),
      gaps: jsonStrings,
    }) } : {}),
  });
  return jsonObject({
    studyReports: jsonArray(jsonObject({
      source: jsonString, modality: jsonString,
      description: jsonArray(jsonObject({ label: jsonString, text: jsonString })),
      conclusion: jsonString, limitations: jsonStrings,
    })),
    summary: jsonString,
    statements: jsonArray(jsonObject({ text: jsonString, source: { type: ['string', 'null'] } })),
    ...(task === 'clinical' || task === 'management' ? { report } : {}),
  });
}

const line = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g,' ').trim().slice(0,1600) : '';
const list = (value: unknown) => Array.isArray(value) ? value.map(line).filter(Boolean).slice(0,16) : [];
const rows = (value: unknown): Record<string,unknown>[] => Array.isArray(value) ? value.filter((row): row is Record<string,unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row)).slice(0,12) : [];
export function readClinicalReport(raw: unknown, allowed: ReadonlySet<string> = new Set()): ClinicalReport | undefined {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
 const report = raw as Record<string, unknown>;
 const problem = line(report.problem);
 if (!problem) return undefined;
 const rawTactics = report.tactics && typeof report.tactics === 'object' && !Array.isArray(report.tactics)
  ? report.tactics as Record<string, unknown> : {};
 const tactics = {nextStep:line(rawTactics.nextStep), timing:line(rawTactics.timing), reassess:line(rawTactics.reassess), escalate:line(rawTactics.escalate)};
 const safety = report.medicationSafety && typeof report.medicationSafety === 'object' ? report.medicationSafety as Record<string,unknown> : undefined;
 const medicationSafety = safety ? {gaps:list(safety.gaps),alerts:rows(safety.alerts).flatMap(row=>{
   const combination = line(row.combination), risk = line(row.risk);
   if (!combination || !risk) return [];
   const sources = [...new Set(list(row.sources).filter(key=>allowed.has(key)))].slice(0,6);
   return [{combination,risk,patientFactor:line(row.patientFactor),mitigation:line(row.mitigation),sources}];
 })} : undefined;
 return { problem, facts:list(report.facts),
  differential:rows(report.differential).filter(row=>line(row.hypothesis)).map(row=>({hypothesis:line(row.hypothesis),supporting:list(row.supporting),...separateMissingFromOpposing(list(row.opposing),list(row.missing)),dangerous:row.dangerous===true})),
  investigations:rows(report.investigations).filter(row=>line(row.test)).map(row=>({test:line(row.test),rationale:line(row.rationale),priority:line(row.priority)})),
  management:rows(report.management).filter(row=>line(row.option)).map(row=>{
    const sources = [...new Set(list(row.sources).filter(key=>allowed.has(key)))].slice(0,6);
    const medications = [...new Set(list(row.medications).map(name=>name.toLowerCase()).filter(name=>/^[a-z][a-z-]{1,29}(?: [a-z][a-z-]{1,29}){0,3}$/.test(name)))].slice(0,12);
    const stoppedMedications=[...new Set(list(row.stoppedMedications).map(name=>name.toLowerCase()).filter(name=>/^[a-z][a-z-]{1,29}(?: [a-z][a-z-]{1,29}){0,3}$/.test(name)))].slice(0,12);
    return {option:line(row.option),conditions:list(row.conditions),safetyChecks:list(row.safetyChecks),monitoring:list(row.monitoring),...(sources.length?{sources}:{}),...(medications.length?{medications}:{}),...(stoppedMedications.length?{stoppedMedications}:{})};
  }),
  ...(Object.values(tactics).some(Boolean)?{tactics}:{}),
  ...(medicationSafety && (medicationSafety.alerts.length || medicationSafety.gaps.length) ? {medicationSafety}:{}),
  questions:list(report.questions),limitations:list(report.limitations),followUp:list(report.followUp) };
}
export const REPORT_INSTRUCTION = `For clinical or management tasks, include report using this schema:
{"problem":"problem representation grounded in available evidence","facts":["observed data with source name; separate visual model interpretation from measured facts"],"differential":[{"hypothesis":"provisional hypothesis","supporting":["specific evidence for"],"opposing":["specific evidence against, never invent absent signs"],"missing":["what would distinguish it"],"dangerous":false}],"investigations":[{"test":"proposed investigation","rationale":"which decision it changes","priority":"urgency with reason"}],"management":[{"option":"conditional option for physician review","medications":["English generic active ingredients proposed together in this option"],"stoppedMedications":["English generic active ingredients explicitly discontinued before this option starts"],"conditions":["when it applies"],"safetyChecks":["contraindications, allergies, pregnancy, renal/hepatic function and interactions to verify where relevant"],"monitoring":["response and adverse effects to monitor"],"sources":["exact allowed evidence keys relevant to this option"]}],"tactics":{"nextStep":"the first action or check that changes the decision","timing":"supported urgency and reason","reassess":"what and when to recheck, if supported","escalate":"findings that would require faster review or a change in plan"},"questions":["targeted missing facts"],"limitations":["what was not assessed"],"followUp":["other reassessment details"]}.
For management involving drugs, add medicationSafety: {"alerts":[{"combination":"two medicines actually reported or proposed together, or one medicine with a documented disease or organ impairment","risk":"clinical consequence","patientFactor":"case-specific risk modifier or missing information","mitigation":"practical alternative, dose review or monitoring to discuss with the physician","sources":["exact supplied evidence keys that support the risk"]}],"gaps":["missing medication or safety information that prevents a conclusion"]}. Keep current drugs separate from proposed alternatives and do not report a pair as co-administered if they are mutually exclusive. Include over-the-counter drugs, allergies, renal/hepatic function, QT or bleeding risk when relevant to the actual options. Only attach an evidence key if its text supports that interaction. An alert with no verified source is a review item, not a confirmed interaction. Empty alerts do not establish compatibility. Do not imply a comprehensive database check.
For a management option that proposes medication, add a medications array with one English generic active ingredient per entry, for example ["spironolactone"]. Include only drugs explicitly named in that option and intended for concurrent use. Populate stoppedMedications ONLY when that option explicitly proposes stopping an existing medicine BEFORE the new combination begins; otherwise []. Keep switching plans conditional and give required timing and monitoring; do not assume overlap or no overlap. Use separate management entries for alternatives; never merge them into one medications array. Omit doses, brands, drug classes, drugs to stop or avoid, and existing drugs mentioned only for context. Leave the array empty for non-drug options. This field does not change the answer language.
Keep tactics specific to this case. Leave an unsupported timing field empty rather than inventing a deadline. Include the decision an examination or result would change.
Use empty arrays when a section cannot be supported. Never describe an unperformed/unavailable test or unreported symptom as a finding against a diagnosis. Put it in missing, not opposing. Do not infer dyspnea at rest from orthopnea or exertional dyspnea. Never claim that four roles agree when the cited opinions diverge. Never fill sections just to appear complete. No fabricated numerical probabilities, risk scores or drug interactions. Do not claim a medication interaction checker was run. Unknown is not normal. For a full clinical task, include clinically appropriate provisional management options, immediate safety actions and monitoring when useful for the case; prioritize diagnosis and relevant testing, and do not invent doses or imply that a physician accepted any proposal. For a dedicated management task, provide fuller alternatives, specific prerequisites, medication checks and reassessment. A purely interpretive/image-only task must not invent a treatment plan. Keep current and proposed medication separate. Every hypothesis and plan is unsigned and requires physician review.`;
export function clinicalReportText(report:ClinicalReport,t:(value:string)=>string=value=>value):string{
 return [report.problem,...report.facts.map(text=>`• ${text}`),
 ...report.differential.map(item=>`${item.hypothesis}\n${t('За:')} ${item.supporting.join('; ')}\n${t('Против:')} ${item.opposing.join('; ')}\n${t('Уточнить:')} ${item.missing.join('; ')}`),
 ...report.investigations.map(item=>`${item.test}: ${item.rationale} (${item.priority})`),
 ...report.management.map(item => [
   item.option,
   `${t('Условия:')} ${item.conditions.join('; ')}`,
   `${t('Перед назначением:')} ${item.safetyChecks.join('; ')}`,
   `${t('Контроль:')} ${item.monitoring.join('; ')}`,
   ...(item.localInteractions ?? []).map(alert => `${t('Локальная проверка сочетаний:')} ${alert.first} + ${alert.second}. ${alert.risk}. ${alert.action} ${alert.url}`),
   item.sources?.length ? `${t('Источники:')} ${item.sources.join(', ')}` : '',
 ].filter(Boolean).join('\n')),
 ...(report.medicationSafety?.alerts.map(item=>[item.combination,item.risk,item.patientFactor,item.mitigation,item.sources.join(', ')].filter(Boolean).join('\n'))??[]),
 ...(report.medicationSafety?.gaps??[]),
 ...(report.tactics ? [report.tactics.nextStep && `${t('Следующий шаг:')} ${report.tactics.nextStep}`,report.tactics.timing && `${t('Срочность:')} ${report.tactics.timing}`,report.tactics.reassess && `${t('Контроль:')} ${report.tactics.reassess}`,report.tactics.escalate && `${t('Условия смены тактики:')} ${report.tactics.escalate}`].filter(Boolean) : []),
 ...report.questions.map(text=>`${t('Вопрос:')} ${text}`),...report.followUp.map(text=>`${t('Повторная оценка:')} ${text}`),...report.limitations.map(text=>`${t('Ограничение:')} ${text}`)].join('\n\n');
}
