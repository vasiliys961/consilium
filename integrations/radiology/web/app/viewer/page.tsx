"use client";
import {LocalizedUi,useUiTranslator} from '../../components/ConciliumBridge';
import {conciliumParentOrigin} from '../../lib/concilium-parent-origin';
import { useViewerLayout,useConciliumViewerCopy } from "../../components/ConciliumBridge";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { checkMprEligibility } from "../../lib/mpr-eligibility";
import { assessMprQuality } from "../../lib/mpr-quality";
import { distinctProjectionTitles, groupDicomSeries, readDicomSeriesHeader, type DicomSeries } from "../../lib/dicom-series";
import { suggestPrimaryDicomSeries } from "../../lib/automatic-primary-series";
import { validateViewerFileSelection } from "../../lib/viewer-limits";
import { appendProjections, MAX_COMPARED_PROJECTIONS, projectionAddedMessage } from "../../lib/projection-load";
import "./viewer.css";
import "../radiology.css";
import { AnalysisSoundProvider } from "../../components/AnalysisSoundProvider";
import DetectorAvailabilityGuide from "../../components/DetectorAvailabilityGuide";
import WorkspaceNavigation from "../../components/WorkspaceNavigation";
import type { WorkerSession } from "../../lib/local-worker";
import type { BoundNoduleReport } from "../../lib/live-nodule-report";
import type { SanitizedDetectorBundle } from "../../lib/detector-consilium-evidence";
import type { ClnVerifiedLocalEvidence } from "../../lib/cln-physician-local-review";
const NoduleBoundResearchView = dynamic(() => import("../../components/NoduleBoundResearchView"), { ssr: false });
const WmhSourceReview = dynamic(() => import("../../components/WmhSourceReview"), { ssr: false });
const VisionFramePlanningPanel = dynamic(() => import("../../components/VisionFramePlanningPanel"), { ssr: false });
const PlainImageAnalysis = dynamic(() => import("../../components/PlainImageAnalysis"), { ssr: false });
const RadiographCompare = dynamic(() => import("../../components/RadiographCompare"), { ssr: false });
const UnifiedDicomStudyAnalysis = dynamic(() => import("../../components/UnifiedDicomStudyAnalysis"), { ssr: false });
const DirectIchDicomDetector = dynamic(() => import("../../components/DirectIchDicomDetector"), { ssr: false });
const NativeCtResearchExport = dynamic(() => import("../../components/NativeCtResearchExport"), { ssr: false });
const NiftiCtResearchView = dynamic(() => import("../../components/NiftiCtResearchView"), {
    ssr: false,
    loading: () => <div className="cs-placeholder"><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E NIfTI CT review\u2026"}/></div>,
});
const LungNoduleResearchResults = dynamic(() => import("../../components/LungNoduleResearchResults"), { ssr: false });
const ChestEffusionResearchResults = dynamic(() => import("../../components/ChestEffusionResearchResults"), { ssr: false });
const IldGgoExpertResearch = dynamic(() => import("../../components/IldGgoExpertResearch"), { ssr: false });
const IldPatternResearch = dynamic(() => import("../../components/IldPatternResearch"), { ssr: false });
const ChestExtraPulmonaryResearch = dynamic(() => import("../../components/ChestExtraPulmonaryResearch"), { ssr: false });
const ThoracicMassResearch = dynamic(() => import("../../components/ThoracicMassResearch"), { ssr: false });
const ColonCancerResearchResults = dynamic(() => import("../../components/ColonCancerResearchResults"), { ssr: false });
const PathologyCoverageResearch = dynamic(() => import("../../components/PathologyCoverageResearch"), { ssr: false });
const MorphometryEvidenceReview = dynamic(() => import("../../components/MorphometryEvidenceReview"), { ssr: false });
const RenalCalculusResearchEvidence = dynamic(() => import("../../components/RenalCalculusResearchEvidence"), { ssr: false });
const RenalNeoplasmThreePhaseEvidence = dynamic(() => import("../../components/RenalNeoplasmThreePhaseEvidence"), { ssr: false });
const KiTS23RenalTumorEvidence = dynamic(() => import("../../components/KiTS23RenalTumorEvidence"), { ssr: false });
const RenalCystResearchEvidence = dynamic(() => import("../../components/RenalCystResearchEvidence"), { ssr: false });
const FumpePeResearchEvidence = dynamic(() => import("../../components/FumpePeResearchEvidence"), { ssr: false });
const LungscapePhysicianEvidencePanel = dynamic(() => import("../../components/LungscapePhysicianEvidencePanel"), { ssr: false });
const CornerstoneMPR = dynamic(() => import("../../components/CornerstoneMPR"), {
    ssr: false, loading: () => <div className="cs-placeholder"><LocalizedUi value={"\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 \u0442\u0440\u0451\u0445\u043C\u0435\u0440\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430\u2026"}/></div>,
});
const CornerstoneStack = dynamic(() => import("../../components/CornerstoneStack"), {
    ssr: false,
    loading: () => <div className="cs-placeholder"><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 Cornerstone3D\u2026"}/></div>,
});
type Indexed = {
    id: string;
    file: File;
    header: Awaited<ReturnType<typeof readDicomSeriesHeader>>;
};
export default function ViewerPage() {
    const __ui = useUiTranslator();
    const copy = useConciliumViewerCopy();
    const {wide,setWide}=useViewerLayout();
    const [clientReady, setClientReady] = useState(false);
    useEffect(() => setClientReady(true), []);
    const importedNonce=useRef(''),sourceBindings=useRef(new WeakMap<File,string>());
    const folderPicker = useRef<HTMLInputElement>(null);
    const [sourceMode, setSourceMode] = useState<"dicom" | "nifti" | "nodules" | "colon" | "coverage" | "morphometry">("dicom");
    const [indexed, setIndexed] = useState<Indexed[]>([]);
    const [photos, setPhotos] = useState<{
        id: string;
        file: File;
        url: string;
    }[]>([]);
    const [currentSeriesKey, setCurrentSeriesKey] = useState("");
    const [wmhSlice, setWmhSlice] = useState<number | undefined>(undefined);
    const [displayWindow, setDisplayWindow] = useState<{
        width: number;
        center: number;
        nonce: number;
    } | null>(null);
    const [viewMode, setViewMode] = useState<"2d" | "mpr" | "3d">("2d");
    const [visionOpen, setVisionOpen] = useState(false);
    const [researchOpen, setResearchOpen] = useState(false);
    const [researchMode, setResearchMode] = useState(false);
    useEffect(() => { setResearchMode(new URLSearchParams(window.location.search).get("research") === "1"); }, []);
    const [visionFromPrimary, setVisionFromPrimary] = useState(false);
    const [primaryStage, setPrimaryStage] = useState<{
        seriesKey: string;
        stage: "running" | "completed" | "vision-only" | "cancelled";
    } | null>(null);
    const [visionDetectorEvidence, setVisionDetectorEvidence] = useState<{
        seriesKey: string;
        bundle: SanitizedDetectorBundle;
    } | null>(null);
    const [clnVerified, setClnVerified] = useState<{
        seriesKey: string;
        value: ClnVerifiedLocalEvidence;
    } | null>(null);
    const [preparedMonaiSource, setPreparedMonaiSource] = useState<File | null>(null);
    const [preparedMonaiSession, setPreparedMonaiSession] = useState<WorkerSession | null>(null);
    const [preparedMonaiResult, setPreparedMonaiResult] = useState<BoundNoduleReport | null>(null);
    const [message, setMessage] = useState("Выберите папку с DICOM-файлами или набор отдельных файлов.");
    const [reading, setReading] = useState(false);
    const series = useMemo(() => groupDicomSeries(indexed.map((item) => ({ id: item.id, name: item.file.name, metadata: item.header }))), [indexed]);
    const suggestion = useMemo(() => suggestPrimaryDicomSeries(series, new Set(indexed.map(item => item.id))), [series, indexed]);
    const selected: DicomSeries | undefined = series.find(item => item.key === (currentSeriesKey || suggestion.key)) ?? series[0];
    const visionSeries = useMemo(() => selected ? [selected] : [], [selected]);
    const indexedById = useMemo(() => new Map(indexed.map((item) => [item.id, item.file])), [indexed]);
    const radiographViews = useMemo(() => {
        const raw = series.flatMap(item => {
            const modality = item.modality.replace(/\0/g, "").trim();
            if (modality !== "CR" && modality !== "DX")
                return [];
            return item.members.flatMap(member => {
                const file = indexedById.get(member.id);
                return file ? [{ id: member.id, file, modality: modality as "CR" | "DX", bodyRegion: member.metadata.bodyRegion ?? null, view: member.metadata.viewPosition ?? null }] : [];
            });
        }).slice(0, MAX_COMPARED_PROJECTIONS);
        const titles = distinctProjectionTitles(raw.map(item => item.view));
        return raw.map((item, index) => ({ id: item.id, file: item.file, modality: item.modality, bodyRegion: item.bodyRegion, label: titles[index] }));
    }, [series, indexedById]);
    const compareItems = useMemo(() => [
        ...radiographViews,
        ...photos.map((photo, index) => ({ id: photo.id, label: `Снимок ${index + 1}`, file: photo.file, modality: "IMG" as const, url: photo.url })),
    ], [radiographViews, photos]);
    const selectedFiles = useMemo(() => selected?.members.map((item) => indexedById.get(item.id)).filter((file): file is File => !!file) ?? [], [selected, indexedById]);
    const mprCheck = useMemo(() => checkMprEligibility(selected ?? null, selectedFiles.map(file => file.size)), [selected, selectedFiles]);
    const mprQuality = useMemo(() => assessMprQuality(selected ?? null), [selected]);
    useEffect(() => setViewMode("2d"), [selected?.key]);
    async function loadFiles(input: FileList | null) {
        if (!input || reading)
            return;
        const files = Array.from(input);
        const problem = validateViewerFileSelection(files);
        if (problem) {
            setMessage(problem);
            return;
        }
        setReading(true);
        setMessage("Чтение технических DICOM-заголовков, без загрузки на сервер…");
        const parsed: Indexed[] = [];
        let rejected = 0;
        const reasons = new Map<string, number>();
        try {
            for (const file of files) {
                try {
                    const header = await readDicomSeriesHeader(file);
                    parsed.push({ id: crypto.randomUUID(), file, header });
                }
                catch (error: unknown) {
                    rejected++;
                    const reason = error instanceof Error ? error.message : "Неизвестная ошибка индексации.";
                    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
                }
            }
            if (parsed.length === 0) {
                const mostCommon = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
                setMessage(`DICOM не прочитан, открытые проекции сохранены. Пропущено ${rejected}.${mostCommon ? ` ${mostCommon[0]}.` : ""}`);
                return;
            }
            const modalityCode = (value: string) => value.replace(/\0/g, "").trim();
            const radiograph = (item: Indexed) => {
                const code = modalityCode(item.header.modality);
                return code === "CR" || code === "DX";
            };
            if (parsed.every(radiograph)) {
                const existing = indexed.filter(radiograph);
                const result = appendProjections(existing.map(item => ({ item, sopInstanceUid: item.header.sopInstanceUid })), parsed.map(item => ({ item, sopInstanceUid: item.header.sopInstanceUid })));
                if ("error" in result) {
                    setMessage(result.error);
                    return;
                }
                const next = result.items.map(entry => entry.item);
                setIndexed(next);
                setPreparedMonaiSource(null);
                setPreparedMonaiSession(null);
                setPreparedMonaiResult(null);
                setWmhSlice(undefined);
                setViewMode("2d");
                const added = groupDicomSeries(next.slice(-result.added).map(item => ({ id: item.id, name: item.file.name, metadata: item.header })));
                setCurrentSeriesKey(added[0]?.key ?? "");
                setVisionOpen(false);
                setVisionFromPrimary(false);
                setPrimaryStage(null);
                setVisionDetectorEvidence(null);
                setClnVerified(null);
                setMessage(projectionAddedMessage(next.length + photos.length));
                return;
            }
            // A CT or MR study replaces the previous one so slices from another examination do not stay open.
            setPhotos(current => { current.forEach(item => URL.revokeObjectURL(item.url)); return []; });
            setIndexed(parsed);
            setPreparedMonaiSource(null);
            setPreparedMonaiSession(null);
            setPreparedMonaiResult(null);
            setWmhSlice(undefined);
            setViewMode("2d");
            setCurrentSeriesKey("");
            // Pick and validate the newly loaded source before opening local Vision.
            // A scout, mixed study or incomplete geometry must not auto-open a
            // misleading panel; this does not authorize any provider transfer.
            const loadedSeries = groupDicomSeries(parsed.map(item => ({
                id: item.id, name: item.file.name, metadata: item.header,
            })));
            const primary = suggestPrimaryDicomSeries(loadedSeries, new Set(parsed.map(item => item.id)));
            setVisionOpen(false); // No AI workbench until the physician requests analysis.
            setVisionFromPrimary(false);
            setPrimaryStage(null);
            setVisionDetectorEvidence(null);
            setClnVerified(null);
            const mostCommon = [...reasons.entries()].sort((a, b) => b[1] - a[1])[0];
            setMessage(`Проиндексировано ${parsed.length} DICOM; пропущено ${rejected}.${mostCommon ? ` Основная причина (${mostCommon[1]}): ${mostCommon[0]}.` : ""} Изображения остаются на вашем Mac.`);
        }
        finally {
            setReading(false);
        }
    }
    function addPictures(files: File[]) {
        const chosen = files.filter(file => /^(image\/png|image\/jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name)).slice(0, MAX_COMPARED_PROJECTIONS);
        if (!chosen.length) {
            setMessage("Нужен файл PNG или JPEG.");
            return;
        }
        const problem = validateViewerFileSelection(chosen);
        if (problem) {
            setMessage(problem);
            return;
        }
        const code = (value: string) => value.replace(/\0/g, "").trim();
        const hasVolume = indexed.some(item => { const modality = code(item.header.modality); return modality !== "CR" && modality !== "DX"; });
        const radiographCount = hasVolume ? 0 : indexed.filter(item => { const modality = code(item.header.modality); return modality === "CR" || modality === "DX"; }).length;
        const result = appendProjections(Array.from({ length: radiographCount + photos.length }, () => ({ sopInstanceUid: null as string | null })), chosen.map(() => ({ sopInstanceUid: null as string | null })));
        if ("error" in result) {
            setMessage(result.error);
            return;
        }
        if (hasVolume) {
            setIndexed([]);
            setCurrentSeriesKey("");
        }
        setPhotos(current => [...current, ...chosen.map(file => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))]);
        setVisionOpen(false);
        setVisionFromPrimary(false);
        setPrimaryStage(null);
        setVisionDetectorEvidence(null);
        setClnVerified(null);
        setMessage(projectionAddedMessage(radiographCount + photos.length + chosen.length));
    }
    useEffect(()=>{
        const receive=(event:MessageEvent)=>{
            const session=new URLSearchParams(location.search).get('conciliumSession')||sessionStorage.getItem('concilium.bridge.session');
            if(event.origin!==conciliumParentOrigin()||event.source!==window.parent||event.data?.type!=='concilium.materials'||event.data.session!==session||!session||typeof event.data.nonce!=='string'||event.data.nonce===importedNonce.current)return;
            const files=event.data.files;if(!Array.isArray(files)||!files.length||!files.every((f:unknown)=>f instanceof File)||files.reduce((n:number,f:File)=>n+f.size,0)>64*1024*1024)return;
            importedNonce.current=event.data.nonce;if(Array.isArray(event.data.sourceKeys))files.forEach((file:File,i:number)=>{const key=event.data.sourceKeys[i];if(typeof key==='string'&&key.length<=256)sourceBindings.current.set(file,key);});
            const dicom=files.filter((f:File)=>/\.(dcm|dicom)$/i.test(f.name));
            const pictures=files.filter((f:File)=>/\.(png|jpe?g)$/i.test(f.name));
            if(dicom.length){const input=new DataTransfer();dicom.forEach((f:File)=>input.items.add(f));void loadFiles(input.files);}
            if(pictures.length)addPictures(pictures);
        };
        window.addEventListener('message',receive);
        const session=new URLSearchParams(location.search).get('conciliumSession')||sessionStorage.getItem('concilium.bridge.session');
        if(session&&window.parent!==window)window.parent.postMessage({type:'concilium.ready',session},conciliumParentOrigin());
        return()=>window.removeEventListener('message',receive);
    },[]);
    useEffect(()=>{
        const session=new URLSearchParams(location.search).get('conciliumSession')||sessionStorage.getItem('concilium.bridge.session');
        const files=[...indexed.map(item=>item.file),...photos.map(item=>item.file)];
        if(session&&window.parent!==window&&files.length&&files.reduce((n,f)=>n+f.size,0)>64*1024*1024)window.parent.postMessage({type:'concilium.materials-too-large',session},conciliumParentOrigin());
        if(session&&window.parent!==window&&files.length&&files.reduce((n,f)=>n+f.size,0)<=64*1024*1024)window.parent.postMessage({type:'concilium.materials-export',session,files,sourceKeys:files.map(file=>sourceBindings.current.get(file)??'')},conciliumParentOrigin());
    },[indexed,photos]);
    function onPhotos(event: ChangeEvent<HTMLInputElement>) {
        const chosen = Array.from(event.target.files ?? []);
        event.target.value = "";
        addPictures(chosen);
    }
    function onAddOne(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file)
            return;
        if (/^(image\/png|image\/jpeg)$/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name)) {
            addPictures([file]);
            return;
        }
        const list = new DataTransfer();
        list.items.add(file);
        void loadFiles(list.files);
    }
    function onPick(event: ChangeEvent<HTMLInputElement>) {
        void loadFiles(event.target.files);
        event.target.value = "";
    }
    return <main className={wide?"cs-page cs-page-wide":"cs-page"}>
    <header className="cs-top"><a href="/viewer" aria-label={__ui("Opus Radiology AI \u2014 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0435")}>OPUS RADIOLOGY</a><WorkspaceNavigation active={researchMode ? "technical" : "viewer"}/><span><LocalizedUi value={copy.local}/></span></header>
    <div className="cs-container">
      <LocalizedUi value={researchMode && <details className="cs-geometry" aria-label={__ui("\u0418\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u043C\u043E\u0434\u0443\u043B\u0438")}><summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0435 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B"}/></summary>
      <div className="cs-source-mode" aria-label={__ui("\u0424\u043E\u0440\u043C\u0430\u0442 \u0438\u0441\u0445\u043E\u0434\u043D\u043E\u0439 \u0441\u0435\u0440\u0438\u0438")}>
        <button type="button" className={sourceMode === "dicom" ? "active" : ""} onClick={() => setSourceMode("dicom")}><LocalizedUi value={"DICOM \u00B7 \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u0435 \u0441\u0435\u0440\u0438\u0438"}/></button>
        <button type="button" className={sourceMode === "nodules" ? "active" : ""} onClick={() => setSourceMode("nodules")}><LocalizedUi value={"MONAI \u00B7 \u0443\u0437\u043B\u044B \u041A\u0422"}/></button>
        <button type="button" className={sourceMode === "nifti" ? "active" : ""} onClick={() => setSourceMode("nifti")}><LocalizedUi value={"NIfTI \u00B7 \u041A\u0422 \u0431\u0440\u044E\u0448\u043D\u043E\u0439 \u043F\u043E\u043B\u043E\u0441\u0442\u0438"}/></button>
        <button type="button" className={sourceMode === "colon" ? "active" : ""} onClick={() => setSourceMode("colon")}><LocalizedUi value={"VISTA3D \u00B7 \u043E\u043F\u0443\u0445\u043E\u043B\u044C \u0442\u043E\u043B\u0441\u0442\u043E\u0439 \u043A\u0438\u0448\u043A\u0438"}/></button>
        <button type="button" className={sourceMode === "coverage" ? "active" : ""} onClick={() => setSourceMode("coverage")}><LocalizedUi value={"\u041F\u043E\u043A\u0440\u044B\u0442\u0438\u0435 \u043F\u0430\u0442\u043E\u043B\u043E\u0433\u0438\u0439 \u00B7 \u0434\u043E\u043A\u0430\u0437\u0430\u0442\u0435\u043B\u044C\u0441\u0442\u0432\u0430"}/></button>
        <button type="button" className={sourceMode === "morphometry" ? "active" : ""} onClick={() => setSourceMode("morphometry")}><LocalizedUi value={"\u041C\u043E\u0440\u0444\u043E\u043C\u0435\u0442\u0440\u0438\u044F \u00B7 8 \u043C\u043E\u0434\u0443\u043B\u0435\u0439"}/></button>
      </div>
      </details>}/>
      <LocalizedUi value={sourceMode === "nodules" ? <NoduleBoundResearchView initialSource={preparedMonaiSource} initialAutoSession={preparedMonaiSession} initialCompletedReport={preparedMonaiResult}/> : sourceMode === "nifti" ? <NiftiCtResearchView /> : sourceMode === "colon" ? <ColonCancerResearchResults /> : sourceMode === "coverage" ? <PathologyCoverageResearch /> : sourceMode === "morphometry" ? <MorphometryEvidenceReview /> : <>
      <div className="cs-intro"><div><h1><LocalizedUi value={copy.study}/></h1><p><LocalizedUi value={"\u0417\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0435 \u041A\u0422, \u041C\u0420\u0422, \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u043C\u043C\u0443 DICOM \u0438\u043B\u0438 \u0441\u043D\u0438\u043C\u043E\u043A PNG/JPEG \u0438 \u043D\u0430\u0436\u043C\u0438\u0442\u0435 \u0430\u043D\u0430\u043B\u0438\u0437."}/></p></div></div>
      <LocalizedUi value={visionFromPrimary && <p role="status" className="cs-message">
        <LocalizedUi value={primaryStage?.stage === "running" ? copy.running :
                    primaryStage?.stage === "cancelled" ? "Анализ остановлен." :
                        "Результаты анализа появятся под изображениями."}/>
      </p>}/>
      <div className="cs-layout">
        <aside className="cs-sidebar">
          <h2><LocalizedUi value={copy.load}/></h2>
          <p><LocalizedUi value={"\u0420\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u043C\u043C\u0443 \u043C\u043E\u0436\u043D\u043E \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0442\u044C \u043F\u043E \u043E\u0434\u043D\u043E\u0439: \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0430\u044F \u043F\u0440\u043E\u0435\u043A\u0446\u0438\u044F \u0434\u043E\u0431\u0430\u0432\u0438\u0442\u0441\u044F \u043A \u0441\u0440\u0430\u0432\u043D\u0435\u043D\u0438\u044E."}/></p>
          <div className="cs-load-actions">
          <label className="cs-picker"><LocalizedUi value={copy.files}/> <input type="file" multiple accept=".dcm,.dicom,application/dicom" onChange={onPick} disabled={reading || !clientReady}/></label>
          <label className="cs-picker"><LocalizedUi value={"PNG \u0438\u043B\u0438 JPEG"}/><input type="file" multiple accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={onPhotos} disabled={reading || !clientReady}/></label>
          <button type="button" className="cs-outline" disabled={reading || !clientReady} onClick={() => {
                if (folderPicker.current) {
                    (folderPicker.current as HTMLInputElement & {
                        webkitdirectory: boolean;
                    }).webkitdirectory = true;
                    folderPicker.current.click();
                }
            }}><LocalizedUi value={copy.folder}/></button>
          <label className="cs-outline cs-add-projection"><LocalizedUi value={copy.projection}/>
            <input type="file" accept=".dcm,.dicom,application/dicom,image/png,image/jpeg,.png,.jpg,.jpeg" onChange={onAddOne} disabled={reading || !clientReady}/>
          </label>
          </div>
          <input ref={folderPicker} type="file" className="cs-hidden" multiple onChange={onPick} disabled={reading || !clientReady}/>
          <div className="cs-message" role="status"><LocalizedUi value={reading ? "Идёт индексация…" : message}/></div>
          <LocalizedUi value={series.length > 0 && <>
            <h3><LocalizedUi value={"\u0421\u0435\u0440\u0438\u0438 ("}/><LocalizedUi value={series.length}/>)</h3>
            
            <div className="cs-series-list"><LocalizedUi value={series.map((s) => <button type="button" className={selected?.key === s.key ? "cs-series active" : "cs-series"} key={s.key} onClick={() => { setWmhSlice(undefined); setViewMode("2d"); setVisionOpen(false); setVisionFromPrimary(false); setPrimaryStage(null); setVisionDetectorEvidence(null); setClnVerified(null); setCurrentSeriesKey(s.key); }}><LocalizedUi value={s.label}/></button>)}/></div>
          </>}/>
          <LocalizedUi value={researchMode && selected && <details className="cs-geometry"><summary><LocalizedUi value={"\u0421\u0432\u0435\u0434\u0435\u043D\u0438\u044F \u043E\u0431 \u0438\u0441\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u043D\u0438\u0438"}/></summary><h3><LocalizedUi value={"\u041A\u043E\u043D\u0442\u0440\u043E\u043B\u044C \u0433\u0435\u043E\u043C\u0435\u0442\u0440\u0438\u0438"}/></h3><p><LocalizedUi value={selected.spatiallySorted ? "✓ Пространственный порядок подтверждён" : "⚠ Порядок условный"}/></p><p><LocalizedUi value={selected.volumeReady ? `✓ Предварительная геометрия для будущего 3D · ${selected.sliceSpacingMm?.toFixed(2)} мм` : "3D/MPR НЕ РАЗРЕШЕНЫ"}/></p><LocalizedUi value={selected.warning && <p><LocalizedUi value={selected.warning}/></p>}/></details>}/>
          <LocalizedUi value={selected && <UnifiedDicomStudyAnalysis researchMode={researchMode} key={"unified-" + selected.key} series={selected} allSeries={series} files={indexedById} onMonaiReady={(file, session, report) => {
                    setPreparedMonaiSource(file);
                    setPreparedMonaiSession(session);
                    setPreparedMonaiResult(report ?? null);
                    if (researchMode)
                        setSourceMode("nodules");
                }} onNavigate={setWmhSlice} onReadyForVision={key => {
                    if (selected?.key === key) {
                        setVisionFromPrimary(true);
                        setVisionOpen(true);
                    }
                }} onAnalysisStage={(key, stage) => {
                    if (selected?.key === key)
                        setPrimaryStage({ seriesKey: key, stage });
                }} onClnBoundReady={(key, value) => setClnVerified(previous => {
                    if (key !== selected.key)
                        return previous;
                    if (previous?.seriesKey === key && JSON.stringify(previous.value) === JSON.stringify(value))
                        return previous;
                    return { seriesKey: key, value };
                })} onDetectorEvidence={(key, bundle) => setVisionDetectorEvidence(previous => {
                    if (!bundle)
                        return null;
                    if (previous?.seriesKey === key && JSON.stringify(previous.bundle) === JSON.stringify(bundle))
                        return previous;
                    return { seriesKey: key, bundle };
                })}/>}/>
          <LocalizedUi value={researchMode && <details className="cs-geometry" onToggle={event => setResearchOpen(event.currentTarget.open)}><summary><LocalizedUi value={"\u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0435 \u0434\u0438\u0430\u0433\u043D\u043E\u0441\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0435 \u0438\u043D\u0441\u0442\u0440\u0443\u043C\u0435\u043D\u0442\u044B"}/></summary>
          <LocalizedUi value={researchOpen && <>
          <DetectorAvailabilityGuide compact/>
          <LungNoduleResearchResults key={selected?.key ?? "empty"} isChestCT={!!selected && selected.modality === "CT" && selected.members.every(m => m.metadata.bodyRegion === "CHEST")}/>
          <ChestEffusionResearchResults key={"fluid-" + (selected?.key ?? "empty")} isChestCT={!!selected && selected.modality === "CT" && selected.members.every(m => m.metadata.bodyRegion === "CHEST")}/>
          <IldGgoExpertResearch key={"ild-" + (selected?.key ?? "empty")} isChestCT={!!selected && selected.modality === "CT" && selected.members.every(m => m.metadata.bodyRegion === "CHEST")}/>
          <LungscapePhysicianEvidencePanel />
          <FumpePeResearchEvidence />
          <RenalCystResearchEvidence />
          <KiTS23RenalTumorEvidence />
          <RenalNeoplasmThreePhaseEvidence />
          <RenalCalculusResearchEvidence />
          <IldPatternResearch key={"ild-pattern-" + (selected?.key ?? "empty")} isChestCT={!!selected && selected.modality === "CT" && selected.members.every(m => m.metadata.bodyRegion === "CHEST")}/>
          <ChestExtraPulmonaryResearch key={"chest-extra-" + (selected?.key ?? "empty")} isChestCT={!!selected && selected.modality === "CT" && selected.members.every(m => m.metadata.bodyRegion === "CHEST")}/>
          <ThoracicMassResearch key={"intrathoracic-masses-" + (selected?.key ?? "empty")} series={selected ?? null}/>
          <LocalizedUi value={selected && selected.modality === "CT" && selected.members.every(m => m.metadata.bodyRegion === "HEAD") && <DirectIchDicomDetector key={"ich-" + selected.key} series={selected} files={indexedById}/>}/>
          <LocalizedUi value={selected && selected.modality === "MR" && <WmhSourceReview key={"wmh-" + selected.key} series={selected} files={indexedById} onNavigate={setWmhSlice}/>}/>
          <LocalizedUi value={selected && <NativeCtResearchExport key={"native-export-" + selected.key} series={selected} files={selectedFiles} onPreparedSource={(file, session) => { setPreparedMonaiSession(session ?? null); setPreparedMonaiSource(file); setPreparedMonaiResult(null); setSourceMode("nodules"); }}/>}/>
          </>}/>
          </details>}/>
          <button type="button" className="cs-clear" disabled={reading || (indexed.length === 0 && photos.length === 0)} onClick={() => { setIndexed([]); setPhotos(current => { current.forEach(item => URL.revokeObjectURL(item.url)); return []; }); setPreparedMonaiSource(null); setPreparedMonaiSession(null); setPreparedMonaiResult(null); setCurrentSeriesKey(""); setVisionOpen(false); setVisionFromPrimary(false); setPrimaryStage(null); setVisionDetectorEvidence(null); setClnVerified(null); setMessage("Список очищен, файлы на диске не изменены."); }}><LocalizedUi value={"\u041E\u0447\u0438\u0441\u0442\u0438\u0442\u044C \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043D\u043E\u0435"}/></button>
        </aside>
        <div className="cs-stage"><div className="cs-expand-toolbar"><button type="button" aria-pressed={wide} onClick={()=>setWide(!wide)}><LocalizedUi value={wide?"Свернуть изображение · Esc":"На весь экран · панель вниз"}/></button></div>
          <LocalizedUi value={compareItems.length > 1 && <RadiographCompare items={compareItems}/>}/>
          <LocalizedUi value={photos.length === 1 && radiographViews.length === 0 && <section aria-label={__ui("\u041E\u0442\u043A\u0440\u044B\u0442\u044B\u0435 \u0441\u043D\u0438\u043C\u043A\u0438 PNG \u0438\u043B\u0438 JPEG")}>
            <img className="cs-plain-image" src={photos[0].url} alt={__ui("\u0421\u043D\u0438\u043C\u043E\u043A")} style={{ maxWidth: "100%", height: "auto" }}/>
            <PlainImageAnalysis photos={photos}/>
          </section>}/>
          <LocalizedUi value={selectedFiles.length > 0 && photos.length === 0 && <div className="cs-view-modes" role="group" aria-label={__ui("\u041F\u0440\u043E\u0441\u043C\u043E\u0442\u0440 \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439")}>
            <button type="button" aria-pressed={viewMode === "2d"} onClick={() => setViewMode("2d")}><LocalizedUi value={"\u0421\u0440\u0435\u0437\u044B \u00B7 2D"}/></button>
            <button type="button" aria-pressed={viewMode === "mpr"} disabled={!mprCheck.eligible} title={mprCheck.eligible ? undefined : mprCheck.reason} onClick={() => setViewMode("mpr")}><LocalizedUi value={"\u0422\u0440\u0438 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438"}/></button>
            <button type="button" aria-pressed={viewMode === "3d"} disabled={!mprCheck.eligible} title={mprCheck.eligible ? undefined : mprCheck.reason} onClick={() => setViewMode("3d")}><LocalizedUi value={"3D \u00B7 \u0432\u0440\u0430\u0449\u0435\u043D\u0438\u0435"}/></button>
          </div>}/>
          <LocalizedUi value={photos.length === 0 && selectedFiles.length > 0 && !mprCheck.eligible && <p role="status"><LocalizedUi value={"\u0422\u0440\u0438 \u043F\u043B\u043E\u0441\u043A\u043E\u0441\u0442\u0438 \u0438 3D \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u043D\u044B:"}/><LocalizedUi value={mprCheck.reason}/><LocalizedUi value={"\u042D\u0442\u043E \u043E\u0433\u0440\u0430\u043D\u0438\u0447\u0435\u043D\u0438\u0435 \u043E\u0431\u044A\u0451\u043C\u043D\u043E\u0433\u043E \u043F\u0440\u043E\u0441\u043C\u043E\u0442\u0440\u0430; \u043F\u043E\u0441\u043B\u0435\u0434\u043E\u0432\u0430\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0430\u043D\u0430\u043B\u0438\u0437 \u0432\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0445 2D-\u0441\u0440\u0435\u0437\u043E\u0432 \u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E."}/></p>}/>
          <LocalizedUi value={photos.length === 0 && (selectedFiles.length > 0 && selected && viewMode !== "2d" && mprCheck.eligible ?
                <CornerstoneMPR key={"mpr-" + selected.key} files={selectedFiles} sourceSeries={selected} quality={mprQuality} show3D={viewMode === "3d"} onShow3DChange={enabled => setViewMode(enabled ? "3d" : "mpr")}/> :
                selectedFiles.length ?
                    <CornerstoneStack key={selected?.key} files={selectedFiles} modality={selected?.modality} selectedIndex={wmhSlice} onSliceChange={setWmhSlice} displayWindow={displayWindow}/> :
                    <div className="cs-placeholder"><span>✚</span><strong><LocalizedUi value={"\u041E\u0431\u043B\u0430\u0441\u0442\u044C \u0438\u0437\u043E\u0431\u0440\u0430\u0436\u0435\u043D\u0438\u0439"}/></strong><p><LocalizedUi value={"\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 DICOM, \u0440\u0435\u043D\u0442\u0433\u0435\u043D\u043E\u0433\u0440\u0430\u043C\u043C\u0443, PNG \u0438\u043B\u0438 JPEG."}/></p></div>)}/>
          <LocalizedUi value={photos.length === 0 && selected && ["CT", "MR", "CR", "DX"].includes(selected.modality) && <section className="cs-geometry" aria-label={__ui("\u041F\u043E\u0434\u0433\u043E\u0442\u043E\u0432\u043A\u0430 Gemini \u0438 Opus \u043F\u043E \u043E\u0442\u043A\u0440\u044B\u0442\u043E\u043C\u0443 DICOM")}>
            <LocalizedUi value={visionFromPrimary && <h3><LocalizedUi value={"\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435"}/></h3>}/>
            <LocalizedUi value={researchMode && !visionFromPrimary && <button type="button" disabled={reading} onClick={() => setVisionOpen(v => !v)}>
              <LocalizedUi value={visionOpen ? "Закрыть дополнительные инструменты" : "Анализировать отдельные срезы"}/>
            </button>}/>

            <LocalizedUi value={visionOpen && <AnalysisSoundProvider>
              <VisionFramePlanningPanel key={"vision-" + selected.key} series={visionSeries} comparisonSeries={series} activeSeriesKey={selected.key} fileById={indexedById} originalDetectorEvidence={visionDetectorEvidence?.seriesKey === selected.key ? visionDetectorEvidence.bundle : null} clnVerifiedLocal={clnVerified?.seriesKey === selected.key ? clnVerified.value : null} fromPrimaryAnalysis={visionFromPrimary} researchMode={researchMode} primaryActionAvailable={true} primaryAnalysisStage={visionFromPrimary && primaryStage?.seriesKey === selected.key ? primaryStage.stage : "idle"} onOpenSlice={id => {
                        const index = selected.members.findIndex(m => m.id === id);
                        if (index >= 0)
                            setWmhSlice(index);
                        else {
                            const owner = series.find(s => s.members.some(m => m.id === id));
                            if (owner) {
                                setCurrentSeriesKey(owner.key);
                                setWmhSlice(owner.members.findIndex(m => m.id === id));
                                setViewMode('2d');
                                setVisionOpen(false);
                                setVisionFromPrimary(false);
                                setPrimaryStage(null);
                                setVisionDetectorEvidence(null);
                                setClnVerified(null);
                            }
                        }
                    }} onInspectFinding={(id, window) => {
                        const index = selected.members.findIndex(m => m.id === id);
                        if (index >= 0) {
                            setViewMode('2d');
                            setWmhSlice(index);
                            if (window)
                                setDisplayWindow({ ...window, nonce: Date.now() });
                            document.querySelector('.cs-stack')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                        }
                    }}/>
            </AnalysisSoundProvider>}/>
          </section>}/>
          <LocalizedUi value={visionFromPrimary && <div className="cs-bottom-note"><LocalizedUi value={"\u041F\u0440\u0435\u0434\u0432\u0430\u0440\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u0435. \u0412\u0440\u0430\u0447 \u043F\u0440\u043E\u0432\u0435\u0440\u044F\u0435\u0442 \u0435\u0433\u043E \u043F\u043E \u0438\u0441\u0445\u043E\u0434\u043D\u044B\u043C \u0441\u043D\u0438\u043C\u043A\u0430\u043C."}/></div>}/>
        </div>
      </div>
      </>}/>
    </div>
  </main>;
}
