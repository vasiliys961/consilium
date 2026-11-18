'use client';
import {preserveWorkspaceBeforeNavigation,workspaceEditorDraft} from '@/lib/workspace-navigation';
import {retrieveLibraryEvidence} from '@/lib/library-retrieval';
import{materialRoute,moduleHref}from'@/lib/material-routing';
import{CaseConnections}from'./case-connections';
import {CaseResultsSummary} from './case-results-summary';
import {PhysicianTaskAssistant} from './physician-task-assistant';
import {physicianTaskHref} from '@/lib/physician-task-router';
import {consumeSpecialistCaseDraft} from '@/lib/copilot-case-handoff';
import {PortableCaseExport,PortableCaseImport} from './portable-case-file';
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
import {commitClinicalAnalysis,stagePhysicianQuestion,preservePendingQuestion} from '@/lib/case-result-commit';
import {ProductGuide,ReferenceInstructions} from './product-guide';
import { CASE_SECTIONS, type CaseSection } from "@/lib/physician-guide";
import { runOptionsKey, duplicateCompletedRun, repeatedRunWarning } from '@/lib/repeat-analysis';
import { CaseNavigation, CaseSectionControls } from './case-navigation';
import helpStyles from "./physician-help.module.css";
import {downloadDocx} from '@/lib/download-docx';
import { LanguageSwitcher } from './language-switcher';
import {ProtocolLanguageOffer} from './protocol-language-offer';
import {protocolLanguageHref} from '@/lib/protocol-language-flow';
import { WORKSPACE_LANGUAGES, type WorkspaceLanguage } from "@/lib/workspace-i18n";
import { useWorkspaceLanguage } from "@/app/components/workspace-language";
import { LOCALES, type Locale, parseLocale } from "@/lib/locale";
import { PhoneImport } from "@/app/components/phone-import";
import {DrugLabelPicker} from './drug-label-picker';
import {DrugInteractionChecker} from './drug-interaction-checker';
import {COUNCIL_SPECIALTIES,planAdaptiveCouncil,councilSpecialtyLabel,type CouncilSpecialty} from '@/lib/adaptive-council';
import {profileModality} from '@/packages/medical-images/profiles';

