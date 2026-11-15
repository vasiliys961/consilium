'use client';
import {retrieveLibraryEvidence} from '@/lib/library-retrieval';
import{materialRoute,moduleHref}from'@/lib/material-routing';
import{CaseConnections}from'./case-connections';
import {LibrarySuggestions} from './library-suggestions';
import {CaseFeed} from './case-feed';
import Link from 'next/link';
import {registerVaultFlush} from '@/lib/local-vault';
import {useCaseStorageAvailable} from './local-vault';
import privacyStyles from './privacy.module.css';
import {useRouter} from 'next/navigation';
import {PhysicianHelp,FirstCaseIntro,CaseTabHint} from "@/app/components/physician-help";
import {GeneticExtraction} from './genetic-extraction';
import {ImageProfileSelect} from './image-profile';
import {AnalysisProgress} from './analysis-progress';
import {requestAnalysis,type AnalysisProgressEvent} from '@/lib/analysis-stream';
import {ProductGuide,ReferenceInstructions} from './product-guide';
import { CASE_SECTIONS, type CaseSection } from "@/lib/physician-guide";
import { CaseNavigation, CaseSectionControls } from './case-navigation';
import helpStyles from "./physician-help.module.css";
import {downloadDocx} from '@/lib/download-docx';
import { LanguageSwitcher } from './language-switcher';
import { WORKSPACE_LANGUAGES, type WorkspaceLanguage } from "@/lib/workspace-i18n";
import { useWorkspaceLanguage } from "@/app/components/workspace-language";
import { LOCALES, type Locale, parseLocale } from "@/lib/locale";
import { PhoneImport } from "@/app/components/phone-import";
import { workflowGuide } from "@/lib/workflow-guide";
import { WorkflowGuideView } from "@/app/components/workflow-guide";
import {DrugLabelPicker} from './drug-label-picker';
import {DrugInteractionChecker} from './drug-interaction-checker';
import {medicationCopy} from '@/lib/medication-copy';
import { useEffect, useRef, useState } from 'react';
import { openNewCase, caseTitle, caseAnalysisInput, caseContext, caseSignature, readCases, persistCase, exportCase, decisionDraftFrom, finishClinicalCase, reviseCaseEvent, decisionDocument, type AnalysisKind, type Analysis, type ClinicalCase, type Event } from '@/lib/casebook';
import { prepareFile } from '@/lib/case-intake';
import type { CaseTask } from '@/lib/case-plan';
import type { CaseResult, CaseFile } from '@/lib/conductor';
import styles from '@/app/workspace.module.css';
const EMPTY_EVENT_DRAFTS = {note:'',decision:''};
const modules = [
 ['Личная библиотека','Книги и руководства · локальный RAG','Хранение книг в браузере, смысловой поиск и предложения страниц к врачебному вопросу.','/library'],
 ['ЭКГ','Цифровые записи и изображения','Цифровая запись поступает в установленный ECGFounder из ECG-opus; фотографии разбираются отдельно по видимым данным.','/ecg'],
 ['Opus Radiology','DICOM, КТ, МРТ и рентгенография','Подключён исходный локальный модуль с просмотром серий, MPR и доступными детекторами. Описание можно сохранить в случае.','/radiology'],
 ['Медицинские изображения','Гистология, дерматоскопия, раны и маммография','Выберите профиль изображения. Приложение использует профильный разбор, проверяет качество и отмечает неполные данные.','/images'],
 ['УЗИ','Медицинские изображения','Выберите профиль изображения. Приложение использует профильный разбор, проверяет качество и отмечает неполные данные.','/ultrasound'],
 ['Генетика','VCF, VCF.GZ и генотипы','Разбор значения вариантов, наследственных рисков, беременности, спорта и лекарств с продолжением обсуждения и сохранением в случай.','/genetics'],
 ['Протокол осмотра','Приём и заключения исследований','Готовые шаблоны Doctor Opus и модуля протоколов: редактирование, сохранение в случай и настоящий DOCX.','/protocol'],
 ['Документы и лаборатория','PDF, DOCX, XLSX, CSV и текст','Извлечённые документы и значения передаются в общий разбор вместе с вопросом врача.','/workbench'],
 ['Проверка лекарств и опасных сочетаний','Внешние чекеры и источники','Самостоятельный модуль: введите список препаратов и предполагаемое назначение. Случай создавать не требуется.','/drug-checker'],
 ['Инструкции к лекарствам','FDA · DailyMed','','/drug-labels'],
 ['Сканер документов','Фото страниц → многостраничный PDF','Сборка страниц на телефоне, локальный OCR на компьютере и проверка персональных данных перед разбором.','/scanner'],
 ['Медицинский перевод','Голосовой перевод в реальном времени','Расшифровка, перевод и сверка чисел, доз и отрицаний.','/translator'],
];
function formatDate(value: string, language="ru") { return new Date(value).toLocaleString(language==='en'?'en-GB':language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
function download(content: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export default function ClinicalWorkspace({home=false}:{home?:boolean}) {
    const router=useRouter();
    const [libraryOptions,setLibraryOptions]=useState({enabled:true,automatic:true,documentId:''});
    const [selectedLibrary,setSelectedLibrary]=useState<{question:string;files:CaseFile[]}>({question:'',files:[]});
    const storageAvailable=useCaseStorageAvailable();
    const { t, language, setLanguage } = useWorkspaceLanguage();
    const date=(value:string)=>formatDate(value,language);
    const [answerOverride,setAnswerLocale] = useState<Locale>();
    const answerLocale:Locale=answerOverride??language;

    const [showTrash,setShowTrash]=useState(false);
    const [editingEvent,setEditingEvent]=useState<string>();
    const [saving,setSaving]=useState(false);
    const [cases, setCases] = useState<ClinicalCase[]>([]);
    const [current, setCurrent] = useState<ClinicalCase | null>(null);
    const [section, setSection] = useState('cases');
    const [helpOpen,setHelpOpen]=useState(false);
    const [tab, setTab] = useState<CaseSection>('context');
    const [search, setSearch] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [progress,setProgress]=useState<AnalysisProgressEvent[]>([]);const [preview,setPreview]=useState('');
    const [caseQuestion, setCaseQuestion] = useState('');
    const analysisRequest = useRef<AbortController>();
    const [uploading, setUploading] = useState(false);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [rereadImages,setRereadImages]=useState(false);
    const [consilium, setConsilium] = useState(false);
    const [imageSecondOpinion,setImageSecondOpinion]=useState(false);
    const [eventDrafts, setEventDrafts] = useState(EMPTY_EVENT_DRAFTS);
    const [dirty, setDirty] = useState(false);
    const [externalSearch, setExternalSearch] = useState(true);
    const libraryPicker = useRef<HTMLInputElement>(null);
    const [task, setTask] = useState<CaseTask | 'auto'>('auto');
    const picker = useRef<HTMLInputElement>(null);
    const caseNav = useRef<HTMLElement>(null);
    const tabIndex = CASE_SECTIONS.findIndex(section => section.id === tab);
    const eventKind = tab === 'followup' ? 'note' : 'decision';
    const eventText = eventDrafts[eventKind];
    const editingCurrent=Boolean(editingEvent&&current?.events.some(event=>event.id===editingEvent&&event.kind===eventKind));
    const unsaved = dirty || Boolean(eventDrafts.note.trim() || eventDrafts.decision.trim() || caseQuestion.trim());

    function goToTab(next: CaseSection) {
        setTab(next);
        requestAnimationFrame(() => {
            caseNav.current?.scrollIntoView({block:'start',behavior:'instant'});
            caseNav.current?.querySelector<HTMLButtonElement>(`[data-case-section="${next}"]`)?.focus({preventScroll:true});
        });
    }
    function goToSection(next: 'cases' | 'modules') {
        setSection(next);
        if (next !== section) window.scrollTo({top:0,behavior:'instant'});
    }
    useEffect(() => {
        let active = true;
        if(storageAvailable)readCases(true).then(async saved => {
            if (!active) return;
            setCases(saved);
            if (!home) {
                const query = new URLSearchParams(window.location.search);
                if (query.get('new') === '1') {
                    const value = await openNewCase(saved);
                    if (active) {setCurrent(value);window.history.replaceState(window.history.state,'',`/workspace?case=${encodeURIComponent(value.id)}`);}
                }
                else if (query.get('case')) {const value=saved.find(item=>!item.deletedAt&&item.id===query.get('case'))??null;setCurrent(value);if(value?.workspaceDraft){setCaseQuestion(value.workspaceDraft.question);setEventDrafts({note:value.workspaceDraft.note,decision:value.workspaceDraft.decision});if(CASE_SECTIONS.some(s=>s.id===value.workspaceDraft?.tab))setTab(value.workspaceDraft.tab as CaseSection);}}
            }
        }).catch(() => { if (active) setNotice('Не удалось открыть локальное хранилище. Экспортируйте случай перед закрытием.'); });
        fetch('/api/status').then(r => r.json()).then(v => { if (active) setConfigured(v.configured); }).catch(() => { if (active) setConfigured(false); });
        return () => { active = false; };
    }, [home,storageAvailable]);
    useEffect(() => () => analysisRequest.current?.abort(), []);
    useEffect(() => {
        if (!unsaved)
            return;
        const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [unsaved]);
    const draftSnapshot=current?{...current,workspaceDraft:{question:caseQuestion,note:eventDrafts.note,decision:eventDrafts.decision,tab}}:null;
    const latestDraft=useRef(draftSnapshot);latestDraft.current=draftSnapshot;
    const flushed=useRef<string>('');
    const flushDraft=async()=>{const value=latestDraft.current;if(value){await persistCase(value);flushed.current=JSON.stringify([value.id,value.updated,value.workspaceDraft]);}};
    useEffect(()=>registerVaultFlush(flushDraft),[]);
    useEffect(()=>()=>{void flushDraft().catch(()=>{});},[]);
    useEffect(()=>{if(!current||busy||uploading)return;const record=draftSnapshot!,signature=JSON.stringify([record.id,record.updated,record.workspaceDraft]);if(flushed.current===signature)return;
      const timer=setTimeout(()=>{void persistCase(record).then(()=>{flushed.current=signature;if(latestDraft.current?.id===record.id){setCases(values=>[record,...values.filter(x=>x.id!==record.id)]);setDirty(false);}}).catch(()=>setNotice('Автосохранение не удалось. Сохраните или экспортируйте случай перед переходом.'));},250);
      return()=>clearTimeout(timer);
    },[current,caseQuestion,eventDrafts,tab,busy,uploading]);
    useEffect(()=>{const refresh=()=>{const id=latestDraft.current?.id;if(id)void readCases(true).then(values=>{const fresh=values.find(x=>x.id===id);if(fresh){setCases(values);setCurrent(fresh);}});};window.addEventListener('concilium-case-updated',refresh);return()=>window.removeEventListener('concilium-case-updated',refresh);},[]);
    const update = (patch: Partial<ClinicalCase>) => {
        if (current) {
            setCurrent(value => value && value.id === current.id ? { ...value, ...patch, updated: new Date().toISOString() } : value);
            setDirty(true);
        }
    };
    const create = async () => {
        if(home){router.push('/workspace?new=1');return;}
        const value=await openNewCase(cases);setCurrent(value);setCases(await readCases(true));window.history.replaceState(window.history.state,'',`/workspace?case=${encodeURIComponent(value.id)}`);
        setTab('context');
        setSection('cases');
        setNotice('');
        setDirty(false);
        setEventDrafts(EMPTY_EVENT_DRAFTS);setEditingEvent(undefined);
        setCaseQuestion('');
        window.scrollTo({top:0,behavior:'instant'});
    };
    async function save(value = current) {
        if (!value)
            return false;
        try {
            await persistCase(value.id===current?.id?{...value,workspaceDraft:latestDraft.current?.workspaceDraft}:value);
            setCases(await readCases(true));
            setDirty(false);
            setNotice('Случай сохранён в этом браузере.');return true;
        }
        catch {
            setNotice('Сохранение не удалось. Экспортируйте случай — хранилище может быть заполнено.');return false;
        }
    }
    async function addFiles(list: FileList | null, reference = false) {
        if (!list || !current)return;
        if(current.status==='closed'){setNotice('Верните случай в работу перед добавлением материалов.');return;}
        setUploading(true);
        const added:CaseFile[] = [];
        const errors = [];
        for (const file of Array.from(list)) {
            try {
                added.push(await prepareFile(file));
            }
            catch (e) {
                errors.push(e instanceof Error ? e.message : t("Ошибка чтения"));
            }
        }
        const caseId=current.id;setCurrent(value=>value?.id===caseId?{...value,[reference?'library':'files']:[...(reference?value.library??[]:value.files),...added].filter((f,i,a)=>a.findIndex(x=>x.sha256===f.sha256)===i),updated:new Date().toISOString()}:value);setDirty(true);
        setNotice(errors.join('\n') || `Добавлено материалов: ${added.length}`);
        setUploading(false);
    }
    const payloadTooLarge = current && JSON.stringify([...current.files.filter(file=>materialRoute(file)!=='radiology'),...(current.library??[])]).length > 12000000;
    const canAnalyze = Boolean(current && !current.deletedAt && current.status==='active' && configured && !busy && !uploading && !payloadTooLarge);
    async function analyze(snapshot = current, requestedTask = task, withCouncil = consilium, kind:AnalysisKind = 'analysis') {
        if (!snapshot || !canAnalyze || analysisRequest.current)
            return;
        if(caseAnalysisInput(snapshot).pendingModules.length){await save(snapshot);router.push(moduleHref('radiology',snapshot.id));return;}
        if(snapshot===current&&caseQuestion.trim()){snapshot={...snapshot,events:[...snapshot.events,{id:crypto.randomUUID(),at:new Date().toISOString(),kind:'question',text:caseQuestion.trim()}]};setCaseQuestion('');}
        const request = new AbortController();
        analysisRequest.current = request;
        setBusy(true);setProgress([]);setPreview('');goToTab('analysis');
        setNotice('');
        const input = caseAnalysisInput(snapshot, rereadImages||imageSecondOpinion);
        try {
            const libraryQuestion=snapshot.events.slice().reverse().find(event=>event.kind==='question')?.text||snapshot.question||caseContext(snapshot).slice(0,1000);
            const automaticEvidence=libraryOptions.enabled&&libraryOptions.automatic?await retrieveLibraryEvidence(libraryQuestion,{context:caseContext(snapshot).slice(0,3500),documentId:libraryOptions.documentId||undefined,signal:request.signal}):null;
            const libraryFiles=automaticEvidence?.files??(libraryOptions.enabled&&selectedLibrary.question===libraryQuestion?selectedLibrary.files:[]);
            const value = await requestAnalysis({ imageProfile:snapshot.imageProfile,caseId: snapshot.id, text: input.text, files: input.files, referenceFiles: [...(snapshot.library??[]),...libraryFiles], drugLabels:snapshot.drugLabels, externalSearch, locale: answerLocale, sourceLocale: language, consilium:withCouncil,secondOpinion:imageSecondOpinion, ...(requestedTask !== 'auto' ? { task:requestedTask } : {}), retain: false },{signal:request.signal,onProgress:event=>setProgress(old=>[...old.slice(-20),event]),onPreview:setPreview});
            if (!value.draft || !value.gateway)
                throw new Error('Сервис вернул неполный результат.');
            const newestQuestion=snapshot.events.slice().reverse().find(event=>event.kind==='question')?.text||snapshot.question;
            const title=kind==='summary'?'Резюме разбора':newestQuestion||'Разбор материалов и клинических данных';
            const entry:Analysis={id:crypto.randomUUID(),at:new Date().toISOString(),question:title,kind,clinicalContext:snapshot.context,newFacts:snapshot.events.filter(event=>event.kind==='note'&&(!snapshot.analyses[0]||event.at>snapshot.analyses[0].at)).map(event=>event.text).join('\n\n'),context:input.text,inputSignature:caseSignature(snapshot),materialsKey:input.materialsKey,visualEvidence:input.visualEvidence(value.visualReadings),reusedSources:input.reusedSources,result:value};
            const next:ClinicalCase={...snapshot,updated:entry.at,analyses:[entry,...snapshot.analyses],...(kind==='summary'&&value.clinicalDraft==='generated'?{decisionDraft:{analysisId:entry.id,at:entry.at,text:decisionDraftFrom(entry)}}:{})};
            setCurrent(next);
                setDirty(true);
            setRereadImages(false);
            setNotice(value.clinicalDraft === 'generated' ? t("Черновик готов. Проверьте источники и ограничения перед решением.") : value.draft.summary);
        }
        catch (e) {
            setNotice(request.signal.aborted ? 'Разбор остановлен.' : e instanceof Error ? e.message : t("Нет соединения с сервисом."));
        }
        finally {
            analysisRequest.current = undefined;
            setBusy(false);
        }
    }
    async function storeTransition(value:ClinicalCase,message:string){
      setSaving(true);try{await persistCase(value);setCurrent(value);setCases(await readCases(true));setDirty(false);setNotice(message);return true;}catch{setDirty(true);setNotice('Сохранение не удалось. Скачайте документ перед закрытием.');return false;}finally{setSaving(false);}
    }
    async function finishCase(){if(!current||busy||saving)return;try{
      const next=finishClinicalCase(current,eventDrafts.decision,current.events.some(event=>event.id===editingEvent&&event.kind==='decision')?editingEvent:undefined);
      if(await storeTransition(next,'Случай завершён и сохранён. Решение врача можно скачать.')){setEventDrafts(value=>({...value,decision:''}));setEditingEvent(undefined);}
    }catch(error){setNotice(error instanceof Error?error.message:'Не удалось завершить случай.');}}
    async function moveToTrash(value:ClinicalCase,restore=false){if(busy||saving)return;
      const next={...value,deletedAt:restore?undefined:new Date().toISOString(),updated:new Date().toISOString()};
      setSaving(true);try{await persistCase(next);setCases(await readCases(true));if(current?.id===value.id){setCurrent(null);setDirty(false);setEventDrafts(EMPTY_EVENT_DRAFTS);setCaseQuestion('');}setNotice(restore?'Случай восстановлен.':'Случай перемещён в корзину. Его можно восстановить.');}catch{setNotice('Не удалось изменить корзину.');}finally{setSaving(false);}
    }
    function addEvent(andAnalyze = false) {
        if (!current || !eventText.trim())
            return;
        if(editingCurrent&&editingEvent){const next=reviseCaseEvent(current,editingEvent,eventText);void storeTransition(next,'Правка сохранена. Предыдущий текст доступен в истории правок.').then(saved=>{if(saved){setEditingEvent(undefined);setEventDrafts(value=>({...value,[eventKind]:''}));}});return;}
        const events: Event[] = [...current.events, { id: crypto.randomUUID(), at: new Date().toISOString(), kind:eventKind, text: eventText.trim() }];
        update({ events });
        setEventDrafts(value => ({...value,[eventKind]:''}));
        if (andAnalyze) {
          if(eventKind==='note')events.push({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'question',text:caseQuestion.trim()||'Динамика: что изменилось с учётом новых данных и как это влияет на дальнейшую тактику?'});
          void analyze({...current, events},task,consilium,'analysis');
        }
    }
    function reviewMedications(active:string,proposed:string){if(!current||!canAnalyze)return;
      const question=['Проверьте лекарственные взаимодействия и риски только для перечисленных препаратов. Отдельно оцените подтверждённые сочетания, недостающие данные и источники; не считайте отсутствие найденного правила доказательством совместимости.',`Текущий список, сообщённый врачом:\n${active||'(не указан)'}`,`Предполагаемое назначение, ещё не принято:\n${proposed||'(не указано)'}`].join('\n\n');
      const snapshot={...current,currentMedications:active,events:[...current.events,{id:crypto.randomUUID(),at:new Date().toISOString(),kind:'question' as const,text:question}]};
      void analyze(snapshot,'management',false,'question');
    }
    function askCase(kind: 'question' | 'management' | 'council' | 'summary') {
        if (!current || !canAnalyze) return;
        const defaults={management:'Какие варианты лечебной тактики подходят к этому случаю и что проверить перед назначением?',council:'Консилиум: разберите нерешённые вопросы, разногласия и следующий шаг.',summary:'Резюме всей дискуссии: кратко сопоставьте все этапы, новые данные и разногласия. Укажите выводы, следующий шаг, условия изменения тактики и оставшиеся вопросы. Подготовьте проект решения для врача, не выдавая его за принятое решение.',question:''};
        const question=kind==='summary'?[defaults.summary,caseQuestion.trim()].filter(Boolean).join('\n'):caseQuestion.trim()||defaults[kind];
        if (!question) return;
        const events: Event[] = [...current.events, {id:crypto.randomUUID(),at:new Date().toISOString(),kind:'question',text:question}];
        update({events});
        setCaseQuestion('');
        void analyze({...current,events}, kind === 'management' || kind === 'summary' ? 'management' : 'auto', kind === 'council' || consilium,kind);
    }
    const changeCase = (value: ClinicalCase | null) => {
        if(home && value){router.push(`/workspace?case=${encodeURIComponent(value.id)}`);return;}
        if (busy || uploading || saving)
            return;
        if (unsaved && !window.confirm(t('Есть несохранённые изменения. Перейти без сохранения?')))
            return;
        setCurrent(value);
        setDirty(false);
        setTab('context');
        setEventDrafts(EMPTY_EVENT_DRAFTS);setEditingEvent(undefined);
        setCaseQuestion('');
        setNotice('');
        window.history.replaceState(window.history.state,'',value?`/workspace?case=${encodeURIComponent(value.id)}`:'/workspace');
        window.scrollTo({top:0,behavior:'instant'});
    };
    const noticeBox = notice && <div role="status" className={styles.notice}>{t(notice)}<button aria-label={t("Закрыть уведомление")} onClick={() => setNotice('')}>×</button></div>;
    return <div className={styles.shell} onClickCapture={event=>{const link=(event.target as HTMLElement).closest('a');if(!current||!link||event.defaultPrevented||link.target==='_blank')return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.pathname==='/workspace')return;
       if(['/workbench','/radiology','/ecg','/images','/ultrasound','/genetics','/protocol'].some(path=>url.pathname===path||url.pathname.startsWith(path+'/'))){event.preventDefault();event.stopPropagation();url.searchParams.set('case',current.id);void flushDraft().then(()=>router.push(url.pathname+url.search)).catch(()=>setNotice('Сохранение не удалось. Останьтесь в случае и экспортируйте материалы.'));}
    }}>
  <aside className={styles.sidebar}>
   <Link className={styles.brand} href="/">✳ <span>concilium<small>DOCTOR OPUS</small></span></Link>
   <p className={styles.navLabel}>{t("РАБОЧЕЕ ПРОСТРАНСТВО")}</p>
   <button aria-label={t("Клинические случаи")} aria-pressed={section==='cases'} className={section === 'cases' ? styles.active : ''} onClick={() => goToSection('cases')}>▤ <span>{t("Клинические случаи")}</span><small>{cases.filter(value=>!value.deletedAt).length}</small></button>
   <button aria-label={t("Модули анализа")} aria-pressed={section==='modules'} className={section === 'modules' ? styles.active : ''} onClick={() => goToSection('modules')}>◈ <span>{t("Модули анализа")}</span></button>
   <Link className={styles.sidebarConsult} aria-label={t("Спросить специалиста")} href="/consult"><span aria-hidden="true">◌</span><span>{t("Спросить специалиста")}</span></Link>
   <button aria-label={t("Инструкция для врача")} onClick={() => setHelpOpen(true)}>ⓘ <span>{t("Инструкция для врача")}</span></button>
   <Link className={styles.sidebarConsult} href="/library" aria-label={t('Личная библиотека')}><span aria-hidden="true">▤</span><span>{t('Личная библиотека')}</span></Link><div className={styles.sideBottom}><span className={styles.dot}/>{t("Локальное рабочее место")}<p>{t("Исследовательская версия")}<br />{t("Решение принимает врач")}</p><Link href={current?moduleHref('workbench',current.id):'/workbench'}>{t("Расширенная станция ↗")}</Link></div>
  </aside>
  <div className={styles.main}>
   <header className={styles.top}>{!home && <Link href="/">← {t("Главная")}</Link>}<button type="button" className={helpStyles.helpButton} onClick={()=>setHelpOpen(true)}>ⓘ {t("Инструкция для врача")}</button><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><LanguageSwitcher/><label style={{ margin: 0 }}>{t('Язык ответа')} <select aria-label="Answer language" value={answerLocale} onChange={event => { const next = parseLocale(event.target.value); setAnswerLocale(next); localStorage.setItem('concilium-answer-language', next); }}>{LOCALES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label></div><span>{t("Рабочее место врача")}<b>/ {section === 'cases' ? t("Случаи") : section === 'modules' ? t("Модули") : t("Руководство")}</b></span><span className={styles.status}>{configured === null ? t("Проверяем подключение") : configured ? t("● Шлюз настроен") : t("○ ИИ не подключён")}</span></header>
   <main className={styles.content}>
   {(!current || section !== 'cases') && noticeBox}
   {section === 'cases' && !current && <>
    <div className={styles.heading}><div><p className={styles.eyebrow}>{t("КЛИНИЧЕСКАЯ ПРАКТИКА")}</p><h1>{home ? t("Помощь врачу в разборе случая") : t("Рабочее место врача")}</h1><p>{home ? t("Начните с вопроса или откройте сохранённый случай.") : t("Создайте новый клинический случай или откройте сохранённый.")}</p></div><button className={styles.primary} onClick={create}>{t("＋ Новый случай")}</button></div>
    {home ? <section className={styles.welcome}><div><span className={styles.pill}>{t("ЕДИНОЕ КЛИНИЧЕСКОЕ ПРОСТРАНСТВО")}</span><h2>{t("Задайте вопрос.")}<br/>{t("Добавьте исследования.")}</h2><p>{t("Загрузите ЭКГ, снимок, выписку или анализы. Напишите, что вы хотите выяснить.")}<br/>{t("Приложение подготовит ответ; вы проверите выводы и сохраните своё решение.")}</p><Link className={styles.lightButton} href="/workspace">{t("Начать работу")} <span aria-hidden="true">↗</span></Link><Link className={styles.consultLink} href="/consult">{t("Спросить специалиста")}</Link></div><div className={styles.orbit} aria-hidden="true"><span>{t("ЭКГ")}</span><span>{t("Генетика")}</span><strong>✳</strong><span>{t("Документы")}</span><span>{t("Снимки")}</span></div></section> : <FirstCaseIntro onStart={create} onHelp={()=>setHelpOpen(true)}/>}
    {storageAvailable&&<div className={styles.metrics}><div><strong>{cases.filter(c => !c.deletedAt&&c.status === 'active').length.toString().padStart(2, '0')}</strong><span>{t("Активных случаев")}</span></div><div><strong>{cases.reduce((n, c) => n + c.analyses.length, 0).toString().padStart(2, '0')}</strong><span>{t("Сохранённых разборов")}</span></div><div><strong>{String(modules.length).padStart(2,'0')}</strong><span>{t("Направлений в станции")}</span></div></div>}
    <ProductGuide onStart={create}/>
    {storageAvailable&&<>
    <div className={styles.listHead}><h2>{t(showTrash?'Корзина':'Мои случаи')}<small>{cases.filter(value=>Boolean(value.deletedAt)===showTrash).length}</small></h2><button onClick={()=>setShowTrash(value=>!value)}>{t(showTrash?'← Мои случаи':'🗑 Корзина')}</button><input aria-label={t("Поиск случаев")} placeholder={t("Поиск по названию и контексту…")} value={search} onChange={e => setSearch(e.target.value)}/></div>
    {showTrash&&!cases.some(value=>value.deletedAt)&&<p>{t('Корзина пуста. Удалённые сюда случаи можно будет восстановить.')}</p>}
    {!cases.length ? <div className={styles.empty}><span>▤</span><h3>{t("Здесь начнётся история случая")}</h3><p>{t("Создайте клинический случай и добавьте обезличенные материалы.")}<br />{t("Сохранённые случаи доступны в этом браузере.")}</p><button onClick={create}>{t("Создать первый случай →")}</button></div> : <div className={styles.caseList}>{cases.filter(c=>Boolean(c.deletedAt)===showTrash).filter(c => (c.title + ' ' + c.context + ' ' + (c.privatePatient?.name??'') + ' ' + (c.privatePatient?.identifiers??'')).toLowerCase().includes(search.toLowerCase())).map(c => <div className={styles.caseListRow} key={c.id}><button disabled={Boolean(c.deletedAt)} onClick={() => changeCase(c)}><span className={styles.caseIcon}>▤</span><span><strong>{caseTitle(c,t('Без названия'))}</strong><small>{date(c.updated)} · {c.files.length} {t("материалов ·")} {c.analyses.length} {t("разборов")}</small></span><span className={styles.pill}>{c.status === 'active' ? t("В работе") : t("Завершён")}</span><b>↗</b></button><button type="button" disabled={saving} aria-label={`${t(c.deletedAt?'Восстановить случай':'В корзину')} ${caseTitle(c,t('Без названия'))}`} onClick={()=>void moveToTrash(c,Boolean(c.deletedAt))}>{t(c.deletedAt?'Восстановить':'🗑')}</button></div>)}</div>}
    </>}
   </>}
   {section === 'cases' && current && <>
    <button className={styles.back} disabled={busy} onClick={() => changeCase(null)}>{t("← Все случаи")}</button>
    <div className={styles.heading}><div><p className={styles.eyebrow}>{t("СЛУЧАЙ ·")}{current.id.slice(0, 8)} {dirty ? t("· СОХРАНЯЕМ") : ''}</p><h1>{caseTitle(current,t('Новый клинический случай'))}</h1><p>{t("Создан")} {date(current.created)} · {current.status === 'active' ? t("В работе") : t("Завершён")}</p></div><div className={styles.actions}><button disabled={busy} onClick={() => download(exportCase(current), `case-${current.id.slice(0, 8)}.md`, 'text/markdown')}>{t("↓ Экспорт")}</button><button disabled={busy} onClick={()=>void downloadDocx(current.title||t("Протокол осмотра"),exportCase(current),answerLocale).catch(()=>setNotice(t("Не удалось создать DOCX")))}>{t("Бланк DOCX")}</button><Link className={styles.primary} href={`/protocol/case?case=${encodeURIComponent(current.id)}&locale=${encodeURIComponent(answerLocale)}`} onClick={event=>{if(dirty||!cases.some(item=>item.id===current.id)){event.preventDefault();void save().then(saved=>{if(saved)router.push(`/protocol/case?case=${encodeURIComponent(current.id)}&locale=${encodeURIComponent(answerLocale)}`);});}}}>{t("Протокол осмотра")}</Link><Link href={`/radiology?case=${encodeURIComponent(current.id)}`} onClick={event=>{if(dirty){event.preventDefault();void save().then(saved=>{if(saved)router.push(`/radiology?case=${encodeURIComponent(current.id)}`);});}}}>{t("Opus Radiology")}</Link><button className={styles.primary} disabled={busy || uploading} onClick={() => void save()}>{t("Сохранить случай")}</button></div></div>
    <CaseConnections/>{(current.moduleReports??[]).map(report=><details key={report.id}><summary>{t('Результат профильного модуля')} · {report.sources.join(', ')}</summary><p style={{whiteSpace:'pre-wrap'}}>{report.text}</p></details>)}{current.status==='closed'&&<section className={styles.notice}><div><strong>{t('Случай завершён и доступен для скачивания')}</strong><p>{t('Чтобы изменить решение или продолжить обсуждение, верните случай в работу. Предыдущий текст решения сохранится в истории правок.')}</p><div className={styles.actions}><button disabled={saving} onClick={()=>void downloadDocx(caseTitle(current,t('Решение врача')),decisionDocument(current),answerLocale)}>{t('Скачать решение DOCX')}</button><button onClick={()=>download(exportCase(current),`case-${current.id.slice(0,8)}.md`,'text/markdown')}>{t('Скачать всю историю')}</button><button disabled={saving} onClick={()=>void storeTransition({...current,status:'active',closedAt:undefined,updated:new Date().toISOString()},'Случай возвращён в работу.')}>{t('Вернуть в работу')}</button></div></div></section>}
    <button type="button" disabled={busy||saving} onClick={()=>void moveToTrash(current)}>{t('🗑 В корзину')}</button>
    <details className={privacyStyles.localPatient}><summary>{t('Данные пациента · только локально')}</summary><p>{t('Эти поля сохраняются вместе со случаем только в этом браузере. Используйте их для связи кода случая с пациентом. Они не включаются в запросы моделям.')}</p>{(['name','birthDate','identifiers','dates'] as const).map((field,index)=><label key={field}>{t(['ФИО пациента','Дата рождения','Контакты и идентификаторы','Точные даты исследований'][index])}<input disabled={busy} type={field==='birthDate'?'date':'text'} value={current.privatePatient?.[field]??''} onChange={e=>update({privatePatient:{name:'',birthDate:'',identifiers:'',dates:'',...current.privatePatient,[field]:e.target.value}})}/></label>)}</details>
    <PhoneImport disabled={busy||uploading||current.status==='closed'} locale={language} onFile={async (file) => { const transfer = new DataTransfer(); transfer.items.add(file); await addFiles(transfer.files); }}/>
    <CaseNavigation index={tabIndex} navRef={caseNav} fileCount={current.files.length} busy={busy} onNavigate={goToTab}/>
    {noticeBox}
    <div className={styles.caseGrid}><section id="case-section-content" className={styles.panel}>{tab!=='analysis'&&<CaseTabHint text={CASE_SECTIONS[tabIndex].hint}/>}
    {tab === 'context' && <><h2>{t("Клинический контекст")}</h2><p className={styles.muted}>{t("Используйте код случая вместо ФИО и других идентификаторов пациента.")}</p><label>{t("Название случая")}<input disabled={busy} value={current.title} placeholder={t("Например: повторный приём · случай 024")} onChange={e => update({ title: e.target.value })}/></label><label>{t("Жалобы, анамнез и данные осмотра")}<textarea rows={8} disabled={busy} value={current.context} placeholder={t("Возраст, симптомы и сроки, анамнез, препараты и дозы, аллергии, жизненные показатели…")} onChange={e => update({ context: e.target.value })}/></label><label>{t("На какой вопрос нужно ответить?")}<textarea rows={3} disabled={busy} value={current.question} placeholder={t("Дифференциальный диагноз, дополнительное обследование, варианты лечения и мониторинг…")} onChange={e => update({ question: e.target.value })}/></label><DrugInteractionChecker key={current.id+'-interactions'} onReview={canAnalyze?reviewMedications:undefined} current={current.currentMedications??''} onCurrentChange={currentMedications=>update({currentMedications})} disabled={busy}/><DrugLabelPicker key={current.id} selected={current.drugLabels} onChange={drugLabels=>update({drugLabels})} disabled={busy}/></>}
    {tab === 'materials' && <><h2>{t("Материалы случая")}</h2><p className={styles.muted}>{t("PDF, DOCX, XLSX, TXT, CSV, XML, JSON, VCF, JPG/PNG/WebP, TIFF, DICOM, ZIP, цифровая ЭКГ, короткое аудио и видео. До 8 МБ на файл, до 12 МБ на запрос.")}</p><input ref={picker} hidden type="file" multiple onChange={e => { void addFiles(e.target.files); e.target.value = ''; }}/><button className={styles.dropzone} disabled={busy || uploading} onClick={() => picker.current?.click()}><strong>{uploading ? t("Читаем материалы…") : t("＋ Выбрать файлы")}</strong><span>{t("Извлекаем данные перед отправкой на разбор")}</span></button>{current.files.map((f, i) => <div className={styles.fileRow} key={f.sha256}><div><strong>{f.name}</strong><small>{Math.round((f.bytes || 0) / 1024)}{t("КБ ·")}{f.text ? `${f.text.length} символов извлечено` : t("Изображение")}</small></div><Link href={moduleHref(materialRoute(f)==='radiology'?'radiology':materialRoute(f)==='ecg'?'ecg':'workbench',current.id)}>{t(materialRoute(f)==='radiology'?'Открыть в Opus Radiology':materialRoute(f)==='ecg'?'Открыть в модуле ЭКГ':'Открыть в станции')}</Link><button disabled={busy || uploading} onClick={() => update({ files: current.files.filter((_, j) => i !== j) })} aria-label={`${t("Удалить")} ${f.name}`}>{t("Удалить")}</button></div>)}<>{current.files.filter(f=>/\.vcf(?:\.gz)?$/i.test(f.name)).map(f=><GeneticExtraction key={f.sha256} file={f}/>)}</>
            <details className={helpStyles.referencePanel} open={Boolean(current.library?.length)}><summary>{t("Рекомендации и статьи · необязательно")}</summary><ReferenceInstructions expanded/><input ref={libraryPicker} hidden type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={e => { void addFiles(e.target.files, true); e.target.value = ''; }}/><button disabled={busy || uploading} onClick={() => libraryPicker.current?.click()}>{t("Добавить руководство или статью")}</button>{current.library?.map((file, i) => <div className={styles.fileRow} key={file.sha256}><span>{file.name}</span><button disabled={busy} onClick={() => update({ library: current.library?.filter((_, j) => j !== i) })}>{t("Удалить")}</button></div>)}</details><p className={styles.muted}>{t("DICOM, архивы, сигналы ЭКГ и видео:")}<Link href={current?moduleHref('workbench',current.id):'/workbench'}>{t("расширенная станция ↗")}</Link>{t("Из случая открывайте модуль или станцию по кнопкам: случай и загруженные материалы передаются автоматически. Повторно выбирать случай и загружать тот же файл не нужно.")}</p></>}
    {tab === 'analysis' && <>
      <section className={styles.caseComposer} aria-label={t('Запустить разбор')}>
        <h2>{t('Клинический разбор')}</h2><p>{t('Новый ответ появится первым. Предыдущие вопросы и исследования останутся в ленте ниже.')}</p>
        <div className={styles.actions}><button disabled={busy} onClick={()=>goToTab('context')}>{t('Дополнить клинические данные')}</button><button disabled={busy} onClick={()=>goToTab('materials')}>{t('Добавить исследование')}</button></div>
        <label>{t('Вопрос для этого этапа')}<textarea rows={2} disabled={busy} value={caseQuestion} placeholder={current.analyses.length?t('Новый вопрос по случаю…'):current.question||t('Что нужно выяснить?')} onChange={event=>setCaseQuestion(event.target.value)}/></label>
        <LibrarySuggestions onOptionsChange={setLibraryOptions} key={current.id} context={caseContext(current).slice(0,3500)} query={caseQuestion.trim()||current.events.slice().reverse().find(event=>event.kind==='question')?.text||current.question||caseContext(current).slice(0,1000)} onSelectionChange={(files,question)=>setSelectedLibrary({question,files})} disabled={busy||current.status==='closed'}/>
        <div className={styles.actions}>
          <button className={busy?styles.runningButton:styles.primary} disabled={!canAnalyze||(!caseQuestion.trim()&&!caseContext(current).trim()&&!current.files.length)} onClick={()=>void analyze()}>{busy?t('Разбор идёт…'):current.analyses.length?t('Продолжить разбор'):t('Разобрать случай')}</button>
          <button disabled={!canAnalyze} onClick={()=>askCase('management')}>{t('Лечебная тактика')}</button>
          <button disabled={!canAnalyze} onClick={()=>askCase('council')}>{t('Консилиум')}</button>
          <button disabled={!canAnalyze||!current.analyses.some(analysis=>analysis.result.clinicalDraft==='generated')} onClick={()=>askCase('summary')}>{t('Резюме разбора')}</button>
          {busy&&<button onClick={()=>analysisRequest.current?.abort()}>{t('Остановить разбор')}</button>}
        </div>
<details><summary>{t("Настройки разбора и источников")}</summary><p className={styles.muted}>{t("Разбор учитывает контекст, материалы и записи о динамике.")}</p><label>{t("Задача")}<select value={task} disabled={busy} onChange={e => setTask(e.target.value as CaseTask | 'auto')}><option value="auto">{t("Определить по вопросу")}</option><option value="interpret">{t("Разобрать материалы")}</option><option value="clinical">{t("Диагностический разбор")}</option><option value="management">{t("Лечебная тактика")}</option><option value="evidence">{t("Поиск доказательств")}</option></select><small>{t("Если не уверены, оставьте «Определить по вопросу». Для начала достаточно одного ясного вопроса и нужных материалов.")}</small></label><ImageProfileSelect value={current.imageProfile??"auto"} onChange={imageProfile=>update({imageProfile})} disabled={busy}/><label className={styles.check}><input type="checkbox" checked={externalSearch} disabled={busy} onChange={e => setExternalSearch(e.target.checked)}/>{t("Разрешить поиск в публичных источниках, если он нужен для задачи")}</label><label className={styles.check}><input type="checkbox" checked={imageSecondOpinion} disabled={busy} onChange={e=>setImageSecondOpinion(e.target.checked)}/>{t("Второе мнение по исходным изображениям")}</label><label className={styles.check}><input type="checkbox" checked={consilium} disabled={busy} onChange={e => setConsilium(e.target.checked)}/>{t("Подключить консилиум")}</label><small>{t("Необязательно: добавляет отдельные мнения моделей, увеличивает время и расход. Для обычного чтения файла начните без консилиума.")}</small>{!configured && <p className={styles.muted}>{t("Если разбор недоступен, откройте «Инструкцию для врача» и раздел «Если не получается начать».")}</p>}{payloadTooLarge && <p role="alert">{t("Объём запроса превышает 12 МБ. Удалите часть материалов.")}</p>}<small>{t("Результат — черновик. Проверяйте диагнозы, дозы, противопоказания и ссылки.")}</small></details>
        {current.analyses.length>0&&<label className={styles.check}><input type="checkbox" disabled={busy} checked={rereadImages} onChange={event=>setRereadImages(event.target.checked)}/>{t('Повторно прочитать прежние изображения')}</label>}
      </section>
      <details><summary>{t('Проверить препараты · можно дополнить список')}</summary><DrugInteractionChecker onReview={canAnalyze?reviewMedications:undefined} current={current.currentMedications??''} onCurrentChange={currentMedications=>update({currentMedications})} disabled={busy||current.status==='closed'}/></details>
      {busy&&<AnalysisProgress events={progress} preview={preview}/>}
      {!current.analyses.length?<div className={styles.empty}><h3>{t('Разбор ещё не выполнен')}</h3><p>{t('Добавьте клинические данные и материалы, задайте вопрос и нажмите «Разобрать случай» выше.')}</p></div>:<CaseFeed value={current} busy={busy} onCouncil={()=>askCase('council')} onDecision={()=>goToTab('decision')}/>}
    </>}
    {(tab === 'followup' || tab === 'decision') && <>{tab==='decision'&&<div className={styles.decisionDraft}><h3>{t('Проект решения по резюме')}</h3>{current.decisionDraft?<><p>{t('Это предложение модели. Перенесите его в поле ниже, проверьте и отредактируйте перед добавлением записи.')}</p>{current.analyses[0]?.id!==current.decisionDraft.analysisId&&<p role="status">{t('После этого резюме появились новые этапы. Обновите резюме перед решением.')}</p>}<details><summary>{t('Посмотреть проект и уточняющие вопросы')}</summary><pre>{current.decisionDraft.text}</pre></details><button disabled={busy||current.status==='closed'} onClick={()=>setEventDrafts(value=>({...value,decision:current.decisionDraft!.text}))}>{t('Взять за основу и редактировать')}</button></>:<p>{t('Сначала нажмите «Резюме разбора» во вкладке «Разбор». Здесь появится проект решения и вопросы для уточнения.')}</p>}</div>}<h2>{tab === 'followup' ? t("Наблюдение в динамике") : t("Решение лечащего врача")}</h2><p className={styles.muted}>{tab === 'followup' ? t("Новые симптомы, результаты обследований и ответ на лечение войдут в следующий разбор.") : t("Зафиксируйте принятый план, изменения к черновику и сроки контроля. Запись не является электронной подписью.")}</p><textarea rows={5} disabled={busy||saving} aria-label={t("Новая запись")} readOnly={current.status==='closed'} value={eventText} onChange={e => {const text=e.target.value;setEventDrafts(value=>({...value,[eventKind]:text}));}} placeholder={tab === 'followup' ? t("Что изменилось с предыдущего визита?") : t("Ваше решение и обоснование…")}/><div className={styles.actions}><button disabled={busy||saving||current.status==='closed'||!eventText.trim()} onClick={()=>addEvent()}>{t(editingCurrent?'Сохранить правку':'Добавить запись')}</button>{editingCurrent&&<button onClick={()=>{setEditingEvent(undefined);setEventDrafts(value=>({...value,[eventKind]:''}));}}>{t('Отменить правку')}</button>}<button className={styles.primary} disabled={!canAnalyze || !eventText.trim()} onClick={()=>addEvent(true)}>{t("Добавить запись и разобрать")}</button></div><div className={styles.timeline}>{current.events.filter(e => e.kind === eventKind).slice().reverse().map(e => <article key={e.id}><small>{date(e.at)}{e.editedAt?' · '+t('Изменено')+' '+date(e.editedAt):''}</small><p>{e.text}</p><button disabled={busy||current.status==='closed'} onClick={()=>{setEditingEvent(e.id);setEventDrafts(value=>({...value,[eventKind]:e.text}));}}>{t('Редактировать запись')}</button>{e.revisions?.length?<details><summary>{t('История правок')} · {e.revisions.length}</summary>{e.revisions.map((revision,index)=><section key={index}><small>{date(revision.at)}</small><p>{revision.text}</p></section>)}</details>:null}</article>)}</div>{tab==='decision'&&current.status==='active'&&<button className={styles.primary} disabled={busy||saving} onClick={()=>void finishCase()}>{t('Завершить и сохранить случай')}</button>}{tab === 'decision' && <label>{t("Статус случая")}<select disabled={busy} value={current.status} onChange={e => {if(e.target.value==='closed')void finishCase();else void storeTransition({...current,status:'active',closedAt:undefined,updated:new Date().toISOString()},'Случай возвращён в работу.');}}><option value="active">{t("В работе")}</option><option value="closed">{t("Завершён")}</option></select></label>}</>}
    <CaseSectionControls index={tabIndex} onNavigate={goToTab}/>
    </section><aside className={styles.rightPanel}><WorkflowGuideView guide={workflowGuide({ context: caseContext(current), files: current.files, result: current.analyses[0]?.result, busy, changed: Boolean(current.analyses[0] && (current.analyses[0].inputSignature ? current.analyses[0].inputSignature !== caseSignature(current) : current.events.some(e=>e.kind==='note' && e.at>current.analyses[0].at))), decision: current.events.some(event => event.kind === 'decision') })} onHelp={()=>setHelpOpen(true)} onAction={goToTab}/><div className={styles.noteCard}><h3>{t("Хранение случая")}</h3><p>{t("Новый случай сохраняется сразу, до первого разбора. Жалобы, вопросы и материалы сохраняются автоматически; идентификатор не меняется при переходах.")}</p><p>{t("Серверной базы случаев нет. Для переноса между устройствами используйте зашифрованную резервную копию в меню «Хранение случаев»; Markdown и DOCX подходят для чтения, но не восстанавливают диалог.")}</p></div></aside></div>
   </>}
   {section === 'modules' && <><div className={styles.heading}><div><p className={styles.eyebrow}>{t("ИНСТРУМЕНТЫ DOCTOR OPUS")}</p><h1>{t("Одна задача. Разные инструменты.")}</h1><p>{t("Реальные возможности и границы подключённых компонентов.")}</p></div><Link className={styles.primary} href={current?moduleHref('workbench',current.id):'/workbench'}>{t("Открыть станцию ↗")}</Link></div>{[false,true].map(extra=><section key={String(extra)}>{extra&&<h2>{t('Дополнительные инструменты')}</h2>}<div className={styles.moduleGrid}>{modules.filter(([, , , href])=>(href==='/protocol'||href==='/translator')===extra).map(([name,formats,description,href])=><article className={styles.panel} key={name}><h2>{href==='/drug-labels'?medicationCopy(language).title:t(name)}</h2><strong>{t(formats)}</strong><p>{href==='/drug-labels'?medicationCopy(language).market:t(description)}</p><Link href={current?moduleHref(href.slice(1),current.id):href}>{t('Перейти к инструментам →')}</Link></article>)}</div></section>)}</>}
   </main><PhysicianHelp open={helpOpen} onClose={()=>setHelpOpen(false)}/><footer className={styles.footer}>CONCILIUM / DOCTOR OPUS <span>{t("Клиническое мышление с опорой на данные")}</span></footer>
  </div>
 </div>;
}
