/** C13 lightweight, offline and deterministic assistant for clinical TOOL routing.
 * Not a diagnostic engine: it never launches modules or sends clinical data.
 */
export type PhysicianTool='radiology'|'ecg'|'ultrasound'|'genetics'|'medications'|'guidelines'|'clinical'|'specialist'|'protocol'|'ambient'|'documents';
export interface PhysicianStep {tool:PhysicianTool;title:string;reason:string;}
export interface PhysicianTaskPlan {intent:'welcome'|'help'|'route';steps:PhysicianStep[];message:string;}

const catalog:Record<PhysicianTool,Omit<PhysicianStep,'tool'>>={
 radiology:{title:'Opus Radiology',reason:'Просмотр и анализ имеющихся КТ, МРТ или DICOM. Итог проверяет врач и сохраняет в случай.'},
 ecg:{title:'ЭКГ',reason:'Открыть запись или изображение ЭКГ, проверить измерения и интерпретацию.'},
 ultrasound:{title:'УЗИ',reason:'Открыть инструмент анализа ультразвукового исследования.'},
 genetics:{title:'Генетика',reason:'Использовать VCF и обсуждать генетические результаты с привязкой к случаю.'},
 medications:{title:'Проверка лекарств',reason:'Проверить взаимодействия и клинические ограничения до назначения.'},
 guidelines:{title:'Клинические рекомендации',reason:'Найти применимые рекомендации и источники; проверить их актуальность.'},
 clinical:{title:'Клинический разбор',reason:'Сопоставить симптомы и уже полученные результаты в истории случая.'},
 specialist:{title:'Спросить специалиста',reason:'Открыть отдельную клиническую консультацию; она не запускается автоматически.'},
 protocol:{title:'Протокол осмотра',reason:'Открыть существующий редактор RU или Global и оформить документ.'},
 ambient:{title:'Запись беседы в протоколе',reason:'Использовать существующую запись/расшифровку RU или Global; микрофон и платное распознавание включаются только отдельно в редакторе.'},
 documents:{title:'Документы и лаборатория',reason:'Открыть выписку, таблицу или документ в рабочей станции.'},
};
/** Whitelisted module steps for conversational LLM output. No executable tool calls. */
export function physicianToolSteps(ids:readonly PhysicianTool[]):PhysicianStep[]{
 const steps:PhysicianStep[]=[];
 for(const tool of ids){
  if(Object.prototype.hasOwnProperty.call(catalog,tool)&&!steps.some(step=>step.tool===tool))
   steps.push({tool,...catalog[tool]});
  if(steps.length>=4)break;
 }
 return steps;
}
const word=(s:string)=>new RegExp('(?:^|[^a-zа-яё])(?:'+s+')(?![a-zа-яё])','i');
const RAD=word('кт|мрт|кт\\/мрт|рентген|dicom|ct|mri|xray|x-ray');
const ECG=/экг|электрокарди|ecg|ekg/i;
const US=word('узи|сонограф|эхокардиограф|эхокг|ultrasound|echo');
const GEN=/генет|геном|vcf|фармакогеном|вариантов.*днк/i;
const MED=/лекарств|препарат|полипрагмаз|взаимодейств|дозиров|назначен|антикоагуля|совместимост|побочн.*эффект/i;
const GUIDE=/рекомендаци|гайдлайн|guideline|руководств|источник|литератур|доказательн|публикаци/i;
const SPECIALIST=/специалист|консультаци|консультант|врач.*консультаци|consult specialist|ask specialist/i;
const CLIN=/консилиум|комплексн|дифференциал|разбор|тактик|диагноз|сопостав|клиническ.*случай|second opinion/i;
const PROTO=/протокол|soap|заключен|документир|оформлен.*прием|запис.*в карт/i;
const AMBIENT=/ambient|запис.*при[её]м|запис.*бесед|расшифров|транскриб|диктов|микрофон|запис.*разговор/i;
const DOC=word('pdf|xlsx|docx|выписк|лаборатор|анализы|документ|таблиц');
const RESPIRATORY=/(?:кашел|кашель|кашл|одышк|диспноэ|cough|dyspn|shortness of breath|breathlessness)/i;
const CARDIAC=/(?:болит\s+сердц|боль\s+(?:в|за)\s+(?:груд|грудин|сердц)|бол[ьи]\s+(?:в\s+)?груд|давит\s+(?:в\s+)?груд|дискомфорт\s+(?:в\s+)?груд|chest\s+(?:pain|tightness|discomfort)|heart\s+pain)/i;
export const isCardiacPresentation=(value:string)=>CARDIAC.test(value)&&!PROTO.test(value)&&!AMBIENT.test(value);
export const isCopilotHelpQuery=(value:string)=>/^(?:что (?:ты |вы )?умеешь|что умеет|чем (?:ты |вы |doctor opus )?може(?:шь|те|т) помочь|что может doctor opus|возможност|покажи (?:все )?функции|help|what can you do|(?:найди|подбери|покажи) (?:мне )?(?:нужный )?инструмент\??$|find (?:a )?tool\??$)/i.test(value.trim());


