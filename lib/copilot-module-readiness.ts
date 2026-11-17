import type {PhysicianTool} from './physician-task-router.ts';
import type {WorkspaceLanguage} from './workspace-i18n.ts';

/** C13-B: read-only interpretation of the existing local integration health API.
 * Never calls providers, starts modules, reads patient cases or saves results.
 * Unknown readiness is NOT equivalent to a working medical analyzer.
 */
export type CopilotIntegrationSnapshot={
 radiology?:{installed:boolean;running:boolean};
 protocol?:{ru?:{installed:boolean;running:boolean};en?:{installed:boolean;running:boolean}};
 ecg?:{available:boolean};
};

export type ReadinessState='available'|'opens-on-request'|'not-installed'|'limited'|'unknown';
export interface CopilotModuleReadiness{
 state:ReadinessState;
 allowed:boolean;
 text:string;
 /** Display a readiness note only where a real integration status was checked. */
 visible:boolean;
}
const copy:Record<WorkspaceLanguage,Record<ReadinessState,string>>={
 en:{available:'Module is running', 'opens-on-request':'Installed; opens when selected',
  'not-installed':'Module is not installed in this workspace','limited':'ECG analysis options will be checked in the module',
  unknown:'Status unverified; it will be checked when opened'},
 ru:{available:'Модуль запущен','opens-on-request':'Установлен; откроется по вашему выбору',
  'not-installed':'Модуль не установлен в этой копии','limited':'Варианты анализа ЭКГ будут проверены в модуле',
  unknown:'Готовность не подтверждена; проверим при открытии'},
 es:{available:'Módulo en ejecución','opens-on-request':'Instalado; se abre al seleccionarlo',
  'not-installed':'El módulo no está instalado','limited':'Las opciones de ECG se comprobarán en el módulo',
  unknown:'Estado no confirmado; se comprobará al abrir'},
 fr:{available:'Module en cours d’exécution','opens-on-request':'Installé ; ouverture sur demande',
  'not-installed':'Le module n’est pas installé','limited':'Les options ECG seront vérifiées dans le module',
  unknown:'État non vérifié ; il sera contrôlé à l’ouverture'},
 ar:{available:'الوحدة قيد التشغيل','opens-on-request':'مثبتة؛ تُفتح عند الاختيار',
  'not-installed':'الوحدة غير مثبتة','limited':'سيتم التحقق من خيارات تخطيط القلب داخل الوحدة',
  unknown:'لم تُتحقق الجاهزية؛ سنفحصها عند الفتح'},
 hi:{available:'मॉड्यूल चल रहा है','opens-on-request':'स्थापित है; चुनने पर खुलेगा',
  'not-installed':'मॉड्यूल स्थापित नहीं है','limited':'ईसीजी विकल्प मॉड्यूल में जाँचे जाएंगे',
  unknown:'स्थिति सत्यापित नहीं है; खोलने पर जाँच होगी'},
 'pt-BR':{available:'Módulo em execução','opens-on-request':'Instalado; abre ao selecionar',
  'not-installed':'Módulo não instalado','limited':'As opções de ECG serão verificadas no módulo',
  unknown:'Status não verificado; será conferido ao abrir'},
 id:{available:'Modul sedang berjalan','opens-on-request':'Terpasang; terbuka saat dipilih',
  'not-installed':'Modul belum terpasang','limited':'Pilihan analisis EKG diperiksa di modul',
  unknown:'Status belum diverifikasi; diperiksa saat dibuka'},
 tr:{available:'Modül çalışıyor','opens-on-request':'Kurulu; seçilince açılır',
  'not-installed':'Modül yüklü değil','limited':'EKG analiz seçenekleri modülde kontrol edilir',
  unknown:'Durum doğrulanmadı; açıldığında kontrol edilir'},
 'zh-CN':{available:'模块运行中','opens-on-request':'已安装；选择后打开',
  'not-installed':'此工作区未安装该模块','limited':'心电图分析选项将在模块内检查',
  unknown:'状态尚未验证；打开时检查'},
};
export function copilotModuleReadiness(
 tool:PhysicianTool,locale:WorkspaceLanguage,snapshot:CopilotIntegrationSnapshot|null,healthFailed=false,
):CopilotModuleReadiness{
 let state:ReadinessState='unknown';
 let visible=false;
 if(tool==='radiology'){
  visible=true;
  const value=!healthFailed?snapshot?.radiology:undefined;
  if(value?.installed===false)state='not-installed';
  else if(value?.installed===true)state=value.running?'available':'opens-on-request';
 }else if(tool==='protocol'||tool==='ambient'){
  visible=true;
  const value=!healthFailed?snapshot?.protocol?.[locale==='ru'?'ru':'en']:undefined;
  if(value?.installed===false)state='not-installed';
  else if(value?.installed===true)state=value.running?'available':'opens-on-request';
 }else if(tool==='ecg'){
  visible=true;
  const value=!healthFailed?snapshot?.ecg:undefined;
  if(value?.available===false)state='limited';
  else if(value?.available===true)state='available';
 }
 // All other modules are navigable in the app but have no health verification
 // in this API. Avoid a green "ready" label that could mislead a physician.
 return {state,allowed:state!=='not-installed',text:copy[locale][state],visible};
}
