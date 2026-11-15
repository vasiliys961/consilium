import type { CaseFile } from './conductor.ts';
export type CaseTask = 'interpret' | 'clinical' | 'management' | 'evidence';
const physicianQuestion = (note: string) => note.match(/Вопрос врача:\s*([^]*?)(?:\n\n|$)/)?.[1];
/** Intent is chosen before tools run. A request to read a file is not a literature question. */
export function planCase(note: string, files: readonly CaseFile[], task?: CaseTask) {
  const request = physicianQuestion(note) ?? note;
  const evidence = /источник|рекомендаци|руководств|литератур|доказатель|guideline|evidence|reference|literature|pubmed|evidencia|référence|recommandation|evidência|referensi|kanıt|文献|证据|دليل|أدلة|साक्ष्य/i.test(request);
  const management = /как лечить|чем лечить|лечени[еяю]|лечебн|тактик|схем[ауы] терапии|назначить|подобрать|дозиров|treat|therapy|management|prescri|tratamiento|traitement|tratamento|pengobatan|tedavi|rawatan|治疗|علاج|उपचार/i.test(request);
  const clinical = /дифференциаль|диагноз|клиническ|differential|diagnos|clinical reasoning|diagn[oó]st|诊断|تشخيص|निदान/i.test(request) || request.length > 500;
  const selected = task ?? (management ? 'management' : evidence ? 'evidence' : clinical ? 'clinical' : files.length ? 'interpret' : 'clinical');
  const needsInput = !files.length && /^(?:что (?:здесь|это|тут)|what is (?:here|this))[?!.\s]*$/i.test(request.trim());
  return { task: selected, needsInput, search: selected === 'evidence' || selected === 'management' || evidence };
}
export function searchTopic(note: string, observations: string, task: CaseTask, requested=false, planning=false): string | null {
  if (!requested && task !== 'evidence' && task !== 'management') return null;
  const clean = (value: string) => value.replace(/File [^\n]+|Seen:|Reading, unsigned:|Withheld:[^\n]+/g,' ').replace(/\s+/g,' ').trim();
  if (planning) {
    const question = clean(physicianQuestion(note) ?? note);
    const findings = clean(observations);
    const sections = note.split(/\n\s*\n/);
    const update = sections.slice().reverse().find(section => /^[^\n]{1,60} — (?:Динамика|Решение врача):/.test(section));
    const context = clean(sections.filter(section => section !== update && !section.startsWith('Вопрос врача:')).join('\n'));
    return [
      question.slice(0, 350),
      update && clean(update).slice(0, 300),
      findings.slice(0, 350),
      context !== question ? context.slice(0, update ? 190 : 490) : '',
    ].filter(Boolean).join('\n') || null;
  }
  const value = clean(observations || note);
  const generic = /^(?:что (?:здесь|это|тут)|what (?:is|do)|расшифруй|посмотри|покажи)/i.test(value);
  return value.length >= 12 && !generic ? value.slice(0, 1200) : null;
}