export function planPhysicianTask(task:string):PhysicianTaskPlan {
 const value=task.trim().slice(0,4000);
 if(!value)return {intent:'welcome',steps:[],message:'Опишите задачу или выберите пример. Помощник предложит инструменты, не выполняя анализ автоматически.'};
 if(isCopilotHelpQuery(value))
  return {intent:'help',steps:(['clinical','specialist','radiology','ecg','medications','guidelines','ambient','protocol','genetics','ultrasound','documents'] as const).map(tool=>({tool,...catalog[tool]})),message:'Могу помочь выбрать инструмент Doctor Opus. Выберите модуль ниже или напишите, что хотите сделать.'};
 if(isCardiacPresentation(value))
  return {intent:'route',steps:physicianToolSteps(['specialist','clinical']),message:'При боли в груди можно обратиться к специалисту. При внезапной или выраженной боли, одышке, обмороке, холодном поте или ухудшении состояния нужна срочная очная оценка.'};
 const tools:PhysicianTool[]=[];
 const add=(tool:PhysicianTool)=>{if(!tools.includes(tool))tools.push(tool);};
 if(RAD.test(value))add('radiology');
 if(ECG.test(value))add('ecg');
 if(US.test(value))add('ultrasound');
 if(GEN.test(value))add('genetics');
 if(DOC.test(value))add('documents');
 if(MED.test(value))add('medications');
 if(GUIDE.test(value))add('guidelines');
 if(SPECIALIST.test(value))add('specialist');
 if(CLIN.test(value)||!tools.length&&!(PROTO.test(value)||AMBIENT.test(value)))add('clinical');
 if(AMBIENT.test(value))add('ambient');
 if(PROTO.test(value))add('protocol');
 if(tools.length>1&&!tools.includes('clinical')&&tools.some(x=>['ecg','radiology','ultrasound','genetics'].includes(x)))tools.splice(tools.findIndex(x=>x==='protocol'||x==='ambient')<0?tools.length:tools.findIndex(x=>x==='protocol'||x==='ambient'),0,'clinical');
 // Ambient already uses an original protocol editor: do not suggest duplicate editor.
 if(tools.includes('ambient')&&tools.includes('protocol'))tools.splice(tools.indexOf('protocol'),1);
 const respiratoryOnly=RESPIRATORY.test(value)&&!PROTO.test(value)&&!AMBIENT.test(value);
 if(respiratoryOnly&&!tools.includes('clinical'))tools.unshift('clinical');
 const message=respiratoryOnly
  ? 'При кашле с одышкой сначала оцените срочность: SpO₂, ЧДД, пульс, АД, температуру, давность симптомов и боль в груди. При выраженной дыхательной недостаточности, гипоксемии или нестабильности требуется срочная очная оценка. Каковы SpO₂, ЧДД и начало симптомов? После этого можно открыть клинический разбор.'
  : 'Предлагаю последовательность по вашему запросу. Это навигация, а не диагностическое заключение. Каждый инструмент запускается только по вашему нажатию.';
 return {intent:'route',steps:tools.map(tool=>({tool,...catalog[tool]})),message};
}

/** A physician's explicit navigation instruction is permission to OPEN a page,
 * never to perform a paid analysis or edit a case. LLM text is not accepted here.
 */
export function copilotRequestedOpen(task:string):PhysicianTool|null{
 const phrase=task.trim();
 if(!/^(?:открой|открыть|перейди|перейти|покажи|open|go to)\s+/i.test(phrase))return null;
 if(!/(?:\b(?:ecg|ekg|ct|mri|radiology|protocol|ambient|ultrasound|genetics|guidelines|documents)\b|экг|кт|мрт|специалист|консультаци|протокол|при[её]м|разбор|консилиум|радиологи|узи|генетик|лекарств|рекомендаци|документ)/i.test(phrase))
  return null;
 const plan=planPhysicianTask(phrase);
 return plan.intent==='route'&&plan.steps.length===1?plan.steps[0].tool:null;
}

export function physicianTaskHref(tool:PhysicianTool,caseId?:string,locale='ru'):string{
 const path:Record<PhysicianTool,string>={
  radiology:'/radiology',ecg:'/ecg',ultrasound:'/ultrasound',genetics:'/genetics',
  medications:'/drug-checker',guidelines:'/guidelines',clinical:'/workspace',specialist:'/consult',
  protocol:'/protocol/case',ambient:'/protocol/case',documents:'/workbench'};
 const params=new URLSearchParams();
 if(caseId)params.set('case',caseId);
 if(tool==='protocol'||tool==='ambient')params.set('locale',locale);
 if(tool==='ambient')params.set('ambient','1');
 return path[tool]+(params.size?'?'+params.toString():'');
}
