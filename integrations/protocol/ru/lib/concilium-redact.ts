const LABELED_NAME =
  /(фио|фамилия|patient\s*name|name)\s*[:：]\s*[^,\n.;]{2,80}/gi;
const FIO =
  /(?<![\p{L}\p{N}])[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]*(?:ович|евич|овна|евна)(?![\p{L}\p{N}])/gu;
const INITIALS = /[А-ЯЁ][а-яё]{1,}\s+[А-ЯЁ]\.\s?[А-ЯЁ]\./g;
const TITLED_NAME = /\b(?:mr|mrs|ms|dr)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MONTH_DATE =
  /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/gi;
const NUMERIC_DATE =
  /\b(?:(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:(?:19|20)\d{2}|\d{2})|(?:19|20)\d{2}-(?:0?[1-9]|1[0-2])-(?:0?[1-9]|[12]\d|3[01]))\b/g;
const SNILS = /\b\d{3}-\d{3}-\d{3}[\s-]?\d{2}\b/g;
const POLICY = /\b\d{16}\b/g;
const DOCUMENT =
  /(?:паспорт|снилс|полис|медкарта|mrn)\s*[:№#]?\s*[0-9A-ZА-Я][0-9A-ZА-Я\-/ ]{3,24}/gi;
const PHONE = /\+[1-9]\d{0,2}(?:[ \t().-]*\d){7,13}(?![\d.])|(?<![\d.])8(?:[ \t()-]*\d){10}(?![\d.])|(?<![\d.])\(?\d{3}\)?[ \t.-]\d{3}[ \t.-]\d{4}(?![\d.])/g;
const ADDRESS = /(?:ул\.|улица|проспект|пр-т|street|st\.)\s+[^\n,]{2,60}/gi;
const URL = /https?:\/\/[^\s]+/gi;
const AGE = /(?:возраст|age)\s*[:.]?\s*(\d{2,3})\b/gi;
const MEDICAL_TITLES=new Set('Clinical Medical Diagnostic Reasoning Draft Final Note History Present Illness Physical Examination Assessment Plan Chief Complaint Family Social Review Systems Blood Pressure Heart Rate Treatment Follow Up General Internal Medicine Physician Normal Sinus Rhythm Left Right Bundle Branch Block Anterior Posterior Fascicular Aortic Valve Stenosis Disease Syndrome Acute Chronic Myocardial Infarction Coronary Artery Pulmonary Embolism Deep Venous Thrombosis Renal Failure Heart Failure Blood Cell Count Hemoglobin White Red Platelet Test Result Laboratory Report Drug Dose Allergy Allergies Examination Findings Consent Patient Data Diagnosis Differential Preliminary Evidence Probability Verification Uncertainties Case Study Description Summary Investigation Investigations Relevant Findings Monitoring Medication Medications Advice Discharge Lifestyle Risk Factors Interpretation Functional Conclusion Indication Technique Comparison Impression Recommendations No Not Negative Positive Vitamin Protein Cancer Tumor Breast Lung Liver Kidney Brain Skin Wound Follow-up'.split(' '));

function dateToken(match: string) {
  const year = match.match(/(?:19|20)\d{2}/);
  return year ? `[date] ${year[0]}` : "[date]";
}

export function redactText(value: string): { text: string; removed: number } {
  let text = value;
  let removed = 0;
  const apply = (pattern: RegExp, token: string | ((match: string, label: string) => string)) => {
    text = text.replace(pattern, (...args: string[]) => {
      const replacement=typeof token === "string" ? token : token(args[0] ?? "", args[1] ?? "");
      if(replacement!==args[0])removed += 1;
      return replacement;
    });
  };
  apply(FIO, "[name]");
  apply(EMAIL, "[email]");
  apply(URL, "[url]");
  apply(/(?:дата\s*рождения|д\.?\s*р\.?|date\s*of\s*birth|birth\s*date|dob)\s*[:=：]?\s*(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|\d{1,2}\s+[\p{L}]+\s+\d{4})/giu,"[birth date]");
  apply(/(?:фио|ф\.?\s*и\.?\s*о\.?|patient\s*(?:name|id)|full\s*name|имя\s*пациента)\s*[:=：]\s*[^,\n;<>]{2,100}/giu,"[patient]");
  apply(/(?<!\p{L})[А-ЯЁ][А-ЯЁа-яё-]{1,40}\s+[А-ЯЁ]\.\s*[А-ЯЁ]\.(?!\p{L})/gu,"[name]");
  apply(/\b[A-Z][a-z'-]{1,35}\s+[A-Z]\.\s*(?:[A-Z]\.)?/g,"[name]");
  apply(/(?<!\p{L})[А-ЯЁ][а-яё-]{2,35}(?:ов|ев|ин|ова|ева|ина|ский|ская|енко|ян)\s+[А-ЯЁ][а-яё-]{2,35}(?!\p{L})/gu,"[name]");
  apply(/\b[A-Z][a-z'-]{2,35}\s+[A-Z][a-z'-]{2,35}(?:\s+[A-Z][a-z'-]{2,35})?\b/g,match=>match.split(/\s+/).some(word=>MEDICAL_TITLES.has(word))?match:'[name]');
  apply(/(?:паспорт|passport|снилс|инн|полис|insurance|social\s*security|ssn|medical\s*record|mrn|patient\s*id|идентификатор|номер\s*(?:карты|истории\s*болезни))\s*[:№#=]?\s*[A-ZА-Я0-9][A-ZА-Я0-9\-/ ]{2,35}/giu,"[id]");
  apply(/\b\d{3}-\d{2}-\d{4}\b/g,"[id]");
  apply(/(?:адрес|address)\s*[:=：]\s*[^\n;]{3,120}/giu,"[address]");
  apply(/\b\d{1,6}\s+(?:[A-Z][\p{L}'-]+\s+){0,5}(?:Street|Road|Avenue|Lane|Drive|Boulevard|St\.|Rd\.|Ave\.)(?:\s*[^\n;]{0,35})/gu,"[address]");
  apply(MONTH_DATE, dateToken);
  apply(NUMERIC_DATE, dateToken);
  apply(SNILS, "[id]");
  apply(POLICY, "[id]");
  apply(DOCUMENT, "[id]");
  apply(LABELED_NAME, (_match, label) => `${label}: [name]`);
  apply(FIO, "[name]");
  apply(INITIALS, "[name]");
  apply(TITLED_NAME, "[name]");
  apply(PHONE, match=>/^\+?\d+\.\d+$/.test(match)?match:"[phone]");
  apply(ADDRESS, "[address]");
  text = text.replace(AGE, (match, raw) => {
    const age = Number(raw);
    if (!Number.isFinite(age) || age < 90) return match;
    removed += 1;
    return "[age] 90+";
  });
  return { text, removed };
}

export function redactDocument(name: string, value: string | null): { text: string | null; removed: number } {
  if (!value) return { text: value, removed: 0 };
  const lower = name.toLowerCase();
  if (/\.vcf(?:\.gz)?$/.test(lower)) return redactVcf(value);
  if (lower.endsWith('.csv')) return redactCsv(value);
  const cleaned = redactText(value);
  return { text: cleaned.text, removed: cleaned.removed };
}

const PERSONAL_COLUMN=/^(?:фио|фамилия|имя|отчество|пациент|patient(?:[ _-]?(?:name|id))?|name|first[ _-]?name|last[ _-]?name|dob|birth[ _-]?date|дата[ _-]?рождения|address|адрес|phone|телефон|email|e-mail|mrn|ssn|passport|паспорт|снилс|полис|sample[ _-]?id|specimen[ _-]?id)$/iu;
export function redactCsv(value:string):{text:string;removed:number}{
 const delimiter=value.split(/\r?\n/,1)[0]?.includes(';')?';':',';
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<value.length;i++){const c=value[i];if(c==='"'){if(quoted&&value[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===delimiter||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){rows.push(row);row=[];}}else cell+=c;}
 if(cell||row.length){row.push(cell);rows.push(row);}let removed=0;
 const personal=new Set((rows[0]??[]).flatMap((s,i)=>PERSONAL_COLUMN.test(s.trim())?[i]:[]));
 const next=rows.map((cells,r)=>cells.map((s,i)=>{if(r>0&&personal.has(i)&&s.trim()){removed++;return '[identifier]';}if(/^[-+]?\d+(?:[.,eE+-]\d+)*$/.test(s.trim()))return s;const cleaned=redactText(s);removed+=cleaned.removed;return cleaned.text;}));
 if(!removed)return {text:value,removed};
 return {text:next.map(cells=>cells.map(s=>s.includes(delimiter)||/["\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s).join(delimiter)).join('\n'),removed};
}
export function redactVcf(value:string):{text:string;removed:number}{
 let removed=0;const rows=value.split(/\r?\n/).flatMap(line=>{
  if(/^##(?:SAMPLE|PEDIGREE|individual|patient|fileDate|sourceFile|commandline|reference)=/i.test(line)){removed++;return [];}
  if(line.startsWith('#CHROM')){const cells=line.split('\t');for(let i=9;i<cells.length;i++){if(cells[i]!==`SAMPLE_${i-8}`)removed++;cells[i]=`SAMPLE_${i-8}`;}return [cells.join('\t')];}
  if(line.startsWith('#')){const c=redactText(line);removed+=c.removed;return [c.text];}
  const cells=line.split('\t');if(cells.length<8)return [line];
  if(cells[2]!=='.'&&!/^(?:rs\d+)(?:;rs\d+)*$/.test(cells[2])){cells[2]='.';removed++;}
  cells[7]=cells[7].split(';').filter(field=>{if(/^(?:patient|name|sample|specimen|subject|dob|birth|address|phone|email|mrn|date)(?:[_a-z]*)=/i.test(field)){removed++;return false;}return true;}).map(field=>{const c=redactText(field);removed+=c.removed;return c.text;}).join(';')||'.';
  return [cells.join('\t')];
 });return {text:rows.join('\n'),removed};
}