import type {MedicationContext} from '@/lib/drug-interaction-rules';
import {medicationCopy} from '@/lib/medication-copy';
import { useEffect, useRef, useState } from 'react';
import { openNewCase, caseTitle, caseAnalysisInput, caseContext, caseSignature, readCases, persistCase, persistCaseAutosave, exportCase, finishClinicalCase, reviseCaseEvent, decisionDocument, type AnalysisKind, type Analysis, type ClinicalCase, type Event } from '@/lib/casebook';
import { prepareFile } from '@/lib/case-intake';
import type { CaseTask } from '@/lib/case-plan';
import type { CaseResult, CaseFile } from '@/lib/conductor';
import styles from '@/app/workspace.module.css';
const EMPTY_EVENT_DRAFTS = {note:'',decision:''};
const modules = [
 ['Личная библиотека','Книги и руководства','Хранение книг в браузере, смысловой поиск и предложения страниц к врачебному вопросу.','/library'],
 ['ЭКГ','Цифровые записи и изображения','Разбор цифровой ЭКГ и фотографий с сохранением заключения в случае.','/ecg'],
 ['Opus Radiology','DICOM, КТ, МРТ и рентгенография','Подключён исходный локальный модуль с просмотром серий, MPR и доступными детекторами. Описание можно сохранить в случае.','/radiology'],
 ['Медицинские изображения','Гистология, дерматоскопия, раны и маммография','Выберите профиль изображения. Приложение использует профильный разбор, проверяет качество и отмечает неполные данные.','/images'],
 ['УЗИ','Медицинские изображения','Выберите профиль изображения. Приложение использует профильный разбор, проверяет качество и отмечает неполные данные.','/ultrasound'],
 ['Генетика','VCF, VCF.GZ и генотипы','Разбор значения вариантов, наследственных рисков, беременности, спорта и лекарств с продолжением обсуждения и сохранением в случай.','/genetics'],
 ['Протокол осмотра','Приём и заключения исследований','Готовые шаблоны Doctor Opus и модуля протоколов: редактирование, сохранение в случай и настоящий DOCX.','/protocol'],
 ['Клинические рекомендации','Руководства и клинические источники','Раздел материнского Opus: быстрый стандартный поиск, глубокий разбор и актуальные источники онлайн.','/guidelines'],
 ['Документы и лаборатория','PDF, DOCX, XLSX, CSV и текст','Извлечённые документы и значения передаются в общий разбор вместе с вопросом врача.','/workbench'],
 ['Проверка лекарств и опасных сочетаний','Взаимодействия и ограничения терапии','Самостоятельный модуль: введите список препаратов и предполагаемое назначение. Случай создавать не требуется.','/drug-checker'],
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
    const [protocolOffer,setProtocolOffer]=useState<{caseId:string;analysisId:string}|null>(null);
    const [busy, setBusy] = useState(false);
    const [progress,setProgress]=useState<AnalysisProgressEvent[]>([]);const [preview,setPreview]=useState('');
    const [caseQuestion, setCaseQuestion] = useState('');
    const analysisRequest = useRef<AbortController>();
    const [uploading, setUploading] = useState(false);
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [rereadImages,setRereadImages]=useState(false);
    const [consilium, setConsilium] = useState(false);
    const [councilSpecialty,setCouncilSpecialty]=useState<CouncilSpecialty>('auto');
    const [councilFallback,setCouncilFallback]=useState(false);
    const councilContext=[caseQuestion,current?.question,current?.context,
      ...(current?.events.slice(-5).map(item=>item.text)??[])].filter(Boolean).join('\n').slice(0,9000);
    const councilModalities=[
      ...(current?.files.map(file=>{
        const profile=file.imageProfile&&file.imageProfile!=='auto'?file.imageProfile:current.imageProfile;
        if(profile&&profile!=='auto'&&file.image)return profileModality(profile);
        const route=materialRoute(file);
        return route==='ecg'||route==='radiology'?route:'unknown';
      })??[]),
      ...(current?.analyses.flatMap(item=>item.result.ledger.filter(row=>row.status==='read').map(row=>row.modality))??[]),
      ...(current?.moduleReports?.length?['radiology']:[]),
    ].slice(0,100);
    const autoCouncilPlan=planAdaptiveCouncil(councilContext,councilModalities);
    const councilPlan=planAdaptiveCouncil(councilContext,councilModalities,councilSpecialty);
    // A past provider receipt is a grounded cost reference; never present it as
    // the guaranteed price of the NEXT council on a changed patient context.
    const priorCouncilCalls=current?.analyses.map(item=>item.result.cost.calls?.filter(call=>call.stage==='consilium'))
      .find(calls=>calls?.length);
    const priorCouncilUsd=priorCouncilCalls?.length?
      priorCouncilCalls.reduce((sum,call)=>sum+call.usd,0):null;
    const priorCouncilBilled=Boolean(priorCouncilCalls?.length&&priorCouncilCalls.every(call=>call.billingSource==='openrouter'));
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
                    if (active) {
                      setCurrent(value);window.history.replaceState(window.history.state,'',`/workspace?case=${encodeURIComponent(value.id)}`);
                      const transfer=consumeSpecialistCaseDraft(value.id);
                      if(transfer){setCaseQuestion(transfer.question);setTab('analysis');}
                    }
                }
                else if (query.get('case')) {
                    const value=saved.find(item=>!item.deletedAt&&item.id===query.get('case'))??null;
                    setCurrent(value);
                    if(value?.workspaceDraft){
                      setCaseQuestion(value.workspaceDraft.question);
                      setEventDrafts({note:value.workspaceDraft.note,decision:value.workspaceDraft.decision});
                      if(CASE_SECTIONS.some(s=>s.id===value.workspaceDraft?.tab))setTab(value.workspaceDraft.tab as CaseSection);
                    }
                    const transfer=value?consumeSpecialistCaseDraft(value.id):null;
                    if(transfer){
                      // Keep any existing unsent physician draft; never replace it.
                      setCaseQuestion(previous=>[previous,transfer.question].filter(Boolean).join('\n\n').slice(0,6500));
                      setTab('analysis');
                    }
                }
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
    const flushDraft=async()=>{
      const value=latestDraft.current;
      const signature=JSON.stringify(value);
      await preserveWorkspaceBeforeNavigation(value);
      // If the doctor typed while storage was busy, stay on this screen rather
      // than leave the newest words behind.
      if(JSON.stringify(latestDraft.current)!==signature)throw Error('workspace_changed_during_save');
      if(value)flushed.current=JSON.stringify([value.id,value.updated,value.workspaceDraft]);
    };
    useEffect(()=>registerVaultFlush(flushDraft),[]);
    useEffect(()=>()=>{void flushDraft().catch(()=>{});},[]);
    useEffect(()=>{if(!current||busy||uploading)return;const record=draftSnapshot!,signature=JSON.stringify([record.id,record.updated,record.workspaceDraft]);if(flushed.current===signature)return;
      const timer=setTimeout(()=>{void persistCaseAutosave(record).then(async applied=>{
        if(!applied)return; // A newer analysis/attachment already superseded this snapshot.
        if(latestDraft.current?.id!==record.id||JSON.stringify([latestDraft.current.id,latestDraft.current.updated,latestDraft.current.workspaceDraft])!==signature)return;
        const saved=await readCases(true);
        if(latestDraft.current?.id!==record.id||JSON.stringify([latestDraft.current.id,latestDraft.current.updated,latestDraft.current.workspaceDraft])!==signature)return;
        flushed.current=signature;setCases(saved);setDirty(false);
      }).catch(()=>setNotice('Автосохранение не удалось. Сохраните или экспортируйте случай перед переходом.'));},250);
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
        if(busy||uploading||saving)return;
        setSaving(true);
        try{
        await flushDraft();
        const value=await openNewCase(cases);setCurrent(value);setCases(await readCases(true));window.history.replaceState(window.history.state,'',`/workspace?case=${encodeURIComponent(value.id)}`);
        setTab('context');setProtocolOffer(null);
        setSection('cases');
        setNotice('');
        setDirty(false);
        setEventDrafts(EMPTY_EVENT_DRAFTS);setEditingEvent(undefined);
        setCaseQuestion('');
        window.scrollTo({top:0,behavior:'instant'});
        }catch{setNotice('Не удалось сохранить изменения. Останьтесь в случае и повторите сохранение.');}
        finally{setSaving(false);}
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
    /** W3: the existing RU/Global Ambient is the ONLY recorder and STT owner.
     * Save pending case edits, then open its already-supported ambient=1 entry.
     * Never start microphone, STT, protocol LLM, or a new child service here.
     */
    async function openExistingAmbientFromCase(){
        if(!current || current.status!=='active' || busy || uploading || saving)return;
        try{
            if(unsaved && !(await save()))return;
            await flushDraft();
            router.push(physicianTaskHref('ambient',current.id,language));
        }catch{
            setNotice('Не удалось сохранить изменения перед открытием записи приёма. Останьтесь в случае и повторите сохранение.');
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
    async function analyze(snapshot = current, requestedTask = task, withCouncil = consilium, kind:AnalysisKind = 'analysis', explicitQuestion?:string) {
        if (!snapshot || !canAnalyze || analysisRequest.current)
            return;
        const originalSnapshot=snapshot;
        const pendingQuestion=(explicitQuestion??(snapshot===current?caseQuestion:'')).trim();
        // Pending Radiology materials must not block clinical reasoning about other
        // supplied data. caseAnalysisInput() explicitly marks the unassessed
        // imaging; the physician opens Radiology separately when needed.
        if(pendingQuestion)snapshot=stagePhysicianQuestion(snapshot,pendingQuestion);
        const request = new AbortController();
        analysisRequest.current = request;
        setProtocolOffer(null);setBusy(true);setProgress([]);setPreview('');goToTab('analysis');
        setNotice('');
        const input = caseAnalysisInput(snapshot, rereadImages||imageSecondOpinion);
        try {
            // Preserve all visible facts even when the doctor uses the original
            // case question instead of entering a separate follow-up question.
            await flushDraft();
            if(pendingQuestion){
                // Record the pending request in the editable draft. The staged
                // question event stays in memory until a complete response arrives.
                await preservePendingQuestion(originalSnapshot,pendingQuestion,eventDrafts.note,eventDrafts.decision);
            }
            const libraryQuestion=snapshot.events.slice().reverse().find(event=>event.kind==='question')?.text||snapshot.question||caseContext(snapshot).slice(0,1000);
            const automaticEvidence=libraryOptions.enabled&&libraryOptions.automatic?await retrieveLibraryEvidence(libraryQuestion,{context:caseContext(snapshot).slice(0,3500),documentId:libraryOptions.documentId||undefined,signal:request.signal}):null;
            const libraryFiles=automaticEvidence?.files??(libraryOptions.enabled&&selectedLibrary.question===libraryQuestion?selectedLibrary.files:[]);
            const requestOptionsKey=runOptionsKey({task:requestedTask,kind,consilium:withCouncil,councilSpecialty:withCouncil?councilSpecialty:'auto',councilFallback:withCouncil&&councilFallback,secondOpinion:imageSecondOpinion,rereadImages,externalSearch,answerLocale,sourceLocale:language,retrievedSources:libraryFiles});
            const latest=originalSnapshot.analyses[0];
            // Repeating the same completed question must warn before any paid
            // request, even when the UI stages a new question event for that run.
            const sameQuestion=Boolean(pendingQuestion && latest?.question===pendingQuestion && kind!=='summary');
            const comparableSignature=sameQuestion?caseSignature(originalSnapshot):caseSignature(snapshot);
            if(duplicateCompletedRun(latest,comparableSignature,requestOptionsKey)
                && !window.confirm(repeatedRunWarning(latest,language))){
              setNotice('Повторный запрос отменён. Предыдущее заключение сохранено.');
              return;
            }
            const value = await requestAnalysis({ imageProfile:snapshot.imageProfile,caseId: snapshot.id, text: input.text, files: input.files, referenceFiles: [...(snapshot.library??[]),...libraryFiles], drugLabels:snapshot.drugLabels, externalSearch, locale: answerLocale, sourceLocale: language, consilium:withCouncil,councilSpecialty:withCouncil?councilSpecialty:'auto',councilFallback:withCouncil&&councilFallback,secondOpinion:imageSecondOpinion, ...(requestedTask !== 'auto' ? { task:requestedTask } : {}), retain: false },{signal:request.signal,onProgress:event=>setProgress(old=>[...old.slice(-20),event]),onPreview:setPreview});
            if (!value.draft || !value.gateway)
                throw new Error('Сервис вернул неполный результат.');
            const newestQuestion=snapshot.events.slice().reverse().find(event=>event.kind==='question')?.text||snapshot.question;
            const title=kind==='summary'?'Резюме разбора':newestQuestion||'Разбор материалов и клинических данных';
            const entry:Analysis={id:crypto.randomUUID(),at:new Date().toISOString(),question:title,kind,clinicalContext:snapshot.context,newFacts:snapshot.events.filter(event=>event.kind==='note'&&(!snapshot.analyses[0]||event.at>snapshot.analyses[0].at)).map(event=>event.text).join('\n\n'),context:input.text,inputSignature:caseSignature(snapshot),requestOptionsKey,materialsKey:input.materialsKey,visualEvidence:input.visualEvidence(value.visualReadings),reusedSources:input.reusedSources,result:value};
            const {value:next,stored}=await commitClinicalAnalysis(snapshot,entry,{
                question:pendingQuestion?'':caseQuestion,
                note:eventDrafts.note,decision:eventDrafts.decision,tab:'analysis',
            });
            setCurrent(next);
            if(pendingQuestion)setCaseQuestion(value=>value.trim()===pendingQuestion?'':value);
            if(stored)setCases(old=>[next,...old.filter(item=>item.id!==next.id)]);
            setDirty(!stored);
            if(stored&&value.clinicalDraft==='generated')setProtocolOffer({caseId:next.id,analysisId:entry.id});
            setRereadImages(false);
            setNotice(!stored
                ? 'Ответ получен, но не сохранён в браузере. Экспортируйте случай сейчас; не закрывайте страницу.'
                : value.clinicalDraft === 'generated' ? t("Черновик готов. Проверьте источники и ограничения перед решением.") : value.draft.summary);
        }
        catch (e) {
            // Previews are unverified partial tokens and never become a case result.
            // The doctor question remains in the editor (and was preserved locally).
            setPreview('');
            setNotice(request.signal.aborted ? 'Разбор остановлен. Вопрос сохранён для повторного запуска.' : e instanceof Error ? e.message : t("Нет соединения с сервисом."));
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
        const at=new Date().toISOString();
        const events: Event[] = [...current.events, { id: crypto.randomUUID(), at, kind:eventKind, text: eventText.trim() }];
        const snapshot:ClinicalCase={...current,events,updated:at};
        setCurrent(snapshot);
        setDirty(true);
        setEventDrafts(value => ({...value,[eventKind]:''}));
        if (andAnalyze) {
          const requestQuestion=caseQuestion.trim()||
            (eventKind==='note'
              ? 'Динамика: что изменилось с учётом новых данных и как это влияет на дальнейшую тактику?'
              : 'Оцените последствия нового решения врача для дальнейшего ведения.');
          setCaseQuestion(requestQuestion);
          // The observation/decision is a real physician event, but the extra
          // AI question is NOT committed until a completed response arrives.
          void analyze(snapshot,task,consilium,'analysis',requestQuestion);
        }
    }
    function reviewMedications(active:string,proposed:string,details:{stopped:string;alternatives:string;context:MedicationContext}){if(!current||!canAnalyze)return;
      const question=['Проверьте лекарственные взаимодействия и риски только для перечисленных препаратов. Отдельно оцените подтверждённые сочетания, недостающие данные и источники; не считайте отсутствие найденного правила доказательством совместимости.',`Текущий список, сообщённый врачом:\n${active||'(не указан)'}`,`Предполагаемое назначение, ещё не принято:\n${proposed||'(не указано)'}`,`Отменяются до назначения (НЕ считать текущим совместным приёмом):\n${details.stopped||'(нет)'}`,`Альтернативы, взаимоисключающие схемы (НЕ объединять):\n${details.alternatives||'(нет)'}`,`Данные для лекарственной безопасности: СКФ ${details.context.egfr??'неизвестна'} мл/мин/1,73 м²; калий ${details.context.potassium??'неизвестен'} ммоль/л; возраст ${details.context.ageYears??'неизвестен'} лет; QTc ${details.context.qtcMs??'неизвестна'} мс; декомпенсированный цирроз ${details.context.decompensatedCirrhosis===true?'подтверждён':'не подтверждён'}; тяжёлая печёночная недостаточность ${details.context.severeHepaticImpairment===true?'подтверждена':'не подтверждена'}.`].join('\n\n');
      const snapshot:ClinicalCase={...current,currentMedications:active,updated:new Date().toISOString()};
      setCurrent(snapshot);
      setDirty(true);
      setCaseQuestion(question);
      void analyze(snapshot,'management',false,'question',question);
    }
    function askCase(kind: 'question' | 'management' | 'council' | 'summary') {
        if (!current || !canAnalyze) return;
        const defaults={management:'Какие варианты лечебной тактики подходят к этому случаю и что проверить перед назначением?',council:'Консилиум: разберите нерешённые вопросы, разногласия и следующий шаг.',summary:'Резюме всей дискуссии: кратко сопоставьте все этапы, новые данные и разногласия. Укажите выводы, следующий шаг, условия изменения тактики и оставшиеся вопросы. Подготовьте проект решения для врача, не выдавая его за принятое решение.',question:''};
        const question=kind==='summary'?[defaults.summary,caseQuestion.trim()].filter(Boolean).join('\n'):caseQuestion.trim()||defaults[kind];
        if (!question) return;
        // Never clear the clinician's question or record a completed event
        // merely because a button was pressed. The request can still fail.
        setCaseQuestion(question);
        void analyze(current,kind === 'management' || kind === 'summary' ? 'management' : 'auto',
          kind === 'council' || consilium,kind,question);
    }
    const changeCase = async (value: ClinicalCase | null) => {
        if(home && value){router.push(`/workspace?case=${encodeURIComponent(value.id)}`);return;}
        if(busy||uploading||saving)return;
        setSaving(true);
        try{
          await flushDraft();
          const saved=await readCases(true);
          const target=value?saved.find(item=>item.id===value.id&&!item.deletedAt):null;
          if(value&&!target)throw Error('case_unavailable');
          const draft=workspaceEditorDraft(target??null);
          setCases(saved);setCurrent(target??null);setProtocolOffer(null);
          setDirty(false);
          setTab(CASE_SECTIONS.some(item=>item.id===draft.tab)?draft.tab as CaseSection:'context');
          setEventDrafts({note:draft.note,decision:draft.decision});setEditingEvent(undefined);
          setCaseQuestion(draft.question);setNotice('');
          window.history.replaceState(window.history.state,'',target?`/workspace?case=${encodeURIComponent(target.id)}`:'/workspace');
          window.scrollTo({top:0,behavior:'instant'});
        }catch{
          setNotice('Не удалось сохранить изменения. Останьтесь в случае и повторите сохранение.');
        }finally{setSaving(false);}
    };
    const noticeBox = notice && <div role="status" className={styles.notice}>{t(notice)}<button aria-label={t("Закрыть уведомление")} onClick={() => setNotice('')}>×</button></div>;
    return <div className={styles.shell} onClickCapture={event=>{const link=(event.target as HTMLElement).closest('a');if(!current||!link||event.defaultPrevented||link.target==='_blank')return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.pathname==='/workspace')return;
       if(['/workbench','/radiology','/ecg','/images','/ultrasound','/genetics','/protocol','/drug-checker','/guidelines','/library'].some(path=>url.pathname===path||url.pathname.startsWith(path+'/'))){event.preventDefault();event.stopPropagation();url.searchParams.set('case',current.id);void flushDraft().then(()=>router.push(url.pathname+url.search)).catch(()=>setNotice('Сохранение не удалось. Останьтесь в случае и экспортируйте материалы.'));}
    }}>
  <aside className={styles.sidebar}>
   <Link className={styles.brand} href="/">✳ <span>concilium<small>DOCTOR OPUS</small></span></Link>
   <p className={styles.navLabel}>{t("РАБОЧЕЕ ПРОСТРАНСТВО")}</p>
   <button aria-label={t("Клинические случаи")} aria-pressed={section==='cases'} className={section === 'cases' ? styles.active : ''} onClick={() => goToSection('cases')}>▤ <span>{t("Клинические случаи")}</span><small>{cases.filter(value=>!value.deletedAt).length}</small></button>
   <button aria-label={t("Модули анализа")} aria-pressed={section==='modules'} className={section === 'modules' ? styles.active : ''} onClick={() => goToSection('modules')}>◈ <span>{t("Модули анализа")}</span></button>
   <button type="button" aria-label={t("Помощник Doctor Opus")} onClick={()=>{goToSection('cases');requestAnimationFrame(()=>document.getElementById('doctor-opus-assistant')?.scrollIntoView({block:'start',behavior:'smooth'}));}}>✳ <span>{t("Помощник Doctor Opus")}</span></button>
   <Link className={styles.sidebarConsult} aria-label={t("Спросить специалиста")} href="/consult"><span aria-hidden="true">◌</span><span>{t("Спросить специалиста")}</span></Link>
   <button aria-label={t("Инструкция для врача")} onClick={() => setHelpOpen(true)}>ⓘ <span>{t("Инструкция для врача")}</span></button>
   <Link className={styles.sidebarConsult} href="/library" aria-label={t('Личная библиотека')}><span aria-hidden="true">▤</span><span>{t('Личная библиотека')}</span></Link><div className={styles.sideBottom}><span className={styles.dot}/>{t("Локальное рабочее место")}<p>{t("Исследовательская версия")}<br />{t("Решение принимает врач")}</p><Link href={current?moduleHref('workbench',current.id):'/workbench'}>{t("Расширенная станция ↗")}</Link></div>
  </aside>
  <div className={styles.main}>
   <header className={styles.top}>{!home && <Link href="/">← {t("Главная")}</Link>}<button type="button" className={helpStyles.helpButton} onClick={()=>setHelpOpen(true)}>ⓘ {t("Инструкция для врача")}</button><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><LanguageSwitcher/><label style={{ margin: 0 }}>{t('Язык ответа')} <select aria-label="Answer language" value={answerLocale} onChange={event => { const next = parseLocale(event.target.value); setAnswerLocale(next); localStorage.setItem('concilium-answer-language', next); }}>{LOCALES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label></div><span>{t("Рабочее место врача")}<b>/ {section === 'cases' ? t("Случаи") : section === 'modules' ? t("Модули") : t("Руководство")}</b></span><span className={styles.status}>{configured===false?t("○ ИИ не подключён"):null}</span></header>
   <main className={styles.content}>
   {(!current || section !== 'cases') && noticeBox}
   {section === 'cases' && !current && <>
    <div className={styles.heading}><div><p className={styles.eyebrow}>{t("КЛИНИЧЕСКАЯ ПРАКТИКА")}</p><h1>{home ? t("Помощь врачу в разборе случая") : t("Рабочее место врача")}</h1><p>{home ? t("Начните с вопроса или откройте сохранённый случай.") : t("Создайте новый клинический случай или откройте сохранённый.")}</p></div><button className={styles.primary} onClick={create}>{t("＋ Новый случай")}</button></div>
    <PhysicianTaskAssistant onOpenCase={async id=>{await flushDraft();const value=(await readCases()).find(item=>item.id===id);if(value)changeCase(value);}}/>
    {!home&&cases.length===0&&<FirstCaseIntro onStart={create} onHelp={()=>setHelpOpen(true)}/>}
    <ProductGuide onStart={create}/>
    {storageAvailable&&<PortableCaseImport onImported={async()=>{setCases(await readCases(true));}}/>}
    {storageAvailable&&<>
    <div className={styles.listHead}><h2>{t(showTrash?'Корзина':'Мои случаи')}<small>{cases.filter(value=>Boolean(value.deletedAt)===showTrash).length}</small></h2><button onClick={()=>setShowTrash(value=>!value)}>{t(showTrash?'← Мои случаи':'🗑 Корзина')}</button><input aria-label={t("Поиск случаев")} placeholder={t("Поиск по названию и контексту…")} value={search} onChange={e => setSearch(e.target.value)}/></div>
    {showTrash&&<p>{t('Случаи в корзине сохраняются в этом браузере и восстанавливаются без файла и пароля. Файл нужен для переноса или резервной копии. Очистка данных браузера удаляет и корзину.')}</p>}
    {!cases.length ? <div className={styles.empty}><span>▤</span><h3>{t("Здесь начнётся история случая")}</h3><p>{t("Создайте клинический случай и добавьте обезличенные материалы.")}<br />{t("Сохранённые случаи доступны в этом браузере.")}</p><button onClick={create}>{t("Создать первый случай →")}</button></div> : <div className={styles.caseList}>{cases.filter(c=>Boolean(c.deletedAt)===showTrash).filter(c => (c.title + ' ' + c.context + ' ' + (c.privatePatient?.name??'') + ' ' + (c.privatePatient?.identifiers??'')).toLowerCase().includes(search.toLowerCase())).map(c => <div className={styles.caseListRow} key={c.id}><button disabled={Boolean(c.deletedAt)} onClick={() => changeCase(c)}><span className={styles.caseIcon}>▤</span><span><strong>{caseTitle(c,t('Без названия'))}</strong><small>{date(c.updated)} · {c.files.length} {t("материалов ·")} {c.analyses.length} {t("разборов")}</small></span><span className={styles.pill}>{c.status === 'active' ? t("В работе") : t("Завершён")}</span><b>↗</b></button><button type="button" disabled={saving} aria-label={`${t(c.deletedAt?'Восстановить случай':'В корзину')} ${caseTitle(c,t('Без названия'))}`} onClick={()=>void moveToTrash(c,Boolean(c.deletedAt))}>{t(c.deletedAt?'Восстановить':'🗑')}</button></div>)}</div>}
    </>}
   </>}
   {section === 'cases' && current && <>
    <button className={styles.back} disabled={busy||uploading||saving} onClick={() => changeCase(null)}>{t("← Все случаи")}</button>
    <div className={styles.heading}><div><p className={styles.eyebrow}>{t("СЛУЧАЙ ·")}{current.id.slice(0, 8)} {dirty ? t("· СОХРАНЯЕМ") : ''}</p><h1>{caseTitle(current,t('Новый клинический случай'))}</h1><p>{t("Создан")} {date(current.created)} · {current.status === 'active' ? t("В работе") : t("Завершён")}</p></div><div className={styles.actions}><button disabled={busy} onClick={() => download(exportCase(current), `case-${current.id.slice(0, 8)}.md`, 'text/markdown')}>{t("↓ Экспорт")}</button><button disabled={busy} onClick={()=>void downloadDocx(current.title||t("Протокол осмотра"),exportCase(current),answerLocale).catch(()=>setNotice(t("Не удалось создать DOCX")))}>{t("Бланк DOCX")}</button>{current.analyses[0]?.result.clinicalDraft==='generated'?<button type="button" className={styles.primary} disabled={busy} onClick={()=>setProtocolOffer({caseId:current.id,analysisId:current.analyses[0].id})}>{t("Протокол осмотра")}</button>:<Link className={styles.primary} href={`/protocol/case?case=${encodeURIComponent(current.id)}&locale=${encodeURIComponent(answerLocale)}`} onClick={event=>{if(dirty||!cases.some(item=>item.id===current.id)){event.preventDefault();void save().then(saved=>{if(saved)router.push(`/protocol/case?case=${encodeURIComponent(current.id)}&locale=${encodeURIComponent(answerLocale)}`);});}}}>{t("Протокол осмотра")}</Link>}<button type="button" disabled={busy||uploading||saving||current.status!=='active'} onClick={()=>void openExistingAmbientFromCase()}>{language==='ru'?'Записать приём':'Record encounter'}</button><Link href={`/radiology?case=${encodeURIComponent(current.id)}`} onClick={event=>{if(dirty){event.preventDefault();void save().then(saved=>{if(saved)router.push(`/radiology?case=${encodeURIComponent(current.id)}`);});}}}>{t("Opus Radiology")}</Link><button className={styles.primary} disabled={busy || uploading} onClick={() => void save()}>{t("Сохранить случай")}</button></div></div>
    <PhysicianTaskAssistant onOpenCase={async id=>{await flushDraft();const value=(await readCases()).find(item=>item.id===id);if(value)changeCase(value);}} hasClinicalResult={current.analyses[0]?.result.clinicalDraft==='generated'&&current.analyses[0]?.inputSignature===caseSignature(current)} caseId={current.id} caseClosed={current.status==='closed'} onClinical={task=>{setCaseQuestion(task);goToTab('analysis');}} beforeExecute={async()=>{await flushDraft();}} onCaseSaved={async id=>{const values=await readCases(true);setCases(values);const value=values.find(item=>item.id===id);if(value){setCurrent(value);setDirty(false);goToTab('analysis');}}}/>
    <PortableCaseExport key={current.id} caseId={current.id} beforeExport={async()=>{const ok=await save();if(ok)await flushDraft();return ok;}}/>
    <CaseConnections/>{protocolOffer?.caseId===current.id&&current.analyses[0]?.id===protocolOffer.analysisId&&<ProtocolLanguageOffer disabled={busy||saving} onDismiss={()=>setProtocolOffer(null)} onChoose={languages=>{void (async()=>{try{if(unsaved&&!(await save()))return;await flushDraft();router.push(protocolLanguageHref(current.id,languages));setProtocolOffer(null);}catch{setNotice('Не удалось сохранить переход к протоколу. Случай остаётся открытым.');}})();}}/>}<CaseResultsSummary record={current}/>{current.status==='closed'&&<section className={styles.notice}><div><strong>{t('Случай завершён и доступен для скачивания')}</strong><p>{t('Чтобы изменить решение или продолжить обсуждение, верните случай в работу. Предыдущий текст решения сохранится в истории правок.')}</p><div className={styles.actions}><button disabled={saving} onClick={()=>void downloadDocx(caseTitle(current,t('Решение врача')),decisionDocument(current),answerLocale)}>{t('Скачать решение DOCX')}</button><button onClick={()=>download(exportCase(current),`case-${current.id.slice(0,8)}.md`,'text/markdown')}>{t('Скачать всю историю')}</button><button disabled={saving} onClick={()=>void storeTransition({...current,status:'active',closedAt:undefined,updated:new Date().toISOString()},'Случай возвращён в работу.')}>{t('Вернуть в работу')}</button></div></div></section>}
    <button type="button" disabled={busy||saving} onClick={()=>void moveToTrash(current)}>{t('🗑 В корзину')}</button>
    <details className={privacyStyles.localPatient}><summary>{t('Данные пациента · только локально')}</summary><p>{t('Эти поля сохраняются вместе со случаем только в этом браузере. Используйте их для связи кода случая с пациентом. Они не включаются в запросы моделям.')}</p>{(['name','birthDate','identifiers','dates'] as const).map((field,index)=><label key={field}>{t(['ФИО пациента','Дата рождения','Контакты и идентификаторы','Точные даты исследований'][index])}<input disabled={busy} type={field==='birthDate'?'date':'text'} value={current.privatePatient?.[field]??''} onChange={e=>update({privatePatient:{name:'',birthDate:'',identifiers:'',dates:'',...current.privatePatient,[field]:e.target.value}})}/></label>)}</details>
    <PhoneImport disabled={busy||uploading||current.status==='closed'} locale={language} onFile={async (file) => { const transfer = new DataTransfer(); transfer.items.add(file); await addFiles(transfer.files); }}/>
    <CaseNavigation index={tabIndex} navRef={caseNav} fileCount={current.files.length} busy={busy} onNavigate={goToTab}/>
    {noticeBox}
    <div className={styles.caseGrid}><section id="case-section-content" className={styles.panel}>{tab!=='analysis'&&<CaseTabHint text={CASE_SECTIONS[tabIndex].hint}/>}
    {tab === 'context' && <><h2>{t("Клинический контекст")}</h2><p className={styles.muted}>{t("Используйте код случая вместо ФИО и других идентификаторов пациента.")}</p><label>{t("Название случая")}<input disabled={busy} value={current.title} placeholder={t("Например: повторный приём · случай 024")} onChange={e => update({ title: e.target.value })}/></label><label>{t("Жалобы, анамнез и данные осмотра")}<textarea rows={8} disabled={busy} value={current.context} placeholder={t("Возраст, симптомы и сроки, анамнез, препараты и дозы, аллергии, жизненные показатели…")} onChange={e => update({ context: e.target.value })}/></label><label>{t("На какой вопрос нужно ответить?")}<textarea rows={3} disabled={busy} value={current.question} placeholder={t("Дифференциальный диагноз, дополнительное обследование, варианты лечения и мониторинг…")} onChange={e => update({ question: e.target.value })}/></label><DrugInteractionChecker caseNarrative={current.context} key={current.id+'-interactions'} onReview={canAnalyze?reviewMedications:undefined} reviewLabel="Разобрать через полный консилиум (дороже, чем Flash-проверка)" current={current.currentMedications??''} onCurrentChange={currentMedications=>update({currentMedications})} disabled={busy}/><DrugLabelPicker key={current.id} selected={current.drugLabels} onChange={drugLabels=>update({drugLabels})} disabled={busy}/></>}
    {tab === 'materials' && <><h2>{t("Материалы случая")}</h2><p className={styles.muted}>{t("PDF, DOCX, XLSX, TXT, CSV, XML, JSON, VCF, JPG/PNG/WebP, TIFF, DICOM, ZIP, цифровая ЭКГ, короткое аудио и видео. До 8 МБ на файл, до 12 МБ на запрос.")}</p><input ref={picker} hidden type="file" multiple onChange={e => { void addFiles(e.target.files); e.target.value = ''; }}/><button className={styles.dropzone} disabled={busy || uploading} onClick={() => picker.current?.click()}><strong>{uploading ? t("Читаем материалы…") : t("＋ Выбрать файлы")}</strong><span>{t("Извлекаем данные перед отправкой на разбор")}</span></button>{current.files.map((f, i) => <div className={styles.fileRow} key={f.sha256}><div><strong>{f.name}</strong><small>{Math.round((f.bytes || 0) / 1024)}{t("КБ ·")}{f.text ? `${f.text.length} символов извлечено` : t("Изображение")}</small></div><Link href={moduleHref(materialRoute(f)==='radiology'?'radiology':materialRoute(f)==='ecg'?'ecg':'workbench',current.id)}>{t(materialRoute(f)==='radiology'?'Открыть в Opus Radiology':materialRoute(f)==='ecg'?'Открыть в модуле ЭКГ':'Открыть в станции')}</Link><button disabled={busy || uploading} onClick={() => update({ files: current.files.filter((_, j) => i !== j) })} aria-label={`${t("Удалить")} ${f.name}`}>{t("Удалить")}</button></div>)}<>{current.files.filter(f=>/\.vcf(?:\.gz)?$/i.test(f.name)).map(f=><GeneticExtraction key={f.sha256} file={f}/>)}</>
            <details className={helpStyles.referencePanel} ><summary>{t("Рекомендации и статьи · необязательно")}</summary><ReferenceInstructions expanded/><input ref={libraryPicker} hidden type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={e => { void addFiles(e.target.files, true); e.target.value = ''; }}/><button disabled={busy || uploading} onClick={() => libraryPicker.current?.click()}>{t("Добавить руководство или статью")}</button>{current.library?.map((file, i) => <div className={styles.fileRow} key={file.sha256}><span>{file.name}</span><button disabled={busy} onClick={() => update({ library: current.library?.filter((_, j) => j !== i) })}>{t("Удалить")}</button></div>)}</details><p className={styles.muted}>{t("DICOM, архивы, сигналы ЭКГ и видео:")}<Link href={current?moduleHref('workbench',current.id):'/workbench'}>{t("расширенная станция ↗")}</Link>{t("Из случая открывайте модуль или станцию по кнопкам: случай и загруженные материалы передаются автоматически. Повторно выбирать случай и загружать тот же файл не нужно.")}</p></>}
    {tab === 'analysis' && <>
      <section className={styles.caseComposer} aria-label={t('Запустить разбор')}>
        {!configured&&configured!==null&&<p role="status">{t('Анализ сейчас недоступен. Можно продолжить работу с данными и сохранить случай.')}</p>}
        <h2>{t('Клинический разбор')}</h2><p>{t('Новый ответ появится первым. Предыдущие вопросы и исследования останутся в ленте ниже.')}</p>
        <div className={styles.actions}><button disabled={busy} onClick={()=>goToTab('context')}>{t('Дополнить клинические данные')}</button><button disabled={busy} onClick={()=>goToTab('materials')}>{t('Добавить исследование')}</button></div>
        <label>{t('Вопрос для этого этапа')}<textarea rows={2} disabled={busy} value={caseQuestion} placeholder={current.analyses.length?t('Новый вопрос по случаю…'):current.question||t('Что нужно выяснить?')} onChange={event=>setCaseQuestion(event.target.value)}/></label>
        <LibrarySuggestions onOptionsChange={setLibraryOptions} key={current.id} context={caseContext(current).slice(0,3500)} query={caseQuestion.trim()||current.events.slice().reverse().find(event=>event.kind==='question')?.text||current.question||caseContext(current).slice(0,1000)} onSelectionChange={(files,question)=>setSelectedLibrary({question,files})} disabled={busy||current.status==='closed'}/>
        <p className={styles.muted} style={{fontSize:13,margin:'6px 0'}}>
          {language==='ru'?'«Лечебная тактика» и «Консилиум» — два разных платных запуска. Если нужен полный разбор с обсуждением, сразу выберите «Консилиум».':'Management and Council are separate paid runs. For the complete debate, choose Council directly.'}
        </p>
        <details style={{marginTop:8}} data-testid="council-model-technical"><summary>{language==='ru'?'Модели и технические сведения':'AI models and technical details'}</summary><p className={styles.muted} style={{fontSize:14,margin:'6px 0'}} data-testid="council-model-roster">
          {language==='ru'
            ?'План консилиума (до запуска, без оплаты): гипотезы — '+councilSpecialtyLabel(councilPlan.lead,language)+' / Gemini 4 Argon; обследования — '+councilSpecialtyLabel(councilPlan.secondary,language)+' / GPT-6.1 Sol; критик — Claude Opus 5.5; безопасность лекарств — Claude Sonnet 5.5; итог — Claude Opus 5.5. Модель Gemini может измениться по тарифной политике. Реальные модели после ответа указаны в отчёте.'
            :'Council plan (free preview): hypotheses — '+councilSpecialtyLabel(councilPlan.lead,language)+' / Gemini 4 Argon; investigations — '+councilSpecialtyLabel(councilPlan.secondary,language)+' / GPT-6.1 Sol; critic — Claude Opus 5.5; medication safety — Claude Sonnet 5.5; synthesis — Claude Opus 5.5. Gemini may change under pricing policy. Actual models appear in results.'}
        </p></details>
        <div className={styles.actions}>
          <button className={busy?styles.runningButton:styles.primary} disabled={!canAnalyze||(!caseQuestion.trim()&&!caseContext(current).trim()&&!current.files.length)} onClick={()=>void analyze()}>{busy?t('Разбор идёт…'):current.analyses.length?t('Продолжить разбор'):t('Разобрать случай')}</button>
          <button disabled={!canAnalyze} onClick={()=>askCase('management')}>{t('Лечебная тактика')}</button>
          <button disabled={!canAnalyze} onClick={()=>askCase('council')}>{t('Консилиум')}</button>
          <button disabled={!canAnalyze||!current.analyses.some(analysis=>analysis.result.clinicalDraft==='generated')} onClick={()=>askCase('summary')}>{t('Резюме разбора')}</button>
          {busy&&<button onClick={()=>analysisRequest.current?.abort()}>{t('Остановить разбор')}</button>}
        </div>
<details><summary>{t("Настройки разбора и источников")}</summary><p className={styles.muted}>{t("Разбор учитывает контекст, материалы и записи о динамике.")}</p><label>{t("Задача")}<select value={task} disabled={busy} onChange={e => setTask(e.target.value as CaseTask | 'auto')}><option value="auto">{t("Определить по вопросу")}</option><option value="interpret">{t("Разобрать материалы")}</option><option value="clinical">{t("Диагностический разбор")}</option><option value="management">{t("Лечебная тактика")}</option><option value="evidence">{t("Поиск доказательств")}</option></select><small>{t("Если не уверены, оставьте «Определить по вопросу». Для начала достаточно одного ясного вопроса и нужных материалов.")}</small></label><ImageProfileSelect value={current.imageProfile??"auto"} onChange={imageProfile=>update({imageProfile})} disabled={busy}/><label className={styles.check}><input type="checkbox" checked={externalSearch} disabled={busy} onChange={e => setExternalSearch(e.target.checked)}/>{t("Разрешить поиск в публичных источниках, если он нужен для задачи")}</label><label className={styles.check}><input type="checkbox" checked={imageSecondOpinion} disabled={busy} onChange={e=>setImageSecondOpinion(e.target.checked)}/>{t("Второе мнение по исходным изображениям")}</label><label className={styles.check}><input type="checkbox" checked={consilium} disabled={busy} onChange={e => setConsilium(e.target.checked)}/>{t("Подключить консилиум")}</label><small>{t("Необязательно: добавляет отдельные мнения моделей, увеличивает время и расход. Для обычного чтения файла начните без консилиума.")}</small><label style={{display:'block',marginBlock:8}}>{t('Клинический профиль консилиума')}
 <select disabled={busy} value={councilSpecialty} onChange={event=>setCouncilSpecialty(event.target.value as CouncilSpecialty)}>
  <option value="auto">{language==='ru'?'Автоматически (рекомендуется)':'Automatically (recommended)'}</option>
  <optgroup label={language==='ru'?'Предложенные по материалам':'Suggested for this case'}>
   {autoCouncilPlan.suggested.map(id=><option key={id} value={id}>{councilSpecialtyLabel(id,language)}</option>)}
  </optgroup>
  <optgroup label={language==='ru'?'Другие профили (врач выбирает сам)':'Other available perspectives'}>
   {COUNCIL_SPECIALTIES.filter(option=>option.id!=='auto'&&!autoCouncilPlan.suggested.some(id=>id===option.id))
     .map(option=><option key={option.id} value={option.id}>{councilSpecialtyLabel(option.id,language)}</option>)}
  </optgroup>
 </select>
 <small>{t('По умолчанию система выбирает профиль автоматически. Это изменяет задачи существующих моделей, а не добавляет новых участников.')}</small>
 <p style={{fontSize:13,margin:'6px 0'}}>{language==='ru'
   ? 'Предварительно: гипотезы — '+councilSpecialtyLabel(councilPlan.lead,language)+'; обследования — '+councilSpecialtyLabel(councilPlan.secondary,language)+'. Критик, безопасность лекарств и синтез остаются независимыми ролями.'
   : 'Preliminary plan: hypotheses — '+councilSpecialtyLabel(councilPlan.lead,language)+'; investigations — '+councilSpecialtyLabel(councilPlan.secondary,language)+'. Critic, medication safety and synthesis remain separate.'}</p>
 <p style={{fontSize:12,margin:'4px 0'}}>
  {language==='ru'?'При запуске консилиума — до 5 платных вызовов, но адаптация профилей не добавляет ни одного.':'Launching the council may use up to five paid model calls; adapting their perspectives adds none.'}
  {priorCouncilUsd!==null
   ?' '+(language==='ru'?'Предыдущий консилиум в этом случае: $':'Previous council in this case: $')+priorCouncilUsd.toFixed(4)+
     (priorCouncilBilled?(language==='ru'?' (начисление OpenRouter)':' (billed by OpenRouter)'):
       (language==='ru'?' (расчётная сумма)':' (estimated)'))+'.'
   :''}
  {' '+(language==='ru'?'Стоимость следующего обсуждения заранее не гарантирована.':'The cost of the next council is not guaranteed.')}
 </p>
 </label><label className={styles.check}>
 <input type="checkbox" disabled={busy} checked={councilFallback} onChange={event=>setCouncilFallback(event.target.checked)}/>
 {language==='ru'?'Если модель официально недоступна, разрешить один резервный вызов для этой роли (может увеличить стоимость). По умолчанию выключено.':'Allow one backup model request per affected role only when the primary model is explicitly unavailable (may cost extra). Off by default.'}
 </label>{!configured && <p className={styles.muted}>{t("Если разбор недоступен, откройте «Инструкцию для врача» и раздел «Если не получается начать».")}</p>}{payloadTooLarge && <p role="alert">{t("Объём запроса превышает 12 МБ. Удалите часть материалов.")}</p>}<small>{t("Результат — черновик. Проверяйте диагнозы, дозы, противопоказания и ссылки.")}</small></details>
        {current.analyses.length>0&&<label className={styles.check}><input type="checkbox" disabled={busy} checked={rereadImages} onChange={event=>setRereadImages(event.target.checked)}/>{t('Повторно прочитать прежние изображения')}</label>}
      </section>
      <details><summary>{t('Проверить препараты · можно дополнить список')}</summary><DrugInteractionChecker caseNarrative={current.context} onReview={canAnalyze?reviewMedications:undefined} current={current.currentMedications??''} onCurrentChange={currentMedications=>update({currentMedications})} disabled={busy||current.status==='closed'}/></details>
      {busy&&<AnalysisProgress events={progress} preview={preview}/>}
      {!current.analyses.length?<div className={styles.empty}><h3>{t('Разбор ещё не выполнен')}</h3><p>{t('Добавьте клинические данные и материалы, задайте вопрос и нажмите «Разобрать случай» выше.')}</p></div>:<CaseFeed value={current} busy={busy} onCouncil={()=>askCase('council')} onDecision={()=>goToTab('decision')}/>}
    </>}
    {(tab === 'followup' || tab === 'decision') && <>{tab==='decision'&&<div className={styles.decisionDraft}><h3>{t('Проект решения по резюме')}</h3>{current.decisionDraft?<><p>{t('Это предложение модели. Перенесите его в поле ниже, проверьте и отредактируйте перед добавлением записи.')}</p>{current.analyses[0]?.id!==current.decisionDraft.analysisId&&<p role="status">{t('После этого резюме появились новые этапы. Обновите резюме перед решением.')}</p>}<details><summary>{t('Посмотреть проект и уточняющие вопросы')}</summary><pre>{current.decisionDraft.text}</pre></details><button disabled={busy||current.status==='closed'} onClick={()=>setEventDrafts(value=>({...value,decision:current.decisionDraft!.text}))}>{t('Взять за основу и редактировать')}</button></>:<p>{t('Сначала нажмите «Резюме разбора» во вкладке «Разбор». Здесь появится проект решения и вопросы для уточнения.')}</p>}</div>}<h2>{tab === 'followup' ? t("Наблюдение в динамике") : t("Решение лечащего врача")}</h2><p className={styles.muted}>{tab === 'followup' ? t("Новые симптомы, результаты обследований и ответ на лечение войдут в следующий разбор.") : t("Зафиксируйте принятый план, изменения к черновику и сроки контроля. Запись не является электронной подписью.")}</p><textarea rows={5} disabled={busy||saving} aria-label={t("Новая запись")} readOnly={current.status==='closed'} value={eventText} onChange={e => {const text=e.target.value;setEventDrafts(value=>({...value,[eventKind]:text}));}} placeholder={tab === 'followup' ? t("Что изменилось с предыдущего визита?") : t("Ваше решение и обоснование…")}/><div className={styles.actions}><button disabled={busy||saving||current.status==='closed'||!eventText.trim()} onClick={()=>addEvent()}>{t(editingCurrent?'Сохранить правку':'Добавить запись')}</button>{editingCurrent&&<button onClick={()=>{setEditingEvent(undefined);setEventDrafts(value=>({...value,[eventKind]:''}));}}>{t('Отменить правку')}</button>}<button className={styles.primary} disabled={!canAnalyze || !eventText.trim()} onClick={()=>addEvent(true)}>{t("Добавить запись и разобрать")}</button></div><div className={styles.timeline}>{current.events.filter(e => e.kind === eventKind).slice().reverse().map(e => <article key={e.id}><small>{date(e.at)}{e.editedAt?' · '+t('Изменено')+' '+date(e.editedAt):''}</small><p>{e.text}</p><button disabled={busy||current.status==='closed'} onClick={()=>{setEditingEvent(e.id);setEventDrafts(value=>({...value,[eventKind]:e.text}));}}>{t('Редактировать запись')}</button>{e.revisions?.length?<details><summary>{t('История правок')} · {e.revisions.length}</summary>{e.revisions.map((revision,index)=><section key={index}><small>{date(revision.at)}</small><p>{revision.text}</p></section>)}</details>:null}</article>)}</div>{tab==='decision'&&current.status==='active'&&<button className={styles.primary} disabled={busy||saving} onClick={()=>void finishCase()}>{t('Завершить и сохранить случай')}</button>}{tab === 'decision' && <label>{t("Статус случая")}<select disabled={busy} value={current.status} onChange={e => {if(e.target.value==='closed')void finishCase();else void storeTransition({...current,status:'active',closedAt:undefined,updated:new Date().toISOString()},'Случай возвращён в работу.');}}><option value="active">{t("В работе")}</option><option value="closed">{t("Завершён")}</option></select></label>}</>}
    <CaseSectionControls index={tabIndex} onNavigate={goToTab}/>
    </section></div>
   </>}
   {section === 'modules' && <><div className={styles.heading}><div><p className={styles.eyebrow}>{t("ИНСТРУМЕНТЫ DOCTOR OPUS")}</p><h1>{t("Одна задача. Разные инструменты.")}</h1><p>{t("Реальные возможности и границы подключённых компонентов.")}</p></div><Link className={styles.primary} href={current?moduleHref('workbench',current.id):'/workbench'}>{t("Открыть станцию ↗")}</Link></div>{[false,true].map(extra=><section key={String(extra)}>{extra&&<h2>{t('Дополнительные инструменты')}</h2>}<div className={styles.moduleGrid}>{modules.filter(([, , , href])=>(href==='/protocol'||href==='/translator')===extra).map(([name,formats,description,href])=><article className={styles.panel} key={name}><h2>{href==='/drug-labels'?medicationCopy(language).title:t(name)}</h2><strong>{t(formats)}</strong><p>{href==='/drug-labels'?medicationCopy(language).market:t(description)}</p><Link href={current?moduleHref(href.slice(1),current.id):href}>{t('Перейти к инструментам →')}</Link></article>)}</div></section>)}</>}
   </main><PhysicianHelp open={helpOpen} onClose={()=>setHelpOpen(false)}/><footer className={styles.footer}>CONCILIUM / DOCTOR OPUS <span>{t("Клиническое мышление с опорой на данные")}</span></footer>
  </div>
 </div>;
}
