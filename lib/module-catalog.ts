import type { CaseFile, LedgerEntry } from './conductor.ts';
/** Capabilities are explicit: adapters in this repo do not imply that external model weights are installed. */
export const MODULE_CATALOG = [
 {id:'documents',title:'Документы и лаборатория',origin:'doctor-opus',contract:'Извлечённые параграфы и лабораторные строки, исходные значения и единицы',state:'local'},
 {id:'ecg-visual',title:'Визуальный разбор ЭКГ',origin:'ECG-opus / Concilium',contract:'Видимые признаки, предварительное заключение, ограничения и калибровка отдельно',state:'gateway'},
 {id:'ecg-waveform',title:'Цифровая ЭКГ',origin:'ECG-opus',contract:'Проверка отведений и частоты дискретизации; ECGFounder только при доступном исполнителе',state:'installed-local'},
 {id:'radiology',title:'Лучевая диагностика',origin:'opus-radiology-ai-github',route:'/radiology',contract:'Подключён исходный модуль Opus Radiology; серии, MPR и реальные детекторы сохраняют собственные ограничения',state:'partial'},
 {id:'ultrasound',title:'УЗИ',origin:'ultrasound / Concilium',route:'/ultrasound',contract:'Протокол и проекции, доступные кадры клипа; охват не равен полному исследованию',state:'partial'},
 {id:'genomics',title:'Генетика и фармакогенетика',origin:'geno-clinician / GenomicsAI Pro',route:'/genetics',contract:'Вызванные варианты, правила ACMG и снимок CPIC; неполные локусы не считаются нормой',state:'local'},
 {id:'translation',title:'Медицинский перевод',origin:'medical-translator',contract:'Сверка доз, чисел, отрицаний и терминов; полный WebRTC-диалог ещё не перенесён',state:'partial'},
 {id:'protocol',title:'Протокол приёма',origin:'протокол осмотра + doctor-opus-global',route:'/protocol',contract:'Редактируемые шаблоны приёма и исследований по предоставленным сведениям, без подстановки отсутствующих данных нормой',state:'local'},
] as const;
export function normalizeFiles(files: readonly CaseFile[]): CaseFile[] {
 const used=new Set<string>();
 return files.map(file=>{
  const original=file.name;let name=original;let suffix=2;
  while(used.has(name)) {const dot=original.lastIndexOf('.');name=dot>0?`${original.slice(0,dot)} (${suffix++})${original.slice(dot)}`:`${original} (${suffix++})`;}
  used.add(name);return {...file,name};
 });
}
export function evidenceIndex(ledger: readonly LedgerEntry[]): string {
 return ledger.map(entry=>`${entry.source} | ${entry.modality} | ${entry.status} | ${entry.sha256 ?? 'no hash'} | ${entry.reason ?? ''}`).join('\n');
}
